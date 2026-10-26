"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createPatientAction,
  updatePatientAction,
} from "@/app/cashflow/patients/actions";
import { Modal } from "@/components/ui/modal";
import {
  HMO_COMPANY_SUGGESTIONS,
  MAX_HMO_ACCOUNT_LENGTH,
  MAX_HMO_COMPANY_LENGTH,
} from "@/lib/cashflow/patient-hmo";
import { todayInManila } from "@/lib/cashflow/visit-status";

const FIELD =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

type Initial = {
  id: string;
  fullName: string;
  contactNumber: string;
  notes: string;
  birthDate: string;
  hmoCompany: string;
  hmoAccountNumber: string;
};

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
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [contactNumber, setContactNumber] = useState(
    initial?.contactNumber ?? "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? "");
  const [hmoCompany, setHmoCompany] = useState(initial?.hmoCompany ?? "");
  const [hmoAccountNumber, setHmoAccountNumber] = useState(
    initial?.hmoAccountNumber ?? "",
  );
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
        hmoCompany,
        hmoAccountNumber,
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
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              HMO company
              <input
                value={hmoCompany}
                onChange={(event) => setHmoCompany(event.target.value)}
                list="patient-hmo-companies"
                maxLength={MAX_HMO_COMPANY_LENGTH}
                placeholder="e.g. Maxicare"
                className={FIELD}
                autoComplete="off"
              />
              <datalist id="patient-hmo-companies">
                {HMO_COMPANY_SUGGESTIONS.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              HMO account number
              <input
                value={hmoAccountNumber}
                onChange={(event) => setHmoAccountNumber(event.target.value)}
                maxLength={MAX_HMO_ACCOUNT_LENGTH}
                className={FIELD}
                autoComplete="off"
              />
            </label>
          </div>
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
