import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  procedurePriceHistory,
  procedurePrices,
  procedures,
  transactions,
  type PriceHistoryRow,
  type ProcedureRow,
} from "@/lib/db/schema";
import { HMO_PAYMENT_TYPES, round2 } from "@/lib/cashflow/pricing";
import {
  normalizePriceBasis,
  type PriceBasis,
} from "@/lib/cashflow/price-basis";
import { normalizeVatType, type VatType } from "@/lib/cashflow/pricing";

/** A price change bigger than this (either way) asks the admin to confirm. */
export const LARGE_PRICE_CHANGE_RATIO = 0.25;

export type ProcedureAdminRow = {
  id: string;
  name: string;
  vatType: VatType;
  price: number | null;
  priceBasis: PriceBasis;
  active: boolean;
  updatedAt: string;
  /** Transaction lines recorded for this procedure. */
  usedCount: number;
  /** HMO price for each HMO that has one (keyed by HMO name). */
  payerPrices: Record<string, number>;
};

/** Every procedure with how often it has been used, for the Procedures tab. */
export async function listProcedureAdminRows(): Promise<ProcedureAdminRow[]> {
  const [rows, usage, usageByName, hmoRows] = await Promise.all([
    db.select().from(procedures).orderBy(procedures.name),
    db
      .select({
        procedureId: transactions.procedureId,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .groupBy(transactions.procedureId),
    db
      .select({
        name: sql<string>`lower(trim(${transactions.procedure}))`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .groupBy(sql`lower(trim(${transactions.procedure}))`),
    db.select().from(procedurePrices),
  ]);
  const hmoById = new Map<string, Record<string, number>>();
  for (const row of hmoRows) {
    const prices = hmoById.get(row.procedureId) ?? {};
    prices[row.payer] = Number(row.price);
    hmoById.set(row.procedureId, prices);
  }
  const usedById = new Map(
    usage.flatMap((row) =>
      row.procedureId ? [[row.procedureId, row.count] as const] : [],
    ),
  );
  const usedByName = new Map(usageByName.map((row) => [row.name, row.count]));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    vatType: normalizeVatType(row.defaultVatType),
    price: row.defaultPrice === null ? null : Number(row.defaultPrice),
    priceBasis: normalizePriceBasis(row.priceBasis),
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
    payerPrices: hmoById.get(row.id) ?? {},
    // Lines linked by id, or older ones that only carry the name.
    usedCount: Math.max(
      usedById.get(row.id) ?? 0,
      usedByName.get(row.name.trim().toLowerCase()) ?? 0,
    ),
  }));
}

export type PriceHistoryEntry = {
  id: string;
  oldPrice: number | null;
  newPrice: number | null;
  changedByName: string;
  changedAt: string;
  note: string;
  /** "Cash" or the HMO the price is for. */
  payer: string;
};

function toEntry(row: PriceHistoryRow): PriceHistoryEntry {
  return {
    id: row.id,
    oldPrice: row.oldPrice === null ? null : Number(row.oldPrice),
    newPrice: row.newPrice === null ? null : Number(row.newPrice),
    changedByName: row.changedByName,
    changedAt: row.changedAt.toISOString(),
    note: row.note,
    payer: row.payer,
  };
}

export async function listPriceHistory(
  procedureId: string,
): Promise<PriceHistoryEntry[]> {
  const rows = await db
    .select()
    .from(procedurePriceHistory)
    .where(eq(procedurePriceHistory.procedureId, procedureId))
    .orderBy(desc(procedurePriceHistory.changedAt));
  return rows.map(toEntry);
}

export type ProcedureInput = {
  name: string;
  vatType: VatType;
  price: number | null;
  priceBasis: PriceBasis;
  active: boolean;
  note: string;
  /** HMO prices keyed by HMO name; null = no price for that HMO. Only the
   * accepted HMOs are used. */
  payerPrices: Record<string, number | null>;
};

type Actor = { userId: string | null; name: string };

export type SaveProcedureResult =
  | { ok: true; id: string }
  | { ok: false; message: string; needsConfirm?: boolean };

async function nameTaken(name: string, exceptId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: procedures.id })
    .from(procedures)
    .where(ilike(procedures.name, name.replace(/[%_\\]/g, "\\$&")))
    .limit(3);
  return rows.some((row) => row.id !== exceptId);
}

async function recordPriceChange(
  procedureId: string,
  oldPrice: number | null,
  newPrice: number | null,
  actor: Actor,
  note: string,
  payer = "Cash",
) {
  await db.insert(procedurePriceHistory).values({
    procedureId,
    payer,
    oldPrice: oldPrice === null ? null : oldPrice.toString(),
    newPrice: newPrice === null ? null : newPrice.toString(),
    changedByUserId: actor.userId,
    changedByName: actor.name,
    note,
  });
}

/** Keeps only the accepted HMOs, with rounded, non-negative prices. */
function cleanPayerPrices(
  input: Record<string, number | null>,
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const payer of HMO_PAYMENT_TYPES) {
    const value = input[payer];
    result[payer] =
      value === null || value === undefined || !(value >= 0)
        ? null
        : round2(value);
  }
  return result;
}

/**
 * Saves the HMO prices of a procedure and records each change in the
 * history. Returns the biggest relative change of an existing price (for the
 * "large change" confirmation), computed before anything is written.
 */
async function loadCurrentPayerPrices(
  procedureId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(procedurePrices)
    .where(eq(procedurePrices.procedureId, procedureId));
  return Object.fromEntries(rows.map((row) => [row.payer, Number(row.price)]));
}

async function writePayerPrices(
  procedureId: string,
  current: Record<string, number>,
  next: Record<string, number | null>,
  actor: Actor,
  note: string,
) {
  for (const payer of HMO_PAYMENT_TYPES) {
    const before = current[payer] ?? null;
    const after = next[payer] ?? null;
    if (before === after) {
      continue;
    }
    if (after === null) {
      await db
        .delete(procedurePrices)
        .where(
          and(
            eq(procedurePrices.procedureId, procedureId),
            eq(procedurePrices.payer, payer),
          ),
        );
    } else {
      await db
        .insert(procedurePrices)
        .values({ procedureId, payer, price: after.toString() })
        .onConflictDoUpdate({
          target: [procedurePrices.procedureId, procedurePrices.payer],
          set: { price: after.toString(), updatedAt: new Date() },
        });
    }
    await recordPriceChange(procedureId, before, after, actor, note, payer);
  }
}

export async function createProcedure(
  input: ProcedureInput,
  actor: Actor,
): Promise<SaveProcedureResult> {
  const name = input.name.trim();
  if (await nameTaken(name)) {
    return { ok: false, message: `“${name}” is already on the list.` };
  }
  const price = input.price === null ? null : round2(input.price);
  const [created] = await db
    .insert(procedures)
    .values({
      name,
      defaultVatType: input.vatType,
      defaultPrice: price === null ? null : price.toString(),
      priceBasis: input.priceBasis,
      active: input.active,
    })
    .returning({ id: procedures.id });
  if (price !== null) {
    await recordPriceChange(created.id, null, price, actor, input.note || "Added");
  }
  await writePayerPrices(
    created.id,
    {},
    cleanPayerPrices(input.payerPrices),
    actor,
    input.note || "Added",
  );
  return { ok: true, id: created.id };
}

export async function updateProcedure(
  id: string,
  input: ProcedureInput,
  actor: Actor,
  confirmLargeChange: boolean,
): Promise<SaveProcedureResult> {
  const [current] = await db
    .select()
    .from(procedures)
    .where(eq(procedures.id, id))
    .limit(1);
  if (!current) {
    return { ok: false, message: "That procedure no longer exists." };
  }
  const name = input.name.trim();
  if (await nameTaken(name, id)) {
    return { ok: false, message: `“${name}” is already on the list.` };
  }

  const oldPrice =
    current.defaultPrice === null ? null : Number(current.defaultPrice);
  const newPrice = input.price === null ? null : round2(input.price);
  const priceChanged = oldPrice !== newPrice;

  const currentPayer = await loadCurrentPayerPrices(id);
  const nextPayer = cleanPayerPrices(input.payerPrices);

  // Every price that changes from one amount to another (not added or
  // cleared): a jump of more than 25% asks for a second confirmation.
  const changes: { label: string; from: number; to: number }[] = [];
  if (priceChanged && oldPrice !== null && oldPrice > 0 && newPrice !== null) {
    changes.push({ label: "Cash", from: oldPrice, to: newPrice });
  }
  for (const payer of HMO_PAYMENT_TYPES) {
    const from = currentPayer[payer];
    const to = nextPayer[payer];
    if (from !== undefined && from > 0 && to !== null && to !== from) {
      changes.push({ label: payer, from, to });
    }
  }
  const large = changes.filter(
    (change) =>
      Math.abs(change.to - change.from) / change.from >
      LARGE_PRICE_CHANGE_RATIO,
  );
  if (large.length > 0 && !confirmLargeChange) {
    const lines = large
      .map((change) => {
        const pct = Math.round(((change.to - change.from) / change.from) * 100);
        return `${change.label}: ${change.from.toLocaleString("en-PH")} to ${change.to.toLocaleString("en-PH")} (${pct > 0 ? "+" : ""}${pct}%)`;
      })
      .join("; ");
    return {
      ok: false,
      needsConfirm: true,
      message: `Large price change — ${lines}. Confirm to save it.`,
    };
  }

  await db
    .update(procedures)
    .set({
      name,
      defaultVatType: input.vatType,
      defaultPrice: newPrice === null ? null : newPrice.toString(),
      priceBasis: input.priceBasis,
      active: input.active,
      updatedAt: new Date(),
    })
    .where(eq(procedures.id, id));

  if (priceChanged) {
    await recordPriceChange(id, oldPrice, newPrice, actor, input.note);
  }
  await writePayerPrices(id, currentPayer, nextPayer, actor, input.note);
  return { ok: true, id };
}

/**
 * Deletes a procedure that was never used. One that has transactions can
 * only be hidden, so the history keeps pointing at it.
 */
export async function deleteUnusedProcedure(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [current] = await db
    .select({ name: procedures.name })
    .from(procedures)
    .where(eq(procedures.id, id))
    .limit(1);
  if (!current) {
    return { ok: true };
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      or(
        eq(transactions.procedureId, id),
        sql`lower(trim(${transactions.procedure})) = ${current.name.trim().toLowerCase()}`,
      ),
    );
  if (count > 0) {
    return {
      ok: false,
      message: `It has ${count} transaction line${count === 1 ? "" : "s"}, so it can't be deleted. Hide it instead.`,
    };
  }
  await db.delete(procedures).where(eq(procedures.id, id));
  return { ok: true };
}

export type { ProcedureRow };
