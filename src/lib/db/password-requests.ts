import { and, desc, eq, inArray, isNull, lt, or, sql, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { passwordResetRequests, users } from "@/lib/db/schema";
import { passwordSchemaMissing } from "@/lib/db/users";
import type { UserRole } from "@/lib/cashflow/user-schema";

const MAX_PER_ADDRESS_PER_HOUR = 5;
const MAX_UNKNOWN_OPEN = 100;
const KEEP_DAYS = 30;

export type ResetRequest = {
  id: string;
  createdAt: Date;
  email: string;
  note: string;
  userId: string | null;
  userName: string | null;
  userRole: UserRole | null;
  branchId: string | null;
  ip: string;
  userAgent: string;
};

/**
 * Records a "forgot my password" request. Never reveals whether the e-mail has
 * an account: the caller always shows the same message. One open request per
 * e-mail (asking again just refreshes it); at most 5 per hour per address.
 */
export async function createResetRequest(input: {
  emailKey: string;
  note: string;
  ip: string;
  userAgent: string;
}): Promise<void> {
  try {
    const [account] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.emailKey))
      .limit(1);

    if (input.ip) {
      const [recent] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(passwordResetRequests)
        .where(
          and(
            eq(passwordResetRequests.ip, input.ip.slice(0, 64)),
            gte(passwordResetRequests.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
          ),
        );
      if ((recent?.value ?? 0) >= MAX_PER_ADDRESS_PER_HOUR) return;
    }

    const [existing] = await db
      .select({ id: passwordResetRequests.id })
      .from(passwordResetRequests)
      .where(
        and(
          eq(passwordResetRequests.emailKey, input.emailKey),
          eq(passwordResetRequests.status, "open"),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(passwordResetRequests)
        .set({
          createdAt: new Date(),
          note: input.note || undefined,
          ip: input.ip.slice(0, 64),
          userAgent: input.userAgent.slice(0, 300),
        })
        .where(eq(passwordResetRequests.id, existing.id));
      return;
    }

    if (!account) {
      const [unknownOpen] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(passwordResetRequests)
        .where(
          and(eq(passwordResetRequests.status, "open"), isNull(passwordResetRequests.userId)),
        );
      if ((unknownOpen?.value ?? 0) >= MAX_UNKNOWN_OPEN) return;
    }

    await db.insert(passwordResetRequests).values({
      userId: account?.id ?? null,
      emailKey: input.emailKey,
      note: input.note,
      ip: input.ip.slice(0, 64),
      userAgent: input.userAgent.slice(0, 300),
    });

    // Tidy up now and then (about one write in twenty).
    if (Math.random() < 0.05) {
      await db
        .delete(passwordResetRequests)
        .where(
          and(
            lt(passwordResetRequests.createdAt, new Date(Date.now() - KEEP_DAYS * 86_400_000)),
            or(
              inArray(passwordResetRequests.status, ["done", "dismissed"]),
              isNull(passwordResetRequests.userId),
            ),
          ),
        );
    }
  } catch (error) {
    if (!passwordSchemaMissing(error)) {
      console.error("Could not record the password reset request.", error);
    }
  }
}

/** The matching account's role for an e-mail, or null (used for audit only). */
export async function findAccountForRequest(
  emailKey: string,
): Promise<{ id: string; name: string; role: UserRole } | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.email, emailKey))
    .limit(1);
  return row ?? null;
}

/** Open requests, newest first. [] when the table does not exist yet. */
export async function listOpenResetRequests(): Promise<ResetRequest[]> {
  try {
    const rows = await db
      .select({
        id: passwordResetRequests.id,
        createdAt: passwordResetRequests.createdAt,
        email: passwordResetRequests.emailKey,
        note: passwordResetRequests.note,
        userId: passwordResetRequests.userId,
        userName: users.name,
        userRole: users.role,
        branchId: users.branchId,
        ip: passwordResetRequests.ip,
        userAgent: passwordResetRequests.userAgent,
      })
      .from(passwordResetRequests)
      .leftJoin(users, eq(users.id, passwordResetRequests.userId))
      .where(eq(passwordResetRequests.status, "open"))
      .orderBy(desc(passwordResetRequests.createdAt))
      .limit(100);
    return rows;
  } catch (error) {
    if (passwordSchemaMissing(error)) return [];
    throw error;
  }
}

/**
 * How many open requests this person can act on (shown beside "Users" in the
 * menu). Requests for an unknown e-mail are not counted: they are usually
 * typos and would only inflate the number.
 */
export async function countActionableResetRequests(actorRole: UserRole): Promise<number> {
  if (actorRole !== "admin" && actorRole !== "superuser") return 0;
  try {
    const roles = actorRole === "superuser" ? ["admin", "dentist", "staff"] : ["dentist", "staff"];
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(passwordResetRequests)
      .innerJoin(users, eq(users.id, passwordResetRequests.userId))
      .where(
        and(
          eq(passwordResetRequests.status, "open"),
          inArray(users.role, roles as ("admin" | "dentist" | "staff")[]),
        ),
      );
    return row?.value ?? 0;
  } catch (error) {
    if (passwordSchemaMissing(error)) return 0;
    throw error;
  }
}

/** Marks every open request of that account as handled (after a reset). */
export async function closeRequestsForUser(userId: string, handledBy: string): Promise<void> {
  try {
    await db
      .update(passwordResetRequests)
      .set({ status: "done", handledBy, handledAt: new Date() })
      .where(
        and(eq(passwordResetRequests.userId, userId), eq(passwordResetRequests.status, "open")),
      );
  } catch (error) {
    if (!passwordSchemaMissing(error)) throw error;
  }
}

export async function getResetRequest(id: string) {
  const [row] = await db
    .select({
      id: passwordResetRequests.id,
      status: passwordResetRequests.status,
      userId: passwordResetRequests.userId,
      email: passwordResetRequests.emailKey,
      userRole: users.role,
    })
    .from(passwordResetRequests)
    .leftJoin(users, eq(users.id, passwordResetRequests.userId))
    .where(eq(passwordResetRequests.id, id))
    .limit(1);
  return row;
}

export async function dismissResetRequest(id: string, handledBy: string): Promise<void> {
  await db
    .update(passwordResetRequests)
    .set({ status: "dismissed", handledBy, handledAt: new Date() })
    .where(and(eq(passwordResetRequests.id, id), eq(passwordResetRequests.status, "open")));
}
