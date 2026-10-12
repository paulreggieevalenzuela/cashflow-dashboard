"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchPatientsAction } from "@/app/cashflow/patient-actions";
import { mergePatientsAction } from "@/app/cashflow/patients/actions";
import type { PatientSummary } from "@/lib/db/patients";

/**
 * Admin tool: this record is a duplicate of another patient (same person,
 * different spelling). Search for the patient to keep, then merge: all
 * invoices move across and this record is removed.
 */
export function MergePatient({
  sourceId,
  sourceName,
}: {
  sourceId: string;
  sourceName: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [target, setTarget] = useState<PatientSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function search(value: string) {
    setQuery(value);
    setTarget(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    const found = await searchPatientsAction(value);
    setResults(found.filter((patient) => patient.id !== sourceId));
  }

  function merge() {
    if (!target) return;
    if (
      !window.confirm(
        `Merge "${sourceName}" into "${target.fullName}"? All invoices move to ${target.fullName} and this record is removed. This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await mergePatientsAction(sourceId, target.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/cashflow/patients/${result.targetId}`);
    });
  }

  return (
    <details className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Merge duplicate (admin)
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Is this the same person as another patient on file? Search for the
          patient to keep.
        </p>
        <input
          value={query}
          onChange={(event) => void search(event.target.value)}
          placeholder="Search the patient to keep…"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        {results.length > 0 && !target && (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {results.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  onClick={() => setTarget(patient)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-amber-50 dark:hover:bg-amber-950/30"
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {patient.fullName}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {patient.visitCount} visits
                    {patient.lastVisitDate
                      ? ` · last ${patient.lastVisitDate}`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {target && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              Keep <strong>{target.fullName}</strong> and remove{" "}
              <strong>{sourceName}</strong>.
            </span>
            <button
              type="button"
              onClick={merge}
              disabled={pending}
              className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? "Merging…" : "Merge"}
            </button>
          </div>
        )}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
