/**
 * A patient's HMO details: the HMO company, the account (member) number and
 * the birthday. Pure rules (no database, no React), shared by the form, the
 * server action and the screens.
 */

import { HMO_PAYMENT_TYPES } from "@/lib/cashflow/pricing";

export const MAX_HMO_COMPANY_LENGTH = 100;
export const MAX_HMO_ACCOUNT_LENGTH = 60;

/** Suggestions for the HMO company box (any other name can still be typed). */
export const HMO_COMPANY_SUGGESTIONS: readonly string[] = HMO_PAYMENT_TYPES;

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
