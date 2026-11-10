import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  userBranches,
  userPermissionOverrides,
  users,
} from "@/lib/db/schema";
import {
  effectivePermissions,
  overridesFor,
  worksInEveryClinic,
  type Permission,
  type PermissionOverride,
} from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/cashflow/user-schema";

let warned = false;

/**
 * Until scripts/sql/2026-11-roles-permissions-trash.sql has been run the new
 * tables do not exist. Everything must keep working then (people simply have
 * their role's default privileges and their one branch), with one warning.
 */
export function accessSchemaMissing(error: unknown): boolean {
  const text = String(error) + String((error as { cause?: unknown })?.cause ?? "");
  const missing =
    /user_branches|user_permission_overrides|deleted_items|invalid input value for enum user_role/.test(text);
  if (missing && !warned) {
    warned = true;
    console.warn(
      "Roles & permissions are using defaults: run scripts/sql/2026-11-roles-permissions-trash.sql.",
    );
  }
  return missing;
}

export async function getOverrides(userId: string): Promise<PermissionOverride[]> {
  try {
    return await db
      .select({
        permission: userPermissionOverrides.permission,
        granted: userPermissionOverrides.granted,
      })
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, userId));
  } catch (error) {
    if (!accessSchemaMissing(error)) throw error;
    return [];
  }
}

/** The clinics a person is ticked for. Falls back to their one branch. */
export async function getUserBranchIds(
  userId: string,
  fallbackBranchId: string | null,
): Promise<string[]> {
  try {
    const rows = await db
      .select({ branchId: userBranches.branchId })
      .from(userBranches)
      .where(eq(userBranches.userId, userId));
    const ids = rows.map((row) => row.branchId);
    if (ids.length > 0) return ids;
  } catch (error) {
    if (!accessSchemaMissing(error)) throw error;
  }
  return fallbackBranchId ? [fallbackBranchId] : [];
}

/** Clinics of many people at once (the Users list). */
export async function listBranchIdsByUser(): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  try {
    const rows = await db
      .select({ userId: userBranches.userId, branchId: userBranches.branchId })
      .from(userBranches);
    for (const row of rows) {
      map.set(row.userId, [...(map.get(row.userId) ?? []), row.branchId]);
    }
  } catch (error) {
    if (!accessSchemaMissing(error)) throw error;
  }
  return map;
}

export type AccessProfile = {
  permissions: Permission[];
  /** null = every clinic. */
  branchIds: string[] | null;
  overrides: PermissionOverride[];
};

/** Everything that decides what one person may do, in one round trip. */
export async function getAccessProfile(input: {
  userId: string;
  role: UserRole;
  branchId: string | null;
}): Promise<AccessProfile> {
  const [overrides, ids] = await Promise.all([
    input.role === "superuser" ? Promise.resolve([]) : getOverrides(input.userId),
    worksInEveryClinic(input.role)
      ? Promise.resolve<string[]>([])
      : getUserBranchIds(input.userId, input.branchId),
  ]);
  return {
    permissions: effectivePermissions(input.role, overrides),
    branchIds: worksInEveryClinic(input.role) ? null : ids,
    overrides,
  };
}

/**
 * Saves one person's role, clinics and privileges together. Only the
 * differences from the role's defaults are stored. The first ticked clinic
 * becomes their home clinic (`users.branchId`).
 */
export async function saveUserAccess(input: {
  userId: string;
  role: UserRole;
  branchIds: string[];
  permissions: readonly string[];
}): Promise<void> {
  const overrides = overridesFor(input.role, input.permissions);
  const clinics = worksInEveryClinic(input.role) ? [] : [...new Set(input.branchIds)];

  await db
    .update(users)
    .set({
      role: input.role as "owner" | "admin" | "dentist" | "staff",
      ...(worksInEveryClinic(input.role) ? {} : { branchId: clinics[0] ?? null }),
    })
    .where(eq(users.id, input.userId));

  await db
    .delete(userPermissionOverrides)
    .where(eq(userPermissionOverrides.userId, input.userId));
  if (overrides.length > 0) {
    await db.insert(userPermissionOverrides).values(
      overrides.map((override) => ({
        userId: input.userId,
        permission: override.permission,
        granted: override.granted,
      })),
    );
  }

  if (!worksInEveryClinic(input.role)) {
    await db.delete(userBranches).where(eq(userBranches.userId, input.userId));
    if (clinics.length > 0) {
      await db
        .insert(userBranches)
        .values(clinics.map((branchId) => ({ userId: input.userId, branchId })));
    }
  }
}

/** Gives a new account its clinics (used when a user is created). */
export async function setUserBranches(userId: string, branchIds: string[]): Promise<void> {
  try {
    await db.delete(userBranches).where(eq(userBranches.userId, userId));
    const clinics = [...new Set(branchIds)];
    if (clinics.length > 0) {
      await db
        .insert(userBranches)
        .values(clinics.map((branchId) => ({ userId, branchId })));
    }
  } catch (error) {
    if (!accessSchemaMissing(error)) throw error;
  }
}

/** Customized people (for the "customized" badge on the Users list). */
export async function listCustomizedUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  try {
    const rows = await db
      .selectDistinct({ userId: userPermissionOverrides.userId })
      .from(userPermissionOverrides)
      .where(inArray(userPermissionOverrides.userId, userIds));
    return new Set(rows.map((row) => row.userId));
  } catch (error) {
    if (!accessSchemaMissing(error)) throw error;
    return new Set();
  }
}

