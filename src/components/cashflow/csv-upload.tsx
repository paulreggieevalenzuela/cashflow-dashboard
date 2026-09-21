"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import { importCsvAction } from "@/app/cashflow/actions";
import type { CsvRowError } from "@/lib/cashflow/parse-csv";

type ImportSummary = {
  fileName: string;
  importedCount: number;
  errors: CsvRowError[];
};

export function CsvUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsParsing(true);
    setSummary(null);
    setFormError(null);

    try {
      const text = await file.text();
      const result = await importCsvAction(text);

      if (!result.ok) {
        setFormError(result.message);
        return;
      }

      setSummary({
        fileName: file.name,
        importedCount: result.data.importedCount,
        errors: result.data.errors,
      });

      if (result.data.importedCount > 0) {
        router.refresh();
      }
    } catch {
      setFormError("Something went wrong while importing this file. Please try again.");
    } finally {
      setIsParsing(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="space-y-4">
      <label
        htmlFor="cashflow-csv-input"
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center transition-colors hover:border-amber-400 hover:bg-amber-50/50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-700"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="h-8 w-8 text-zinc-400"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
          />
        </svg>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {isParsing ? "Importing..." : "Click to upload a cashflow CSV export"}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Expects the clinic export format (Date, Visit ID, Patient Name, ...)
        </span>
        <input
          ref={inputRef}
          id="cashflow-csv-input"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={isParsing}
          onChange={handleFileChange}
        />
      </label>

      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {formError}
        </div>
      )}

      {summary && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">{summary.fileName}</p>
          <p className="mt-1 text-amber-700 dark:text-amber-400">
            {summary.importedCount} transaction{summary.importedCount === 1 ? "" : "s"} imported.
          </p>
          {summary.errors.length > 0 && (
            <div className="mt-3">
              <p className="font-medium text-red-700 dark:text-red-400">
                {summary.errors.length} row{summary.errors.length === 1 ? "" : "s"} skipped:
              </p>
              <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs text-red-600 dark:text-red-400">
                {summary.errors.map((error, index) => (
                  <li key={index}>
                    Line {error.line}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
