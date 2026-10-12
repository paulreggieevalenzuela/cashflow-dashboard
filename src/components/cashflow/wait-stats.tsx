import { formatMinutes, type WaitStat } from "@/lib/cashflow/visit-status";

/** Average minutes per stage, from the status history. */
export function WaitStats({
  title,
  stats,
}: {
  title: string;
  stats: WaitStat[];
}) {
  const hasData = stats.some((stat) => stat.count > 0);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h3>
      {hasData ? (
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.stage}>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                {stat.label}
              </dt>
              <dd className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {stat.averageMinutes === null
                  ? "—"
                  : formatMinutes(stat.averageMinutes)}
              </dd>
              <dd className="text-xs text-zinc-400 dark:text-zinc-500">
                {stat.count} {stat.count === 1 ? "visit" : "visits"}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          No completed steps yet. Averages appear once visits are moved through
          Arrived, On-going and For Payment.
        </p>
      )}
    </div>
  );
}
