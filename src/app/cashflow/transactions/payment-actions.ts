"use server";

import { visitLockMessage } from "@/lib/db/transaction-checks";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import {
  PaymentInputSchema,
  type PaymentInput,
} from "@/lib/cashflow/payment-schema";
import { appliedToBill } from "@/lib/cashflow/pricing";
import {
  getInvoiceById,
  getInvoiceSummaries,
  recomputeInvoiceFees,
} from "@/lib/db/invoices";
import { logAudit } from "@/lib/db/audit";
import { addPayment, deletePayment, getPaymentById } from "@/lib/db/payments";
import { syncStatusWithPayments } from "@/lib/db/visit-status";

type ActionResult = { ok: true } | { ok: false; message: string };

function revalidate() {
  revalidatePath("/cashflow/transactions", "layout");
  revalidatePath("/cashflow");
}

/**
 * Any signed-in role can record a payment — same access level as adding or
 * editing a transaction itself (see actions.ts). Only removing one is
 * admin-only, matching `removeTransactionAction`.
 */
export async function addPaymentAction(
  invoiceId: string,
  input: PaymentInput,
): Promise<ActionResult> {
  const guard = await requirePermission(
    "payment.add",
    "You don't have permission to record payments.",
  );
  if (!guard.ok) {
    return { ok: false, message: guard.message };
  }
  const session = guard.session;

  const locked = await visitLockMessage(
    invoiceId,
    { isSuperuser: session.user.isSuperuser },
    "record a payment",
  );
  if (locked) {
    return { ok: false, message: locked };
  }

  const summary = (await getInvoiceSummaries([invoiceId]))[invoiceId];
  if (!summary) {
    return { ok: false, message: "That transaction no longer exists." };
  }

  const parsed = PaymentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  const balance = Math.max(summary.totalDue - summary.collected, 0);
  // A card payment's merchant fee is inside the amount paid.
  if (
    appliedToBill(parsed.data.amount, parsed.data.paymentType) >
    balance + 0.005
  ) {
    return {
      ok: false,
      message: `That is more than the balance due (${balance.toFixed(2)}).`,
    };
  }

  await addPayment({
    invoiceId,
    amount: parsed.data.amount,
    paymentType: parsed.data.paymentType,
    referenceNo: parsed.data.referenceNo,
    paidAt: new Date(`${parsed.data.paidAt}T00:00:00`),
    notes: parsed.data.notes,
  });
  await recomputeInvoiceFees(invoiceId);
  const actor = {
    userId: session.user.id,
    name: session.user.name ?? session.user.email ?? "",
  };
  await syncStatusWithPayments(invoiceId, actor);
  await logAudit({
    action: "payment.added",
    entityType: "payment",
    invoiceId,
    patientId: (await getInvoiceById(invoiceId))?.patientId ?? null,
    summary: `${parsed.data.amount.toFixed(2)} by ${parsed.data.paymentType || "unspecified method"}${parsed.data.referenceNo ? ` · ref ${parsed.data.referenceNo}` : ""}`,
    actor,
  });

  revalidate();
  return { ok: true };
}

export async function deletePaymentAction(
  paymentId: string,
): Promise<ActionResult> {
  const guard = await requirePermission(
    "payment.delete",
    "You don't have permission to remove payments.",
  );
  if (!guard.ok) {
    return { ok: false, message: guard.message };
  }
  const session = guard.session;
  const actor = {
    userId: session.user.id,
    name: session.user.name ?? session.user.email ?? "",
  };

  const removed = await getPaymentById(paymentId);
  const locked = await visitLockMessage(
    removed?.invoiceId,
    { isSuperuser: session.user.isSuperuser },
    "remove a payment",
  );
  if (locked) {
    return { ok: false, message: locked };
  }
  let invoiceId: string | null;
  try {
    invoiceId = await deletePayment(paymentId, actor);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not remove the payment." };
  }
  if (invoiceId) {
    await recomputeInvoiceFees(invoiceId);
    await syncStatusWithPayments(invoiceId, actor);
    await logAudit({
      action: "payment.removed",
      entityType: "payment",
      entityId: paymentId,
      invoiceId,
      patientId: (await getInvoiceById(invoiceId))?.patientId ?? null,
      summary: removed
        ? `${removed.amount.toFixed(2)} by ${removed.paymentType || "unspecified method"}${removed.referenceNo ? ` · ref ${removed.referenceNo}` : ""}`
        : "A payment was removed",
      actor,
    });
  }
  revalidate();
  return { ok: true };
}
