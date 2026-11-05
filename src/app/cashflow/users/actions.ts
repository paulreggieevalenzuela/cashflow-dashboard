"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/access";
import { hashPassword } from "@/lib/auth/password";
import { canActOnRequestFor, canResetPassword } from "@/lib/auth/reset-rules";
import { generateTempPassword, tempPasswordExpiry } from "@/lib/auth/temp-password";
import { logAudit } from "@/lib/db/audit";
import { recordLoginAttempt } from "@/lib/db/login-attempts";
import {
  closeRequestsForUser,
  dismissResetRequest,
  getResetRequest,
} from "@/lib/db/password-requests";
import {
  createUser,
  deleteUser,
  getUserByEmail,
  getUserById,
  passwordSchemaReady,
  setUserPassword,
  updateUserBranch,
  updateUserRole,
} from "@/lib/db/users";
import {
  CreateUserInputSchema,
  USER_ROLES,
  type AssignableRole,
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

async function requireAdminSession() {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return null;
  }
  return session;
}

/** The stored role of the signed-in admin (the superuser counts as "admin" in the session). */
function actorRole(session: NonNullable<Awaited<ReturnType<typeof requireAdminSession>>>): UserRole {
  return session.user.isSuperuser ? "superuser" : "admin";
}

function actorOf(session: NonNullable<Awaited<ReturnType<typeof requireAdminSession>>>) {
  return {
    userId: session.user.id,
    name: session.user.name ?? session.user.email ?? "Admin",
  };
}

export async function createUserAction(input: unknown): Promise<ActionResult<TempPasswordIssued>> {
  const session = await requireAdminSession();
  if (!session) {
    return { ok: false, message: "Only admins can create users." };
  }

  const parsed = CreateUserInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
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

  // The system makes the password; the admin never chooses someone's real one.
  const tempPassword = generateTempPassword();
  const expiresAt = tempPasswordExpiry();
  const created = await createUser({
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash: await hashPassword(tempPassword),
    role: parsed.data.role,
    branchId: parsed.data.branchId || null,
    mustChangePassword: true,
    tempPasswordExpiresAt: expiresAt,
  });

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
  const session = await requireAdminSession();
  if (!session) {
    return { ok: false, message: "Only admins can reset passwords." };
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
  const session = await requireAdminSession();
  if (!session) {
    return { ok: false, message: "Only admins can handle reset requests." };
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

export async function updateUserRoleAction(
  userId: string,
  role: AssignableRole,
): Promise<ActionResult<null>> {
  const session = await requireAdminSession();
  if (!session) {
    return { ok: false, message: "Only admins can change roles." };
  }

  if (!USER_ROLES.includes(role)) {
    return { ok: false, message: "That role can't be given from here." };
  }

  const target = await getUserById(userId);
  if (!target) {
    return { ok: false, message: "That user no longer exists." };
  }
  if (target.role === "superuser") {
    return { ok: false, message: "The superuser's role can't be changed here." };
  }

  if (session.user.id === userId && role !== "admin") {
    return { ok: false, message: "You can't remove your own admin access." };
  }

  await updateUserRole(userId, role);
  revalidatePath("/cashflow/users");
  return { ok: true, data: null };
}

export async function updateUserBranchAction(
  userId: string,
  branchId: string,
): Promise<ActionResult<null>> {
  const session = await requireAdminSession();
  if (!session) {
    return { ok: false, message: "Only admins can change a user's branch." };
  }

  await updateUserBranch(userId, branchId || null);
  revalidatePath("/cashflow/users");
  return { ok: true, data: null };
}

export async function deleteUserAction(userId: string): Promise<ActionResult<null>> {
  const session = await requireAdminSession();
  if (!session) {
    return { ok: false, message: "Only admins can remove users." };
  }

  if (session.user.id === userId) {
    return { ok: false, message: "You can't remove your own account." };
  }

  const target = await getUserById(userId);
  if (target?.role === "superuser") {
    return { ok: false, message: "The superuser account can't be removed." };
  }

  await deleteUser(userId);
  revalidatePath("/cashflow/users");
  return { ok: true, data: null };
}
