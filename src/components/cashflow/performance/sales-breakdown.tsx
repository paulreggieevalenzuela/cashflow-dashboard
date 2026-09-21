"use client";

import { useState } from "react";
import { TrendLineChart } from "@/components/cashflow/dashboard/charts";
import { BRAND_LINE_COLOR } from "@/lib/cashflow/chart-palette";

export type SalesPeriodRow = {
  periodLabel: string;
  netCollection: number;
  commissionAmount: number;
  transactionCount: number;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const GRANULARITIES = [
  { value: "month", label: "Monthly", recentCount: 12 },
  { value: "quarter", label: "Quarterly", recentCount: 8 },
  { value: "year", label: "Annual", recentCount: 5 },
] as const;

type Granularity = (typeof GRANULARITIES)[number]["value"];

export function SalesBreakdown({
  monthly,
  quarterly,
  annual,
  showCommission,
  commissionLabel = "Commission",
}: {
  monthly: SalesPeriodRow[];
  quarterly: SalesPeriodRow[];
  annual: SalesPeriodRow[];
  /** Hide the commission column entirely when there's nothing to show
   * (e.g. no rates set yet) rather than a column of zeroes. */
  showCommission: boolean;
  /** "Commission" for a dentist's view, "Bonus" for a staff member's —
   * same underlying `commissionAmount` field either way. */
  commissionLabel?: string;
}) {
  const [granularity, setGranularity] = useState<Granularity>("month");

  const dataByGranularity: Record<Granularity, SalesPeriodRow[]> = {
    month: monthly,
    quarter: quarterly,
    year: annual,
  };

  const activeMeta = GRANULARITIES.find((g) => g.value === granularity)!;
  const rows = dataByGranularity[granularity].slice(-activeMeta.recentCount);

  if (monthly.length === 0 && quarterly.length === 0 && annual.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        No linked sales yet for this selection.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Sales period"
        className="inline-flex rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {GRANULARITIES.map((option) => {
          const isActive = option.value === granularity;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setGranularity(option.value)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {rows.length > 0 && (
        <TrendLineChart
          points={rows.map((row) => ({ label: row.periodLabel, total: row.netCollection }))}
          color={BRAND_LINE_COLOR}
          formatValue={(value) => currencyFormatter.format(value)}
          ariaLabel={`Net collection by ${activeMeta.label.toLowerCase()} period`}
        />
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 text-right font-medium">Net collection</th>
              {showCommission && (
                <th className="px-4 py-3 text-right font-medium">{commissionLabel}</th>
              )}
              <th className="px-4 py-3 text-right font-medium">Transactions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows
              .slice()
              .reverse()
              .map((row) => (
                <tr key={row.periodLabel} className="text-zinc-700 dark:text-zinc-300">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                    {row.periodLabel}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {currencyFormatter.format(row.netCollection)}
                  </td>
                  {showCommission && (
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {currencyFormatter.format(row.commissionAmount)}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {row.transactionCount}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
