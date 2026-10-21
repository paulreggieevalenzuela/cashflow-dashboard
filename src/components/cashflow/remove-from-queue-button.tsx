"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeFromQueueAction } from "@/app/cashflow/transactions/status-actions";
import { Modal } from "@/components/ui/modal";

/**
 * "Remove" on a Queue card (Arrived and On-going only — the board decides
 * where to show it, and the server refuses anything else). Asks first,
 * because it deletes the visit.
 */
export function RemoveFromQueueButton({
  invoiceId,
  patientName,
}: {
  invoiceId: string;
  patientName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await removeFromQueueAction(invoiceId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Remove ${patientName} from the queue`}
        className="text-xs font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400"
      >
        Remove
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Remove from queue?"
        description={`${patientName} will be taken off the queue and the visit deleted. Use this for a check-in made by mistake or a patient who left. This is recorded in the audit trail.`}
      >
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Keep in queue
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Removing…" : "Remove visit"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
