"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  PaymentInputSchema,
  type PaymentInput,
} from "@/lib/cashflow/payment-schema";
import { appliedToBill, receivedForBill } from "@/lib/cashflow/pricing";
import { getInvoiceSummaries, recomputeInvoiceFees } from "@/lib/db/invoices";
import { addPayment, deletePayment } from "@/lib/db/payments";

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
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "You must be signed in to record a payment." };
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
  // A card payment includes its merchant fee; only the rest pays the bill.
  if (
    appliedToBill(parsed.data.amount, parsed.data.paymentType) >
    balance + 0.005
  ) {
    const most = receivedForBill(balance, parsed.data.paymentType);
    return {
      ok: false,
      message: `That is more than the balance due (${most.toFixed(2)}${most > balance ? ", including the merchant fee" : ""}).`,
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

  revalidate();
  return { ok: true };
}

export async function deletePaymentAction(
  paymentId: string,
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { ok: false, message: "Only admins can remove a payment." };
  }

  const invoiceId = await deletePayment(paymentId);
  if (invoiceId) {
    await recomputeInvoiceFees(invoiceId);
  }
  revalidate();
  return { ok: true };
}
