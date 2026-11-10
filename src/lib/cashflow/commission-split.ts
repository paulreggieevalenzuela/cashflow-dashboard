import { round2 } from "@/lib/cashflow/pricing";

/** Share of a transferred patient's commission that goes to each dentist. */
export const TRANSFER_SHARE_PERCENT = 50;

export interface CommissionSplit {
  /** The main dentist's part (the whole commission when not transferred). */
  main: number;
  /** The dentist the patient was transferred to (0 when not transferred). */
  transfer: number;
}

/**
 * Splits a line's commission between the main dentist and the dentist the
 * patient was transferred to. The commission itself is always worked out
 * ONCE, at the main dentist's rate; this only divides it. The two parts add
 * up to exactly the commission (the odd centavo stays with the transferred
 * dentist, so nothing is created or lost).
 */
export function splitCommission(
  commission: number,
  transferred: boolean,
): CommissionSplit {
  const total = round2(commission);
  if (!transferred || total <= 0) {
    return { main: total, transfer: 0 };
  }
  const main = round2((total * (100 - TRANSFER_SHARE_PERCENT)) / 100);
  return { main, transfer: round2(total - main) };
}

/** Why a "transferred to" dentist can't be used, or null when it is fine. */
export function transferDentistError(
  mainDentist: string,
  transferDentist: string,
): string | null {
  const transfer = transferDentist.trim();
  if (!transfer) {
    return null;
  }
  const main = mainDentist.trim();
  if (!main) {
    return "Choose the main dentist first.";
  }
  if (main.toLowerCase() === transfer.toLowerCase()) {
    return "The transferred-to dentist must be a different dentist.";
  }
  return null;
}
