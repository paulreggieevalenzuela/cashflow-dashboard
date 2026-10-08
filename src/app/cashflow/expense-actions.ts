"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  ExpenseSchema,
  ManualExpenseInputSchema,
  type ManualExpenseInput,
} from "@/lib/cashflow/expense-schema";
import { computeVat } from "@/lib/cashflow/pricing";
import { createExpense, findLikelyDuplicateExpense } from "@/lib/db/expenses";
import { getOrCreateSupplier } from "@/lib/db/suppliers";

type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      message: string;
      fieldErrors?: Record<string, string>;
      /** True when the only problem is "this looks like a repeat" — the form
       * then offers an "Add it anyway" button. */
      duplicate?: boolean;
    };

/**
 * Same policy as transactions (see actions.ts): any signed-in role can
 * record an expense — this isn't admin-gated, since staff are the ones
 * usually handling day-to-day purchases/receipts, not just admins.
 */
async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }
  return session;
}

export async function addExpenseAction(
  input: ManualExpenseInput,
): Promise<ActionResult<{ expenseId: string }>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: "You must be signed in to add an expense." };
  }

  const parsedInput = ManualExpenseInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsedInput.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const data = parsedInput.data;
  const supplier = data.supplierName
    ? await getOrCreateSupplier({
        name: data.supplierName,
        address: data.supplierAddress,
        tin: data.supplierTin,
      })
    : undefined;

  if (!data.allowDuplicate) {
    const duplicate = await findLikelyDuplicateExpense({
      date: data.date,
      category: data.category,
      amount: data.amount,
      supplierId: supplier?.id ?? null,
      referenceNo: data.referenceNo,
    });
    if (duplicate) {
      return {
        ok: false,
        duplicate: true,
        message:
          "This looks like an expense that was already recorded (same date, amount and supplier, or the same reference number).",
      };
    }
  }

  // VAT split is always worked out here from the amount and the VAT type —
  // never taken from what the browser displayed.
  const { base, vat } = computeVat(data.amount, data.vatType);

  const candidate = {
    id: randomUUID(),
    date: data.date,
    category: data.category,
    description: data.description,
    amount: data.amount,
    paymentMethod: data.paymentMethod,
    branchId: data.branchId || null,
    createdByUserId: session.user.id,
    supplierId: supplier?.id ?? null,
    referenceNo: data.referenceNo,
    remarks: data.remarks,
    nature: data.nature,
    vatType: data.vatType,
    vatableAmount: data.vatType === "vat" ? base : 0,
    vatAmount: vat,
  };

  const result = ExpenseSchema.safeParse(candidate);
  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  await createExpense(result.data);
  revalidatePath("/cashflow");
  revalidatePath("/cashflow/expenses");

  return { ok: true, data: { expenseId: result.data.id } };
}
