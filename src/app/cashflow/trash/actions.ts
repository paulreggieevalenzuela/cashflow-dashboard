"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/access";
import {
  purgeDeletedItem,
  restoreDeletedItem,
  type RestoreResult,
} from "@/lib/db/deleted-items";

/** Only the superuser sees and restores deleted items; checked here on every call. */
async function requireSuperuser() {
  const session = await auth();
  if (!session?.user?.isSuperuser) {
    return null;
  }
  return session;
}

function revalidateAll() {
  revalidatePath("/cashflow", "layout");
}

export async function restoreDeletedItemAction(
  archiveId: string,
  allowNumberClash = false,
): Promise<RestoreResult> {
  const session = await requireSuperuser();
  if (!session) {
    return { ok: false, message: "Only the superuser can restore deleted items." };
  }
  try {
    const result = await restoreDeletedItem(
      archiveId,
      {
        userId: session.user.id,
        name: session.user.name ?? session.user.email ?? "Superuser",
      },
      { allowNumberClash },
    );
    if (result.ok) revalidateAll();
    return result;
  } catch (error) {
    console.error("restoreDeletedItemAction failed", error);
    return { ok: false, message: "The restore failed. Nothing was changed." };
  }
}

export async function purgeDeletedItemAction(
  archiveId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await requireSuperuser();
  if (!session) {
    return { ok: false, message: "Only the superuser can delete items for good." };
  }
  const removed = await purgeDeletedItem(archiveId);
  if (!removed) {
    return { ok: false, message: "That item is no longer in Deleted items." };
  }
  revalidateAll();
  return { ok: true };
}
