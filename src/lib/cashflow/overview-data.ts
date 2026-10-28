/**
 * The Overview page's figures, built from small SQL roll-ups instead of the
 * whole transaction table.
 *
 * Before, the page loaded every transaction and expense and sent them all to
 * the browser, which worked everything out there. Now the database adds the
 * rows up by month (see `src/lib/db/overview.ts`) and this pure module turns
 * those monthly sums into what each card shows, for all four period
 * pickers, so the browser receives a few hundred numbers instead of the
 * whole history. Pure (no database, no React), so the arithmetic can be
 * checked on its own.
 */

import {
  GRANULARITY_OPTIONS,
  periodKeyAndLabel,
  trailingPeriodTotals,
  type ExpenseCategoryStat,
  type Granularity,
  type PatientStats,
  type PaymentStat,
  type PeriodPoint,
  type ProcedureStat,
} from "@/lib/cashflow/dashboard-metrics";
import { isCheckInPlaceholder } from "@/lib/cashflow/visit-status";

/** "YYYY-MM" */
type YearMonth = string;

/** What the database returns: sums per month (and per month and label). */
export type OverviewRaw = {
  /** Net collection per month, for the trailing window. */
  monthlyNet: Array<{ ym: YearMonth; total: number }>;
  /** Expenses per month, for the trailing window. */
  monthlyExpenses: Array<{ ym: YearMonth; total: number }>;
  /** This calendar year, per month: visits, amount paid, net collection. */
  yearMonthly: Array<{
    ym: YearMonth;
    visits: number;
    amountPaid: number;
    netCollection: number;
  }>;
  yearPayments: Array<{ ym: YearMonth; paymentType: string; total: number }>;
  yearProcedures: Array<{
    ym: YearMonth;
    procedure: string;
    count: number;
    revenue: number;
  }>;
  yearExpenseCategories: Array<{
    ym: YearMonth;
    category: string;
    total: number;
  }>;
  /** Patients seen this calendar year, by month (one entry per patient and month). */
  yearPatientMonths: Array<{ ym: YearMonth; patientKey: string }>;
  /** The first-ever visit date (YYYY-MM-DD) of each patient seen this year. */
  patientFirstVisit: Array<{ patientKey: string; firstDate: string }>;
  /** Unique patients on record, all time. */
  allTimePatients: number;
};

export type PeriodStats = {
  visits: number;
  amountPaid: number;
  netCollection: number;
  payments: PaymentStat[];
  procedures: { top: ProcedureStat[]; otherCount: number; otherRevenue: number };
  expenseCategories: ExpenseCategoryStat[];
  patients: PatientStats;
};

export type OverviewData = {
  /** Trailing net-collection series per picker value. */
  trend: Record<Granularity, PeriodPoint[]>;
  /** Trailing expense series per picker value. */
  expenseTrend: Record<Granularity, PeriodPoint[]>;
  /** The current period's figures per picker value. */
  current: Record<Granularity, PeriodStats>;
};

const GRANULARITIES = GRANULARITY_OPTIONS.map((option) => option.value);

/** The key of the period that contains a "YYYY-MM" month. */
function keyOfMonth(ym: YearMonth, granularity: Granularity): string {
  const [year, month] = ym.split("-").map(Number);
  return periodKeyAndLabel(year, month - 1, granularity).key;
}

/** The key of the period that contains a "YYYY-MM-DD" date. */
function keyOfDate(date: string, granularity: Granularity): string {
  return keyOfMonth(date.slice(0, 7), granularity);
}

function toShares<K extends string>(
  totals: Map<K, number>,
  name: (key: K) => string,
): Array<{ key: K; label: string; total: number; pct: number }> {
  let grand = 0;
  for (const value of totals.values()) grand += value;
  return [...totals.entries()]
    .map(([key, total]) => ({
      key,
      label: name(key),
      total,
      pct: grand === 0 ? 0 : (total / grand) * 100,
    }))
    .sort((a, b) => b.total - a.total);
}

function periodStats(
  raw: OverviewRaw,
  granularity: Granularity,
  currentKey: string,
): PeriodStats {
  const inPeriod = (ym: YearMonth) => keyOfMonth(ym, granularity) === currentKey;

  let visits = 0;
  let amountPaid = 0;
  let netCollection = 0;
  for (const row of raw.yearMonthly) {
    if (!inPeriod(row.ym)) continue;
    visits += row.visits;
    amountPaid += row.amountPaid;
    netCollection += row.netCollection;
  }

  const byPayment = new Map<string, number>();
  for (const row of raw.yearPayments) {
    if (!inPeriod(row.ym)) continue;
    const key = row.paymentType.trim() || "Unspecified";
    byPayment.set(key, (byPayment.get(key) ?? 0) + row.total);
  }
  const payments: PaymentStat[] = toShares(byPayment, (key) => key).map(
    (item) => ({ paymentType: item.label, total: item.total, pct: item.pct }),
  );

  const byProcedure = new Map<string, ProcedureStat>();
  for (const row of raw.yearProcedures) {
    if (!inPeriod(row.ym) || isCheckInPlaceholder(row.procedure)) continue;
    const key = row.procedure.trim() || "Unspecified";
    const existing = byProcedure.get(key);
    if (existing) {
      existing.count += row.count;
      existing.revenue += row.revenue;
    } else {
      byProcedure.set(key, {
        procedure: key,
        count: row.count,
        revenue: row.revenue,
      });
    }
  }
  const sortedProcedures = [...byProcedure.values()].sort(
    (a, b) => b.count - a.count,
  );
  const restProcedures = sortedProcedures.slice(5);

  const byCategory = new Map<string, number>();
  for (const row of raw.yearExpenseCategories) {
    if (!inPeriod(row.ym)) continue;
    const key = row.category.trim() || "Unspecified";
    byCategory.set(key, (byCategory.get(key) ?? 0) + row.total);
  }
  const expenseCategories: ExpenseCategoryStat[] = toShares(
    byCategory,
    (key) => key,
  ).map((item) => ({ category: item.label, total: item.total, pct: item.pct }));

  const inPeriodPatients = new Set<string>();
  for (const row of raw.yearPatientMonths) {
    if (inPeriod(row.ym)) inPeriodPatients.add(row.patientKey);
  }
  const firstDates = new Map(
    raw.patientFirstVisit.map((row) => [row.patientKey, row.firstDate]),
  );
  let newInPeriod = 0;
  for (const patient of inPeriodPatients) {
    const first = firstDates.get(patient);
    if (first && keyOfDate(first, granularity) === currentKey) newInPeriod += 1;
  }

  return {
    visits,
    amountPaid,
    netCollection,
    payments,
    procedures: {
      top: sortedProcedures.slice(0, 5),
      otherCount: restProcedures.reduce((sum, item) => sum + item.count, 0),
      otherRevenue: restProcedures.reduce((sum, item) => sum + item.revenue, 0),
    },
    expenseCategories,
    patients: {
      uniquePatients: raw.allTimePatients,
      periodUnique: inPeriodPatients.size,
      newInPeriod,
      returningInPeriod: inPeriodPatients.size - newInPeriod,
    },
  };
}

/** Everything the Overview shows, for every period picker value. */
export function buildOverviewData(
  raw: OverviewRaw,
  referenceDate: Date,
): OverviewData {
  const trend = {} as OverviewData["trend"];
  const expenseTrend = {} as OverviewData["expenseTrend"];
  const current = {} as OverviewData["current"];

  for (const granularity of GRANULARITIES) {
    trend[granularity] = trailingPeriodTotals(
      raw.monthlyNet,
      (row) => `${row.ym}-01`,
      (row) => row.total,
      granularity,
      referenceDate,
    );
    expenseTrend[granularity] = trailingPeriodTotals(
      raw.monthlyExpenses,
      (row) => `${row.ym}-01`,
      (row) => row.total,
      granularity,
      referenceDate,
    );
    const currentKey = periodKeyAndLabel(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      granularity,
    ).key;
    current[granularity] = periodStats(raw, granularity, currentKey);
  }
  return { trend, expenseTrend, current };
}
