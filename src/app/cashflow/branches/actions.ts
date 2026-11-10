"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { createBranch, deleteBranch, renameBranch } from "@/lib/db/branches";

type ActionResult = { ok: true } | { ok: false; message: string };

async function requireAdmin(): Promise<ActionResult> {
  const guard = await requirePermission(
    "branch.manage",
    "You don't have permission to manage clinics.",
  );
  return guard.ok ? { ok: true } : guard;
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
