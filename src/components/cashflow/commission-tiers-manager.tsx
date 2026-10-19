"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  clearIndividualRatesAction,
  deleteTierRateAction,
  setDentistTierAction,
  setTierRateAction,
} from "@/app/cashflow/commissions/actions";
import {
  COMMISSION_TIERS,
  describeTierRate,
  tierLabel,
} from "@/lib/cashflow/commission-tiers";
import type { DentistTier, TierRate } from "@/lib/db/commission-tiers";
import type { ProcedureRow } from "@/lib/db/schema";
import type { PublicUser } from "@/lib/db/users";

const INPUT_CLASS =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40";

type TierRow = {
  procedureId: string;
  procedureName: string;
  byTier: Map<number, TierRate>;
};

function groupByProcedure(rates: TierRate[]): TierRow[] {
  const rows = new Map<string, TierRow>();
  for (const rate of rates) {
    const row = rows.get(rate.procedureId) ?? {
      procedureId: rate.procedureId,
      procedureName: rate.procedureName,
      byTier: new Map<number, TierRate>(),
    };
    row.byTier.set(rate.tier, rate);
    rows.set(rate.procedureId, row);
  }
  return [...rows.values()].sort((a, b) =>
    a.procedureName.localeCompare(b.procedureName),
  );
}

export function CommissionTiersManager({
  dentists,
  dentistTiers,
  procedures,
  tierRates,
  overrideCount,
}: {
  dentists: PublicUser[];
  dentistTiers: DentistTier[];
  procedures: ProcedureRow[];
  tierRates: TierRate[];
  /** Individual rates that still sit on dentists who have a tier. */
  overrideCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [procedureId, setProcedureId] = useState("");
  const [tiers, setTiers] = useState<number[]>([]);
  const [ratePercent, setRatePercent] = useState("");
  const [hmoRatePercent, setHmoRatePercent] = useState("");
  const [pesoValue, setPesoValue] = useState("");
  const [hmoPesoValue, setHmoPesoValue] = useState("");

  const tierByDentist = new Map(
    dentistTiers.map((entry) => [entry.dentistUserId, entry.tier]),
  );
  const tierDentists = (tier: number) =>
    dentists.filter(
      (dentist) =>
        dentist.role === "dentist" && tierByDentist.get(dentist.id) === tier,
    );
  const dentistOnly = dentists.filter((dentist) => dentist.role === "dentist");
  const rows = groupByProcedure(tierRates);

  async function run(key: string, task: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    setMessage(null);
    try {
      const result = await task();
      if (!result.ok) {
        setMessage(result.message ?? "Something went wrong.");
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function toggleTier(tier: number) {
    setTiers((current) =>
      current.includes(tier)
        ? current.filter((value) => value !== tier)
        : [...current, tier],
    );
  }

  /** Load a procedure's current values for the first selected tier. */
  function loadExisting(nextProcedureId: string, nextTiers: number[]) {
    const first = nextTiers[0];
    const existing = tierRates.find(
      (rate) => rate.procedureId === nextProcedureId && rate.tier === first,
    );
    if (!existing) {
      return;
    }
    setRatePercent(String(existing.ratePercent));
    setHmoRatePercent(existing.hmoRatePercent?.toString() ?? "");
    setPesoValue(existing.pesoValue?.toString() ?? "");
    setHmoPesoValue(existing.hmoPesoValue?.toString() ?? "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ratePercent && !pesoValue) {
      setMessage("Enter a percentage or a flat peso value.");
      return;
    }
    await run("save", async () => {
      const result = await setTierRateAction({
        tiers,
        procedureId,
        ratePercent: ratePercent ? Number(ratePercent) : 0,
        hmoRatePercent: hmoRatePercent ? Number(hmoRatePercent) : null,
        pesoValue: pesoValue ? Number(pesoValue) : null,
        hmoPesoValue: hmoPesoValue ? Number(hmoPesoValue) : null,
      });
      if (result.ok) {
        setProcedureId("");
        setTiers([]);
        setRatePercent("");
        setHmoRatePercent("");
        setPesoValue("");
        setHmoPesoValue("");
      }
      return result;
    });
  }

  async function handleClearOverrides() {
    if (
      !window.confirm(
        `Remove ${overrideCount} individual rate(s) from dentists who have a tier? Their tier rates will apply instead. This cannot be undone.`,
      )
    ) {
      return;
    }
    await run("clear", clearIndividualRatesAction);
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {message}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Dentist tiers
        </h3>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          A dentist earns the rate their tier gives each procedure. Change a
          dentist&apos;s tier here and it applies to transactions saved from
          then on.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dentistOnly.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No dentist accounts yet.
            </p>
          )}
          {dentistOnly.map((dentist) => {
            const current = tierByDentist.get(dentist.id);
            return (
              <div
                key={dentist.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3.5 py-2.5 dark:border-zinc-800"
              >
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {dentist.name}
                </span>
                <select
                  aria-label={`Tier for ${dentist.name}`}
                  value={current ?? ""}
                  disabled={busy === `tier-${dentist.id}`}
                  onChange={(event) =>
                    run(`tier-${dentist.id}`, () =>
                      setDentistTierAction({
                        dentistUserId: dentist.id,
                        tier: event.target.value
                          ? Number(event.target.value)
                          : null,
                      }),
                    )
                  }
                  className="select-chevron rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="">No tier</option>
                  {[...COMMISSION_TIERS].reverse().map((tier) => (
                    <option key={tier} value={tier}>
                      {tierLabel(tier)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          {COMMISSION_TIERS.map(
            (tier) =>
              `${tierLabel(tier)}: ${
                tierDentists(tier)
                  .map((dentist) => dentist.name)
                  .join(", ") || "nobody yet"
              }`,
          ).join(" · ")}
        </p>
      </div>

      {overrideCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <span>
            {overrideCount} individual rate(s) are still set on dentists who
            have a tier. An individual rate takes priority over the tier, so
            tier changes won&apos;t reach those procedures.
          </span>
          <button
            type="button"
            onClick={handleClearOverrides}
            disabled={busy === "clear"}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-transparent dark:text-amber-300"
          >
            {busy === "clear" ? "Removing..." : "Remove them"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Add or change a procedure&apos;s tier rate
        </h3>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Pick a procedure and the tier(s) it applies to. Every dentist in
          those tiers earns it. Tick Tier 2 and Tier 1 together when they
          share a rate.
        </p>
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Procedure
            </label>
            <select
              required
              value={procedureId}
              onChange={(event) => {
                setProcedureId(event.target.value);
                loadExisting(event.target.value, tiers);
              }}
              className={`select-chevron ${INPUT_CLASS}`}
            >
              <option value="">Select procedure</option>
              {procedures.map((procedure) => (
                <option key={procedure.id} value={procedure.id}>
                  {procedure.name}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Tiers
            </legend>
            <div className="flex h-[42px] items-center gap-4">
              {COMMISSION_TIERS.map((tier) => (
                <label
                  key={tier}
                  className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={tiers.includes(tier)}
                    onChange={() => {
                      const next = tiers.includes(tier)
                        ? tiers.filter((value) => value !== tier)
                        : [...tiers, tier];
                      toggleTier(tier);
                      loadExisting(procedureId, next);
                    }}
                  />
                  {tierLabel(tier)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Rate (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="e.g. 25"
              value={ratePercent}
              onChange={(event) => setRatePercent(event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Flat peso per procedure (₱)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="X-rays, e.g. 70"
              value={pesoValue}
              onChange={(event) => setPesoValue(event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              HMO rate (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="e.g. 10"
              value={hmoRatePercent}
              onChange={(event) => setHmoRatePercent(event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              HMO flat peso (₱)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="optional"
              value={hmoPesoValue}
              onChange={(event) => setHmoPesoValue(event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <button
            type="submit"
            disabled={busy === "save" || !procedureId || tiers.length === 0}
            className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy === "save" ? "Saving..." : "Save tier rate"}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Procedure</th>
              {COMMISSION_TIERS.map((tier) => (
                <th key={tier} className="px-4 py-3 font-medium">
                  {tierLabel(tier)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  No tier rates yet. Run the tier SQL file, or add a procedure
                  above.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.procedureId} className="text-zinc-700 dark:text-zinc-300">
                  <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-50">
                    {row.procedureName}
                  </td>
                  {COMMISSION_TIERS.map((tier) => {
                    const rate = row.byTier.get(tier);
                    return (
                      <td
                        key={tier}
                        className="whitespace-nowrap px-4 py-2.5 tabular-nums"
                      >
                        {rate ? (
                          <span className="inline-flex items-center gap-1.5">
                            {describeTierRate(rate)}
                            <button
                              type="button"
                              aria-label={`Remove ${tierLabel(tier)} rate for ${row.procedureName}`}
                              disabled={busy === rate.id}
                              onClick={() =>
                                run(rate.id, () => deleteTierRateAction(rate.id))
                              }
                              className="rounded px-1 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            >
                              ×
                            </button>
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
