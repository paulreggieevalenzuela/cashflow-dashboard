import { summarizeChanges } from "@/lib/cashflow/audit-diff";
import { AUDIT_ACTION_LABELS, type AuditEntry } from "@/lib/cashflow/audit-types";

const when = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "short",
});

/** Who did what, and when (newest first). */
export function AuditTrail({
  entries,
  emptyText = "Nothing has been recorded yet.",
  showLinks = false,
}: {
  entries: AuditEntry[];
  emptyText?: string;
  /** Link each line to its visit or patient (used on the Audit tab). */
  showLinks?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</p>
    );
  }
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {entries.map((entry) => (
        <li key={entry.id} className="py-2.5 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {when.format(new Date(entry.createdAt))}
              {entry.userName ? ` · ${entry.userName}` : ""}
            </span>
            {showLinks && entry.patientId && (
              <a
                href={`/cashflow/patients/${entry.patientId}`}
                className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
              >
                Patient
              </a>
            )}
          </div>
          {entry.changes.length > 0 ? (
            <details className="mt-0.5">
              <summary className="cursor-pointer text-xs text-zinc-600 dark:text-zinc-400">
                {entry.changes.length}{" "}
                {entry.changes.length === 1 ? "change" : "changes"}:{" "}
                {summarizeChanges(entry.changes).slice(0, 110)}
                {summarizeChanges(entry.changes).length > 110 ? "…" : ""}
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-zinc-600 dark:text-zinc-400">
                {entry.changes.map((change, index) => (
                  <li key={index} className="list-disc">
                    <strong>{change.field}</strong>
                    {change.from || change.to
                      ? `: ${[change.from, change.to].filter(Boolean).join(" → ")}`
                      : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              {entry.summary}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
