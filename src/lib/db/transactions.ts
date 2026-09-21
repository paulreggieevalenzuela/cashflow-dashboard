import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getCommissionRateMap } from "@/lib/db/commission-rates";
import { findDentistUserByName } from "@/lib/db/dentists";
import { getOrCreateProcedureByName } from "@/lib/db/procedures";
import {
  dentistCommissionRates,
  transactions,
  users,
  type NewTransactionRow,
  type TransactionRow,
} from "@/lib/db/schema";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import type { TransactionSortKey, TransactionsQueryParams } from "@/lib/cashflow/transactions-query";

/**
 * `numeric` columns round-trip as strings through the Postgres driver (see
 * the note in schema.ts) but the rest of the app works with JS numbers, per
 * `CashflowTransactionSchema`. These two helpers are the only place that
 * conversion happens.
 */
function toAppTransaction(row: TransactionRow): CashflowTransaction {
  return {
    ...row,
    amountPaid: Number(row.amountPaid),
    vatExclusive: Number(row.vatExclusive),
    vatAmount: Number(row.vatAmount),
    merchantFee: Number(row.merchantFee),
    withholdingTax: Number(row.withholdingTax),
    netCollection: Number(row.netCollection),
    commissionAmount: row.commissionAmount === null ? undefined : Number(row.commissionAmount),
  };
}

function toDbRow(transaction: CashflowTransaction): NewTransactionRow {
  return {
    ...transaction,
    amountPaid: transaction.amountPaid.toString(),
    vatExclusive: transaction.vatExclusive.toString(),
    vatAmount: transaction.vatAmount.toString(),
    merchantFee: transaction.merchantFee.toString(),
    withholdingTax: transaction.withholdingTax.toString(),
    netCollection: transaction.netCollection.toString(),
    commissionAmount: transaction.commissionAmount?.toString(),
  };
}

export async function listTransactions(): Promise<CashflowTransaction[]> {
  const rows = await db.select().from(transactions).orderBy(asc(transactions.date));
  return rows.map(toAppTransaction);
}

export type TransactionsPage = {
  rows: CashflowTransaction[];
  total: number;
};

/**
 * Paginated variant of `listTransactions`, for the transactions table.
 * `listTransactions` (all rows) is kept as-is for the dashboard, which needs
 * the full dataset to compute totals/trends.
 *
 * Ordered the same way as `listTransactions` (`date` ascending), with
 * `createdAt` as a tiebreaker — LIMIT/OFFSET pagination needs a fully
 * deterministic order, otherwise rows with the same date could shift
 * between pages. This covers every row in the table the same way
 * regardless of how it got there (manual entry, CSV import, or any future
 * API) — there's only one `transactions` table, so pagination is agnostic
 * to the source.
 */
// Columns the transactions table can be sorted by — `date`/`createdAt` stays
// the tiebreaker underneath whichever one is active, so LIMIT/OFFSET
// pagination is always fully deterministic regardless of sort column.
const SORT_COLUMNS = {
  date: transactions.date,
  patientName: transactions.patientName,
  dentist: transactions.dentist,
  amountPaid: transactions.amountPaid,
  netCollection: transactions.netCollection,
} as const satisfies Record<TransactionSortKey, unknown>;

export type TransactionsPageQuery = Pick<
  TransactionsQueryParams,
  "q" | "type" | "payment" | "dentist" | "from" | "to" | "sort" | "dir"
> & {
  limit: number;
  offset: number;
};

export async function listTransactionsPage({
  limit,
  offset,
  q,
  type,
  payment,
  dentist,
  from,
  to,
  sort = "date",
  dir = "desc",
}: TransactionsPageQuery): Promise<TransactionsPage> {
  const conditions = [];

  const search = q?.trim();
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(transactions.patientName, term),
        ilike(transactions.dentist, term),
        ilike(transactions.procedure, term),
        ilike(transactions.invoiceNumber, term),
        ilike(transactions.paymentType, term),
      ),
    );
  }
  if (type) conditions.push(eq(transactions.transactionType, type));
  if (payment) conditions.push(eq(transactions.paymentType, payment));
  if (dentist) conditions.push(eq(transactions.dentist, dentist));
  if (from) conditions.push(gte(transactions.date, from));
  if (to) conditions.push(lte(transactions.date, to));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const orderFn = dir === "desc" ? desc : asc;
  const sortColumn = SORT_COLUMNS[sort] ?? transactions.date;
  const orderBy =
    sort === "date"
      ? [orderFn(sortColumn), orderFn(transactions.createdAt)]
      : [orderFn(sortColumn), asc(transactions.date), asc(transactions.createdAt)];

  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(transactions).where(whereClause),
  ]);

  return {
    rows: rows.map(toAppTransaction),
    total: totalResult[0]?.count ?? 0,
  };
}

export async function getTransactionById(
  id: string,
): Promise<CashflowTransaction | undefined> {
  const [row] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  return row ? toAppTransaction(row) : undefined;
}

/**
 * Resolves `dentistUserId` and `procedureId` for a batch of transactions,
 * and the commission each row earns from whatever rate is currently set
 * for its (dentist, procedure) pair.
 *
 * Batched by *distinct* dentist/procedure name rather than once per row —
 * a CSV import might have hundreds of rows but only a handful of distinct
 * dentists and procedures, so this keeps the number of DB round trips
 * proportional to the variety in the data, not its size.
 */
async function resolveCommissionLinks(rows: CashflowTransaction[]) {
  const distinctDentistNames = [
    ...new Set(rows.map((row) => row.dentist?.trim()).filter((name): name is string => Boolean(name))),
  ];
  const distinctProcedureNames = [
    ...new Set(rows.map((row) => row.procedure.trim()).filter(Boolean)),
  ];

  const [dentistMatches, procedureMatches, rateMap] = await Promise.all([
    Promise.all(distinctDentistNames.map((name) => findDentistUserByName(name))),
    Promise.all(distinctProcedureNames.map((name) => getOrCreateProcedureByName(name))),
    getCommissionRateMap(),
  ]);

  const dentistIdByName = new Map<string, string>();
  distinctDentistNames.forEach((name, index) => {
    const match = dentistMatches[index];
    if (match) {
      dentistIdByName.set(name.toLowerCase(), match.id);
    }
  });

  const procedureIdByName = new Map<string, string>();
  distinctProcedureNames.forEach((name, index) => {
    const match = procedureMatches[index];
    if (match) {
      procedureIdByName.set(name.toLowerCase(), match.id);
    }
  });

  return rows.map((row) => {
    const dentistUserId = dentistIdByName.get((row.dentist ?? "").trim().toLowerCase()) ?? null;
    const procedureId = procedureIdByName.get(row.procedure.trim().toLowerCase()) ?? null;

    let commissionAmount = 0;
    if (dentistUserId && procedureId) {
      const rate = rateMap.get(`${dentistUserId}:${procedureId}`);
      if (rate) {
        commissionAmount = Math.round(row.netCollection * (rate / 100) * 100) / 100;
      }
    }

    return { dentistUserId, procedureId, commissionAmount };
  });
}

/**
 * Inserts new transactions, or updates them in place when their id already
 * exists (e.g. re-importing an overlapping CSV export, or re-adding a
 * manually-entered row with the same id). `createdAt` is left untouched on
 * conflict so the original insert time is preserved; every other column
 * (including the commission link/amount, in case a rate or account changed
 * since the last save) is set to whatever value was being inserted
 * (`excluded.<column>`), the standard Postgres upsert idiom.
 */
// The neon-http driver sends each query as a single HTTP request; a
// one-shot insert of thousands of rows (e.g. backfilling every existing
// transaction) can exceed its request size limit and fail with an opaque
// "Database request failed" (no Postgres error code — it never reaches
// Postgres). Chunking keeps every request well under that ceiling and has
// no effect on correctness, since each chunk is its own complete upsert.
const UPSERT_CHUNK_SIZE = 200;

export async function upsertTransactions(rows: CashflowTransaction[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const links = await resolveCommissionLinks(rows);

  const values = rows.map((row, index) => ({
    ...toDbRow(row),
    dentistUserId: links[index].dentistUserId,
    procedureId: links[index].procedureId,
    commissionAmount: links[index].commissionAmount.toString(),
  }));

  for (let i = 0; i < values.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = values.slice(i, i + UPSERT_CHUNK_SIZE);
    await db
      .insert(transactions)
      .values(chunk)
      .onConflictDoUpdate({
        target: transactions.id,
        set: {
          date: sql`excluded.date`,
          visitId: sql`excluded.visit_id`,
          patientName: sql`excluded.patient_name`,
          transactionType: sql`excluded.transaction_type`,
          visitType: sql`excluded.visit_type`,
          dentist: sql`excluded.dentist`,
          dentistUserId: sql`excluded.dentist_user_id`,
          procedure: sql`excluded.procedure`,
          procedureId: sql`excluded.procedure_id`,
          paymentType: sql`excluded.payment_type`,
          amountPaid: sql`excluded.amount_paid`,
          vatExclusive: sql`excluded.vat_exclusive`,
          vatAmount: sql`excluded.vat_amount`,
          month: sql`excluded.month`,
          year: sql`excluded.year`,
          invoiceNumber: sql`excluded.invoice_number`,
          remarks: sql`excluded.remarks`,
          merchantFee: sql`excluded.merchant_fee`,
          withholdingTax: sql`excluded.withholding_tax`,
          netCollection: sql`excluded.net_collection`,
          commissionAmount: sql`excluded.commission_amount`,
          branchId: sql`excluded.branch_id`,
          createdByUserId: sql`excluded.created_by_user_id`,
          transactionNumber: sql`excluded.transaction_number`,
        },
      });
  }
}

/**
 * Generates the next human-facing transaction number, in "MMDDYY-####"
 * format (e.g. "091726-0001") — the date the transaction is *recorded*
 * (not necessarily the visit date) plus a same-day running sequence. This
 * is the invoice-facing reference number shown to patients; it is distinct
 * from the internal `id` (the upsert key) and the free-text `invoiceNumber`
 * CSV field.
 *
 * Only transactions created through the app call this — bulk CSV import of
 * historical data leaves `transactionNumber` null, since those rows
 * weren't "recorded" on the date they occurred and backfilling a number
 * for them would be misleading.
 *
 * Implemented as a count of same-day rows rather than a DB sequence:
 * simple and adequate at this clinic's transaction volume, though two
 * transactions created in the same instant could in principle race to the
 * same number. Acceptable tradeoff for a low-concurrency single-clinic
 * app — revisit with a Postgres sequence per day if that ever becomes a
 * problem.
 */
export async function generateTransactionNumber(recordDate: Date = new Date()): Promise<string> {
  const mm = String(recordDate.getMonth() + 1).padStart(2, "0");
  const dd = String(recordDate.getDate()).padStart(2, "0");
  const yy = String(recordDate.getFullYear() % 100).padStart(2, "0");
  const prefix = `${mm}${dd}${yy}`;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(sql`${transactions.transactionNumber} like ${prefix + "-%"}`);

  const nextSeq = (row?.count ?? 0) + 1;
  return `${prefix}-${String(nextSeq).padStart(4, "0")}`;
}

/**
 * Generates the next Visit ID for a given visit date, in "YYYYMMDD-###"
 * format (e.g. "20260921-001") — a same-day running sequence keyed off the
 * `date` the visit actually happened on (unlike `generateTransactionNumber`,
 * which is keyed off the date the transaction was *recorded*). Used by the
 * manual "Add transaction" form, which no longer collects a Visit ID from
 * staff at all.
 *
 * Implemented as a count of same-day-prefix rows, same tradeoff as
 * `generateTransactionNumber` — fine at this clinic's volume, revisit with
 * a real sequence if that ever changes.
 */
export async function generateVisitId(visitDate: string): Promise<string> {
  const prefix = visitDate.replaceAll("-", "");

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(sql`${transactions.visitId} like ${prefix + "-%"}`);

  const nextSeq = (row?.count ?? 0) + 1;
  return `${prefix}-${String(nextSeq).padStart(3, "0")}`;
}

/**
 * Generates the next invoice number, in "YYYYMMDD-####-HHmmss" format
 * (e.g. "20260921-0007-143522") — today's date, a same-day running
 * sequence, and the time of creation. The manual form no longer collects
 * this from staff at all (shown as a disabled field instead); it's
 * generated once here on create and preserved as-is on edit, same pattern
 * as `generateVisitId`/`generateTransactionNumber` above.
 */
export async function generateInvoiceNumber(recordDate: Date = new Date()): Promise<string> {
  const yyyy = recordDate.getFullYear();
  const mm = String(recordDate.getMonth() + 1).padStart(2, "0");
  const dd = String(recordDate.getDate()).padStart(2, "0");
  const prefix = `${yyyy}${mm}${dd}`;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(sql`${transactions.invoiceNumber} like ${prefix + "-%"}`);

  const nextSeq = (row?.count ?? 0) + 1;
  const hh = String(recordDate.getHours()).padStart(2, "0");
  const min = String(recordDate.getMinutes()).padStart(2, "0");
  const ss = String(recordDate.getSeconds()).padStart(2, "0");

  return `${prefix}-${String(nextSeq).padStart(4, "0")}-${hh}${min}${ss}`;
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.delete(transactions).where(eq(transactions.id, id));
}

export type DentistSalesRow = {
  dentistUserId: string;
  dentistName: string;
  netCollection: number;
  commissionAmount: number;
  transactionCount: number;
};

/**
 * Ranks dentists by total net collection over an optional date range
 * (`from`/`to`, inclusive, `YYYY-MM-DD`) — the basis for the "top sales"
 * leaderboard on the Performance page. Only counts transactions linked to a
 * real dentist account; unlinked rows (see `resolveCommissionLinks`) can't
 * be attributed to anyone and are excluded rather than guessed at.
 */
export async function getDentistLeaderboard({
  from,
  to,
}: {
  from?: string;
  to?: string;
} = {}): Promise<DentistSalesRow[]> {
  const conditions = [sql`${transactions.dentistUserId} is not null`];
  if (from) conditions.push(sql`${transactions.date} >= ${from}`);
  if (to) conditions.push(sql`${transactions.date} <= ${to}`);

  const rows = await db
    .select({
      dentistUserId: transactions.dentistUserId,
      dentistName: users.name,
      netCollection: sql<string>`coalesce(sum(${transactions.netCollection}), 0)`,
      commissionAmount: sql<string>`coalesce(sum(${transactions.commissionAmount}), 0)`,
      transactionCount: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.dentistUserId))
    .where(and(...conditions))
    .groupBy(transactions.dentistUserId, users.name)
    .orderBy(desc(sql`sum(${transactions.netCollection})`));

  return rows.map((row) => ({
    dentistUserId: row.dentistUserId as string,
    dentistName: row.dentistName,
    netCollection: Number(row.netCollection),
    commissionAmount: Number(row.commissionAmount),
    transactionCount: row.transactionCount,
  }));
}

export type SalesPeriod = "month" | "quarter" | "year";

export type SalesPeriodRow = {
  /** e.g. "2026-07" (month), "2026-Q3" (quarter), "2026" (year). */
  periodLabel: string;
  netCollection: number;
  commissionAmount: number;
  transactionCount: number;
};

/**
 * Sales bucketed by month, quarter, or year — either for one dentist (their
 * own Performance view) or clinic-wide (`dentistUserId` omitted). Derived
 * straight from `date` (`YYYY-MM-DD` text) rather than the stored
 * `month`/`year` display columns, since those store the month as a name
 * ("July") which isn't simple to bucket into quarters in SQL.
 */
export async function getSalesByPeriod({
  dentistUserId,
  granularity,
}: {
  dentistUserId?: string;
  granularity: SalesPeriod;
}): Promise<SalesPeriodRow[]> {
  const periodExpr =
    granularity === "year"
      ? sql<string>`substring(${transactions.date}, 1, 4)`
      : granularity === "quarter"
        ? sql<string>`substring(${transactions.date}, 1, 4) || '-Q' || ceil(substring(${transactions.date}, 6, 2)::int / 3.0)::int`
        : sql<string>`substring(${transactions.date}, 1, 7)`;

  const whereClause = dentistUserId ? eq(transactions.dentistUserId, dentistUserId) : undefined;

  const rows = await db
    .select({
      periodLabel: periodExpr,
      netCollection: sql<string>`coalesce(sum(${transactions.netCollection}), 0)`,
      commissionAmount: sql<string>`coalesce(sum(${transactions.commissionAmount}), 0)`,
      transactionCount: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(whereClause)
    .groupBy(periodExpr)
    .orderBy(periodExpr);

  return rows.map((row) => ({
    periodLabel: row.periodLabel,
    netCollection: Number(row.netCollection),
    commissionAmount: Number(row.commissionAmount),
    transactionCount: row.transactionCount,
  }));
}

export type DentistProcedureRow = {
  procedure: string;
  transactionCount: number;
  netCollection: number;
  commissionAmount: number;
};

/**
 * Per-procedure breakdown for one dentist — how much of their net
 * collection/commission came from each kind of procedure. Grouped by the
 * free-text `procedure` column (not `procedureId`) so it still reflects
 * every transaction the dentist is linked to, even ones from before the
 * `procedures` table existed or whose name didn't resolve to a row.
 */
export async function getDentistProcedureBreakdown(
  dentistUserId: string,
): Promise<DentistProcedureRow[]> {
  const rows = await db
    .select({
      procedure: transactions.procedure,
      transactionCount: sql<number>`count(*)::int`,
      netCollection: sql<string>`coalesce(sum(${transactions.netCollection}), 0)`,
      commissionAmount: sql<string>`coalesce(sum(${transactions.commissionAmount}), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.dentistUserId, dentistUserId))
    .groupBy(transactions.procedure)
    .orderBy(desc(sql`sum(${transactions.netCollection})`));

  return rows.map((row) => ({
    procedure: row.procedure,
    transactionCount: row.transactionCount,
    netCollection: Number(row.netCollection),
    commissionAmount: Number(row.commissionAmount),
  }));
}

export type DentistPatientRow = {
  patientName: string;
  visitCount: number;
  netCollection: number;
  lastVisitDate: string;
};

/**
 * Distinct patients seen by one dentist, most recent visit first. Grouped
 * by `patientName` (there's no separate patients table) — two patients who
 * happen to share an exact name will merge into one row here, a known
 * limitation rather than a bug, consistent with how the rest of the app
 * treats patient identity.
 */
export async function getDentistPatients(dentistUserId: string): Promise<DentistPatientRow[]> {
  const rows = await db
    .select({
      patientName: transactions.patientName,
      visitCount: sql<number>`count(*)::int`,
      netCollection: sql<string>`coalesce(sum(${transactions.netCollection}), 0)`,
      lastVisitDate: sql<string>`max(${transactions.date})`,
    })
    .from(transactions)
    .where(eq(transactions.dentistUserId, dentistUserId))
    .groupBy(transactions.patientName)
    .orderBy(desc(sql`max(${transactions.date})`));

  return rows.map((row) => ({
    patientName: row.patientName,
    visitCount: row.visitCount,
    netCollection: Number(row.netCollection),
    lastVisitDate: row.lastVisitDate,
  }));
}

export type StaffBonusRow = {
  staffUserId: string;
  staffName: string;
  netCollection: number;
  bonusAmount: number;
  transactionCount: number;
};

/**
 * Ranks staff by bonus earned, mirroring `getDentistLeaderboard` but
 * attributed differently: a dentist's commission is linked at save time
 * (`transactions.dentistUserId`/`commissionAmount`, resolved in
 * `resolveCommissionLinks`), while a staff bonus is computed here, on the
 * fly, from whoever *recorded* the transaction (`createdByUserId`) joined
 * against the same `dentist_commission_rates` table (role-agnostic by
 * design — see that table's doc comment). Nothing is stored: a rate change
 * changes every past period's bonus total when recomputed, unlike
 * dentist commission which is frozen at save time. That's an accepted
 * difference for now rather than a bug to fix — bonus rates are expected
 * to be set once and rarely revisited.
 */
export async function getStaffBonusLeaderboard(): Promise<StaffBonusRow[]> {
  const rows = await db
    .select({
      staffUserId: transactions.createdByUserId,
      staffName: users.name,
      netCollection: sql<string>`coalesce(sum(${transactions.netCollection}), 0)`,
      bonusAmount: sql<string>`coalesce(sum(${transactions.netCollection} * ${dentistCommissionRates.ratePercent} / 100), 0)`,
      transactionCount: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.createdByUserId))
    .innerJoin(
      dentistCommissionRates,
      and(
        eq(dentistCommissionRates.dentistUserId, transactions.createdByUserId),
        eq(dentistCommissionRates.procedureId, transactions.procedureId),
      ),
    )
    .groupBy(transactions.createdByUserId, users.name)
    .orderBy(desc(sql`sum(${transactions.netCollection} * ${dentistCommissionRates.ratePercent} / 100)`));

  return rows.map((row) => ({
    staffUserId: row.staffUserId as string,
    staffName: row.staffName,
    netCollection: Number(row.netCollection),
    bonusAmount: Number(row.bonusAmount),
    transactionCount: row.transactionCount,
  }));
}

/**
 * One staff member's bonus, bucketed by month/quarter/year — the same
 * shape as `getSalesByPeriod` (reuses the `SalesBreakdown` component,
 * where "commission" reads as "bonus" for a staff user) but computed via
 * the join described on `getStaffBonusLeaderboard` rather than a stored
 * column.
 */
export async function getStaffBonusByPeriod({
  staffUserId,
  granularity,
}: {
  staffUserId: string;
  granularity: SalesPeriod;
}): Promise<SalesPeriodRow[]> {
  const periodExpr =
    granularity === "year"
      ? sql<string>`substring(${transactions.date}, 1, 4)`
      : granularity === "quarter"
        ? sql<string>`substring(${transactions.date}, 1, 4) || '-Q' || ceil(substring(${transactions.date}, 6, 2)::int / 3.0)::int`
        : sql<string>`substring(${transactions.date}, 1, 7)`;

  const rows = await db
    .select({
      periodLabel: periodExpr,
      netCollection: sql<string>`coalesce(sum(${transactions.netCollection}), 0)`,
      commissionAmount: sql<string>`coalesce(sum(${transactions.netCollection} * ${dentistCommissionRates.ratePercent} / 100), 0)`,
      transactionCount: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(
      dentistCommissionRates,
      and(
        eq(dentistCommissionRates.dentistUserId, transactions.createdByUserId),
        eq(dentistCommissionRates.procedureId, transactions.procedureId),
      ),
    )
    .where(eq(transactions.createdByUserId, staffUserId))
    .groupBy(periodExpr)
    .orderBy(periodExpr);

  return rows.map((row) => ({
    periodLabel: row.periodLabel,
    netCollection: Number(row.netCollection),
    commissionAmount: Number(row.commissionAmount),
    transactionCount: row.transactionCount,
  }));
}
