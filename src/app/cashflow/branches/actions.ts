"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createBranch, deleteBranch, renameBranch } from "@/lib/db/branches";

type ActionResult = { ok: true } | { ok: false; message: string };

async function requireAdmin(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "You must be signed in." };
  }
  if (session.user.role !== "admin") {
    return { ok: false, message: "Only admins can manage branches." };
  }
  return { ok: true };
}

function revalidate() {
  revalidatePath("/cashflow/branches");
  revalidatePath("/cashflow/users");
  revalidatePath("/cashflow/transactions");
  revalidatePath("/cashflow");
}

export async function createBranchAction(name: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter a branch name." };
  }

  try {
    await createBranch(trimmed);
  } catch {
    return { ok: false, message: "A branch with that name already exists." };
  }

  revalidate();
  return { ok: true };
}

export async function renameBranchAction(id: string, name: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter a branch name." };
  }

  try {
    await renameBranch(id, trimmed);
  } catch {
    return { ok: false, message: "A branch with that name already exists." };
  }

  revalidate();
  return { ok: true };
}

export async function deleteBranchAction(id: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard;
  }

  await deleteBranch(id);
  revalidate();
  return { ok: true };
}
