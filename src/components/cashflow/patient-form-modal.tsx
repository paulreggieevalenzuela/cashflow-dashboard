"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createPatientAction,
  updatePatientAction,
} from "@/app/cashflow/patients/actions";
import { Modal } from "@/components/ui/modal";
import {
  MAX_HMO_ACCOUNT_LENGTH,
  MAX_HMO_COMPANY_LENGTH,
  MAX_HMO_EMPLOYER_LENGTH,
  MAX_PATIENT_HMOS,
  type PatientHmoEntry,
} from "@/lib/cashflow/patient-hmo";
import { todayInManila } from "@/lib/cashflow/visit-status";
import { useHmoNames } from "@/components/cashflow/payment-methods-context";

const FIELD =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

type Initial = {
  id: string;
  fullName: string;
  contactNumber: string;
  notes: string;
  birthDate: string;
  /** The patient's HMOs (HMO name, their company, account number), first one first. */
  hmos: PatientHmoEntry[];
  /** False until scripts/sql/2026-11-patient-hmos.sql is run: one HMO only. */
  hmoListReady: boolean;
};

/** One row of the HMO list on screen (`key` only keeps rows apart while editing). */
type HmoRow = PatientHmoEntry & { key: number };

/** Add a patient, or edit one's name, contact number, birthday, HMO details and notes. */
export function PatientFormModal({
  initial,
  buttonLabel,
  buttonClassName,
}: {
  initial?: Initial;
  buttonLabel: string;
  buttonClassName?: string;
}) {
  const router = useRouter();
  const hmoNames = useHmoNames();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [contactNumber, setContactNumber] = useState(
    initial?.contactNumber ?? "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? "");
  const [nextKey, setNextKey] = useState(initial?.hmos.length ?? 0);
  const [hmoRows, setHmoRows] = useState<HmoRow[]>(
    (initial?.hmos ?? []).map((entry, index) => ({ ...entry, key: index })),
  );
  // Without the list table only one HMO fits.
  const listReady = initial?.hmoListReady ?? true;
  const maxRows = listReady ? MAX_PATIENT_HMOS : 1;

  function addHmoRow() {
    setHmoRows((rows) => [...rows, { company: "", employer: "", accountNumber: "", key: nextKey }]);
    setNextKey((key) => key + 1);
  }
  function changeHmoRow(key: number, change: Partial<PatientHmoEntry>) {
    setHmoRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }
  function removeHmoRow(key: number) {
    setHmoRows((rows) => rows.filter((row) => row.key !== key));
  }
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  function submit() {
    setError(null);
    setExistingId(null);
    startTransition(async () => {
      const input = {
        fullName,
        contactNumber,
        notes,
        birthDate,
        // The first HMO also fills the older single fields (the server does
        // this too; sent here so the type is complete).
        hmoCompany: hmoRows[0]?.company ?? "",
        hmoAccountNumber: hmoRows[0]?.accountNumber ?? "",
        hmos: hmoRows.map(({ company, employer, accountNumber }) => ({
          company,
          employer,
          accountNumber,
        })),
      };
      const result = initial
        ? await updatePatientAction(initial.id, input)
        : await createPatientAction(input);
      if (!result.ok) {
        setError(result.message);
        setExistingId(result.existingId ?? null);
        return;
      }
      setOpen(false);
      if (initial) {
        router.refresh();
      } else {
        router.push(`/cashflow/patients/${result.id}`);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
        }
      >
        {buttonLabel}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={initial ? "Edit patient" : "Add patient"}
        description={
          initial
            ? "Correct the name, contact number, birthday, HMO details or notes. Old visits keep their dates and amounts."
            : "Patients are also added automatically the first time their name is used on a transaction."
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Full name
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className={FIELD}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Contact number
            <input
              value={contactNumber}
              onChange={(event) => setContactNumber(event.target.value)}
              className={FIELD}
              inputMode="tel"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Birthday
            <input
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              min="1900-01-01"
              max={todayInManila()}
              className={FIELD}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              HMO list
            </legend>
            {hmoRows.length === 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No HMO yet. Add one if the patient has an HMO card.
              </p>
            )}
            {hmoRows.map((row, index) => (
              <div
                key={row.key}
                className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 sm:grid-cols-2"
              >
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  HMO name
                  <input
                    value={row.company}
                    onChange={(event) => changeHmoRow(row.key, { company: event.target.value })}
                    list="patient-hmo-companies"
                    maxLength={MAX_HMO_COMPANY_LENGTH}
                    placeholder="e.g. Maxicare"
                    className={FIELD}
                    autoComplete="off"
                    aria-label={`HMO ${index + 1} name`}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  HMO account number
                  <input
                    value={row.accountNumber}
                    onChange={(event) => changeHmoRow(row.key, { accountNumber: event.target.value })}
                    maxLength={MAX_HMO_ACCOUNT_LENGTH}
                    className={FIELD}
                    autoComplete="off"
                    aria-label={`HMO ${index + 1} account number`}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 sm:col-span-2">
                  Patient&rsquo;s company
                  <input
                    value={row.employer}
                    onChange={(event) => changeHmoRow(row.key, { employer: event.target.value })}
                    maxLength={MAX_HMO_EMPLOYER_LENGTH}
                    placeholder="The company the patient works for (optional)"
                    disabled={!listReady}
                    title={
                      listReady
                        ? undefined
                        : "Run scripts/sql/2026-11-patient-hmos.sql in Neon to keep the patient's company."
                    }
                    className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-60`}
                    autoComplete="off"
                    aria-label={`HMO ${index + 1} patient's company`}
                  />
                </label>
                <div className="flex justify-end sm:col-span-2">
                  <button
                    type="button"
                    onClick={() => removeHmoRow(row.key)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    aria-label={`Remove HMO ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <datalist id="patient-hmo-companies">
              {hmoNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {hmoRows.length < maxRows ? (
              <button
                type="button"
                onClick={addHmoRow}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                + Add HMO
              </button>
            ) : (
              !listReady && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Only one HMO fits for now, and the patient&rsquo;s company can&rsquo;t be kept. To keep several per patient, run{" "}
                  <code>scripts/sql/2026-11-patient-hmos.sql</code> in Neon.
                </p>
              )
            )}
          </fieldset>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className={FIELD}
            />
          </label>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}{" "}
              {existingId && (
                <a
                  href={`/cashflow/patients/${existingId}`}
                  className="font-medium underline"
                >
                  Open that patient
                </a>
              )}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || !fullName.trim()}
              className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
