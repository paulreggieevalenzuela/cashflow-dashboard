"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { logAudit } from "@/lib/db/audit";
import {
  addPaymentMethod,
  deletePaymentMethod,
  setPaymentMethodActive,
} from "@/lib/db/payment-methods";
import { allPaymentMethods, type PaymentMethodKind } from "@/lib/cashflow/payment-methods";

type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const DENIED = "You don't have permission to change the payment methods.";

function refresh() {
  // Every screen with a payment-method list or an HMO price column.
  revalidatePath("/cashflow", "layout");
}

/** Adds a payment method (an HMO, card, e-wallet or bank). Owners and admins. */
export async function addPaymentMethodAction(input: {
  name: string;
  kind: PaymentMethodKind;
}): Promise<ActionResult> {
  const guard = await requirePermission("payment_method.manage", DENIED);
  if (!guard.ok) return guard;
  const actor = {
    userId: guard.session.user.id,
    name: guard.session.user.name ?? guard.session.user.email ?? "Someone",
  };

  const result = await addPaymentMethod({
    name: String(input.name ?? ""),
    kind: input.kind,
    actorName: actor.name,
  });
  if (!result.ok) return result;

  await logAudit({
    action: "payment_method.added",
    entityType: "user",
    entityId: guard.session.user.id,
    summary: `${actor.name} added the payment method ${result.name} (${input.kind === "hmo" ? "HMO" : "other"})`,
    actor,
  });
  refresh();
  return result;
}

/** Hides a method an owner or admin added from new visits, or shows it again. */
export async function setPaymentMethodActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const guard = await requirePermission("payment_method.manage", DENIED);
  if (!guard.ok) return guard;
  const actor = {
    userId: guard.session.user.id,
    name: guard.session.user.name ?? guard.session.user.email ?? "Someone",
  };

  const result = await setPaymentMethodActive(String(id), Boolean(active));
  if (!result.ok) return result;
  await logAudit({
    action: "payment_method.changed",
    entityType: "user",
    entityId: guard.session.user.id,
    summary: `${actor.name}: ${result.message}`,
    actor,
  });
  refresh();
  return result;
}

/** Removes an added method that was never used. */
export async function deletePaymentMethodAction(id: string): Promise<ActionResult> {
  const guard = await requirePermission("payment_method.manage", DENIED);
  if (!guard.ok) return guard;
  const actor = {
    userId: guard.session.user.id,
    name: guard.session.user.name ?? guard.session.user.email ?? "Someone",
  };

  // Remember the name for the audit line before it is gone.
  const before = allPaymentMethods().find((method) => method.id === String(id));
  const result = await deletePaymentMethod(String(id));
  if (!result.ok) return result;
  await logAudit({
    action: "payment_method.changed",
    entityType: "user",
    entityId: guard.session.user.id,
    summary: `${actor.name} removed the unused payment method ${before?.name ?? ""}`.trim(),
    actor,
  });
  refresh();
  return result;
}
