"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setUserTheme, type Theme } from "@/lib/db/user-preferences";

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
