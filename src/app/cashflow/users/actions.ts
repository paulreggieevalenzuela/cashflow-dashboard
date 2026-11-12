"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/access";
import { can, permissionLabel } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import {
  ALL_PERMISSIONS,
  assignableRolesFor,
  canManageUser,
  canRemoveUser,
  managerRoleOf,
  effectivePermissions,
  worksInEveryClinic,
  type Permission,
} from "@/lib/auth/permissions";
import { canActOnRequestFor, canResetPassword } from "@/lib/auth/reset-rules";
import { generateTempPassword, tempPasswordExpiry } from "@/lib/auth/temp-password";
import { logAudit } from "@/lib/db/audit";
import { listBranches } from "@/lib/db/branches";
import { recordLoginAttempt } from "@/lib/db/login-attempts";
import {
  closeRequestsForUser,
  dismissResetRequest,
  getResetRequest,
} from "@/lib/db/password-requests";
import { getOverrides, saveUserAccess, setUserBranches } from "@/lib/db/user-access";
import {
  createUser,
  deleteUser,
  getUserByEmail,
  getUserById,
  passwordSchemaReady,
  setUserPassword,
  updateUserProfile,
} from "@/lib/db/users";
import {
  CreateUserInputSchema,
  SaveAccessInputSchema,
  UpdateProfileInputSchema,
  type UserRole,
} from "@/lib/cashflow/user-schema";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/** Shown to the admin ONCE, right after creating a user or resetting a password. */
export type TempPasswordIssued = {
  userName: string;
  email: string;
  tempPassword: string;
  /** ISO date-time the temporary password stops working. */
  expiresAt: string;
};

const NEEDS_SQL =
  "Password management isn't set up in the database yet. Run scripts/sql/2026-11-password-management.sql in Neon first.";

type Session = NonNullable<Awaited<ReturnType<typeof auth>>>;

/** The signed-in person, when they may manage users. */
async function requireUserManager(): Promise<Session | null> {
  const session = await auth();
  if (!session?.user || !can(session, "user.manage") || !managerRoleOf(session.user)) {
    return null;
  }
  return session;
}

/** The stored role of the signed-in person (owner / superuser count as "admin" in the session). */
function actorRole(session: Session): UserRole {
  // requireUserManager has already refused anyone who is not an admin level.
  return managerRoleOf(session.user) ?? "admin";
}

function actorOf(session: Session) {
  return {
    userId: session.user.id,
    name: session.user.name ?? session.user.email ?? "Admin",
  };
}

const DENIED = "You don't have permission to manage users.";

function fieldErrorsOf(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

/** Keeps only clinics that exist (a stale tick must not break the save). */
async function knownBranchIds(ids: readonly string[]): Promise<string[]> {
  const branches = await listBranches();
  const known = new Set(branches.map((branch) => branch.id));
  return [...new Set(ids)].filter((id) => known.has(id));
}

export async function createUserAction(input: unknown): Promise<ActionResult<TempPasswordIssued>> {
  const session = await requireUserManager();
  if (!session) {
    return { ok: false, message: DENIED };
  }

  const parsed = CreateUserInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  if (!assignableRolesFor(actorRole(session)).includes(parsed.data.role)) {
    return {
      ok: false,
      message:
        parsed.data.role === "owner"
          ? "Only the superuser can create an owner."
          : "You can't give that role.",
    };
  }

  if (!(await passwordSchemaReady())) {
    return { ok: false, message: NEEDS_SQL };
  }

  const existing = await getUserByEmail(parsed.data.email);
  if (existing) {
    return {
      ok: false,
      message: "A user with that email already exists.",
      fieldErrors: { email: "Already in use." },
    };
  }

  const clinics = worksInEveryClinic(parsed.data.role)
    ? []
    : await knownBranchIds(parsed.data.branchIds);

  // The system makes the password; the admin never chooses someone's real one.
  const tempPassword = generateTempPassword();
  const expiresAt = tempPasswordExpiry();
  const created = await createUser({
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash: await hashPassword(tempPassword),
    role: parsed.data.role,
    branchId: clinics[0] ?? null,
    mustChangePassword: true,
    tempPasswordExpiresAt: expiresAt,
  });
  if (clinics.length > 0) {
    await setUserBranches(created.id, clinics);
  }

  await logAudit({
    action: "user.created",
    entityType: "user",
    entityId: created.id,
    summary: `Created ${parsed.data.role} account for ${parsed.data.name} (${parsed.data.email}) with a temporary password`,
    actor: actorOf(session),
  });

  revalidatePath("/cashflow/users");
  return {
    ok: true,
    data: {
      userName: parsed.data.name,
      email: parsed.data.email,
      tempPassword,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

/**
 * Gives someone a new temporary password (forgot password, locked out, or a
 * suspected leak). They must choose their own at the next sign-in, and every
 * device they were signed in on is signed out.
 */
export async function resetUserPasswordAction(
  userId: string,
): Promise<ActionResult<TempPasswordIssued>> {
  const session = await requireUserManager();
  if (!session) {
    return { ok: false, message: DENIED };
  }
  if (!(await passwordSchemaReady())) {
    return { ok: false, message: NEEDS_SQL };
  }

  const target = await getUserById(userId);
  if (!target) {
    return { ok: false, message: "That user no longer exists." };
  }

  // Who may reset whom is decided here, on the server, whatever the screen showed.
  const decision = canResetPassword(
    { id: session.user.id, role: actorRole(session) },
    { id: target.id, role: target.role },
  );
  if (!decision.ok) {
    return { ok: false, message: decision.reason };
  }

  const tempPassword = generateTempPassword();
  const expiresAt = tempPasswordExpiry();
  await setUserPassword({
    id: target.id,
    passwordHash: await hashPassword(tempPassword),
    mustChange: true,
    tempPasswordExpiresAt: expiresAt,
  });

  // Clear any sign-in lock on that e-mail (a correct sign-in resets the count).
  await recordLoginAttempt({
    emailKey: target.email,
    ip: "",
    userAgent: "password reset by an admin",
    outcome: "ok",
  });
  await closeRequestsForUser(target.id, session.user.id);

  await logAudit({
    action: "user.password_reset",
    entityType: "user",
    entityId: target.id,
    summary: `${session.user.name ?? "An admin"} reset the password of ${target.name} (${target.email})`,
    actor: actorOf(session),
  });

  revalidatePath("/cashflow/users");
  revalidatePath("/cashflow", "layout");
  return {
    ok: true,
    data: {
      userName: target.name,
      email: target.email,
      tempPassword,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function dismissResetRequestAction(requestId: string): Promise<ActionResult<null>> {
  const session = await requireUserManager();
  if (!session) {
    return { ok: false, message: DENIED };
  }
  const request = await getResetRequest(requestId);
  if (!request || request.status !== "open") {
    return { ok: false, message: "That request was already handled." };
  }
  if (request.userRole === "superuser" || !canActOnRequestFor(actorRole(session), request.userRole)) {
    return { ok: false, message: "You can't handle this request." };
  }

  await dismissResetRequest(requestId, session.user.id);
  await logAudit({
    action: "user.reset_dismissed",
    entityType: "user",
    entityId: request.userId ?? "",
    summary: `${session.user.name ?? "An admin"} dismissed a password reset request for ${request.email}`,
    actor: actorOf(session),
  });
  revalidatePath("/cashflow/users");
  return { ok: true, data: null };
}

/** "Personal Information" tab: name and e-mail. */
export async function updateUserProfileAction(
  userId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requireUserManager();
  if (!session) {
    return { ok: false, message: DENIED };
  }
  const parsed = UpdateProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }
  const target = await getUserById(userId);
  if (!target) {
    return { ok: false, message: "That user no longer exists." };
  }
  const decision = canManageUser(
    { id: session.user.id, role: actorRole(session) },
    { id: target.id, role: target.role },
  );
  if (!decision.ok) {
    return { ok: false, message: decision.reason };
  }

  if (parsed.data.email !== target.email) {
    const clash = await getUserByEmail(parsed.data.email);
    if (clash && clash.id !== target.id) {
      return {
        ok: false,
        message: "A user with that email already exists.",
        fieldErrors: { email: "Already in use." },
      };
    }
  }

  await updateUserProfile(target.id, parsed.data);
  await logAudit({
    action: "user.access_changed",
    entityType: "user",
    entityId: target.id,
    summary: `${session.user.name ?? "An admin"} updated the details of ${parsed.data.name}${parsed.data.email !== target.email ? ` (e-mail ${target.email} → ${parsed.data.email})` : ""}`,
    actor: actorOf(session),
  });
  revalidatePath("/cashflow/users");
  revalidatePath(`/cashflow/users/${target.id}`);
  return { ok: true, data: null };
}

/**
 * "Access & Permissions" tab: the role, the clinics and the privileges of one
 * person, saved together. Rules (all enforced here, whatever the screen sent):
 * - you can't change your own access, nor anyone at your level or above;
 * - you can only give a role you are allowed to give;
 * - you can't switch on a privilege you don't hold yourself.
 */
export async function saveUserAccessAction(
  userId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requireUserManager();
  if (!session) {
    return { ok: false, message: DENIED };
  }
  const parsed = SaveAccessInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That access setting isn't valid." };
  }
  const target = await getUserById(userId);
  if (!target) {
    return { ok: false, message: "That user no longer exists." };
  }
  const me = { id: session.user.id, role: actorRole(session) };
  const decision = canManageUser(me, { id: target.id, role: target.role });
  if (!decision.ok) {
    return { ok: false, message: decision.reason };
  }

  const role = parsed.data.role;
  if (role !== target.role && !assignableRolesFor(me.role).includes(role)) {
    return {
      ok: false,
      message:
        role === "owner" ? "Only the superuser can make someone an owner." : "You can't give that role.",
    };
  }

  const known = new Set<string>(ALL_PERMISSIONS);
  const chosen = [...new Set(parsed.data.permissions.filter((key) => known.has(key)))] as Permission[];
  const before = effectivePermissions(target.role, await getOverrides(target.id));
  const mine = new Set<string>(session.user.permissions ?? []);
  const notHeld = chosen.filter(
    (key) => !before.includes(key) && me.role !== "superuser" && !mine.has(key),
  );
  if (notHeld.length > 0) {
    return {
      ok: false,
      message: `You can only give privileges you have yourself. Not allowed: ${notHeld
        .map((key) => permissionLabel(key))
        .join("; ")}.`,
    };
  }

  const clinics = worksInEveryClinic(role) ? [] : await knownBranchIds(parsed.data.branchIds);

  await saveUserAccess({
    userId: target.id,
    role,
    branchIds: clinics,
    permissions: chosen,
  });

  const added = chosen.filter((key) => !before.includes(key));
  const removed = before.filter((key) => !chosen.includes(key));
  const parts = [
    role !== target.role ? `role ${target.role} → ${role}` : null,
    added.length ? `added: ${added.map((key) => permissionLabel(key)).join("; ")}` : null,
    removed.length ? `removed: ${removed.map((key) => permissionLabel(key)).join("; ")}` : null,
    worksInEveryClinic(role) ? "all clinics" : `${clinics.length} ${clinics.length === 1 ? "clinic" : "clinics"}`,
  ].filter(Boolean);
  await logAudit({
    action: "user.access_changed",
    entityType: "user",
    entityId: target.id,
    summary: `${session.user.name ?? "An admin"} changed the access of ${target.name}: ${parts.join(" · ")}`,
    actor: actorOf(session),
  });

  revalidatePath("/cashflow", "layout");
  revalidatePath(`/cashflow/users/${target.id}`);
  return { ok: true, data: null };
}

export async function deleteUserAction(userId: string): Promise<ActionResult<null>> {
  const session = await requireUserManager();
  if (!session) {
    return { ok: false, message: DENIED };
  }

  const target = await getUserById(userId);
  if (!target) {
    return { ok: false, message: "That user no longer exists." };
  }
  if (session.user.id === userId) {
    return { ok: false, message: "You can't remove your own account." };
  }
  const decision = canRemoveUser(
    { id: session.user.id, role: actorRole(session) },
    { id: target.id, role: target.role },
  );
  if (!decision.ok) {
    return { ok: false, message: decision.reason };
  }

  await deleteUser(userId);
  await logAudit({
    action: "user.access_changed",
    entityType: "user",
    entityId: target.id,
    summary: `${session.user.name ?? "An admin"} removed the account of ${target.name} (${target.email})`,
    actor: actorOf(session),
  });
  revalidatePath("/cashflow/users");
  return { ok: true, data: null };
}
