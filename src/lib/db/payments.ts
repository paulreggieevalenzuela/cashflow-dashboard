import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { payments, type PaymentRow } from "@/lib/db/schema";

export type Payment = {
  id: string;
  transactionId: string;
  amount: number;
  paymentType: string;
  paidAt: Date;
  notes: string;
  createdAt: Date;
};

function toAppPayment(row: PaymentRow): Payment {
  return { ...row, amount: Number(row.amount) };
}

export async function listPaymentsForTransaction(transactionId: string): Promise<Payment[]> {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.transactionId, transactionId))
    .orderBy(desc(payments.paidAt), desc(payments.createdAt));
  return rows.map(toAppPayment);
}

export async function addPayment(input: {
  transactionId: string;
  amount: number;
  paymentType: string;
  paidAt?: Date;
  notes?: string;
}): Promise<Payment> {
  const [row] = await db
    .insert(payments)
    .values({
      transactionId: input.transactionId,
      amount: input.amount.toString(),
      paymentType: input.paymentType,
      paidAt: input.paidAt ?? new Date(),
      notes: input.notes ?? "",
    })
    .returning();
  return toAppPayment(row);
}

export async function deletePayment(id: string): Promise<void> {
  await db.delete(payments).where(eq(payments.id, id));
}

/**
 * All payment rows for a transaction, gone with it — called from
 * `deleteTransaction` (see transactions.ts) since there's no DB-level
 * cascade configured beyond the FK itself... actually there is
 * (`onDelete: "cascade"` on `payments.transactionId`), so this is here as
 * an explicit, readable step for callers that need payments gone before
 * the transaction row disappears (none currently do) — kept for symmetry
 * with the rest of this module rather than relied upon for cleanup.
 */
export async function deletePaymentsForTransaction(transactionId: string): Promise<void> {
  await db.delete(payments).where(eq(payments.transactionId, transactionId));
}

const BULK_INSERT_CHUNK_SIZE = 200;

/**
 * Inserts many payment rows in one go, chunked the same way
 * `upsertTransactions` chunks its inserts (see the note there) — the
 * neon-http driver's per-request size limit applies here too, and a
 * backfill can easily mean one row per existing transaction. Used by
 * `scripts/backfill-payments.ts`; not used by the single-payment UI flow
 * (`addPayment` above), which never needs to batch.
 */
export async function bulkInsertPayments(
  rows: Array<{
    transactionId: string;
    amount: number;
    paymentType: string;
    paidAt: Date;
    notes?: string;
  }>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const values = rows.map((row) => ({
    transactionId: row.transactionId,
    amount: row.amount.toString(),
    paymentType: row.paymentType,
    paidAt: row.paidAt,
    notes: row.notes ?? "",
  }));

  for (let i = 0; i < values.length; i += BULK_INSERT_CHUNK_SIZE) {
    await db.insert(payments).values(values.slice(i, i + BULK_INSERT_CHUNK_SIZE));
  }
}

/**
 * Distinct transaction ids that already have at least one payment row —
 * used by the backfill script to skip transactions that were entered
 * through the app after payments existed (or were already backfilled),
 * so re-running the backfill never double-records a payment.
 */
export async function listTransactionIdsWithPayments(): Promise<Set<string>> {
  const rows = await db.selectDistinct({ transactionId: payments.transactionId }).from(payments);
  return new Set(rows.map((row) => row.transactionId));
}

/**
 * Total collected per transaction, for a whole batch of transaction ids in
 * one query — used by the transactions table/list to show a "balance due"
 * flag without an N+1 query per row. Transactions with no payment rows at
 * all simply don't appear in the returned map (treat a missing key as 0
 * collected), which normally only happens right after a transaction is
 * created and before its first payment is recorded.
 */
export async function getCollectedTotals(
  transactionIds: string[],
): Promise<Map<string, number>> {
  if (transactionIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      transactionId: payments.transactionId,
      total: sql<string>`sum(${payments.amount})`,
    })
    .from(payments)
    .where(inArray(payments.transactionId, transactionIds))
    .groupBy(payments.transactionId);

  return new Map(rows.map((row) => [row.transactionId, Number(row.total)]));
}
