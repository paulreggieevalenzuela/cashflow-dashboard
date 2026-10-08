"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { prepareUpload } from "@/lib/cashflow/attachment-client";
import {
  ATTACHMENT_ACCEPT,
  attachmentProblem,
  formatFileSize,
} from "@/lib/cashflow/attachment-rules";

/**
 * Chooses photos / PDFs to attach while a transaction is being added. The
 * files are only held here; the form uploads them once the transaction has
 * been saved (it needs the new transaction's id first). Phone photos are
 * shrunk as they are chosen.
 */
export function FilePicker({
  label,
  hint,
  files,
  onChange,
}: {
  label: string;
  hint?: string;
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChoose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (chosen.length === 0) {
      return;
    }

    setError(null);
    setBusy(true);
    const accepted: File[] = [];
    for (const original of chosen) {
      const file = await prepareUpload(original);
      const problem = attachmentProblem(file);
      if (problem) {
        setError(problem);
      } else {
        accepted.push(file);
      }
    }
    setBusy(false);
    if (accepted.length > 0) {
      onChange([...files, ...accepted]);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
            >
              <span className="min-w-0 truncate">
                {file.name}
                <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {formatFileSize(file.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="shrink-0 text-xs font-medium text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
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
        className="w-fit rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {busy
          ? "Preparing..."
          : files.length > 0
            ? "Add another"
            : "Choose file or take photo"}
      </button>

      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {hint && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      )}
    </div>
  );
}
