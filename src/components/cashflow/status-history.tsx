import { StatusPill } from "@/components/cashflow/status-pill";
import type { StatusHistoryEntry } from "@/lib/db/visit-status";

const when = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "short",
});

/** Who moved a visit between statuses, and when. */
export function StatusHistory({ entries }: { entries: StatusHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No status changes recorded yet.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300"
        >
          {entry.fromStatus ? (
            <>
              <StatusPill status={entry.fromStatus} />
              <span aria-hidden="true">→</span>
            </>
          ) : null}
          <StatusPill status={entry.toStatus} />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {when.format(new Date(entry.changedAt))}
            {entry.changedByName ? ` · ${entry.changedByName}` : ""}
            {entry.note ? ` · ${entry.note}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
