import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { payments, type PaymentRow } from "@/lib/db/schema";
import { appliedToBill, round2 } from "@/lib/cashflow/pricing";

/**
 * Payments belong to an INVOICE: one payment (say, one card swipe) can pay
 * for several procedure lines at once. `invoices` + its lines hold what is
 * due; the rows here are what was actually received, and "balance due" is
 * always total due minus the sum of these — never stored, so it can't drift.
 */
export type Payment = {
  id: string;
  invoiceId: string | null;
  amount: number;
  paymentType: string;
  referenceNo: string;
  paidAt: Date;
  notes: string;
  createdAt: Date;
};

/** Marks payment rows created by a CSV import, so re-importing a corrected
 * file replaces exactly those and never touches ones staff typed in. */
export const IMPORT_PAYMENT_NOTE = "Imported from Day End report";

function toAppPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    amount: Number(row.amount),
    paymentType: row.paymentType,
    referenceNo: row.referenceNo,
    paidAt: row.paidAt,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

export async function listPaymentsForInvoice(
  invoiceId: string,
): Promise<Payment[]> {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
    .orderBy(desc(payments.paidAt), desc(payments.createdAt));
  return rows.map(toAppPayment);
}

export async function addPayment(input: {
  invoiceId: string;
  amount: number;
  paymentType: string;
  referenceNo?: string;
  paidAt?: Date;
  notes?: string;
}): Promise<Payment> {
  const [row] = await db
    .insert(payments)
    .values({
      invoiceId: input.invoiceId,
      amount: input.amount.toString(),
      paymentType: input.paymentType,
      referenceNo: input.referenceNo ?? "",
      paidAt: input.paidAt ?? new Date(),
      notes: input.notes ?? "",
    })
    .returning();
  return toAppPayment(row);
}

/** Removes a payment and returns the invoice it belonged to (so the
 * caller can refresh that visit's merchant fee). */
export async function deletePayment(id: string): Promise<string | null> {
  const [row] = await db
    .select({ invoiceId: payments.invoiceId })
    .from(payments)
    .where(eq(payments.id, id))
    .limit(1);
  await db.delete(payments).where(eq(payments.id, id));
  return row?.invoiceId ?? null;
}

const CHUNK = 200;

type BulkPaymentRow = {
  invoiceId: string;
  amount: number;
  paymentType: string;
  paidAt: Date;
  referenceNo?: string;
  notes?: string;
};

/**
 * Inserts many payment rows in one go, chunked like `upsertTransactions`
 * (the neon-http driver has a per-request size limit). Used by the CSV
 * import and by `scripts/backfill-payments.ts`.
 */
export async function bulkInsertPayments(
  rows: BulkPaymentRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const values = rows.map((row) => ({
    invoiceId: row.invoiceId,
    amount: row.amount.toString(),
    paymentType: row.paymentType,
    paidAt: row.paidAt,
    referenceNo: row.referenceNo ?? "",
    notes: row.notes ?? "",
  }));

  for (let i = 0; i < values.length; i += CHUNK) {
    await db.insert(payments).values(values.slice(i, i + CHUNK));
  }
}

/**
 * Re-importing a Day End file: drops the payments an earlier import made
 * for these invoices (identified by `IMPORT_PAYMENT_NOTE`) and writes the
 * fresh ones. Payments typed in by hand are left alone.
 */
export async function replaceImportedPayments(
  invoiceIds: string[],
  rows: BulkPaymentRow[],
): Promise<void> {
  for (let i = 0; i < invoiceIds.length; i += CHUNK) {
    await db
      .delete(payments)
      .where(
        and(
          inArray(payments.invoiceId, invoiceIds.slice(i, i + CHUNK)),
          eq(payments.notes, IMPORT_PAYMENT_NOTE),
        ),
      );
  }
  await bulkInsertPayments(
    rows.map((row) => ({ ...row, notes: IMPORT_PAYMENT_NOTE })),
  );
}

/**
 * Invoice ids that already have at least one payment row — used by the
 * backfill script to skip invoices that already have payments, so
 * re-running it never double-records.
 */
export async function listInvoiceIdsWithPayments(): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ invoiceId: payments.invoiceId })
    .from(payments);
  return new Set(rows.flatMap((row) => (row.invoiceId ? [row.invoiceId] : [])));
}

/**
 * Total collected per invoice for a batch of invoice ids, in one query per
 * chunk. "Collected" is what counts towards the BILL: card payments include
 * their merchant fee, which is taken out here (see `splitReceived`). An
 * invoice with no payments simply isn't in the map (treat as 0).
 */
export async function getCollectedTotalsByInvoice(
  invoiceIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (let i = 0; i < invoiceIds.length; i += CHUNK) {
    const rows = await db
      .select({
        invoiceId: payments.invoiceId,
        paymentType: payments.paymentType,
        total: sql<string>`sum(${payments.amount})`,
      })
      .from(payments)
      .where(inArray(payments.invoiceId, invoiceIds.slice(i, i + CHUNK)))
      .groupBy(payments.invoiceId, payments.paymentType);
    for (const row of rows) {
      if (row.invoiceId) {
        result.set(
          row.invoiceId,
          round2(
            (result.get(row.invoiceId) ?? 0) +
              appliedToBill(Number(row.total), row.paymentType),
          ),
        );
      }
    }
  }
  return result;
}
