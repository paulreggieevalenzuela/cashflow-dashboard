"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  deleteCommissionRateAction,
  deleteTierRateAction,
  setCommissionRateAction,
  setTierRateAction,
} from "@/app/cashflow/commissions/actions";
import { Spinner } from "@/components/ui/spinner";
import {
  COMMISSION_TIERS,
  describeTierRate,
  tierLabel,
} from "@/lib/cashflow/commission-tiers";
import type { CommissionRate } from "@/lib/db/commission-rates";
import type { DentistTier, TierRate } from "@/lib/db/commission-tiers";
import type { ProcedureRow } from "@/lib/db/schema";
import type { PublicUser } from "@/lib/db/users";

const FIELD_CLASS =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm tabular-nums text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40";

/** What the editor holds: text, so a blank box means "not set". */
type RateDraft = {
  ratePercent: string;
  pesoValue: string;
  hmoRatePercent: string;
  hmoPesoValue: string;
};

type RateValues = {
  ratePercent: number;
  hmoRatePercent: number | null;
  pesoValue: number | null;
  hmoPesoValue: number | null;
};

function toDraft(rate: Partial<RateValues> | undefined): RateDraft {
  return {
    ratePercent: rate?.ratePercent !== undefined ? String(rate.ratePercent) : "",
    pesoValue: rate?.pesoValue != null ? String(rate.pesoValue) : "",
    hmoRatePercent:
      rate?.hmoRatePercent != null ? String(rate.hmoRatePercent) : "",
    hmoPesoValue: rate?.hmoPesoValue != null ? String(rate.hmoPesoValue) : "",
  };
}

function draftError(draft: RateDraft, allowPeso: boolean): string | null {
  if (!draft.ratePercent && !(allowPeso && draft.pesoValue)) {
    return allowPeso
      ? "Enter a percentage or a flat peso value."
      : "Enter a percentage.";
  }
  for (const [label, value] of [
    ["Rate", draft.ratePercent],
    ["HMO rate", draft.hmoRatePercent],
  ] as const) {
    if (value && !(Number(value) >= 0 && Number(value) <= 100)) {
      return `${label} must be between 0 and 100.`;
    }
  }
  for (const value of [draft.pesoValue, draft.hmoPesoValue]) {
    if (value && !(Number(value) >= 0)) {
      return "Peso values can't be negative.";
    }
  }
  return null;
}

function draftValues(draft: RateDraft, allowPeso: boolean): RateValues {
  return {
    ratePercent: draft.ratePercent ? Number(draft.ratePercent) : 0,
    hmoRatePercent: draft.hmoRatePercent ? Number(draft.hmoRatePercent) : null,
    pesoValue: allowPeso && draft.pesoValue ? Number(draft.pesoValue) : null,
    hmoPesoValue: draft.hmoPesoValue ? Number(draft.hmoPesoValue) : null,
  };
}

/** The small inline editor that opens inside a cell. */
function RateEditor({
  label,
  initial,
  allowPeso,
  alsoTiers,
  saving,
  onSave,
  onCancel,
}: {
  label: string;
  initial: RateDraft;
  allowPeso: boolean;
  /** Other tiers this rate can also be applied to in the same save. */
  alsoTiers?: number[];
  saving: boolean;
  onSave: (values: RateValues, alsoTiers: number[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [more, setMore] = useState(
    Boolean(initial.pesoValue || initial.hmoRatePercent || initial.hmoPesoValue),
  );
  const [also, setAlso] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const problem = draftError(draft, allowPeso);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onSave(draftValues(draft, allowPeso), also);
  }

  const set = (key: keyof RateDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
      className="flex min-w-[9.5rem] flex-col gap-1.5"
    >
      <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
        <input
          autoFocus
          type="number"
          min="0"
          max="100"
          step="0.01"
          aria-label={`${label} — rate %`}
          value={draft.ratePercent}
          onChange={(event) => set("ratePercent")(event.target.value)}
          className={FIELD_CLASS}
        />
        %
      </label>
      {more && (
        <>
          {allowPeso && (
            <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <input
                type="number"
                min="0"
                step="0.01"
                aria-label={`${label} — flat peso`}
                value={draft.pesoValue}
                onChange={(event) => set("pesoValue")(event.target.value)}
                className={FIELD_CLASS}
              />
              ₱ flat
            </label>
          )}
          <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              aria-label={`${label} — HMO rate %`}
              value={draft.hmoRatePercent}
              onChange={(event) => set("hmoRatePercent")(event.target.value)}
              className={FIELD_CLASS}
            />
            % HMO
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <input
              type="number"
              min="0"
              step="0.01"
              aria-label={`${label} — HMO flat peso`}
              value={draft.hmoPesoValue}
              onChange={(event) => set("hmoPesoValue")(event.target.value)}
              className={FIELD_CLASS}
            />
            ₱ HMO
          </label>
        </>
      )}
      {alsoTiers && alsoTiers.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Also set:</span>
          {alsoTiers.map((tier) => (
            <label key={tier} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={also.includes(tier)}
                onChange={() =>
                  setAlso((current) =>
                    current.includes(tier)
                      ? current.filter((value) => value !== tier)
                      : [...current, tier],
                  )
                }
              />
              {tierLabel(tier)}
            </label>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="submit"
          disabled={saving}
          aria-label={`Save ${label}`}
          className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving && <Spinner className="h-3 w-3" />}
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => setMore((value) => !value)}
          className="ml-auto text-xs text-zinc-400 underline-offset-2 hover:underline"
        >
          {more ? "Less" : "More"}
        </button>
      </div>
    </form>
  );
}

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="search"
      aria-label="Find a procedure"
      placeholder="Find a procedure…"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
    />
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      {message}
    </div>
  );
}

/**
 * One table for every tier: procedures down, Tier 3 / 2 / 1 across. Click a
 * rate to change it in place; click a dash to set one. Applies to every
 * dentist in that tier, on visits saved from then on.
 */
export function TierRateGrid({
  procedures,
  tierRates,
}: {
  procedures: ProcedureRow[];
  tierRates: TierRate[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const rateOf = useMemo(() => {
    const map = new Map<string, TierRate>();
    for (const rate of tierRates) map.set(`${rate.tier}:${rate.procedureId}`, rate);
    return map;
  }, [tierRates]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return procedures
      .filter((procedure) => procedure.active)
      .filter((procedure) => !needle || procedure.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [procedures, search]);

  async function run(key: string, task: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    setMessage(null);
    try {
      const result = await task();
      if (!result.ok) {
        setMessage(result.message ?? "Something went wrong.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3" aria-busy={busy !== null}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Rates per procedure and tier
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Click a rate to change it, or a dash to set one. A change applies to
            every dentist in that tier on visits saved from then on. Open{" "}
            <em>More</em> for a flat peso value (X-rays) or the HMO rate.
          </p>
        </div>
        <SearchBox value={search} onChange={setSearch} />
      </div>
      <ErrorBanner message={message} />
      <div
        data-testid="tier-grid"
        className="max-h-[70vh] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
      >
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
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
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  No procedures match.
                </td>
              </tr>
            )}
            {rows.map((procedure) => (
              <tr key={procedure.id} className="align-top text-zinc-700 dark:text-zinc-300">
                <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-50">
                  {procedure.name}
                </td>
                {COMMISSION_TIERS.map((tier) => {
                  const key = `${tier}:${procedure.id}`;
                  const rate = rateOf.get(key);
                  const cellLabel = `${tierLabel(tier)} · ${procedure.name}`;
                  return (
                    <td key={tier} className="whitespace-nowrap px-4 py-2" data-cell={key}>
                      {editing === key ? (
                        <RateEditor
                          label={cellLabel}
                          initial={toDraft(rate)}
                          allowPeso
                          alsoTiers={COMMISSION_TIERS.filter((other) => other !== tier)}
                          saving={busy === key}
                          onCancel={() => setEditing(null)}
                          onSave={async (values, also) => {
                            const ok = await run(key, () =>
                              setTierRateAction({
                                tiers: [tier, ...also],
                                procedureId: procedure.id,
                                ...values,
                              }),
                            );
                            if (ok) setEditing(null);
                          }}
                        />
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={
                              rate ? `Edit ${cellLabel}` : `Set ${cellLabel}`
                            }
                            onClick={() => {
                              setMessage(null);
                              setEditing(key);
                            }}
                            className="rounded-md px-2 py-1 tabular-nums hover:bg-amber-50 hover:text-amber-800 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
                          >
                            {rate ? (
                              describeTierRate(rate)
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </button>
                          {rate && (
                            <button
                              type="button"
                              aria-label={`Remove ${cellLabel}`}
                              disabled={busy === rate.id}
                              onClick={() =>
                                run(rate.id, () => deleteTierRateAction(rate.id))
                              }
                              className="inline-flex items-center rounded px-1 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            >
                              {busy === rate.id ? (
                                <Spinner className="h-3 w-3" />
                              ) : (
                                "×"
                              )}
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * One person's own rate per procedure (an override of their tier, or a staff
 * bonus). Shows the tier rate they would get otherwise next to it, so the
 * difference is easy to see. A blank own rate means "use the tier rate".
 */
export function PersonRateGrid({
  people,
  procedures,
  rates,
  tierRates,
  dentistTiers,
}: {
  people: PublicUser[];
  procedures: ProcedureRow[];
  rates: CommissionRate[];
  tierRates: TierRate[];
  dentistTiers: DentistTier[];
}) {
  const router = useRouter();
  const [personId, setPersonId] = useState("");
  const [search, setSearch] = useState("");
  const [onlyOwn, setOnlyOwn] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const person = people.find((entry) => entry.id === personId);
  const tier = dentistTiers.find((entry) => entry.dentistUserId === personId)?.tier;

  const ownByProcedure = useMemo(() => {
    const map = new Map<string, CommissionRate>();
    for (const rate of rates) {
      if (rate.dentistUserId === personId) map.set(rate.procedureId, rate);
    }
    return map;
  }, [rates, personId]);

  const tierByProcedure = useMemo(() => {
    const map = new Map<string, TierRate>();
    for (const rate of tierRates) {
      if (rate.tier === tier) map.set(rate.procedureId, rate);
    }
    return map;
  }, [tierRates, tier]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return procedures
      .filter((procedure) => procedure.active || ownByProcedure.has(procedure.id))
      .filter((procedure) => !needle || procedure.name.toLowerCase().includes(needle))
      .filter((procedure) => !onlyOwn || ownByProcedure.has(procedure.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [procedures, search, onlyOwn, ownByProcedure]);

  const ownCount = ownByProcedure.size;

  async function run(key: string, task: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    setMessage(null);
    try {
      const result = await task();
      if (!result.ok) {
        setMessage(result.message ?? "Something went wrong.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3" aria-busy={busy !== null}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            One person&apos;s own rates
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            Choose a dentist (or staff member) to change their rate for a single
            procedure without touching their tier. A rate set here takes
            priority over the tier and replaces it completely, including the
            HMO rate. Also used for staff bonuses.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Dentist / staff
          <select
            aria-label="Dentist or staff"
            value={personId}
            onChange={(event) => {
              setPersonId(event.target.value);
              setEditing(null);
              setMessage(null);
            }}
            className="select-chevron min-w-[14rem] rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
          >
            <option value="">Select a person</option>
            {people.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!person ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Select a person to see and change their rates.
        </p>
      ) : (
        <>
          <ErrorBanner message={message} />
          <div className="flex flex-wrap items-center gap-4">
            <SearchBox value={search} onChange={setSearch} />
            <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={onlyOwn}
                onChange={(event) => setOnlyOwn(event.target.checked)}
              />
              Only their own rates ({ownCount})
            </label>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {tier ? `${person.name} is in ${tierLabel(tier)}.` : `${person.name} has no tier.`}
            </span>
          </div>
          <div
            data-testid="person-grid"
            className="max-h-[70vh] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
          >
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Procedure</th>
                  <th className="px-4 py-3 font-medium">
                    {tier ? `${tierLabel(tier)} rate` : "Tier rate"}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {person.name.split(" ")[0]}&apos;s own rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                    >
                      Nothing to show.
                    </td>
                  </tr>
                )}
                {rows.map((procedure) => {
                  const own = ownByProcedure.get(procedure.id);
                  const tierRate = tierByProcedure.get(procedure.id);
                  const cellLabel = `${person.name} · ${procedure.name}`;
                  const key = procedure.id;
                  return (
                    <tr
                      key={procedure.id}
                      className={`align-top text-zinc-700 dark:text-zinc-300 ${
                        own ? "bg-amber-50/50 dark:bg-amber-950/20" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-50">
                        {procedure.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-zinc-500 dark:text-zinc-400">
                        {tierRate ? describeTierRate(tierRate) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2" data-cell={key}>
                        {editing === key ? (
                          <RateEditor
                            label={cellLabel}
                            initial={toDraft(own ?? tierRate)}
                            allowPeso={false}
                            saving={busy === key}
                            onCancel={() => setEditing(null)}
                            onSave={async (values) => {
                              const ok = await run(key, () =>
                                setCommissionRateAction({
                                  dentistUserId: person.id,
                                  procedureId: procedure.id,
                                  ratePercent: values.ratePercent,
                                  hmoRatePercent: values.hmoRatePercent,
                                  hmoPesoValue: values.hmoPesoValue,
                                }),
                              );
                              if (ok) setEditing(null);
                            }}
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={
                                own ? `Edit ${cellLabel}` : `Set own rate ${cellLabel}`
                              }
                              onClick={() => {
                                setMessage(null);
                                setEditing(key);
                              }}
                              className="rounded-md px-2 py-1 tabular-nums hover:bg-amber-50 hover:text-amber-800 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
                            >
                              {own ? (
                                describeTierRate({
                                  ratePercent: own.ratePercent,
                                  hmoRatePercent: own.hmoRatePercent,
                                  pesoValue: null,
                                  hmoPesoValue: own.hmoPesoValue,
                                })
                              ) : (
                                <span className="text-zinc-400">
                                  {tierRate ? "uses tier rate" : "—"}
                                </span>
                              )}
                            </button>
                            {own && (
                              <button
                                type="button"
                                aria-label={`Remove ${cellLabel}`}
                                title="Go back to the tier rate"
                                disabled={busy === own.id}
                                onClick={() =>
                                  run(own.id, () => deleteCommissionRateAction(own.id))
                                }
                                className="inline-flex items-center rounded px-1 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              >
                                {busy === own.id ? (
                                  <Spinner className="h-3 w-3" />
                                ) : (
                                  "×"
                                )}
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
