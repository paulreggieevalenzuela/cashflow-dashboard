"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { PaymentInputSchema, type PaymentInput } from "@/lib/cashflow/payment-schema";
import { addPayment, deletePayment } from "@/lib/db/payments";
import { getTransactionById } from "@/lib/db/transactions";

type ActionResult = { ok: true } | { ok: false; message: string };

function revalidate(transactionId: string) {
  const id = encodeURIComponent(transactionId);
  revalidatePath(`/cashflow/transactions/${id}`);
  revalidatePath("/cashflow/transactions");
  revalidatePath("/cashflow");
}

/**
 * Any signed-in role can record a payment — same access level as adding or
 * editing a transaction itself (see actions.ts). Only removing one is
 * admin-only, matching `removeTransactionAction`.
 */
export async function addPaymentAction(
  transactionId: string,
  input: PaymentInput,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "You must be signed in to record a payment." };
  }

  const transaction = await getTransactionById(transactionId);
  if (!transaction) {
    return { ok: false, message: "That transaction no longer exists." };
  }

  const parsed = PaymentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  await addPayment({
    transactionId,
    amount: parsed.data.amount,
    paymentType: parsed.data.paymentType,
    paidAt: new Date(`${parsed.data.paidAt}T00:00:00`),
    notes: parsed.data.notes,
  });

  revalidate(transactionId);
  return { ok: true };
}

export async function deletePaymentAction(
  paymentId: string,
  transactionId: string,
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { ok: false, message: "Only admins can remove a payment." };
  }

  await deletePayment(paymentId);
  revalidate(transactionId);
  return { ok: true };
}
