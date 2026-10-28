/**
 * Clinic details shown on the Privacy Policy, Terms, Help and Contact pages.
 *
 * Anything that still says "TO BE CONFIRMED" is a placeholder: the clinic
 * (owner / appointed Data Protection Officer) fills it in here, once, and
 * every page updates. Placeholders are rendered highlighted so they can't be
 * missed, and `LEGAL_TEXT_REVIEWED` controls the "draft" banner on the pages.
 */
export const TO_BE_CONFIRMED = "TO BE CONFIRMED";

export const CLINIC = {
  name: "ADT Dental Clinic",
  /** Registered business name, as it appears on the official receipt. */
  registeredName: TO_BE_CONFIRMED,
  address: TO_BE_CONFIRMED,
  phone: TO_BE_CONFIRMED,
  supportEmail: TO_BE_CONFIRMED,
  supportHours: TO_BE_CONFIRMED,
  /** Data Protection Officer (required by the Data Privacy Act, RA 10173). */
  dpoName: TO_BE_CONFIRMED,
  dpoEmail: TO_BE_CONFIRMED,
  dpoPhone: TO_BE_CONFIRMED,
} as const;

/** Set to true once the clinic's legal adviser has read and approved the text. */
export const LEGAL_TEXT_REVIEWED = false;

/** Date shown as "Last updated" on the policy pages. */
export const LEGAL_LAST_UPDATED = "October 28, 2026";

export function isPlaceholder(value: string): boolean {
  return value === TO_BE_CONFIRMED;
}
