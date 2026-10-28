import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { expenses, transactions } from "@/lib/db/schema";
import {
  buildOverviewData,
  type OverviewData,
  type OverviewRaw,
} from "@/lib/cashflow/overview-data";

const month = (column: typeof transactions.date | typeof expenses.date) =>
  sql<string>`substr(${column}, 1, 7)`;

const patientKey = sql<string>`lower(trim(${transactions.patientName}))`;

/**
 * The Overview page's figures, added up by the database.
 *
 * The page used to read every transaction and expense and send them all to
 * the browser. Now each card's numbers are summed per month in SQL (a few
 * hundred small rows in total, however many visits there are) and
 * `buildOverviewData` turns them into the per-period figures. `branchId`
 * limits everything to one branch (null = all branches).
 *
 * `referenceDate` is "today" on the clinic's calendar (Manila): it decides
 * which month, quarter, half and year are "current".
 */
export async function getOverviewData(input: {
  branchId: string | null;
  referenceDate: Date;
}): Promise<OverviewData> {
  const year = input.referenceDate.getFullYear();
  // The longest trailing window (annual: 5 years) starts here.
  const windowStart = `${year - 4}-01-01`;
  const yearStart = `${year}-01-01`;

  const txBranch = input.branchId
    ? eq(transactions.branchId, input.branchId)
    : undefined;
  const expBranch = input.branchId
    ? eq(expenses.branchId, input.branchId)
    : undefined;
  const hasName = sql`trim(${transactions.patientName}) <> ''`;
  const txFrom = (start: string) =>
    and(gte(transactions.date, start), txBranch);
  const expFrom = (start: string) => and(gte(expenses.date, start), expBranch);

  const [
    monthlyNet,
    monthlyExpenses,
    yearMonthly,
    yearPayments,
    yearProcedures,
    yearExpenseCategories,
    yearPatientMonths,
    patientFirstVisit,
    [allTime],
  ] = await Promise.all([
    db
      .select({
        ym: month(transactions.date),
        total: sql<string>`coalesce(sum(${transactions.netCollection}), 0)`,
      })
      .from(transactions)
      .where(txFrom(windowStart))
      .groupBy(sql`1`),
    db
      .select({
        ym: month(expenses.date),
        total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .where(expFrom(windowStart))
      .groupBy(sql`1`),
    db
      .select({
        ym: month(transactions.date),
        // One visit can have several procedure lines: count it once.
        visits: sql<number>`count(distinct coalesce(${transactions.invoiceId}::text, ${transactions.id}))::int`,
        amountPaid: sql<string>`coalesce(sum(${transactions.amountPaid}), 0)`,
        netCollection: sql<string>`coalesce(sum(${transactions.netCollection}), 0)`,
      })
      .from(transactions)
      .where(txFrom(yearStart))
      .groupBy(sql`1`),
    db
      .select({
        ym: month(transactions.date),
        paymentType: transactions.paymentType,
        total: sql<string>`coalesce(sum(${transactions.amountPaid}), 0)`,
      })
      .from(transactions)
      .where(txFrom(yearStart))
      .groupBy(sql`1`, transactions.paymentType),
    db
      .select({
        ym: month(transactions.date),
        procedure: transactions.procedure,
        count: sql<number>`count(*)::int`,
        revenue: sql<string>`coalesce(sum(${transactions.amountPaid}), 0)`,
      })
      .from(transactions)
      .where(txFrom(yearStart))
      .groupBy(sql`1`, transactions.procedure),
    db
      .select({
        ym: month(expenses.date),
        category: expenses.category,
        total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .where(expFrom(yearStart))
      .groupBy(sql`1`, expenses.category),
    db
      .selectDistinct({
        ym: month(transactions.date),
        patientKey,
      })
      .from(transactions)
      .where(and(txFrom(yearStart), hasName)),
    // The first-ever visit of every patient seen this year.
    db
      .select({
        patientKey,
        firstDate: sql<string>`min(${transactions.date})`,
      })
      .from(transactions)
      .where(
        and(
          txBranch,
          hasName,
          sql`${patientKey} in (
            select lower(trim(t2.patient_name)) from transactions t2
            where t2.date >= ${yearStart} and trim(t2.patient_name) <> ''
            ${input.branchId ? sql`and t2.branch_id = ${input.branchId}` : sql``}
          )`,
        ),
      )
      .groupBy(patientKey),
    db
      .select({
        value: sql<number>`count(distinct ${patientKey})::int`,
      })
      .from(transactions)
      .where(and(txBranch, hasName)),
  ]);

  const raw: OverviewRaw = {
    monthlyNet: monthlyNet.map((row) => ({
      ym: row.ym,
      total: Number(row.total),
    })),
    monthlyExpenses: monthlyExpenses.map((row) => ({
      ym: row.ym,
      total: Number(row.total),
    })),
    yearMonthly: yearMonthly.map((row) => ({
      ym: row.ym,
      visits: row.visits,
      amountPaid: Number(row.amountPaid),
      netCollection: Number(row.netCollection),
    })),
    yearPayments: yearPayments.map((row) => ({
      ym: row.ym,
      paymentType: row.paymentType,
      total: Number(row.total),
    })),
    yearProcedures: yearProcedures.map((row) => ({
      ym: row.ym,
      procedure: row.procedure,
      count: row.count,
      revenue: Number(row.revenue),
    })),
    yearExpenseCategories: yearExpenseCategories.map((row) => ({
      ym: row.ym,
      category: row.category,
      total: Number(row.total),
    })),
    yearPatientMonths: yearPatientMonths.map((row) => ({
      ym: row.ym,
      patientKey: row.patientKey,
    })),
    patientFirstVisit: patientFirstVisit.map((row) => ({
      patientKey: row.patientKey,
      firstDate: row.firstDate,
    })),
    allTimePatients: allTime?.value ?? 0,
  };

  return buildOverviewData(raw, input.referenceDate);
}
