/**
 * Login expiry rules. Pure functions only (no database, no React) so they can
 * be used by the server (src/auth.ts), the middleware and the browser
 * (SessionGuard), and tested on their own.
 *
 * The rule: a login lasts 30 minutes from the last time it was extended. It is
 * extended only by real activity in the browser (see SessionGuard) or by the
 * person pressing "Stay signed in" — never by background requests such as the
 * Queue auto-refresh. A login can never be extended past 12 hours in total.
 */

const MINUTE_MS = 60_000;

const DEFAULT_IDLE_MINUTES = 30;
const MAX_WARNING_MINUTES = 5;
const ABSOLUTE_LIMIT_HOURS = 12;

/**
 * How recently the screen must have been used for the extension in the last
 * minutes to happen quietly (no pop-up).
 */
export const QUIET_ACTIVITY_MS = MINUTE_MS;

/** 12 hours — after this the person must enter their password again. */
export const ABSOLUTE_LIMIT_MS = ABSOLUTE_LIMIT_HOURS * 60 * MINUTE_MS;

/**
 * Idle timeout in milliseconds. 30 minutes. For manual testing you can set
 * NEXT_PUBLIC_SESSION_IDLE_MINUTES (e.g. 3) in .env.local — it is ignored in
 * production builds.
 */
export function idleTimeoutMs(): number {
  if (process.env.NODE_ENV !== "production") {
    const override = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES);
    if (Number.isFinite(override) && override > 0) {
      return override * MINUTE_MS;
    }
  }
  return DEFAULT_IDLE_MINUTES * MINUTE_MS;
}

/**
 * How long before the end the warning / extension window opens: 5 minutes
 * (scaled down to a third of the timeout when testing with a short timeout).
 */
export function warningWindowMs(): number {
  return Math.min(MAX_WARNING_MINUTES * MINUTE_MS, Math.floor(idleTimeoutMs() / 3));
}

/** When the login should end if it is extended at `now`. Never beyond 12 h. */
export function nextActiveUntil(now: number, signedInAt: number): number {
  return Math.min(now + idleTimeoutMs(), signedInAt + ABSOLUTE_LIMIT_MS);
}

export function isExpired(activeUntil: number, now: number): boolean {
  return now >= activeUntil;
}

/** False once the 12-hour limit is what ends the login — extending is pointless. */
export function canExtend(activeUntil: number, signedInAt: number): boolean {
  return activeUntil < signedInAt + ABSOLUTE_LIMIT_MS;
}

export type GuardAction =
  | "none" // plenty of time left, nothing to do
  | "expired" // time is up — sign out and go to the login page
  | "refresh-quietly" // in the last minutes and the screen is being used
  | "show-warning" // in the last minutes and nobody is using the screen
  | "close-warning"; // the pop-up is open but time was added elsewhere

/**
 * What the browser should do on each tick.
 * - remainingMs: time left on the login (from the server's figure).
 * - warningOpen: the pop-up is currently showing.
 * - msSinceActivity: time since the last click / key / touch / scroll.
 * - extendable: false when the 12-hour limit is what will end the login.
 */
export function decideGuardAction(input: {
  remainingMs: number;
  warningOpen: boolean;
  msSinceActivity: number;
  extendable: boolean;
}): GuardAction {
  const { remainingMs, warningOpen, msSinceActivity, extendable } = input;

  if (remainingMs <= 0) return "expired";

  if (remainingMs > warningWindowMs()) {
    return warningOpen ? "close-warning" : "none";
  }

  // In the last minutes. Once the pop-up is open it stays until the person
  // chooses — activity elsewhere must not dismiss it by accident.
  if (warningOpen) return "none";

  if (extendable && msSinceActivity <= QUIET_ACTIVITY_MS) {
    return "refresh-quietly";
  }
  return "show-warning";
}

/** m:ss for the countdown, e.g. 4:07. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Reasons the login page can show a message for (?reason=...). */
export type SignOutReason = "expired" | "limit";

export function parseSignOutReason(value: unknown): SignOutReason | null {
  return value === "expired" || value === "limit" ? value : null;
}

export function signOutMessage(reason: SignOutReason): string {
  return reason === "limit"
    ? "For security, sign-ins last at most 12 hours. Please sign in again."
    : "You were signed out after 30 minutes of inactivity. Please sign in again.";
}
