"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/access";
import {
  ExpenseSchema,
  ManualExpenseInputSchema,
  type ManualExpenseInput,
} from "@/lib/cashflow/expense-schema";
import { computeVat } from "@/lib/cashflow/pricing";
import type { AuditChange } from "@/lib/cashflow/audit-diff";
import { logAudit } from "@/lib/db/audit";
import { listBranches } from "@/lib/db/branches";
import {
  createExpense,
  deleteExpense,
  findLikelyDuplicateExpense,
  getExpenseById,
  updateExpense,
} from "@/lib/db/expenses";
import { getOrCreateSupplier, listSuppliers } from "@/lib/db/suppliers";

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
  revalidatePath("/cashflow/transactions");

  return { ok: true, data: { expenseId: result.data.id } };
}

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

/** Editing and deleting an expense is admin only (adding is open to all). */
async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { session: null, error: "You must be signed in." };
  }
  if (session.user.role !== "admin") {
    return {
      session: null,
      error: "Only an admin can change or delete an expense.",
    };
  }
  return { session, error: null };
}

function revalidateExpenses() {
  revalidatePath("/cashflow");
  revalidatePath("/cashflow/transactions", "layout");
}

function describe(expense: {
  date: string;
  category: string;
  amount: number;
}): string {
  return `${expense.category} ${peso.format(expense.amount)} (${expense.date})`;
}

/** Corrects a saved expense. Same checks as adding one, except the
 * "looks like a repeat" warning. Recorded in the audit trail. */
export async function updateExpenseAction(
  id: string,
  input: ManualExpenseInput,
): Promise<ActionResult<{ expenseId: string }>> {
  const guard = await requireAdmin();
  if (!guard.session) {
    return { ok: false, message: guard.error };
  }
  const { session } = guard;

  const existing = await getExpenseById(id);
  if (!existing) {
    return { ok: false, message: "That expense no longer exists." };
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

  const { base, vat } = computeVat(data.amount, data.vatType);
  const candidate = {
    ...existing,
    date: data.date,
    category: data.category,
    description: data.description,
    amount: data.amount,
    paymentMethod: data.paymentMethod,
    branchId: data.branchId || null,
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

  const [branchList, supplierList] = await Promise.all([
    listBranches(),
    listSuppliers(),
  ]);
  const branchName = (branchId: string | null | undefined) =>
    branchList.find((branch) => branch.id === branchId)?.name ?? "";
  const supplierName = (supplierId: string | null | undefined) =>
    supplierList.find((item) => item.id === supplierId)?.name ?? "";

  const before = existing;
  const after = result.data;
  const changes: AuditChange[] = [];
  const note = (field: string, from: string, to: string) => {
    if (from !== to) {
      changes.push({ field, from: from || "(blank)", to: to || "(blank)" });
    }
  };
  note("Date", before.date, after.date);
  note("Particulars", before.category, after.category);
  note("Amount", peso.format(before.amount), peso.format(after.amount));
  note("Source of fund", before.paymentMethod ?? "", after.paymentMethod ?? "");
  note("Branch", branchName(before.branchId), branchName(after.branchId));
  note("Supplier", supplierName(before.supplierId), supplierName(after.supplierId));
  note("Reference no.", before.referenceNo ?? "", after.referenceNo ?? "");
  note("Description", before.description ?? "", after.description ?? "");
  note("Remarks", before.remarks ?? "", after.remarks ?? "");
  note("VAT", before.vatType ?? "", after.vatType ?? "");
  note("Services or goods", before.nature ?? "", after.nature ?? "");

  await updateExpense(id, after);
  await logAudit({
    action: "expense.updated",
    entityType: "expense",
    entityId: id,
    summary: describe(after),
    changes,
    actor: {
      userId: session.user.id,
      name: session.user.name ?? session.user.email ?? "",
    },
  });
  revalidateExpenses();
  return { ok: true, data: { expenseId: id } };
}

/** Removes an expense (and its attached receipts). Permanent; the audit
 * trail keeps a line saying who removed what. */
export async function deleteExpenseAction(
  id: string,
): Promise<ActionResult<{ expenseId: string }>> {
  const guard = await requireAdmin();
  if (!guard.session) {
    return { ok: false, message: guard.error };
  }
  const { session } = guard;

  const existing = await getExpenseById(id);
  if (!existing) {
    return { ok: false, message: "That expense no longer exists." };
  }
  await deleteExpense(id);
  await logAudit({
    action: "expense.deleted",
    entityType: "expense",
    entityId: id,
    summary: describe(existing),
    actor: {
      userId: session.user.id,
      name: session.user.name ?? session.user.email ?? "",
    },
  });
  revalidateExpenses();
  return { ok: true, data: { expenseId: id } };
}
