import Link from "next/link";
import { LoaPendingBadge } from "@/components/cashflow/loa-pending-badge";
import { VisitStatusControl } from "@/components/cashflow/visit-status-control";
import {
  VISIT_STATUSES,
  formatMinutes,
  type VisitStatus,
} from "@/lib/cashflow/visit-status";
import type { BoardVisit } from "@/lib/db/visit-status";

const clinicDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
});

/** YYYY-MM-DD in the clinic's timezone. */
function clinicDate(iso: string): string {
  return clinicDateFormatter.format(new Date(iso));
}

/** How long a visit has been in its current status. */
function minutesSince(iso: string): number {
  return Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
}

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const timeFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
});

const COLUMN_HINT: Record<VisitStatus, string> = {
  Arrived: "Checked in, waiting",
  "On-going": "With the dentist",
  "For Payment": "At the cashier",
  Cleared: "Cleared today",
};

/**
 * The clinic's queue for today: one column per status. Earlier visits that
 * are still not Cleared stay on the board (flagged with their date) so an
 * unpaid visit from yesterday is not forgotten. The Cleared column shows
 * today's finished visits only.
 */
export function TodayBoard({
  visits,
  today,
  isAdmin,
}: {
  visits: BoardVisit[];
  today: string;
  isAdmin: boolean;
}) {
  const byStatus = new Map<VisitStatus, BoardVisit[]>(
    VISIT_STATUSES.map((status) => [status, []]),
  );
  for (const visit of visits) {
    // Cleared column = finished today: either the visit is from today, or it
    // was cleared today (an older unpaid visit that was just settled).
    if (
      visit.status === "Cleared" &&
      visit.visitDate !== today &&
      clinicDate(visit.statusChangedAt) !== today
    ) {
      continue;
    }
    byStatus.get(visit.status)?.push(visit);
  }

  const waiting = VISIT_STATUSES.slice(0, 3).reduce(
    (sum, status) => sum + (byStatus.get(status)?.length ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Today&rsquo;s queue
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {waiting === 0
            ? "Nobody is waiting right now."
            : `${waiting} ${waiting === 1 ? "visit is" : "visits are"} still open.`}{" "}
          Use the arrow on a card to move a patient to the next step.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {VISIT_STATUSES.map((status) => {
          const list = byStatus.get(status) ?? [];
          return (
            <section
              key={status}
              aria-label={status}
              className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <header className="mb-3 flex items-baseline justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {status}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {COLUMN_HINT[status]}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-800">
                  {list.length}
                </span>
              </header>

              <ul className="space-y-2">
                {list.length === 0 && (
                  <li className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                    Empty
                  </li>
                )}
                {list.map((visit) => (
                  <li
                    key={visit.invoiceId}
                    className="rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <Link
                      href={`/cashflow/transactions/${encodeURIComponent(visit.firstLineId)}`}
                      className="font-medium text-amber-700 hover:underline dark:text-amber-400"
                    >
                      {visit.patientName}
                    </Link>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {visit.procedures.slice(0, 3).join(", ")}
                      {visit.procedures.length > 3
                        ? ` +${visit.procedures.length - 3} more`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {[
                        visit.dentist,
                        visit.branchName,
                        visit.status === "Cleared"
                          ? `cleared ${timeFormatter.format(new Date(visit.statusChangedAt))}`
                          : `${formatMinutes(minutesSince(visit.statusChangedAt))} here (since ${timeFormatter.format(new Date(visit.statusChangedAt))})`,
                        visit.visitDate !== today
                          ? `visit of ${visit.visitDate}`
                          : "",
                        visit.balanceDue > 0
                          ? `${currencyFormatter.format(visit.balanceDue)} due`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {visit.loaPending && (
                      <LoaPendingBadge className="mt-1.5" />
                    )}
                    <div className="mt-2">
                      <VisitStatusControl
                        invoiceId={visit.invoiceId}
                        status={visit.status}
                        balanceDue={visit.balanceDue}
                        isAdmin={isAdmin}
                        loaMissing={visit.loaMissing}
                        visitIssue={visit.visitIssue}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
