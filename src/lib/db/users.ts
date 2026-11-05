import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, type NewUserRow } from "@/lib/db/schema";
import type { AssignableRole, UserRole } from "@/lib/cashflow/user-schema";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchId: string | null;
  createdAt: Date;
};

/** A user as shown on the Users screen (adds the password state). */
export type ManagedUser = PublicUser & {
  /** True while the person still has to choose their own password. */
  mustChangePassword: boolean;
  /** When the temporary password stops working (null = none outstanding). */
  tempPasswordExpiresAt: Date | null;
};

/** Columns that exist since the very first version of the users table. */
const BASE_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  branchId: users.branchId,
  createdAt: users.createdAt,
} as const;

/** Added by scripts/sql/2026-11-password-management.sql. */
const PASSWORD_COLUMNS = {
  mustChangePassword: users.mustChangePassword,
  tempPasswordExpiresAt: users.tempPasswordExpiresAt,
} as const;

const MANAGED_COLUMNS = { ...BASE_COLUMNS, ...PASSWORD_COLUMNS } as const;

let warned = false;

/**
 * Until scripts/sql/2026-11-password-management.sql has been run the new
 * columns / table do not exist. Signing in and everything else must keep
 * working then (nobody is forced to change a password), with one warning.
 */
export function passwordSchemaMissing(error: unknown): boolean {
  const text = String(error) + String((error as { cause?: unknown })?.cause ?? "");
  const missing =
    /must_change_password|temp_password_expires_at|session_version|password_changed_at|password_reset_requests/.test(
      text,
    );
  if (missing && !warned) {
    warned = true;
    console.warn(
      "Password management is OFF: run scripts/sql/2026-11-password-management.sql.",
    );
  }
  return missing;
}

function withDefaults<T extends object>(row: T) {
  return {
    ...row,
    mustChangePassword: false,
    tempPasswordExpiresAt: null as Date | null,
  };
}

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  branchId: string | null;
  mustChangePassword: boolean;
  tempPasswordExpiresAt: Date | null;
  sessionVersion: number;
};

const AUTH_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  passwordHash: users.passwordHash,
  role: users.role,
  branchId: users.branchId,
} as const;

/** Includes the password hash — only for use inside auth.ts's authorize(). */
export async function getUserByEmail(email: string): Promise<AuthUser | undefined> {
  const key = email.trim().toLowerCase();
  try {
    const [row] = await db
      .select({
        ...AUTH_COLUMNS,
        mustChangePassword: users.mustChangePassword,
        tempPasswordExpiresAt: users.tempPasswordExpiresAt,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.email, key))
      .limit(1);
    return row;
  } catch (error) {
    if (!passwordSchemaMissing(error)) throw error;
    const [row] = await db.select(AUTH_COLUMNS).from(users).where(eq(users.email, key)).limit(1);
    return row ? { ...withDefaults(row), sessionVersion: 0 } : undefined;
  }
}

/** The current password hash, for checking "your current password". */
export async function getPasswordHashById(id: string): Promise<string | undefined> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row?.passwordHash;
}

export type AuthState = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
  sessionVersion: number;
};

/**
 * What the server needs to decide, on every request, whether a signed-in
 * person may continue. The token only carries a copy of this; the database
 * is the truth (a password reset or a removed account takes effect at once).
 */
export async function getAuthState(id: string): Promise<AuthState | undefined> {
  try {
    const [row] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        mustChangePassword: users.mustChangePassword,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row;
  } catch (error) {
    if (!passwordSchemaMissing(error)) throw error;
    const [row] = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ? { ...row, mustChangePassword: false, sessionVersion: 0 } : undefined;
  }
}

/** True once the password-management columns exist in the database. */
export async function passwordSchemaReady(): Promise<boolean> {
  try {
    await db.select({ v: users.sessionVersion }).from(users).limit(1);
    return true;
  } catch (error) {
    if (passwordSchemaMissing(error)) return false;
    throw error;
  }
}

export async function listUsers(): Promise<ManagedUser[]> {
  try {
    return await db.select(MANAGED_COLUMNS).from(users).orderBy(users.createdAt);
  } catch (error) {
    if (!passwordSchemaMissing(error)) throw error;
    const rows = await db.select(BASE_COLUMNS).from(users).orderBy(users.createdAt);
    return rows.map(withDefaults);
  }
}

export async function getUserById(id: string): Promise<PublicUser | undefined> {
  const [row] = await db.select(BASE_COLUMNS).from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export async function createUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  role: AssignableRole;
  branchId?: string | null;
  /** A new account starts with a temporary password the person must replace. */
  mustChangePassword?: boolean;
  tempPasswordExpiresAt?: Date | null;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(users)
    .values({ ...data, email: data.email.trim().toLowerCase() } satisfies NewUserRow)
    .returning({ id: users.id });
  return row;
}

export async function updateUserRole(id: string, role: AssignableRole): Promise<void> {
  // The superuser's role is never changed from the app.
  await db.update(users).set({ role }).where(and(eq(users.id, id), ne(users.role, "superuser")));
}

export async function updateUserBranch(id: string, branchId: string | null): Promise<void> {
  await db.update(users).set({ branchId }).where(eq(users.id, id));
}

export async function deleteUser(id: string): Promise<void> {
  // The superuser account is never removed from the app.
  await db.delete(users).where(and(eq(users.id, id), ne(users.role, "superuser")));
}

/**
 * Stores a new password hash and ends every other sign-in of that person.
 * - Reset by an admin: mustChange = true with an expiry (temporary password).
 * - Chosen by the person: mustChange = false, no expiry.
 * Returns the new session version (the caller puts it in the person's token).
 */
export async function setUserPassword(input: {
  id: string;
  passwordHash: string;
  mustChange: boolean;
  tempPasswordExpiresAt: Date | null;
}): Promise<number> {
  const [row] = await db
    .update(users)
    .set({
      passwordHash: input.passwordHash,
      mustChangePassword: input.mustChange,
      tempPasswordExpiresAt: input.mustChange ? input.tempPasswordExpiresAt : null,
      ...(input.mustChange ? {} : { passwordChangedAt: new Date() }),
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, input.id))
    .returning({ sessionVersion: users.sessionVersion });
  return row?.sessionVersion ?? 0;
}
