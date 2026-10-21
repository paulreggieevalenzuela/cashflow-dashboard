"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { canRemoveFromQueue, isVisitStatus } from "@/lib/cashflow/visit-status";
import { deleteInvoice } from "@/lib/db/invoices";
import { getQueueRemovalFacts, setVisitStatus } from "@/lib/db/visit-status";

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

/**
 * Takes a visit off the Queue — deletes it. Any signed-in role may do this,
 * but only while the visit is Arrived or On-going and nothing has been paid
 * (the rule lives in `canRemoveFromQueue` and is checked here against the
 * database, not against what the browser thinks). The removal is written to
 * the audit trail. For Payment and Cleared visits stay admin-only, from
 * Transactions.
 */
export async function removeFromQueueAction(
  invoiceId: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "You must be signed in to remove a visit." };
  }

  const facts = await getQueueRemovalFacts(invoiceId);
  if (!facts) {
    // Already gone (removed on another screen): treat as done.
    revalidatePath("/cashflow", "layout");
    return { ok: true };
  }
  const check = canRemoveFromQueue(facts);
  if (!check.ok) {
    return check;
  }

  await deleteInvoice(invoiceId, {
    userId: session.user.id,
    name: session.user.name ?? session.user.email ?? "",
  });

  revalidatePath("/cashflow/transactions", "layout");
  revalidatePath("/cashflow/patients", "layout");
  revalidatePath("/cashflow/queue");
  // The menu's open-visit count lives in the layout.
  revalidatePath("/cashflow", "layout");
  return { ok: true };
}
