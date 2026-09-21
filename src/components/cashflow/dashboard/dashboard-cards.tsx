"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { setSalesTargetAction } from "@/app/cashflow/targets-actions";
import {
  GRANULARITY_OPTIONS,
  patientStats,
  paymentMethodBreakdown,
  periodOverPeriodChange,
  topProcedures,
  type Granularity,
  type PeriodPoint,
} from "@/lib/cashflow/dashboard-metrics";
import {
  BRAND_LINE_COLOR,
  CATEGORICAL_PALETTE,
  CHART_OTHER_COLOR,
} from "@/lib/cashflow/chart-palette";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import { DonutChart, DonutLegend, GroupedBarChart, TrendLineChart, type DonutSegment } from "./charts";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

/**
 * A hand-rolled compact currency formatter — deliberately NOT
 * `Intl.NumberFormat(..., { notation: "compact" })`. That API's compact
 * rounding/fraction-digit rules come from the runtime's bundled ICU/CLDR
 * data, and Node's (used for SSR) and the browser's don't always agree —
 * e.g. one renders "₱800", the other "₱800.0" for the exact same input.
 * Since this string lands straight in server-rendered markup (chart
 * tooltips, the payment-methods donut's center value) any such mismatch
 * is a real React hydration error, not just a cosmetic one. Doing the
 * K/M/B scaling by hand instead means the output only depends on the
 * input number — identical on the server and in the browser, always.
 */
function formatCompactCurrency(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  function scaled(divisor: number, suffix: string): string {
    const n = Math.round((abs / divisor) * 10) / 10;
    const text = Number.isInteger(n) ? n.toString() : n.toFixed(1);
    return `${sign}₱${text}${suffix}`;
  }

  if (abs >= 1_000_000_000) return scaled(1_000_000_000, "B");
  if (abs >= 1_000_000) return scaled(1_000_000, "M");
  if (abs >= 1_000) return scaled(1_000, "K");
  return `${sign}₱${Math.round(abs)}`;
}

/**
 * Small pill marking a card (or part of one) as illustrative rather than
 * computed from real data — see the project doc for which cards this
 * applies to and what a real version would need.
 */
export function SampleDataBadge({ label = "Sample data" }: { label?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.72-1.36 3.485 0l6.28 11.18c.75 1.334-.213 2.987-1.742 2.987H3.72c-1.53 0-2.492-1.653-1.743-2.987l6.28-11.18ZM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-.25-6.5a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5Z"
          clipRule="evenodd"
        />
      </svg>
      {label}
    </span>
  );
}

function CardShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      {children}
    </div>
  );
}

/**
 * Real: net collection summed straight from your transactions, at
 * whichever granularity the viewer picks from the dropdown (monthly,
 * quarterly, semi-annual, or annual). All four series are precomputed
 * server-side and handed in as `seriesByGranularity` — switching here is
 * an instant local state change, no data refetch.
 */
export function CashflowTrendCard({
  seriesByGranularity,
  granularity,
}: {
  seriesByGranularity: Record<Granularity, PeriodPoint[]>;
  /** Controlled by the page-level period picker next to the greeting —
   * this card no longer owns its own dropdown. */
  granularity: Granularity;
}) {
  const option = GRANULARITY_OPTIONS.find((o) => o.value === granularity) ?? GRANULARITY_OPTIONS[0];
  const series = seriesByGranularity[granularity];
  const { current, pctChange } = periodOverPeriodChange(series);
  const periodTotal = series.reduce((sum, point) => sum + point.total, 0);

  return (
    <CardShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Cashflow</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Net collection, last {series.length} {option.periodNoun}
            {series.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {currencyFormatter.format(current)}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">this {option.periodNoun}</p>
          {pctChange !== null && (
            <p
              className={`text-xs font-medium ${
                pctChange >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {pctChange >= 0 ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}% vs last {option.periodNoun}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4">
        <TrendLineChart
          points={series}
          color={BRAND_LINE_COLOR}
          formatValue={formatCompactCurrency}
          ariaLabel={`Net collection by ${option.periodNoun}`}
        />
      </div>
      <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
        {currencyFormatter.format(periodTotal)} total collected over this period.
      </p>
    </CardShell>
  );
}

// Illustrative only — not derived from real amounts, so it can't be
// mistaken for a computed figure. See ExpenseBreakdownCard for why.
const SAMPLE_MONTHLY_EXPENSES = [15200, 18400, 14100, 21300, 17600, 19900];

/**
 * Income half is real (the same per-granularity series as the cashflow
 * trend card, sliced to the trailing 6 points); expenses are sample data.
 */
export function IncomeExpenseCard({
  series,
  granularity,
}: {
  series: PeriodPoint[];
  granularity: Granularity;
}) {
  const option = GRANULARITY_OPTIONS.find((o) => o.value === granularity) ?? GRANULARITY_OPTIONS[0];
  const recent = series.slice(-6);
  const points = recent.map((point, index) => ({
    label: point.label,
    values: [point.total, SAMPLE_MONTHLY_EXPENSES[index % SAMPLE_MONTHLY_EXPENSES.length]],
  }));

  return (
    <CardShell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Income &amp; expense</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Last {recent.length} {option.periodNoun}
            {recent.length === 1 ? "" : "s"}
          </p>
        </div>
        <SampleDataBadge label="Expenses are sample data" />
      </div>
      <div className="mt-4">
        <GroupedBarChart
          points={points}
          series={[
            { name: "Income", color: BRAND_LINE_COLOR },
            { name: "Expenses", color: CATEGORICAL_PALETTE[1] },
          ]}
          formatValue={formatCompactCurrency}
          ariaLabel="Income versus expense by month"
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: BRAND_LINE_COLOR }}
            aria-hidden="true"
          />
          Income — from your transactions
        </span>
        <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: CATEGORICAL_PALETTE[1] }}
            aria-hidden="true"
          />
          Expenses — sample, not tracked yet
        </span>
      </div>
    </CardShell>
  );
}

const SAMPLE_EXPENSE_CATEGORIES: DonutSegment[] = [
  { label: "Rent", value: 30, color: CATEGORICAL_PALETTE[0] },
  { label: "Wages", value: 22, color: CATEGORICAL_PALETTE[1] },
  { label: "Supplies", value: 18, color: CATEGORICAL_PALETTE[2] },
  { label: "Equipment", value: 20, color: CATEGORICAL_PALETTE[3] },
  { label: "Marketing", value: 8, color: CATEGORICAL_PALETTE[4] },
  { label: "Other", value: 2, color: CHART_OTHER_COLOR },
];

/** Fully illustrative — there's no expenses table yet, see the project doc. */
export function ExpenseBreakdownCard() {
  return (
    <CardShell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Expenses by category</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Illustrative breakdown</p>
        </div>
        <SampleDataBadge />
      </div>
      <div className="mt-4 flex items-center gap-6">
        <DonutChart segments={SAMPLE_EXPENSE_CATEGORIES} centerValue="100%" centerLabel="of expenses" />
        <div className="flex-1">
          <DonutLegend segments={SAMPLE_EXPENSE_CATEGORIES} />
        </div>
      </div>
      <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
        Not tracked yet — add an expenses table to replace this with real numbers.
      </p>
    </CardShell>
  );
}

/**
 * Real: grouped from the `procedure` field on your transactions —
 * `transactions` is expected to already be scoped to the page-level
 * picker's current period (see `filterTransactionsToCurrentPeriod`);
 * `granularity` is only used here for the "this X" copy.
 */
export function PopularProceduresCard({
  transactions,
  granularity,
}: {
  transactions: CashflowTransaction[];
  granularity: Granularity;
}) {
  const option = GRANULARITY_OPTIONS.find((o) => o.value === granularity) ?? GRANULARITY_OPTIONS[0];
  const { top, otherCount } = topProcedures(transactions, 5);
  const maxCount = Math.max(...top.map((item) => item.count), 1);

  return (
    <CardShell>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Popular procedures</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        By number of transactions, this {option.periodNoun}
      </p>
      <ul className="mt-4 space-y-3">
        {top.map((item, index) => (
          <li key={item.procedure}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{item.procedure}</span>
              <span className="text-zinc-500 dark:text-zinc-400">{item.count}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: `${(item.count / maxCount) * 100}%`,
                  backgroundColor: CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length],
                }}
              />
            </div>
          </li>
        ))}
        {top.length === 0 && (
          <li className="text-sm text-zinc-400 dark:text-zinc-500">No transactions yet.</li>
        )}
      </ul>
      {otherCount > 0 && (
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          +{otherCount} more across other procedures
        </p>
      )}
    </CardShell>
  );
}

/**
 * Real: grouped from the `paymentType` field on your transactions —
 * `transactions` is expected to already be scoped to the page-level
 * picker's current period (see `filterTransactionsToCurrentPeriod`).
 */
export function PaymentMethodsCard({
  transactions,
  granularity,
}: {
  transactions: CashflowTransaction[];
  granularity: Granularity;
}) {
  const option = GRANULARITY_OPTIONS.find((o) => o.value === granularity) ?? GRANULARITY_OPTIONS[0];
  const all = paymentMethodBreakdown(transactions);
  const top = all.slice(0, 5);
  const other = all.slice(5);
  const otherTotal = other.reduce((sum, item) => sum + item.total, 0);
  const grandTotal = all.reduce((sum, item) => sum + item.total, 0);

  const segments: DonutSegment[] = [
    ...top.map((item, index) => ({
      label: item.paymentType,
      value: item.total,
      color: CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length],
    })),
    ...(otherTotal > 0 ? [{ label: "Other", value: otherTotal, color: CHART_OTHER_COLOR }] : []),
  ];

  return (
    <CardShell>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Payment methods</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Share of amount paid, this {option.periodNoun}
      </p>
      {segments.length > 0 ? (
        <div className="mt-4 flex items-center gap-6">
          <DonutChart
            segments={segments}
            centerValue={formatCompactCurrency(grandTotal)}
            centerLabel="collected"
          />
          <div className="flex-1">
            <DonutLegend segments={segments} total={grandTotal} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-400 dark:text-zinc-500">No transactions yet.</p>
      )}
    </CardShell>
  );
}

/**
 * Real, with a caveat: patients are identified by name only (the schema
 * has no stable patient id), so this is a good estimate, not an exact
 * figure — two different patients sharing a name would undercount.
 *
 * `transactions` should be the *full*, unscoped list (not pre-filtered to
 * the current period) — `patientStats` needs every row to compute both
 * the all-time `uniquePatients` figure and the period-scoped new/returning
 * breakdown itself, from `granularity`.
 */
export function PatientsCard({
  transactions,
  granularity,
}: {
  transactions: CashflowTransaction[];
  granularity: Granularity;
}) {
  const option = GRANULARITY_OPTIONS.find((o) => o.value === granularity) ?? GRANULARITY_OPTIONS[0];
  const stats = patientStats(transactions, granularity);
  const newPct = stats.periodUnique === 0 ? 0 : (stats.newInPeriod / stats.periodUnique) * 100;
  const returningPct = 100 - newPct;
  const periodLabel = option.periodNoun === "month" ? "This month" : `This ${option.periodNoun}`;

  return (
    <CardShell>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Patients</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{periodLabel}</p>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {stats.newInPeriod}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">New patients</p>
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {stats.returningInPeriod}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Returning patients</p>
        </div>
      </div>
      {stats.periodUnique > 0 && (
        <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full" style={{ width: `${newPct}%`, backgroundColor: BRAND_LINE_COLOR }} />
          <div
            className="h-full"
            style={{ width: `${returningPct}%`, backgroundColor: CATEGORICAL_PALETTE[1] }}
          />
        </div>
      )}
      <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
        {stats.uniquePatients} unique patients on record overall
      </p>
    </CardShell>
  );
}

export type TargetPeriodType = "month" | "quarter" | "year";

export type TargetPeriodData = {
  periodKey: string;
  periodLabel: string;
  actual: number;
  target: number | null;
};

// Quarterly is intentionally left out of the picker — this card only
// offers Monthly and Annual. `TargetPeriodType`/`periods` still cover
// "quarter" (see CashflowOverview, which still computes it) so a
// previously-set quarterly target isn't lost, it's just not reachable
// from this dropdown.
const TARGET_PERIOD_OPTIONS: { value: TargetPeriodType; label: string; noun: string }[] = [
  { value: "month", label: "Monthly", noun: "month" },
  { value: "year", label: "Annual", noun: "year" },
];

/**
 * Real: `periods` is precomputed server-side (actual net collection from
 * your transactions, target from the `sales_targets` table — see
 * `currentPeriodKeys` in dashboard-metrics.ts and `getSalesTarget` in
 * targets.ts) for the current month, quarter, and year at once, so
 * switching the period type here is an instant local state change like
 * the cashflow trend card above, no refetch. Admin can set/edit the
 * target for whichever period is selected; everyone else sees it
 * read-only.
 */
export function TargetVsActualCard({
  periods,
  canEdit,
}: {
  periods: Record<TargetPeriodType, TargetPeriodData>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [periodType, setPeriodType] = useState<TargetPeriodType>("month");
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  const option = TARGET_PERIOD_OPTIONS.find((o) => o.value === periodType)!;
  const data = periods[periodType];
  const target = data.target;
  const pct = target && target > 0 ? Math.round((data.actual / target) * 100) : null;
  const achieved = target ? Math.min(data.actual, target) : 0;
  const remaining = target ? Math.max(target - data.actual, 0) : 0;

  function switchPeriod(next: TargetPeriodType) {
    setPeriodType(next);
    setIsEditing(false);
    setFormError(null);
  }

  function startEditing() {
    setEditValue(target ? target.toString() : "");
    setFormError(null);
    setIsEditing(true);
  }

  async function handleSave() {
    setFormError(null);
    setStatus("submitting");

    const result = await setSalesTargetAction(periodType, data.periodKey, Number(editValue) || 0);

    setStatus("idle");
    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    setIsEditing(false);
    router.refresh();
  }

  return (
    <CardShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Target vs actual
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{data.periodLabel}</p>
        </div>
        <div
          role="group"
          aria-label="Target period"
          className="inline-flex rounded-lg border border-zinc-300 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {TARGET_PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={periodType === opt.value}
              onClick={() => switchPeriod(opt.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                periodType === opt.value
                  ? "bg-white text-amber-700 shadow-sm dark:bg-zinc-700 dark:text-amber-300"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {target ? (
          <div className="flex items-center gap-6">
            <DonutChart
              segments={[
                { label: "Achieved", value: achieved, color: BRAND_LINE_COLOR },
                { label: "Remaining", value: remaining, color: CHART_OTHER_COLOR },
              ]}
              centerValue={`${pct}%`}
              centerLabel="of target"
            />
            <div className="flex-1 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Actual</span>
                <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                  {currencyFormatter.format(data.actual)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Target</span>
                <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                  {currencyFormatter.format(target)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            No target set for this {option.noun} yet.
          </p>
        )}
      </div>

      {canEdit && (
        <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          {formError && (
            <p className="mb-2 text-xs text-red-600 dark:text-red-400">{formError}</p>
          )}
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                autoFocus
                placeholder="0.00"
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                className="w-32 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={status === "submitting"}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {status === "submitting" ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={status === "submitting"}
                className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
            >
              {target ? "Edit target" : "Set a target"}
            </button>
          )}
        </div>
      )}
    </CardShell>
  );
}
