"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusPill } from "@/components/cashflow/status-pill";
import { Modal } from "@/components/ui/modal";
import { setVisitStatusAction } from "@/app/cashflow/transactions/status-actions";
import {
  VISIT_STATUSES,
  canMove,
  nextStatus,
  type VisitStatus,
} from "@/lib/cashflow/visit-status";

const FIELD =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

/**
 * The status pill with its controls: a one-click button for the next step
 * and, for admins, a "Change…" dialog for going back or skipping ahead
 * (which asks for a reason). The server checks every move again.
 */
export function VisitStatusControl({
  invoiceId,
  status,
  balanceDue,
  isAdmin,
  loaMissing = false,
  visitIssue = null,
  layout = "inline",
}: {
  invoiceId: string;
  status: VisitStatus;
  balanceDue: number;
  isAdmin: boolean;
  /** HMO visit with no LOA number yet: "Cleared" is refused. */
  loaMissing?: boolean;
  /** Why the visit can't go on to payment yet (no procedure / no dentist). */
  visitIssue?: string | null;
  layout?: "inline" | "stacked";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    to: VisitStatus;
    pick: boolean;
  } | null>(null);
  const [note, setNote] = useState("");

  const next = nextStatus(status);
  const nextCheck = next
    ? canMove({ from: status, to: next, isAdmin, balanceDue, loaMissing, visitIssue })
    : null;

  function submit(to: VisitStatus, reason?: string) {
    setError(null);
    startTransition(async () => {
      const result = await setVisitStatusAction(invoiceId, to, reason);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDialog(null);
      setNote("");
      router.refresh();
    });
  }

  function handleNext() {
    if (!next || !nextCheck?.ok) return;
    if (nextCheck.needsNote) {
      setDialog({ to: next, pick: false });
      return;
    }
    submit(next);
  }

  const dialogCheck = dialog
    ? canMove({ from: status, to: dialog.to, isAdmin, balanceDue, loaMissing, visitIssue })
    : null;

  return (
    <div
      className={
        layout === "stacked"
          ? "flex flex-col items-start gap-1.5"
          : "flex flex-wrap items-center gap-2"
      }
    >
      <StatusPill status={status} />

      {next && (
        <button
          type="button"
          onClick={handleNext}
          disabled={pending || !nextCheck?.ok}
          title={
            nextCheck && !nextCheck.ok ? nextCheck.message : `Move to ${next}`
          }
          className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {pending ? "Saving…" : `→ ${next}`}
        </button>
      )}

      {isAdmin && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setDialog({
              to: VISIT_STATUSES.find((s) => s !== status) ?? status,
              pick: true,
            });
          }}
          className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Change…
        </button>
      )}

      {error && !dialog && (
        <p
          className="w-full text-xs text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}

      <Modal
        open={dialog !== null}
        onClose={() => {
          setDialog(null);
          setNote("");
          setError(null);
        }}
        title={dialog?.pick ? "Change status" : `Move to ${dialog?.to ?? ""}`}
        description={
          dialog?.pick
            ? `Currently ${status}. Moving a visit back, or ahead, needs a reason and is recorded in the history.`
            : `Moving to ${dialog?.to ?? ""} needs a reason; it is recorded in the history.`
        }
      >
        <div className="space-y-4">
          {dialog?.pick && (
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              New status
              <select
                value={dialog.to}
                onChange={(event) =>
                  setDialog({
                    to: event.target.value as VisitStatus,
                    pick: true,
                  })
                }
                className={`mt-1 select-chevron ${FIELD}`}
              >
                {VISIT_STATUSES.filter((s) => s !== status).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          {dialogCheck && !dialogCheck.ok && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {dialogCheck.message}
            </p>
          )}
          {(!dialogCheck || dialogCheck.ok) && (
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Reason
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="e.g. Courtesy discount, entered by mistake…"
                className={`mt-1 ${FIELD}`}
              />
            </label>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDialog(null);
                setNote("");
                setError(null);
              }}
              className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                pending ||
                !dialog ||
                !dialogCheck?.ok ||
                note.trim().length === 0
              }
              onClick={() => dialog && submit(dialog.to, note)}
              className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
