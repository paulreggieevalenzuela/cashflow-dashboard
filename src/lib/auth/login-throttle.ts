/**
 * When to refuse a sign-in because of too many wrong passwords. Pure rules
 * (no database, no React), shared by the server and the tests.
 *
 * - An account (the typed e-mail, whether or not it exists) is locked after
 *   5 wrong attempts in a row inside 15 minutes, until 15 minutes after the
 *   last wrong one. A correct sign-in clears the count.
 * - One internet address is locked after 20 wrong attempts in 15 minutes
 *   across all e-mails (guessing many accounts from one place).
 * - Attempts made while locked are not counted, so the lock does not keep
 *   extending itself.
 */

export const WINDOW_MINUTES = 15;
export const MAX_ACCOUNT_FAILURES = 5;
export const MAX_ADDRESS_FAILURES = 20;

export type AttemptOutcome =
  | "ok"
  | "wrong_password"
  | "unknown_email"
  | "locked";

/** One earlier attempt for the e-mail, newest first. */
export type EmailAttempt = { at: Date; outcome: AttemptOutcome };

export type LockStatus =
  | { locked: false }
  | { locked: true; retryAfterSeconds: number; reason: "account" | "address" };

const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

/** A wrong-password style outcome (counts toward the lock). */
export function isFailure(outcome: AttemptOutcome): boolean {
  return outcome === "wrong_password" || outcome === "unknown_email";
}

export function lockStatus(input: {
  /** Earlier attempts for this e-mail inside the window, newest first. */
  emailAttempts: EmailAttempt[];
  /** Wrong attempts from this address inside the window, any e-mail. */
  addressFailures: number;
  now: Date;
}): LockStatus {
  const nowMs = input.now.getTime();

  // Wrong attempts since the last correct sign-in (or locked attempt, which
  // is ignored), still inside the window.
  const failures: Date[] = [];
  for (const attempt of input.emailAttempts) {
    if (attempt.outcome === "ok") break;
    if (!isFailure(attempt.outcome)) continue;
    if (nowMs - attempt.at.getTime() > WINDOW_MS) continue;
    failures.push(attempt.at);
  }
  if (failures.length >= MAX_ACCOUNT_FAILURES) {
    const latest = Math.max(...failures.map((at) => at.getTime()));
    const retryMs = latest + WINDOW_MS - nowMs;
    if (retryMs > 0) {
      return {
        locked: true,
        reason: "account",
        retryAfterSeconds: Math.ceil(retryMs / 1000),
      };
    }
  }

  if (input.addressFailures >= MAX_ADDRESS_FAILURES) {
    return {
      locked: true,
      reason: "address",
      retryAfterSeconds: WINDOW_MINUTES * 60,
    };
  }
  return { locked: false };
}

/** "about 15 minutes" style text for the lock message. */
export function waitText(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
