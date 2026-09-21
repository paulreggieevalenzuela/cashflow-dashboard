"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { computeNetCollection, deriveMonthYear } from "@/lib/cashflow/normalize";
import { parseCashflowCsv, type CsvRowError } from "@/lib/cashflow/parse-csv";
import {
  CashflowTransactionSchema,
  ManualTransactionInputSchema,
  type ManualTransactionInput,
} from "@/lib/cashflow/schema";
import {
  deleteTransaction,
  generateInvoiceNumber,
  generateTransactionNumber,
  generateVisitId,
  getTransactionById,
  upsertTransactions,
} from "@/lib/db/transactions";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

function revalidateCashflowPaths(id?: string) {
  revalidatePath("/cashflow");
  revalidatePath("/cashflow/transactions");
  if (id) {
    revalidatePath(`/cashflow/transactions/${id}`);
    revalidatePath(`/cashflow/transactions/${id}/edit`);
  }
}

/**
 * Any signed-in role (admin, dentist, staff) can add/edit/import
 * transactions — only deletion and user management are admin-only.
 * Middleware already blocks unauthenticated requests to /cashflow/*, but
 * Server Actions are reachable independently of the page that renders
 * them, so we check the session here too as defense in depth.
 */
async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }
  return session;
}

function parseManualInput(
  input: ManualTransactionInput,
): { ok: true; data: ManualTransactionInput } | { ok: false; result: ActionResult<null> } {
  const parsedInput = ManualTransactionInputSchema.safeParse(input);
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
      result: { ok: false, message: "Please fix the highlighted fields.", fieldErrors },
    };
  }
  return { ok: true, data: parsedInput.data };
}

export async function addTransactionAction(
  input: ManualTransactionInput,
): Promise<ActionResult<null>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: "You must be signed in to add a transaction." };
  }

  const parsed = parseManualInput(input);
  if (!parsed.ok) {
    return parsed.result;
  }

  const monthYear = deriveMonthYear(parsed.data.date);
  const netCollection = computeNetCollection(
    parsed.data.amountPaid,
    parsed.data.merchantFee,
    parsed.data.withholdingTax,
  );
  const now = new Date();
  const [transactionNumber, visitId, invoiceNumber] = await Promise.all([
    generateTransactionNumber(now),
    generateVisitId(parsed.data.date),
    generateInvoiceNumber(now),
  ]);

  const candidate = {
    id: randomUUID(),
    ...parsed.data,
    visitId,
    invoiceNumber,
    branchId: parsed.data.branchId || null,
    createdByUserId: session.user.id,
    transactionNumber,
    month: monthYear?.month ?? "",
    year: monthYear?.year ?? 0,
    netCollection,
  };

  const result = CashflowTransactionSchema.safeParse(candidate);
  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  await upsertTransactions([result.data]);
  revalidateCashflowPaths();

  return { ok: true, data: null };
}

/**
 * Edits an existing transaction. The manual form only covers the fields in
 * `ManualTransactionInputSchema` — notably not `vatExclusive`/`vatAmount`,
 * which CSV-imported rows can have — so this starts from the existing row
 * and overlays the edited fields, rather than reconstructing the whole
 * record from the form (which would silently zero out anything the form
 * doesn't collect).
 */
export async function updateTransactionAction(
  id: string,
  input: ManualTransactionInput,
): Promise<ActionResult<null>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: "You must be signed in to edit a transaction." };
  }

  const existing = await getTransactionById(id);
  if (!existing) {
    return { ok: false, message: "That transaction no longer exists." };
  }

  const parsed = parseManualInput(input);
  if (!parsed.ok) {
    return parsed.result;
  }

  const monthYear = deriveMonthYear(parsed.data.date);
  const netCollection = computeNetCollection(
    parsed.data.amountPaid,
    parsed.data.merchantFee,
    parsed.data.withholdingTax,
  );

  const candidate = {
    ...existing,
    ...parsed.data,
    // The manual form's `branchId` defaults to "" (unset) rather than
    // omitting the field, so an explicit fallback to the existing value is
    // needed here — otherwise editing any other field would silently clear
    // the branch whenever the form didn't include a branch selector.
    branchId: parsed.data.branchId || existing.branchId,
    // Visit ID is server-generated once, at creation, and never collected
    // by the edit form — always keep whatever the row already has.
    visitId: existing.visitId,
    id,
    month: monthYear?.month ?? existing.month,
    year: monthYear?.year ?? existing.year,
    netCollection,
  };

  const result = CashflowTransactionSchema.safeParse(candidate);
  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues.map((issue) => issue.message).join(" "),
    };
  }

  await upsertTransactions([result.data]);
  revalidateCashflowPaths(encodeURIComponent(id));

  return { ok: true, data: null };
}

export async function importCsvAction(
  csvText: string,
  branchId?: string,
): Promise<ActionResult<{ importedCount: number; errors: CsvRowError[] }>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: "You must be signed in to import transactions." };
  }

  const { transactions, errors } = parseCashflowCsv(csvText);

  if (transactions.length > 0) {
    // The CSV itself has no branch/importer columns, so every row in this
    // import is stamped with the branch picked in the upload form (if any)
    // and the signed-in user, after parsing rather than as part of it —
    // keeps parseCashflowCsv focused on the clinic's actual export format.
    const stamped = transactions.map((transaction) => ({
      ...transaction,
      branchId: branchId || null,
      createdByUserId: session.user.id,
    }));
    await upsertTransactions(stamped);
    revalidateCashflowPaths();
  }

  return {
    ok: true,
    data: { importedCount: transactions.length, errors },
  };
}

export async function removeTransactionAction(id: string): Promise<ActionResult<null>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: "You must be signed in to remove a transaction." };
  }
  if (session.user.role !== "admin") {
    return { ok: false, message: "Only admins can remove transactions." };
  }

  await deleteTransaction(id);
  revalidateCashflowPaths();
  return { ok: true, data: null };
}
