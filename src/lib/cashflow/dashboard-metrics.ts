import type { CashflowTransaction } from "@/lib/cashflow/schema";

/**
 * Pure, DB-free aggregation over an already-fetched transaction list. The
 * dataset is small enough (hundreds to low thousands of rows for a single
 * clinic) that computing these in memory on each page load is simpler and
 * cheaper than maintaining separate SQL rollups — revisit with real
 * aggregate queries if the transaction count grows into the tens of
 * thousands.
 */

export type MonthlyPoint = PeriodPoint;

/** A single point on any of the trend-chart granularities below. */
export type PeriodPoint = {
  /** e.g. "2026-03" (monthly), "2026-Q1" (quarterly), "2026-H1" (semi-annual), "2026" (annual) */
  key: string;
  /** e.g. "Mar 2026", "Q1 2026", "H1 2026", "2026" */
  label: string;
  total: number;
};

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * The four granularities the dashboard's cashflow trend chart can be
 * switched between. `periodsBack` is how many trailing periods the chart
 * shows; `monthsPerPeriod` is how many calendar months make up one period
 * (used to walk the trailing window and to bucket each transaction).
 */
export type Granularity = "monthly" | "quarterly" | "semiAnnual" | "annual";

export const GRANULARITY_OPTIONS: {
  value: Granularity;
  label: string;
  /** Singular noun for one period, used in "this {periodNoun}" / "vs last {periodNoun}" copy. */
  periodNoun: string;
}[] = [
  { value: "monthly", label: "Monthly", periodNoun: "month" },
  { value: "quarterly", label: "Quarterly", periodNoun: "quarter" },
  { value: "semiAnnual", label: "Semi-annual", periodNoun: "half-year" },
  { value: "annual", label: "Annual", periodNoun: "year" },
];

const GRANULARITY_CONFIG: Record<Granularity, { periodsBack: number; monthsPerPeriod: number }> = {
  monthly: { periodsBack: 12, monthsPerPeriod: 1 },
  quarterly: { periodsBack: 8, monthsPerPeriod: 3 },
  semiAnnual: { periodsBack: 6, monthsPerPeriod: 6 },
  annual: { periodsBack: 5, monthsPerPeriod: 12 },
};

function periodKeyAndLabel(
  year: number,
  monthIndex0: number,
  granularity: Granularity,
): { key: string; label: string } {
  switch (granularity) {
    case "monthly": {
      const key = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
      const label = new Date(year, monthIndex0, 1).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
      return { key, label };
    }
    case "quarterly": {
      const quarter = Math.floor(monthIndex0 / 3) + 1;
      return { key: `${year}-Q${quarter}`, label: `Q${quarter} ${year}` };
    }
    case "semiAnnual": {
      const half = Math.floor(monthIndex0 / 6) + 1;
      return { key: `${year}-H${half}`, label: `H${half} ${year}` };
    }
    case "annual":
      return { key: `${year}`, label: `${year}` };
  }
}

/**
 * The current period's key at each of the three granularities the sales
 * target feature uses (month/quarter/year — a target has no semi-annual
 * option, unlike the trend chart's four granularities). Used to look up
 * "this period's" target and to read "this period's" actual straight off
 * the last point of `netCollectionSeriesByGranularity`'s trailing series.
 */
export function currentPeriodKeys(referenceDate = new Date()): {
  month: string;
  quarter: string;
  year: string;
} {
  return {
    month: periodKeyAndLabel(referenceDate.getFullYear(), referenceDate.getMonth(), "monthly").key,
    quarter: periodKeyAndLabel(referenceDate.getFullYear(), referenceDate.getMonth(), "quarterly").key,
    year: periodKeyAndLabel(referenceDate.getFullYear(), referenceDate.getMonth(), "annual").key,
  };
}

/**
 * A trailing, zero-filled net-collection series at any of the four
 * granularities above, ending at the period containing `referenceDate`.
 * Used by the dashboard's cashflow trend chart and the income/expense
 * card, both driven by the same page-level granularity picker.
 * `monthlyNetCollectionSeries` below is kept as a fixed-monthly variant
 * for anything that specifically needs that rather than the selected
 * granularity.
 */
export function netCollectionSeriesByGranularity(
  transactions: CashflowTransaction[],
  granularity: Granularity,
  referenceDate = new Date(),
): PeriodPoint[] {
  const { periodsBack, monthsPerPeriod } = GRANULARITY_CONFIG[granularity];

  const totalsByKey = new Map<string, number>();
  for (const transaction of transactions) {
    const parsed = new Date(`${transaction.date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) continue;
    const { key } = periodKeyAndLabel(parsed.getFullYear(), parsed.getMonth(), granularity);
    totalsByKey.set(key, (totalsByKey.get(key) ?? 0) + transaction.netCollection);
  }

  // Align the cursor to the start of the reference period, then step back
  // (periodsBack - 1) whole periods so the series ends on the current one.
  const periodStartMonth0 = Math.floor(referenceDate.getMonth() / monthsPerPeriod) * monthsPerPeriod;
  const cursor = new Date(referenceDate.getFullYear(), periodStartMonth0, 1);
  cursor.setMonth(cursor.getMonth() - monthsPerPeriod * (periodsBack - 1));

  const points: PeriodPoint[] = [];
  for (let i = 0; i < periodsBack; i++) {
    const { key, label } = periodKeyAndLabel(cursor.getFullYear(), cursor.getMonth(), granularity);
    points.push({ key, label, total: totalsByKey.get(key) ?? 0 });
    cursor.setMonth(cursor.getMonth() + monthsPerPeriod);
  }

  return points;
}

/**
 * Just the transactions that fall in the *current* period at a given
 * granularity (e.g. this calendar month, this quarter, this half-year,
 * this year) — the basis for the dashboard-wide period picker: every card
 * driven by it (stat cards, payment methods, patients, popular
 * procedures) is fed this instead of the full transaction list, so
 * switching the picker recomputes every one of them to the same window.
 */
export function filterTransactionsToCurrentPeriod(
  transactions: CashflowTransaction[],
  granularity: Granularity,
  referenceDate = new Date(),
): CashflowTransaction[] {
  const currentKey = periodKeyAndLabel(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    granularity,
  ).key;

  return transactions.filter((transaction) => {
    const parsed = new Date(`${transaction.date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;
    return (
      periodKeyAndLabel(parsed.getFullYear(), parsed.getMonth(), granularity).key === currentKey
    );
  });
}

/**
 * A trailing `monthsBack`-month series ending at `referenceDate`'s month,
 * summing `netCollection` per month. Months with no transactions are
 * zero-filled rather than omitted, so the chart's x-axis is always
 * contiguous and a quiet month reads as "$0", not as a gap.
 */
export function monthlyNetCollectionSeries(
  transactions: CashflowTransaction[],
  monthsBack = 12,
  referenceDate = new Date(),
): MonthlyPoint[] {
  const totalsByMonth = new Map<string, number>();
  for (const transaction of transactions) {
    const parsed = new Date(`${transaction.date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = monthKey(parsed);
    totalsByMonth.set(key, (totalsByMonth.get(key) ?? 0) + transaction.netCollection);
  }

  const points: MonthlyPoint[] = [];
  const cursor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  cursor.setMonth(cursor.getMonth() - (monthsBack - 1));

  for (let i = 0; i < monthsBack; i++) {
    const key = monthKey(cursor);
    points.push({
      key,
      label: monthLabel(cursor),
      total: totalsByMonth.get(key) ?? 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return points;
}

export function periodOverPeriodChange(series: MonthlyPoint[]): {
  current: number;
  previous: number;
  pctChange: number | null;
} {
  const current = series.at(-1)?.total ?? 0;
  const previous = series.at(-2)?.total ?? 0;
  const pctChange = previous === 0 ? null : ((current - previous) / previous) * 100;
  return { current, previous, pctChange };
}

export type ProcedureStat = {
  procedure: string;
  count: number;
  revenue: number;
};

/** Top procedures by frequency, with an "Other" bucket for the long tail. */
export function topProcedures(
  transactions: CashflowTransaction[],
  limit = 5,
): { top: ProcedureStat[]; otherCount: number; otherRevenue: number } {
  const byProcedure = new Map<string, ProcedureStat>();
  for (const transaction of transactions) {
    const key = transaction.procedure.trim() || "Unspecified";
    const existing = byProcedure.get(key);
    if (existing) {
      existing.count += 1;
      existing.revenue += transaction.amountPaid;
    } else {
      byProcedure.set(key, { procedure: key, count: 1, revenue: transaction.amountPaid });
    }
  }

  const sorted = Array.from(byProcedure.values()).sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, limit);
  const rest = sorted.slice(limit);

  return {
    top,
    otherCount: rest.reduce((sum, item) => sum + item.count, 0),
    otherRevenue: rest.reduce((sum, item) => sum + item.revenue, 0),
  };
}

export type PaymentStat = {
  paymentType: string;
  total: number;
  pct: number;
};

/** Revenue share by payment method, largest first, with a share-of-total pct. */
export function paymentMethodBreakdown(transactions: CashflowTransaction[]): PaymentStat[] {
  const byType = new Map<string, number>();
  let grandTotal = 0;

  for (const transaction of transactions) {
    const key = transaction.paymentType.trim() || "Unspecified";
    byType.set(key, (byType.get(key) ?? 0) + transaction.amountPaid);
    grandTotal += transaction.amountPaid;
  }

  return Array.from(byType.entries())
    .map(([paymentType, total]) => ({
      paymentType,
      total,
      pct: grandTotal === 0 ? 0 : (total / grandTotal) * 100,
    }))
    .sort((a, b) => b.total - a.total);
}

export type PatientStats = {
  /** All-time unique patients across every transaction passed in — not
   * scoped to the current period, so the card can still show an "overall"
   * figure alongside the period-scoped breakdown below. */
  uniquePatients: number;
  periodUnique: number;
  newInPeriod: number;
  returningInPeriod: number;
};

/**
 * A "patient" here is identified by name only — the CSV/manual-entry
 * schema has no stable patient id, so two different patients who happen to
 * share a name would be undercounted. A dedicated `patients` table (see
 * the dashboard write-up) would fix this; treat these counts as a good
 * estimate, not an exact figure, until then.
 *
 * `granularity` scopes the "new vs. returning" breakdown to whatever
 * period the dashboard-wide picker is set to (this month/quarter/etc.) —
 * `uniquePatients` alone stays all-time regardless, since `transactions`
 * is expected to be the *full* list here (see `filterTransactionsToCurrentPeriod`
 * for scoping the other cards).
 */
export function patientStats(
  transactions: CashflowTransaction[],
  granularity: Granularity = "monthly",
  referenceDate = new Date(),
): PatientStats {
  const firstVisitByPatient = new Map<string, string>();
  for (const transaction of transactions) {
    const key = transaction.patientName.trim().toLowerCase();
    if (!key) continue;
    const existing = firstVisitByPatient.get(key);
    if (!existing || transaction.date < existing) {
      firstVisitByPatient.set(key, transaction.date);
    }
  }

  const currentPeriodKey = periodKeyAndLabel(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    granularity,
  ).key;

  const patientsInPeriod = new Set<string>();
  for (const transaction of transactions) {
    const parsed = new Date(`${transaction.date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) continue;
    const { key } = periodKeyAndLabel(parsed.getFullYear(), parsed.getMonth(), granularity);
    if (key === currentPeriodKey) {
      patientsInPeriod.add(transaction.patientName.trim().toLowerCase());
    }
  }

  let newInPeriod = 0;
  for (const patient of patientsInPeriod) {
    const firstVisit = firstVisitByPatient.get(patient);
    if (!firstVisit) continue;
    const firstVisitDate = new Date(`${firstVisit}T00:00:00`);
    const firstVisitKey = periodKeyAndLabel(
      firstVisitDate.getFullYear(),
      firstVisitDate.getMonth(),
      granularity,
    ).key;
    if (firstVisitKey === currentPeriodKey) {
      newInPeriod += 1;
    }
  }

  return {
    uniquePatients: firstVisitByPatient.size,
    periodUnique: patientsInPeriod.size,
    newInPeriod,
    returningInPeriod: patientsInPeriod.size - newInPeriod,
  };
}
