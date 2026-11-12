/**
 * A patient's HMO details: the HMO company, the account (member) number and
 * the birthday. Pure rules (no database, no React), shared by the form, the
 * server action and the screens.
 */

import { hmoPaymentNames } from "@/lib/cashflow/payment-methods";

export const MAX_HMO_COMPANY_LENGTH = 100;
export const MAX_HMO_ACCOUNT_LENGTH = 60;

/** Suggestions for the HMO company box (any other name can still be typed). */
export function hmoCompanySuggestions(): readonly string[] {
  return hmoPaymentNames();
}

export const BIRTH_DATE_INVALID_MESSAGE =
  "The birthday must be a real date that is not in the future.";

/** Today's date in Manila (UTC+8) as YYYY-MM-DD, or any `now` given. */
function manilaToday(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A real calendar date typed as YYYY-MM-DD, from 1900 and not after today. */
export function isValidBirthDate(
  value: string | null | undefined,
  now: Date = new Date(),
): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return real && year >= 1900 && value <= manilaToday(now);
}

/** Whole years lived on `now` (Manila date), or null for a blank / bad date. */
export function ageFromBirthDate(
  birthDate: string,
  now: Date = new Date(),
): number | null {
  if (!isValidBirthDate(birthDate, now)) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = manilaToday(now).split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "1990-03-07" → "March 7, 1990"; anything else is returned as it came. */
export function formatBirthDate(birthDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return birthDate;
  const [year, month, day] = birthDate.split("-").map(Number);
  if (month < 1 || month > 12) return birthDate;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** Trim and collapse runs of spaces; cap the length. */
export function cleanHmoText(value: unknown, max: number): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// A patient's list of HMOs (company + account number, several allowed)
// ---------------------------------------------------------------------------

/** How many HMOs one patient can have. */
export const MAX_PATIENT_HMOS = 10;

/** The longest the patient's own company name (employer) may be. */
export const MAX_HMO_EMPLOYER_LENGTH = 120;

/**
 * One HMO of a patient. `company` is the HMO's name (Maxicare, Medicard...);
 * `employer` is the PATIENT'S company, the one that enrolled them in that HMO.
 */
export type PatientHmoEntry = {
  company: string;
  employer: string;
  accountNumber: string;
};

/** The company name as compared: no capitals, no extra spaces. */
export function hmoKey(name: string): string {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export type CleanHmoListResult =
  | { ok: true; list: PatientHmoEntry[] }
  | { ok: false; message: string };

/**
 * Tidies the list typed on the patient form: spaces trimmed, lengths capped,
 * completely empty rows dropped. An account number needs its company, the same
 * company can't be listed twice (capitals ignored), and at most
 * `MAX_PATIENT_HMOS` entries.
 */
export function cleanHmoList(input: unknown): CleanHmoListResult {
  if (input === undefined || input === null) return { ok: true, list: [] };
  if (!Array.isArray(input)) {
    return { ok: false, message: "The HMO list isn't valid." };
  }
  const list: PatientHmoEntry[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const company = cleanHmoText(row.company, MAX_HMO_COMPANY_LENGTH);
    const employer = cleanHmoText(row.employer, MAX_HMO_EMPLOYER_LENGTH);
    const accountNumber = cleanHmoText(row.accountNumber, MAX_HMO_ACCOUNT_LENGTH);
    if (company === "" && accountNumber === "" && employer === "") continue;
    if (company === "") {
      return {
        ok: false,
        message: `Enter the HMO name for ${
          accountNumber ? `account number ${accountNumber}` : `the company ${employer}`
        }.`,
      };
    }
    const key = hmoKey(company);
    if (seen.has(key)) {
      return { ok: false, message: `${company} is listed twice.` };
    }
    seen.add(key);
    list.push({ company, employer, accountNumber });
  }
  if (list.length > MAX_PATIENT_HMOS) {
    return {
      ok: false,
      message: `A patient can have up to ${MAX_PATIENT_HMOS} HMOs.`,
    };
  }
  return { ok: true, list };
}

/** The old single HMO of a patient as a list of zero or one entry. */
export function legacyHmoList(company: string, accountNumber: string): PatientHmoEntry[] {
  return company.trim() === ""
    ? []
    : [{ company: company.trim(), employer: "", accountNumber }];
}

/** What is known about a patient with ONE HMO: their company and account number. */
export type HmoDetails = { employer: string; accountNumber: string };

/**
 * The patient's details for ONE HMO (the one a visit or billing line is for).
 * With a list, only that HMO's entry counts, and the details are blank when
 * the patient has no entry for it (another HMO's account number would be
 * wrong on the billing). Without a list (older data, or the table not set up
 * yet) the single account number on the patient is used, as before.
 */
export function hmoDetailsFor(
  entries: readonly PatientHmoEntry[],
  hmoName: string,
  legacyAccountNumber: string,
): HmoDetails {
  if (entries.length === 0) return { employer: "", accountNumber: legacyAccountNumber };
  const key = hmoKey(hmoName);
  const entry = entries.find((item) => hmoKey(item.company) === key);
  return { employer: entry?.employer ?? "", accountNumber: entry?.accountNumber ?? "" };
}

/** The patient's account number for ONE HMO (see `hmoDetailsFor`). */
export function accountNumberFor(
  entries: readonly PatientHmoEntry[],
  hmoName: string,
  legacyAccountNumber: string,
): string {
  return hmoDetailsFor(entries, hmoName, legacyAccountNumber).accountNumber;
}

/** The details typed on one visit, for the HMO the visit was paid through. */
export type VisitHmoDetails = { hmoName: string; employer: string; accountNumber: string };

/**
 * The company and account number to show for a visit's HMO. What was typed on
 * the visit wins (when it is for that same HMO and has something in it); if
 * not, the patient's own entry for that HMO is used.
 */
export function resolveHmoDetails(input: {
  visit: VisitHmoDetails | undefined;
  entries: readonly PatientHmoEntry[];
  hmoName: string;
  legacyAccountNumber: string;
}): HmoDetails {
  const saved = input.visit;
  if (
    saved &&
    hmoKey(saved.hmoName) === hmoKey(input.hmoName) &&
    (saved.employer.trim() !== "" || saved.accountNumber.trim() !== "")
  ) {
    return { employer: saved.employer, accountNumber: saved.accountNumber };
  }
  return hmoDetailsFor(input.entries, input.hmoName, input.legacyAccountNumber);
}
