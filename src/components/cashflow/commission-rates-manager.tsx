"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  deleteCommissionRateAction,
  setCommissionRateAction,
} from "@/app/cashflow/commissions/actions";
import type { CommissionRate } from "@/lib/db/commission-rates";
import type { ProcedureRow } from "@/lib/db/schema";
import type { PublicUser } from "@/lib/db/users";

export function CommissionRatesManager({
  dentists,
  procedures,
  rates,
}: {
  dentists: PublicUser[];
  procedures: ProcedureRow[];
  rates: CommissionRate[];
}) {
  const router = useRouter();
  const [dentistUserId, setDentistUserId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setStatus("submitting");

    const result = await setCommissionRateAction({
      dentistUserId,
      procedureId,
      ratePercent: Number(ratePercent),
    });

    setStatus("idle");
    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    setDentistUserId("");
    setProcedureId("");
    setRatePercent("");
    router.refresh();
  }

  async function handleDelete(id: string) {
    setRowBusyId(id);
    try {
      const result = await deleteCommissionRateAction(id);
      if (!result.ok) {
        window.alert(result.message);
      }
      router.refresh();
    } finally {
      setRowBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Set a commission rate
        </h3>

        {formError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {formError}
          </div>
        )}

        {dentists.length === 0 || procedures.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {dentists.length === 0
              ? "No dentist or staff accounts yet — create one on the Users page first."
              : "No procedures recorded yet — add or import a transaction first, then come back to set its rate."}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Dentist / staff
              </label>
              <select
                required
                value={dentistUserId}
                onChange={(event) => setDentistUserId(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
              >
                <option value="">Select a person</option>
                {dentists.map((dentist) => (
                  <option key={dentist.id} value={dentist.id}>
                    {dentist.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Procedure</label>
              <select
                required
                value={procedureId}
                onChange={(event) => setProcedureId(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
              >
                <option value="">Select procedure</option>
                {procedures.map((procedure) => (
                  <option key={procedure.id} value={procedure.id}>
                    {procedure.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Rate (%)</label>
              <input
                required
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="e.g. 12.5"
                value={ratePercent}
                onChange={(event) => setRatePercent(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
              />
            </div>

            <button
              type="submit"
              disabled={status === "submitting"}
              className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {status === "submitting" ? "Saving..." : "Save rate"}
            </button>
          </form>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Dentist / staff</th>
              <th className="px-4 py-3 font-medium">Procedure</th>
              <th className="px-4 py-3 text-right font-medium">Rate</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rates.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No commission or bonus rates set yet.
                </td>
              </tr>
            ) : (
              rates.map((rate) => (
                <tr key={rate.id} className="text-zinc-700 dark:text-zinc-300">
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                    {rate.dentistName}
                  </td>
                  <td className="px-4 py-3">{rate.procedureName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {rate.ratePercent.toFixed(2)}%
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(rate.id)}
                      disabled={rowBusyId === rate.id}
                      className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    >
                      {rowBusyId === rate.id ? "Removing..." : "Remove"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
