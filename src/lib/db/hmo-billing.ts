import { accountNumberFor } from "@/lib/cashflow/patient-hmo";
import { listPatientHmos } from "@/lib/db/patient-hmos";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  branches,
  hmoBillingCounters,
  hmoBillingLines,
  hmoBillings,
  invoices,
  patients,
  transactions,
  type HmoBillingRow,
} from "@/lib/db/schema";
import { hmoNameFor } from "@/lib/cashflow/day-end";
import {
  billingPrefix,
  billingYear,
  formatBillingNumber,
  rangeProblem,
  sortHmoLines,
  summarizeHmoLines,
  type HmoBilling,
  type HmoBillingLine,
} from "@/lib/cashflow/hmo-billing";
import { hmoPaymentNames } from "@/lib/cashflow/payment-methods";
import { round2 } from "@/lib/cashflow/pricing";
import { isCheckInPlaceholder } from "@/lib/cashflow/visit-status";

const CHUNK = 200;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** True when the HMO billing tables have not been created yet (the SQL in
 * scripts/sql/2026-11-hmo-billings.sql has not been run). */
function billingTablesMissing(error: unknown): boolean {
  return /hmo_billing|hmo_billings/.test(String(error)) &&
    /does not exist|relation/i.test(String(error));
}

/**
 * Every procedure line billed to an HMO on visits dated From..To (both
 * days included), for one branch (or every branch when `branchId` is null)
 * and one HMO (or every HMO when `hmo` is null).
 *
 * A line is "billed to an HMO" when its own payment method is that HMO. Each
 * row carries the patient's HMO account number (from the profile), the
 * line's own LOA (the visit's LOA is the fallback for visits saved before
 * LOA was kept per procedure), the visit's LOE, the tooth numbers and the
 * amount. `billedOn` is the number of the active billing the line is
 * already on ("" when none).
 */
export async function getHmoBillingLines(input: {
  from: string;
  to: string;
  branchId: string | null;
  hmo: string | null;
}): Promise<HmoBillingLine[]> {
  const hmoNames = (
    input.hmo ? [input.hmo] : hmoPaymentNames()
  ).map((name) => name.toLowerCase());

  const rows = await db
    .select({
      id: transactions.id,
      invoiceId: transactions.invoiceId,
      visitId: transactions.visitId,
      patientName: transactions.patientName,
      procedure: transactions.procedure,
      paymentType: transactions.paymentType,
      teeth: transactions.teeth,
      lineLoa: transactions.loaNumber,
      amount: transactions.amountPaid,
      visitDate: invoices.visitDate,
      visitLoa: invoices.loaNumber,
      loeNumber: invoices.loeNumber,
      patientId: invoices.patientId,
    })
    .from(transactions)
    .innerJoin(invoices, eq(invoices.id, transactions.invoiceId))
    .where(
      and(
        gte(invoices.visitDate, input.from),
        lte(invoices.visitDate, input.to),
        input.branchId ? eq(invoices.branchId, input.branchId) : undefined,
        inArray(sql<string>`lower(trim(${transactions.paymentType}))`, hmoNames),
      ),
    )
    .orderBy(asc(transactions.lineNumber), asc(transactions.createdAt));

  const real = rows.filter((row) => !isCheckInPlaceholder(row.procedure));
  if (real.length === 0) return [];

  // The patient's HMO account number comes from their profile.
  const patientIds = [
    ...new Set(real.flatMap((row) => (row.patientId ? [row.patientId] : []))),
  ];
  const accountByPatient = new Map<string, string>();
  for (const part of chunks(patientIds)) {
    try {
      const accounts = await db
        .select({ id: patients.id, account: patients.hmoAccountNumber })
        .from(patients)
        .where(inArray(patients.id, part));
      for (const account of accounts) accountByPatient.set(account.id, account.account);
    } catch (error) {
      // Until 2026-10-patient-hmo-details.sql is run the column is missing:
      // the report still works, without account numbers.
      if (!String(error).includes("hmo_account_number")) throw error;
      console.warn("HMO billing: patients.hmo_account_number is missing.");
      break;
    }
  }
  // A patient can have several HMOs: use the account number of the HMO the
  // line is billed to.
  const hmosByPatient = await listPatientHmos(patientIds);

  // Which lines are already on an active billing.
  const billedBy = new Map<string, string>();
  for (const part of chunks(real.map((row) => row.id))) {
    try {
      const billed = await db
        .select({
          transactionId: hmoBillingLines.transactionId,
          billingNumber: hmoBillings.billingNumber,
        })
        .from(hmoBillingLines)
        .innerJoin(hmoBillings, eq(hmoBillings.id, hmoBillingLines.billingId))
        .where(
          and(
            eq(hmoBillingLines.active, true),
            inArray(hmoBillingLines.transactionId, part),
          ),
        );
      for (const entry of billed) billedBy.set(entry.transactionId, entry.billingNumber);
    } catch (error) {
      if (!billingTablesMissing(error)) throw error;
      console.warn(
        "HMO billing tables are missing; run scripts/sql/2026-11-hmo-billings.sql.",
      );
      break;
    }
  }

  return sortHmoLines(
    real.map((row) => ({
      transactionId: row.id,
      visitDate: row.visitDate,
      visitId: row.visitId,
      hmo: hmoNameFor(row.paymentType),
      patientName: row.patientName,
      hmoAccountNumber: row.patientId
        ? accountNumberFor(
            hmosByPatient.get(row.patientId) ?? [],
            hmoNameFor(row.paymentType),
            accountByPatient.get(row.patientId) ?? "",
          )
        : "",
      loaNumber: (row.lineLoa || row.visitLoa || "").trim(),
      loeNumber: (row.loeNumber ?? "").trim(),
      procedure: row.procedure,
      teeth: row.teeth ?? "",
      amount: round2(Number(row.amount)),
      billedOn: billedBy.get(row.id) ?? "",
    })),
  );
}

function toBilling(row: HmoBillingRow): HmoBilling {
  return {
    id: row.id,
    billingNumber: row.billingNumber,
    hmo: row.hmo,
    branchName: row.branchName,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    totalAmount: round2(Number(row.totalAmount)),
    lineCount: row.lineCount,
    patientCount: row.patientCount,
    pendingLoaCount: row.pendingLoaCount,
    status: row.status === "Void" ? "Void" : "Active",
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    voidedByName: row.voidedByName,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
  };
}

export type CreateBillingResult =
  | { ok: true; billing: HmoBilling }
  | { ok: false; message: string };

/**
 * Saves a billing for one HMO, one branch and a cut-off range.
 *
 * The rows are read again here (never taken from the screen), lines already
 * on an active billing are left out, and the number comes from a counter
 * raised by ONE statement, so two people generating at once cannot get the
 * same number. The unique index on active billing lines is the backstop
 * against billing a line twice; if it trips, the half-made billing is
 * removed again.
 */
export async function createHmoBilling(input: {
  hmo: string;
  branchId: string;
  from: string;
  to: string;
  actor: { userId: string | null; name: string };
}): Promise<CreateBillingResult> {
  const problem = rangeProblem(input.from, input.to);
  if (problem) return { ok: false, message: problem };
  const hmo = hmoPaymentNames().find(
    (name) => name.toLowerCase() === input.hmo.trim().toLowerCase(),
  );
  if (!hmo) return { ok: false, message: "Pick an HMO." };

  const [branch] = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.id, input.branchId))
    .limit(1);
  if (!branch) return { ok: false, message: "Pick a branch." };

  const all = await getHmoBillingLines({
    from: input.from,
    to: input.to,
    branchId: branch.id,
    hmo,
  });
  const lines = all.filter((line) => !line.billedOn);
  if (lines.length === 0) {
    return {
      ok: false,
      message:
        all.length > 0
          ? "Every line in this range is already on a saved billing."
          : "There is nothing to bill for this HMO, branch and range.",
    };
  }
  const totals = summarizeHmoLines(lines);

  const prefix = billingPrefix(branch.name);
  const year = billingYear(new Date());
  const [counter] = await db
    .insert(hmoBillingCounters)
    .values({ prefix, year, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [hmoBillingCounters.prefix, hmoBillingCounters.year],
      set: { lastNumber: sql`${hmoBillingCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: hmoBillingCounters.lastNumber });
  const billingNumber = formatBillingNumber(prefix, year, counter.lastNumber);

  const [created] = await db
    .insert(hmoBillings)
    .values({
      billingNumber,
      hmo,
      branchId: branch.id,
      branchName: branch.name,
      periodFrom: input.from,
      periodTo: input.to,
      totalAmount: totals.total.toFixed(2),
      lineCount: totals.lineCount,
      patientCount: totals.patientCount,
      pendingLoaCount: totals.pendingLoaCount,
      createdByUserId: input.actor.userId,
      createdByName: input.actor.name,
    })
    .returning();

  try {
    let lineNumber = 0;
    for (const part of chunks(lines)) {
      await db.insert(hmoBillingLines).values(
        part.map((line) => ({
          billingId: created.id,
          transactionId: line.transactionId,
          lineNumber: ++lineNumber,
          visitId: line.visitId,
          visitDate: line.visitDate,
          patientName: line.patientName,
          hmoAccountNumber: line.hmoAccountNumber,
          loaNumber: line.loaNumber,
          loeNumber: line.loeNumber,
          procedure: line.procedure,
          teeth: line.teeth,
          amount: line.amount.toFixed(2),
        })),
      );
    }
  } catch (error) {
    // Someone else billed one of these lines a moment ago (unique index),
    // or the save failed: take the half-made billing away again.
    await db.delete(hmoBillings).where(eq(hmoBillings.id, created.id));
    if (String(error).includes("hmo_billing_lines_active_transaction_idx")) {
      return {
        ok: false,
        message:
          "Some of these lines were just billed by someone else. Show the preview again and retry.",
      };
    }
    throw error;
  }

  return { ok: true, billing: toBilling(created) };
}

/** Saved billings, newest first. */
const NO_BRANCH_UUID = "00000000-0000-0000-0000-000000000000";

export async function listHmoBillings(input: {
  branchId: string | null;
  /** When set, only billings of these clinics (a person with several). */
  branchIds?: string[] | null;
  limit?: number;
}): Promise<{ billings: HmoBilling[]; tablesMissing: boolean }> {
  try {
    const rows = await db
      .select()
      .from(hmoBillings)
      .where(
        input.branchId
          ? eq(hmoBillings.branchId, input.branchId)
          : input.branchIds
            ? inArray(hmoBillings.branchId, input.branchIds.length > 0 ? input.branchIds : [NO_BRANCH_UUID])
            : undefined,
      )
      .orderBy(desc(hmoBillings.createdAt))
      .limit(input.limit ?? 50);
    return { billings: rows.map(toBilling), tablesMissing: false };
  } catch (error) {
    if (!billingTablesMissing(error)) throw error;
    return { billings: [], tablesMissing: true };
  }
}

/** One saved billing with its saved rows (the frozen copy). */
export async function getHmoBilling(
  id: string,
): Promise<{ billing: HmoBilling; branchId: string | null; lines: HmoBillingLine[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select()
    .from(hmoBillings)
    .where(eq(hmoBillings.id, id))
    .limit(1);
  if (!row) return null;
  const lines = await db
    .select()
    .from(hmoBillingLines)
    .where(eq(hmoBillingLines.billingId, id))
    .orderBy(asc(hmoBillingLines.lineNumber));
  return {
    billing: toBilling(row),
    branchId: row.branchId,
    lines: lines.map((line) => ({
      transactionId: line.transactionId,
      visitDate: line.visitDate,
      visitId: line.visitId,
      hmo: row.hmo,
      patientName: line.patientName,
      hmoAccountNumber: line.hmoAccountNumber,
      loaNumber: line.loaNumber,
      loeNumber: line.loeNumber,
      procedure: line.procedure,
      teeth: line.teeth,
      amount: round2(Number(line.amount)),
      billedOn: row.billingNumber,
    })),
  };
}

/** Voids a billing and releases its lines so they can be billed again. */
export async function voidHmoBilling(input: {
  id: string;
  actorName: string;
}): Promise<{ ok: true; billing: HmoBilling } | { ok: false; message: string }> {
  const [row] = await db
    .select()
    .from(hmoBillings)
    .where(eq(hmoBillings.id, input.id))
    .limit(1);
  if (!row) return { ok: false, message: "That billing was not found." };
  if (row.status === "Void") return { ok: false, message: "It is already void." };
  const [updated] = await db
    .update(hmoBillings)
    .set({ status: "Void", voidedAt: new Date(), voidedByName: input.actorName })
    .where(eq(hmoBillings.id, input.id))
    .returning();
  await db
    .update(hmoBillingLines)
    .set({ active: false })
    .where(eq(hmoBillingLines.billingId, input.id));
  return { ok: true, billing: toBilling(updated) };
}
