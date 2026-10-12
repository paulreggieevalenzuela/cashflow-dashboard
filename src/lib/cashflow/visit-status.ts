/**
 * Internal tracking status of a visit: where the patient is in the clinic.
 * Pure rules (no database, no React) so the form/screens decide what to
 * offer and the server decides what is allowed using the SAME code.
 *
 * Status is a work-flow label only. It never changes sales, collections or
 * commission, which keep following the payments actually received.
 */

export const VISIT_STATUSES = [
  "Arrived",
  "On-going",
  "For Payment",
  "Cleared",
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number];

export function isVisitStatus(value: unknown): value is VisitStatus {
  return (
    typeof value === "string" &&
    (VISIT_STATUSES as readonly string[]).includes(value)
  );
}

/** Today's date (YYYY-MM-DD) in the clinic's timezone. */
export function todayInManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(),
  );
}

/** A balance below this counts as zero (rounding noise). */
const EPSILON = 0.005;

function indexOf(status: VisitStatus): number {
  return VISIT_STATUSES.indexOf(status);
}

/** The next step forward, or null when already Cleared. */
export function nextStatus(status: VisitStatus): VisitStatus | null {
  const next = VISIT_STATUSES[indexOf(status) + 1];
  return next ?? null;
}

/** Cleared visits are read-only for everyone but an admin. */
export function isLocked(status: VisitStatus): boolean {
  return status === "Cleared";
}

export function balanceDueOf(totalDue: number, collected: number): number {
  const balance = totalDue - collected;
  return balance > EPSILON ? Math.round(balance * 100) / 100 : 0;
}

/**
 * The status a brand-new visit starts with.
 *
 * - A reservation fee is money in, not treatment in progress: Cleared.
 * - A visit dated before today is being typed in after the fact (from the
 *   paper booklet), so it skips the waiting steps: Cleared when paid in
 *   full, otherwise For Payment.
 * - A visit for today that is already paid in full is Cleared (the clinic
 *   usually enters the whole visit and its payment in one go).
 * - Anything else for today is Arrived and is moved along as the patient is
 *   seen.
 */
export function defaultStatusOnCreate(input: {
  visitDate: string;
  today: string;
  transactionType: string;
  totalDue: number;
  collected: number;
}): VisitStatus {
  if (input.transactionType === "Reservation") {
    return "Cleared";
  }
  const balance = balanceDueOf(input.totalDue, input.collected);
  const paidInFull = input.totalDue > EPSILON && balance === 0;
  if (input.visitDate < input.today) {
    return paidInFull || input.totalDue <= EPSILON ? "Cleared" : "For Payment";
  }
  return paidInFull ? "Cleared" : "Arrived";
}

export type MoveCheck =
  { ok: true; needsNote: boolean } | { ok: false; message: string };

/**
 * May this person move a visit from one status to another?
 *
 * - Forward, one step at a time, is open to every signed-in role.
 * - A visit can only be Cleared when nothing is owed. This holds for
 *   everyone, admins included: record the payment first.
 * - Going backwards, or jumping ahead, is admin-only and needs a reason.
 */
export function canMove(input: {
  from: VisitStatus;
  to: VisitStatus;
  isAdmin: boolean;
  balanceDue: number;
}): MoveCheck {
  const { from, to, isAdmin, balanceDue } = input;
  if (from === to) {
    return { ok: false, message: "The visit is already " + to + "." };
  }
  if (to === "Cleared" && balanceDue > EPSILON) {
    return {
      ok: false,
      message: `A balance of ${balanceDue.toFixed(2)} is still due. Record the full payment first — a visit can only be Cleared when nothing is owed.`,
    };
  }
  const step = indexOf(to) - indexOf(from);

  if (step === 1) {
    return { ok: true, needsNote: false };
  }

  if (!isAdmin) {
    return {
      ok: false,
      message:
        step < 0
          ? "Only an admin can move a visit back."
          : "Move the visit forward one step at a time.",
    };
  }
  return { ok: true, needsNote: true };
}

/**
 * After a payment is added or removed: should the status follow the money?
 * A For Payment visit that is now paid in full becomes Cleared; a Cleared
 * visit that owes money again goes back to For Payment. Returns null when
 * nothing should change.
 */
export function statusAfterPaymentChange(input: {
  current: VisitStatus;
  balanceDue: number;
}): VisitStatus | null {
  if (input.current === "For Payment" && input.balanceDue <= EPSILON) {
    return "Cleared";
  }
  if (input.current === "Cleared" && input.balanceDue > EPSILON) {
    return "For Payment";
  }
  return null;
}

/** Tailwind classes for the status pill. */
export const STATUS_STYLES: Record<VisitStatus, string> = {
  Arrived: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "On-going":
    "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "For Payment":
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  Cleared: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
};

// ── Waiting times ────────────────────────────────────────────────────

export const WAIT_STAGES = ["Arrived", "On-going", "For Payment"] as const;
export type WaitStage = (typeof WAIT_STAGES)[number];

export const WAIT_STAGE_LABELS: Record<WaitStage, string> = {
  Arrived: "Waiting to see the dentist",
  "On-going": "In treatment",
  "For Payment": "Waiting to pay",
};

export type WaitStat = {
  stage: WaitStage;
  label: string;
  count: number;
  averageMinutes: number | null;
};

/** A stage left open longer than this was forgotten, not waited out, so it
 * is left out of the averages. */
const MAX_STAGE_MINUTES = 24 * 60;

/**
 * Average minutes spent in each stage, from the status history. A stage's
 * time is the gap between entering it and the next FORWARD move of the same
 * visit; stages still open, backwards moves and forgotten visits are skipped.
 * `rows` must be sorted by visit then time.
 */
export function computeWaitStats(
  rows: Array<{ invoiceId: string; toStatus: string; at: number }>,
): WaitStat[] {
  const sums = new Map<WaitStage, { total: number; count: number }>(
    WAIT_STAGES.map((stage) => [stage, { total: 0, count: 0 }]),
  );
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (a.invoiceId !== b.invoiceId) continue;
    if (!isVisitStatus(a.toStatus) || !isVisitStatus(b.toStatus)) continue;
    if (!(WAIT_STAGES as readonly string[]).includes(a.toStatus)) continue;
    if (indexOf(b.toStatus) <= indexOf(a.toStatus)) continue;
    const minutes = (b.at - a.at) / 60000;
    if (minutes < 0 || minutes > MAX_STAGE_MINUTES) continue;
    const bucket = sums.get(a.toStatus as WaitStage);
    if (bucket) {
      bucket.total += minutes;
      bucket.count += 1;
    }
  }
  return WAIT_STAGES.map((stage) => {
    const bucket = sums.get(stage) ?? { total: 0, count: 0 };
    return {
      stage,
      label: WAIT_STAGE_LABELS[stage],
      count: bucket.count,
      averageMinutes:
        bucket.count > 0 ? Math.round(bucket.total / bucket.count) : null,
    };
  });
}

/** "12 min", "1 h 05 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${String(rest).padStart(2, "0")} min`;
}
