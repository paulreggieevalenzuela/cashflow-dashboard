import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  hmoBillings,
  paymentMethods,
  payments,
  procedurePrices,
  transactions,
} from "@/lib/db/schema";
import {
  allPaymentMethods,
  checkNewPaymentMethodName,
  paymentMethodKey,
  setCustomPaymentMethods,
  type CustomPaymentMethod,
  type PaymentMethod,
  type PaymentMethodKind,
} from "@/lib/cashflow/payment-methods";

export const PAYMENT_METHODS_NOT_READY =
  "Adding payment methods needs one more step first: run scripts/sql/2026-11-payment-methods.sql in Neon, then try again.";

let warned = false;

/** The `payment_methods` table doesn't exist yet (the SQL script wasn't run). */
export function paymentMethodsSchemaMissing(error: unknown): boolean {
  const text = String(error) + String((error as { cause?: unknown })?.cause ?? "");
  const missing = /payment_methods/.test(text) && /does not exist|relation/.test(text);
  if (missing && !warned) {
    warned = true;
    console.warn(
      "Payment methods use the built-in list only: run scripts/sql/2026-11-payment-methods.sql.",
    );
  }
  return missing;
}

function toCustom(row: typeof paymentMethods.$inferSelect): CustomPaymentMethod {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "hmo" ? "hmo" : "other",
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByName,
  };
}

/** The added methods, straight from the database ([] while the table is missing). */
export async function listCustomPaymentMethods(): Promise<CustomPaymentMethod[]> {
  try {
    const rows = await db.select().from(paymentMethods).orderBy(paymentMethods.name);
    return rows.map(toCustom);
  } catch (error) {
    if (paymentMethodsSchemaMissing(error)) return [];
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Keeping the in-memory list fresh
// ---------------------------------------------------------------------------

const FRESH_FOR_MS = 10_000;
let loadedAt = 0;
let loading: Promise<void> | null = null;

/**
 * Makes sure this server knows the added payment methods (the pure helpers
 * such as `isHmoPayment` read them). Called on every signed-in request, but
 * asks the database at most once every 10 seconds; a failure keeps the last
 * known list. `force` always asks (after adding or hiding a method).
 */
export async function ensurePaymentMethods(options: { force?: boolean } = {}): Promise<void> {
  if (!options.force && Date.now() - loadedAt < FRESH_FOR_MS) return;
  if (loading && !options.force) return loading;
  const run = (async () => {
    try {
      setCustomPaymentMethods(await listCustomPaymentMethods());
      loadedAt = Date.now();
    } catch (error) {
      console.error("Couldn't load the payment methods", error);
    } finally {
      loading = null;
    }
  })();
  loading = run;
  return run;
}

// ---------------------------------------------------------------------------
// The management screen's data
// ---------------------------------------------------------------------------

export type PaymentMethodRowView = PaymentMethod & {
  /** Visit lines and payments recorded with it. */
  uses: number;
};

/** Every method with how many times it has been used. */
export async function listPaymentMethodsWithUse(): Promise<{
  methods: PaymentMethodRowView[];
  ready: boolean;
}> {
  await ensurePaymentMethods({ force: true });
  const methods = allPaymentMethods();
  const lower = methods.map((method) => method.name.toLowerCase());
  const counts = new Map<string, number>();
  const [lines, paid] = await Promise.all([
    db
      .select({
        key: sql<string>`lower(${transactions.paymentType})`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(inArray(sql`lower(${transactions.paymentType})`, lower))
      .groupBy(sql`1`),
    db
      .select({
        key: sql<string>`lower(${payments.paymentType})`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(inArray(sql`lower(${payments.paymentType})`, lower))
      .groupBy(sql`1`),
  ]);
  for (const row of [...lines, ...paid]) {
    counts.set(row.key, (counts.get(row.key) ?? 0) + row.count);
  }
  const ready = await paymentMethodsReady();
  return {
    methods: methods.map((method) => ({
      ...method,
      uses: counts.get(method.name.toLowerCase()) ?? 0,
    })),
    ready,
  };
}

async function paymentMethodsReady(): Promise<boolean> {
  try {
    await db.select({ id: paymentMethods.id }).from(paymentMethods).limit(1);
    return true;
  } catch (error) {
    if (paymentMethodsSchemaMissing(error)) return false;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Changing the list
// ---------------------------------------------------------------------------

export type MethodResult = { ok: true; message: string } | { ok: false; message: string };

export async function addPaymentMethod(input: {
  name: string;
  kind: PaymentMethodKind;
  actorName: string;
}): Promise<MethodResult & { name?: string }> {
  if (input.kind !== "hmo" && input.kind !== "other") {
    return { ok: false, message: "Choose what kind of payment method it is." };
  }
  await ensurePaymentMethods({ force: true });
  const check = checkNewPaymentMethodName(input.name);
  if (!check.ok) return check;

  try {
    await db.insert(paymentMethods).values({
      name: check.name,
      nameKey: paymentMethodKey(check.name),
      kind: input.kind,
      createdByName: input.actorName,
    });
  } catch (error) {
    if (paymentMethodsSchemaMissing(error)) {
      return { ok: false, message: PAYMENT_METHODS_NOT_READY };
    }
    if (/unique|duplicate/i.test(String(error) + String((error as { cause?: unknown })?.cause ?? ""))) {
      return { ok: false, message: `"${check.name}" already exists.` };
    }
    throw error;
  }
  await ensurePaymentMethods({ force: true });
  return {
    ok: true,
    name: check.name,
    message:
      input.kind === "hmo"
        ? `${check.name} added as an HMO. Set its prices under Procedures.`
        : `${check.name} added.`,
  };
}

/** Hides (or shows again) a method an owner or admin added. */
export async function setPaymentMethodActive(id: string, active: boolean): Promise<MethodResult> {
  try {
    const rows = await db
      .update(paymentMethods)
      .set({ active })
      .where(eq(paymentMethods.id, id))
      .returning({ name: paymentMethods.name });
    if (rows.length === 0) return { ok: false, message: "That payment method no longer exists." };
    await ensurePaymentMethods({ force: true });
    return {
      ok: true,
      message: active
        ? `${rows[0].name} is offered on new visits again.`
        : `${rows[0].name} is hidden from new visits. Past visits keep it.`,
    };
  } catch (error) {
    if (paymentMethodsSchemaMissing(error)) {
      return { ok: false, message: PAYMENT_METHODS_NOT_READY };
    }
    throw error;
  }
}

/**
 * Removes an added method that was never used. One that appears on a visit,
 * a payment or an HMO billing can only be hidden, so history stays readable.
 */
export async function deletePaymentMethod(id: string): Promise<MethodResult> {
  try {
    const [row] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).limit(1);
    if (!row) return { ok: false, message: "That payment method no longer exists." };
    const key = row.name.toLowerCase();
    const [[lines], [paid], [billed]] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(transactions)
        .where(sql`lower(${transactions.paymentType}) = ${key}`),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(payments)
        .where(sql`lower(${payments.paymentType}) = ${key}`),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(hmoBillings)
        .where(sql`lower(${hmoBillings.hmo}) = ${key}`),
    ]);
    if ((lines?.count ?? 0) + (paid?.count ?? 0) + (billed?.count ?? 0) > 0) {
      return {
        ok: false,
        message: `${row.name} is already on visits or payments, so it can't be removed. Hide it instead.`,
      };
    }
    // Prices typed for it before it was ever used go with it.
    await db.delete(procedurePrices).where(sql`lower(${procedurePrices.payer}) = ${key}`);
    await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
    await ensurePaymentMethods({ force: true });
    return { ok: true, message: `${row.name} was removed.` };
  } catch (error) {
    if (paymentMethodsSchemaMissing(error)) {
      return { ok: false, message: PAYMENT_METHODS_NOT_READY };
    }
    throw error;
  }
}
