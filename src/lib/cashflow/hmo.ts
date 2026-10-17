/**
 * HMO authorization on a visit: the LOA (Letter of Authorization) number and
 * the optional LOE number.
 *
 * The LOA often arrives the day AFTER the visit, so it is never needed to
 * check a patient in, treat them or take payment. Instead an HMO visit
 * without an LOA number is "LOA pending", and it cannot be Cleared until the
 * number is entered. Pure rules (no database, no React), shared by the form,
 * the screens and the server.
 */

import { isHmoPayment } from "@/lib/cashflow/pricing";
import type { VisitStatus } from "@/lib/cashflow/visit-status";

export const LOA_PENDING_LABEL = "LOA pending";

export const LOA_MISSING_MESSAGE =
  "This HMO visit has no LOA number yet. Enter it (Edit transaction → HMO authorization) before clearing the visit.";

/** Longest LOA / LOE number we keep. */
export const MAX_HMO_REFERENCE_LENGTH = 60;

/** Is any of these payment methods an HMO / insurance provider? */
export function hasHmoPayment(
  paymentTypes: ReadonlyArray<string | null | undefined>,
): boolean {
  return paymentTypes.some((type) => isHmoPayment(type));
}

/** The HMO visit has no LOA number (blank or spaces only). */
export function isLoaMissing(input: {
  isHmo: boolean;
  loaNumber: string | null | undefined;
}): boolean {
  return input.isHmo && !(input.loaNumber ?? "").trim();
}

/**
 * Show the "LOA pending" flag? A Cleared visit never shows it: visits that
 * were cleared before this field existed (old imports) have no LOA and
 * should not be chased.
 */
export function isLoaPending(input: {
  isHmo: boolean;
  loaNumber: string | null | undefined;
  status: VisitStatus;
}): boolean {
  return input.status !== "Cleared" && isLoaMissing(input);
}

/** Tailwind classes for the "LOA pending" chip. */
export const LOA_PENDING_STYLE =
  "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300";
