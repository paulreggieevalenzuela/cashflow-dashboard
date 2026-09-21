"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { hashPassword } from "@/lib/auth/password";
import {
  createUser,
  deleteUser,
  getUserByEmail,
  updateUserBranch,
  updateUserRole,
} from "@/lib/db/users";
import { CreateUserInputSchema, type UserRole } from "@/lib/cashflow/user-schema";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

async function requireAdminSession() {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return null;
  }
  return session;
}

export async function createUserAction(input: unknown): Promise<ActionResult<null>> {
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

  const existing = await getUserByEmail(parsed.data.email);
  if (existing) {
    return {
      ok: false,
      message: "A user with that email already exists.",
      fieldErrors: { email: "Already in use." },
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await createUser({
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash,
    role: parsed.data.role,
    branchId: parsed.data.branchId || null,
  });

  revalidatePath("/cashflow/users");
  return { ok: true, data: null };
}

export async function updateUserRoleAction(
  userId: string,
  role: UserRole,
): Promise<ActionResult<null>> {
  const session = await requireAdminSession();
  if (!session) {
    return { ok: false, message: "Only admins can change roles." };
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

  await deleteUser(userId);
  revalidatePath("/cashflow/users");
  return { ok: true, data: null };
}
