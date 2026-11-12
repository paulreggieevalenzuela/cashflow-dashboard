import Link from "next/link";
import type { ReactNode } from "react";
import {
  GRANULARITY_OPTIONS,
  type Granularity,
} from "@/lib/cashflow/dashboard-metrics";
import {
  daysBetween,
  type ApprovalWidget,
  type BalanceWidget,
  type HmoWidget,
  type OverviewOps,
  type WaitingWidget,
} from "@/lib/cashflow/overview-ops";
import { formatMinutes } from "@/lib/cashflow/visit-status";

const money = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const periodNoun = (granularity: Granularity) =>
  GRANULARITY_OPTIONS.find((option) => option.value === granularity)?.periodNoun ??
  "period";

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
    >
      {children}
    </Link>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
      {children}
    </p>
  );
}

// ── 1. Waiting times ─────────────────────────────────────────────────

export function WaitingTimesCard({ waiting }: { waiting: WaitingWidget }) {
  const { board, today, last30Days } = waiting;
  const anyWaiting = board.now.some((row) => row.count > 0);
  const hasAverages = [...today, ...last30Days].some((stat) => stat.count > 0);
  return (
    <Card
      title="Waiting times"
      subtitle="Who is waiting now, and the usual wait"
      action={<CardLink href="/cashflow/queue">Open Queue</CardLink>}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        Right now
      </p>
      <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-900">
        {board.now.map((row) => (
          <li
            key={row.stage}
            className="flex items-baseline justify-between gap-3 py-2 text-sm"
          >
            <span className="text-zinc-700 dark:text-zinc-300">{row.label}</span>
            <span className="text-right tabular-nums text-zinc-900 dark:text-zinc-50">
              <span className="font-semibold">{row.count}</span>
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                {row.longestMinutes === null
                  ? "nobody"
                  : `longest ${formatMinutes(row.longestMinutes)}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {!anyWaiting && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Nobody is waiting right now.
        </p>
      )}
      {board.earlierOpen > 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {board.earlierOpen} open {board.earlierOpen === 1 ? "visit is" : "visits are"} from
          an earlier day (not counted above).
        </p>
      )}

      <p className="mt-5 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        Average time in each step
      </p>
      {hasAverages ? (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-500 dark:text-zinc-400">
              <th scope="col" className="py-1 text-left font-normal">
                <span className="sr-only">Step</span>
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                Today
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                Last 30 days
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {today.map((stat, index) => {
              const month = last30Days[index];
              return (
                <tr key={stat.stage}>
                  <th
                    scope="row"
                    className="py-2 text-left font-normal text-zinc-700 dark:text-zinc-300"
                  >
                    {stat.label}
                  </th>
                  <td className="py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                    {stat.averageMinutes === null ? "—" : formatMinutes(stat.averageMinutes)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                    {month?.averageMinutes == null ? "—" : formatMinutes(month.averageMinutes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Averages appear once visits are moved through Arrived, On-going and For Payment.
        </p>
      )}
    </Card>
  );
}

// ── 2. Outstanding balances ──────────────────────────────────────────

/** Light to dark amber: older balances are darker. */
const AGING_COLORS: Record<string, string> = {
  week: "bg-amber-200 dark:bg-amber-300/70",
  month: "bg-amber-400 dark:bg-amber-400",
  older: "bg-amber-700 dark:bg-amber-600",
};

export function BalancesCard({
  balances,
  today,
}: {
  balances: BalanceWidget;
  today: string;
}) {
  const oldestDays = balances.oldestDate ? daysBetween(balances.oldestDate, today) : null;
  return (
    <Card
      title="Outstanding balances"
      subtitle="What patients still owe on finished visits"
    >
      {balances.visits === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No patient owes anything. 
        </p>
      ) : (
        <>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
            {money.format(balances.total)}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {balances.visits} {balances.visits === 1 ? "visit" : "visits"}
            {oldestDays !== null
              ? ` · oldest is ${oldestDays === 0 ? "from today" : `${oldestDays} ${oldestDays === 1 ? "day" : "days"} old`}`
              : ""}
          </p>

          <div
            className="mt-4 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900"
            role="img"
            aria-label={`Balances by age: ${balances.buckets
              .map((bucket) => `${bucket.label} ${money.format(bucket.amount)}`)
              .join(", ")}`}
          >
            {balances.buckets
              .filter((bucket) => bucket.amount > 0)
              .map((bucket) => (
                <div
                  key={bucket.key}
                  className={`${AGING_COLORS[bucket.key]} rounded-full`}
                  style={{ width: `${(bucket.amount / balances.total) * 100}%` }}
                />
              ))}
          </div>
          <ul className="mt-3 space-y-1.5">
            {balances.buckets.map((bucket) => (
              <li
                key={bucket.key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 rounded-full ${AGING_COLORS[bucket.key]}`}
                  />
                  {bucket.label}
                </span>
                <span className="tabular-nums text-zinc-900 dark:text-zinc-50">
                  {money.format(bucket.amount)}
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {bucket.visits} {bucket.visits === 1 ? "visit" : "visits"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Note>
        The part the HMO pays is not counted here; see HMO receivables. Visits still
        in the queue are not counted until they reach For Payment.
      </Note>
    </Card>
  );
}

// ── 3. Approval progress ─────────────────────────────────────────────

export function ApprovalsCard({
  approvals,
  granularity,
  periodStart,
}: {
  approvals: ApprovalWidget;
  granularity: Granularity;
  periodStart: string;
}) {
  const counts = approvals.byPeriod[granularity];
  const total = counts.toCheck + counts.waitingHq + counts.approved;
  const link = (checked: string) =>
    `/cashflow/transactions?checked=${checked}&from=${periodStart}`;
  const rows = [
    {
      key: "toCheck",
      label: "To check (Branch manager)",
      value: counts.toCheck,
      href: link("no"),
      color: "bg-amber-400 dark:bg-amber-400",
      extra:
        counts.late > 0 ? `${counts.late} waiting more than 2 days` : null,
    },
    {
      key: "waitingHq",
      label: "Waiting for Headquarters",
      value: counts.waitingHq,
      href: link("hq"),
      color: "bg-sky-300 dark:bg-sky-400/80",
      extra: null,
    },
    {
      key: "approved",
      label: "Approved by Headquarters",
      value: counts.approved,
      href: link("approved"),
      color: "bg-emerald-500 dark:bg-emerald-500",
      extra: null,
    },
  ];
  return (
    <Card
      title="Approval progress"
      subtitle={`Finished visits this ${periodNoun(granularity)}`}
      action={<CardLink href={link("no")}>Open list</CardLink>}
    >
      {!approvals.ready ? (
        <Note>
          Checking visits is not set up yet. Run
          scripts/sql/2026-11-transaction-checks.sql in Neon to switch it on.
        </Note>
      ) : total === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No finished visits in this period yet.
        </p>
      ) : (
        <>
          <div
            className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900"
            role="img"
            aria-label={rows.map((row) => `${row.label} ${row.value}`).join(", ")}
          >
            {rows
              .filter((row) => row.value > 0)
              .map((row) => (
                <div
                  key={row.key}
                  className={`${row.color} rounded-full`}
                  style={{ width: `${(row.value / total) * 100}%` }}
                />
              ))}
          </div>
          <ul className="mt-4 space-y-3">
            {rows.map((row) => (
              <li key={row.key} className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${row.color}`}
                  />
                  <div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{row.label}</p>
                    {row.extra && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">{row.extra}</p>
                    )}
                  </div>
                </div>
                <Link
                  href={row.href}
                  className="text-lg font-semibold tabular-nums text-zinc-900 hover:underline dark:text-zinc-50"
                >
                  {row.value}
                </Link>
              </li>
            ))}
          </ul>
          {!approvals.hqReady && (
            <Note>
              The Headquarters check is not set up yet. Run
              scripts/sql/2026-11-transaction-hq-checks.sql in Neon to switch it on.
            </Note>
          )}
          <Note>
            Visits from before checking was introduced count as &ldquo;To check&rdquo; until they
            are ticked.
          </Note>
        </>
      )}
    </Card>
  );
}

// ── 4. HMO receivables ───────────────────────────────────────────────

export function HmoReceivablesCard({
  hmo,
  granularity,
}: {
  hmo: HmoWidget;
  granularity: Granularity;
}) {
  const figures = hmo.byPeriod[granularity];
  const owed = figures.toBill + figures.waiting;
  const shown = figures.rows.slice(0, 6);
  const rest = figures.rows.slice(6);
  return (
    <Card
      title="HMO receivables"
      subtitle={`What the HMOs still owe, visits this ${periodNoun(granularity)}`}
      action={<CardLink href="/cashflow/hmo">Open HMO billing</CardLink>}
    >
      {owed === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No HMO amount is outstanding for this period.
        </p>
      ) : (
        <>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
            {money.format(owed)}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">Not billed yet</dt>
              <dd className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {money.format(figures.toBill)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                Billed, waiting for payment
              </dt>
              <dd className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {money.format(figures.waiting)}
              </dd>
            </div>
          </dl>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                <th scope="col" className="py-1 text-left font-normal">
                  HMO
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Not billed
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Waiting
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {shown.map((row) => (
                <tr key={row.hmo}>
                  <th
                    scope="row"
                    className="py-2 text-left font-normal text-zinc-700 dark:text-zinc-300"
                  >
                    {row.hmo}
                  </th>
                  <td className="py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                    {money.format(row.toBill)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                    {money.format(row.waiting)}
                  </td>
                </tr>
              ))}
              {rest.length > 0 && (
                <tr>
                  <th
                    scope="row"
                    className="py-2 text-left font-normal text-zinc-500 dark:text-zinc-400"
                  >
                    Other ({rest.length})
                  </th>
                  <td className="py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                    {money.format(rest.reduce((sum, row) => sum + row.toBill, 0))}
                  </td>
                  <td className="py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                    {money.format(rest.reduce((sum, row) => sum + row.waiting, 0))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
      {hmo.loaPending > 0 && (
        <p className="mt-3 text-xs">
          <Link
            href="/cashflow/queue"
            className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-1 font-medium text-orange-700 hover:underline dark:bg-orange-950 dark:text-orange-300"
          >
            {hmo.loaPending} {hmo.loaPending === 1 ? "visit is" : "visits are"} waiting for an LOA number
          </Link>
        </p>
      )}
      {!hmo.billingReady && (
        <Note>
          HMO billing is not set up yet, so everything counts as not billed. Run
          scripts/sql/2026-11-hmo-billings.sql in Neon to switch it on.
        </Note>
      )}
    </Card>
  );
}

// ── The "Right now" section ──────────────────────────────────────────

export function OpsSection({
  ops,
  granularity,
  today,
}: {
  ops: OverviewOps;
  granularity: Granularity;
  today: string;
}) {
  const withApprovals = ops.approvals !== null;
  return (
    <section
      aria-label="Right now"
      className={`grid grid-cols-1 gap-6 lg:grid-cols-2 ${withApprovals ? "" : "xl:grid-cols-3"}`}
    >
      <WaitingTimesCard waiting={ops.waiting} />
      <BalancesCard balances={ops.balances} today={today} />
      {ops.approvals && (
        <ApprovalsCard
          approvals={ops.approvals}
          granularity={granularity}
          periodStart={ops.periodStarts[granularity]}
        />
      )}
      <HmoReceivablesCard hmo={ops.hmo} granularity={granularity} />
    </section>
  );
}
