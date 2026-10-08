"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import {
  prepareUpload,
  uploadAttachment,
} from "@/lib/cashflow/attachment-client";
import {
  ATTACHMENT_ACCEPT,
  attachmentProblem,
  formatFileSize,
  type AttachmentKind,
} from "@/lib/cashflow/attachment-rules";
import type { AttachmentInfo } from "@/lib/db/attachments";

/**
 * The files attached to a visit or to one payment, with a button to add
 * more and (for admins) a way to remove one. Used for the paper invoice on
 * the transaction page and for the proof of payment under each payment.
 * Pass `paymentId` for a proof of payment on that payment.
 */
export function AttachmentsPanel({
  invoiceId,
  expenseId,
  kind,
  paymentId,
  items,
  canDelete = false,
  buttonLabel,
  emptyText,
}: {
  /** The visit the files belong to... */
  invoiceId?: string;
  /** ...or the expense. */
  expenseId?: string;
  kind: AttachmentKind;
  paymentId?: string;
  items: AttachmentInfo[];
  canDelete?: boolean;
  buttonLabel: string;
  emptyText?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChoose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (chosen.length === 0) {
      return;
    }

    setError(null);
    setBusy(true);
    try {
      for (const original of chosen) {
        const file = await prepareUpload(original);
        const problem = attachmentProblem(file);
        if (problem) {
          setError(problem);
          break;
        }
        const result = await uploadAttachment({
          invoiceId,
          expenseId,
          kind,
          file,
          paymentId,
        });
        if (!result.ok) {
          setError(result.message);
          break;
        }
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function handleRemove(item: AttachmentInfo) {
    if (!window.confirm(`Remove ${item.fileName}? This can't be undone.`)) {
      return;
    }
    setError(null);
    setRemovingId(item.id);
    try {
      const response = await fetch(`/api/cashflow/attachments/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(data?.message ?? "The file could not be removed.");
      }
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && emptyText && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</p>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <a
                href={`/api/cashflow/attachments/${item.id}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate font-medium text-amber-700 hover:underline dark:text-amber-400"
              >
                {item.fileName}
                <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  {formatFileSize(item.sizeBytes)}
                </span>
              </a>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  disabled={removingId === item.id}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  {removingId === item.id ? "Removing..." : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        onChange={handleChoose}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {busy ? "Uploading..." : buttonLabel}
      </button>
    </div>
  );
}
