import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { loginAttempts } from "@/lib/db/schema";
import {
  WINDOW_MINUTES,
  lockStatus,
  type AttemptOutcome,
  type LockStatus,
} from "@/lib/auth/login-throttle";

/** Rows older than this are removed as new ones are written. */
const KEEP_DAYS = 90;

let warned = false;

/**
 * Until `scripts/sql/2026-10-login-attempts.sql` has been run the table does
 * not exist. Signing in must keep working then (failing closed would lock
 * everyone out), so the lock is simply not applied, with one warning.
 */
function tableMissing(error: unknown): boolean {
  const text = String(error);
  if (!text.includes("login_attempts")) return false;
  if (!warned) {
    warned = true;
    console.warn(
      "Sign-in lock is OFF: login_attempts is missing. Run scripts/sql/2026-10-login-attempts.sql.",
    );
  }
  return true;
}

export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase().slice(0, 254);
}

/** Is this e-mail / address currently locked out? */
export async function checkLoginLock(input: {
  emailKey: string;
  ip: string;
}): Promise<LockStatus> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  try {
    const [emailRows, addressRows] = await Promise.all([
      db
        .select({
          at: loginAttempts.createdAt,
          outcome: loginAttempts.outcome,
        })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.emailKey, input.emailKey),
            gte(loginAttempts.createdAt, since),
          ),
        )
        .orderBy(desc(loginAttempts.createdAt))
        .limit(50),
      input.ip
        ? db
            .select({ value: sql<number>`count(*)::int` })
            .from(loginAttempts)
            .where(
              and(
                eq(loginAttempts.ip, input.ip),
                gte(loginAttempts.createdAt, since),
                inArray(loginAttempts.outcome, [
                  "wrong_password",
                  "unknown_email",
                ]),
              ),
            )
        : Promise.resolve([{ value: 0 }]),
    ]);
    return lockStatus({
      emailAttempts: emailRows.map((row) => ({
        at: row.at,
        outcome: row.outcome as AttemptOutcome,
      })),
      addressFailures: addressRows[0]?.value ?? 0,
      now: new Date(),
    });
  } catch (error) {
    if (tableMissing(error)) return { locked: false };
    throw error;
  }
}

/** Writes one sign-in attempt (never throws: a failed log must not block sign-in). */
export async function recordLoginAttempt(input: {
  emailKey: string;
  ip: string;
  userAgent: string;
  outcome: AttemptOutcome;
}): Promise<void> {
  try {
    await db.insert(loginAttempts).values({
      emailKey: input.emailKey,
      ip: input.ip.slice(0, 64),
      userAgent: input.userAgent.slice(0, 300),
      success: input.outcome === "ok",
      outcome: input.outcome,
    });
    // Tidy up now and then (about one write in twenty).
    if (Math.random() < 0.05) {
      await db
        .delete(loginAttempts)
        .where(
          lt(
            loginAttempts.createdAt,
            new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000),
          ),
        );
    }
  } catch (error) {
    if (!tableMissing(error)) {
      console.error("Could not record the sign-in attempt.", error);
    }
  }
}

export type LoginHistoryRow = {
  id: string;
  createdAt: Date;
  emailKey: string;
  ip: string;
  userAgent: string;
  outcome: string;
};

/** The latest sign-in attempts, newest first (admins). null = table missing. */
export async function listRecentLoginAttempts(
  limit = 50,
): Promise<LoginHistoryRow[] | null> {
  try {
    return await db
      .select({
        id: loginAttempts.id,
        createdAt: loginAttempts.createdAt,
        emailKey: loginAttempts.emailKey,
        ip: loginAttempts.ip,
        userAgent: loginAttempts.userAgent,
        outcome: loginAttempts.outcome,
      })
      .from(loginAttempts)
      .orderBy(desc(loginAttempts.createdAt))
      .limit(limit);
  } catch (error) {
    if (tableMissing(error)) return null;
    throw error;
  }
}
