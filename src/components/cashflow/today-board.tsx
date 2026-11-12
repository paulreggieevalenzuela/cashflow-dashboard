import Link from "next/link";
import { LoaPendingBadge } from "@/components/cashflow/loa-pending-badge";
import {
  QueueBoard,
  type QueueBoardColumn,
} from "@/components/cashflow/queue-board";
import { RemoveFromQueueButton } from "@/components/cashflow/remove-from-queue-button";
import { VisitStatusControl } from "@/components/cashflow/visit-status-control";
import { buildSearchText } from "@/lib/cashflow/queue-search";
import {
  VISIT_STATUSES,
  canRemoveFromQueue,
  formatMinutes,
  isOnQueueBoard,
  type VisitStatus,
} from "@/lib/cashflow/visit-status";
import type { BoardVisit } from "@/lib/db/visit-status";

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
  Cleared: "Cleared today · gone at the end of the day",
};

/**
 * The Cleared column is the one that grows all day; it starts with this many
 * cards and the rest are one "Show more" away (a search always finds them).
 */
const CLEARED_INITIAL_LIMIT = 20;

/**
 * The clinic's queue for today: one column per status. Earlier visits that
 * are still not Cleared stay on the board (flagged with their date) so an
 * unpaid visit from yesterday is not forgotten. The Cleared column shows
 * today's finished visits only.
 *
 * The cards are drawn here, on the server; `QueueBoard` (a client component)
 * lays them out and handles the search box.
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
    if (!isOnQueueBoard(visit, today)) {
      continue;
    }
    byStatus.get(visit.status)?.push(visit);
  }

  const waiting = VISIT_STATUSES.slice(0, 3).reduce(
    (sum, status) => sum + (byStatus.get(status)?.length ?? 0),
    0,
  );

  const columns: QueueBoardColumn[] = VISIT_STATUSES.map((status) => ({
    status,
    hint: COLUMN_HINT[status],
    initialLimit: status === "Cleared" ? CLEARED_INITIAL_LIMIT : undefined,
    cards: (byStatus.get(status) ?? []).map((visit) => ({
      id: visit.invoiceId,
      searchText: buildSearchText([
        visit.patientName,
        ...visit.procedures,
        visit.dentist,
        visit.branchName,
      ]),
      facts: {
        dentist: visit.dentist ?? "",
        hasBalance: visit.balanceDue > 0,
        loaPending: visit.loaPending,
        earlier: visit.visitDate !== today,
      },
      node: (
        <>
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
              visit.visitDate !== today ? `visit of ${visit.visitDate}` : "",
              visit.balanceDue > 0
                ? `${currencyFormatter.format(visit.balanceDue)} due`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {visit.loaPending && <LoaPendingBadge className="mt-1.5" />}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <VisitStatusControl
              invoiceId={visit.invoiceId}
              status={visit.status}
              balanceDue={visit.balanceDue}
              isAdmin={isAdmin}
              loaMissing={visit.loaMissing}
              visitIssue={visit.visitIssue}
            />
            {canRemoveFromQueue({
              status: visit.status,
              collected: visit.collected,
            }).ok && (
              <RemoveFromQueueButton
                invoiceId={visit.invoiceId}
                patientName={visit.patientName}
              />
            )}
          </div>
        </>
      ),
    })),
  }));

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

      <QueueBoard columns={columns} />
    </div>
  );
}
