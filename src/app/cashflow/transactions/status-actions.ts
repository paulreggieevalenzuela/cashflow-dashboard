"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isVisitStatus } from "@/lib/cashflow/visit-status";
import { setVisitStatus } from "@/lib/db/visit-status";

type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Moves a visit to another status. Any signed-in role can move a visit
 * forward one step; going back, jumping ahead or clearing with money still
 * owed is admin-only (the rules live in lib/cashflow/visit-status.ts and are
 * enforced again inside `setVisitStatus`).
 */
export async function setVisitStatusAction(
  invoiceId: string,
  to: string,
  note?: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "You must be signed in to change a status." };
  }
  if (!isVisitStatus(to)) {
    return { ok: false, message: "That is not a valid status." };
  }

  const result = await setVisitStatus({
    invoiceId,
    to,
    note,
    actor: {
      userId: session.user.id,
      name: session.user.name ?? session.user.email ?? "",
      isAdmin: session.user.role === "admin",
    },
  });
  if (!result.ok) {
    return result;
  }

  revalidatePath("/cashflow/transactions", "layout");
  revalidatePath("/cashflow/patients", "layout");
  revalidatePath("/cashflow/queue");
  // The menu's open-visit count lives in the layout.
  revalidatePath("/cashflow", "layout");
  return { ok: true };
}
