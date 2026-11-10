"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  clearIndividualRatesAction,
  setDentistTierAction,
} from "@/app/cashflow/commissions/actions";
import { TierRateGrid } from "@/components/cashflow/commission-rate-grids";
import { COMMISSION_TIERS, tierLabel } from "@/lib/cashflow/commission-tiers";
import type { DentistTier, TierRate } from "@/lib/db/commission-tiers";
import type { ProcedureRow } from "@/lib/db/schema";
import type { PublicUser } from "@/lib/db/users";

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

  const tierByDentist = new Map(
    dentistTiers.map((entry) => [entry.dentistUserId, entry.tier]),
  );
  const tierDentists = (tier: number) =>
    dentists.filter(
      (dentist) =>
        dentist.role === "dentist" && tierByDentist.get(dentist.id) === tier,
    );
  const dentistOnly = dentists.filter((dentist) => dentist.role === "dentist");

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

      <TierRateGrid procedures={procedures} tierRates={tierRates} />
    </div>
  );
}
