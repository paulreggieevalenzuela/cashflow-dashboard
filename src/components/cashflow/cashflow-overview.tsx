"use client";

import { useMemo, useState } from "react";
import {
  CashflowTrendCard,
  ExpenseBreakdownCard,
  IncomeExpenseCard,
  PatientsCard,
  PaymentMethodsCard,
  PopularProceduresCard,
  TargetVsActualCard,
  type TargetPeriodData,
  type TargetPeriodType,
} from "@/components/cashflow/dashboard/dashboard-cards";
import { CsvUpload } from "@/components/cashflow/csv-upload";
import {
  filterTransactionsToCurrentPeriod,
  netCollectionSeriesByGranularity,
  GRANULARITY_OPTIONS,
  type Granularity,
} from "@/lib/cashflow/dashboard-metrics";
import type { CashflowTransaction } from "@/lib/cashflow/schema";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function CashflowOverview({
  transactions,
  userName,
  targets,
  canEditTargets = false,
}: {
  transactions: CashflowTransaction[];
  userName?: string;
  /** This period's admin-set target for month/quarter/year, `null` where
   * none has been set yet — fetched server-side from the `sales_targets`
   * table (see targets.ts) since it's not derivable from `transactions`. */
  targets?: Record<TargetPeriodType, number | null>;
  canEditTargets?: boolean;
}) {
  // The single page-wide period picker, next to the greeting — every card
  // below (besides the CSV importer and the target-vs-actual card, which
  // has its own independent period selector) reflects whichever
  // granularity is selected here.
  const [granularity, setGranularity] = useState<Granularity>("monthly");

  // Precomputed once per load for every granularity, so switching the
  // picker is an instant client-side recompute — no refetch, and only the
  // already-fetched `transactions` (not additional data) is used.
  const trendSeriesByGranularity: Record<Granularity, ReturnType<typeof netCollectionSeriesByGranularity>> =
    useMemo(
      () => ({
        monthly: netCollectionSeriesByGranularity(transactions, "monthly"),
        quarterly: netCollectionSeriesByGranularity(transactions, "quarterly"),
        semiAnnual: netCollectionSeriesByGranularity(transactions, "semiAnnual"),
        annual: netCollectionSeriesByGranularity(transactions, "annual"),
      }),
      [transactions],
    );

  // Just the transactions inside the *current* period at the selected
  // granularity (e.g. this month, this quarter) — feeds the stat cards and
  // every period-scoped card (Payment methods, Patients, Popular
  // procedures). `PatientsCard` is the one exception: it takes the full
  // `transactions` list itself, since it also reports an all-time figure
  // alongside the period-scoped one.
  const periodTransactions = useMemo(
    () => filterTransactionsToCurrentPeriod(transactions, granularity),
    [transactions, granularity],
  );

  const totalAmountPaid = periodTransactions.reduce((sum, t) => sum + t.amountPaid, 0);
  const totalNetCollection = periodTransactions.reduce((sum, t) => sum + t.netCollection, 0);

  // "This period"'s actual is just the last point of each trailing
  // series above (it already ends at "now") — no separate computation
  // needed, just a different granularity name for the same three periods
  // the sales-target feature uses (month/quarter/year, no semi-annual).
  // This is intentionally independent of the page-level `granularity`
  // picker above — the target card has always had its own period-type
  // selector.
  const targetPeriods: Record<TargetPeriodType, TargetPeriodData> = {
    month: {
      periodKey: trendSeriesByGranularity.monthly.at(-1)!.key,
      periodLabel: trendSeriesByGranularity.monthly.at(-1)!.label,
      actual: trendSeriesByGranularity.monthly.at(-1)!.total,
      target: targets?.month ?? null,
    },
    quarter: {
      periodKey: trendSeriesByGranularity.quarterly.at(-1)!.key,
      periodLabel: trendSeriesByGranularity.quarterly.at(-1)!.label,
      actual: trendSeriesByGranularity.quarterly.at(-1)!.total,
      target: targets?.quarter ?? null,
    },
    year: {
      periodKey: trendSeriesByGranularity.annual.at(-1)!.key,
      periodLabel: trendSeriesByGranularity.annual.at(-1)!.label,
      actual: trendSeriesByGranularity.annual.at(-1)!.total,
      target: targets?.year ?? null,
    },
  };

  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {greetingForHour(now.getHours())}
            {userName ? `, ${userName.split(" ")[0]}!` : "!"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{dateLabel}</p>
        </div>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <label
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
            htmlFor="overview-granularity"
          >
            Viewing by
          </label>
          <select
            id="overview-granularity"
            value={granularity}
            onChange={(event) => setGranularity(event.target.value as Granularity)}
            className="select-chevron rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
          >
            {GRANULARITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Transactions" value={periodTransactions.length.toString()} />
        <StatCard label="Amount paid" value={currencyFormatter.format(totalAmountPaid)} />
        <StatCard label="Net collection" value={currencyFormatter.format(totalNetCollection)} />
      </section>

      <section className="grid grid-cols-1">
        <TargetVsActualCard periods={targetPeriods} canEdit={canEditTargets} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <CashflowTrendCard seriesByGranularity={trendSeriesByGranularity} granularity={granularity} />
        </div>
        <PaymentMethodsCard transactions={periodTransactions} granularity={granularity} />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <IncomeExpenseCard series={trendSeriesByGranularity[granularity]} granularity={granularity} />
        <ExpenseBreakdownCard />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PatientsCard transactions={transactions} granularity={granularity} />
        <PopularProceduresCard transactions={periodTransactions} granularity={granularity} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Import CSV
        </h2>
        <CsvUpload />
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}
