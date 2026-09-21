"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  ExpenseSchema,
  ManualExpenseInputSchema,
  type ManualExpenseInput,
} from "@/lib/cashflow/expense-schema";
import { createExpense } from "@/lib/db/expenses";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

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
): Promise<ActionResult<null>> {
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

  const candidate = {
    id: randomUUID(),
    ...parsedInput.data,
    branchId: parsedInput.data.branchId || null,
    createdByUserId: session.user.id,
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

  return { ok: true, data: null };
}
