"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/access";
import { getBranchById } from "@/lib/db/branches";
import { setUserTheme, type Theme } from "@/lib/db/user-preferences";
import { updateUserBranch } from "@/lib/db/users";

type ActionResult = { ok: true } | { ok: false; message: string };

export async function updateThemeAction(theme: Theme): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "You must be signed in to change this." };
  }

  if (theme !== "light" && theme !== "dark") {
    return { ok: false, message: "Invalid theme." };
  }

  await setUserTheme(session.user.id, theme);

  // The `dark` class is applied in the root layout, which every route
  // shares — revalidate broadly so the change takes effect everywhere, not
  // just on the profile page.
  revalidatePath("/", "layout");

  return { ok: true };
}

/**
 * Sets the signed-in user's own branch ("" = no branch). Admin only: the
 * branch decides where a person's visits are saved and which Queue they see,
 * so staff and dentists get it from an admin (Users page). An admin can also
 * change anyone's from the Users page.
 */
export async function updateMyBranchAction(
  branchId: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "You must be signed in to change this." };
  }

  if (session.user.role !== "admin") {
    return {
      ok: false,
      message: "Only an admin can change a branch. Ask an admin to assign yours.",
    };
  }

  if (branchId && !(await getBranchById(branchId))) {
    return { ok: false, message: "That branch no longer exists." };
  }

  await updateUserBranch(session.user.id, branchId || null);
  revalidatePath("/cashflow", "layout");
  return { ok: true };
}
