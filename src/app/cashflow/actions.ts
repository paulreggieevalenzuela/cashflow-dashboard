"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { InvoiceInputSchema, type InvoiceInput } from "@/lib/cashflow/invoice-schema";
import { parseCashflowCsv, type CsvRowError } from "@/lib/cashflow/parse-csv";
import { listBranches } from "@/lib/db/branches";
import {
  createInvoice,
  deleteInvoice,
  findInvoiceByNumber,
  getInvoiceById,
  importTransactionsWithInvoices,
  listLinesForInvoice,
  updateInvoice,
  type Invoice,
} from "@/lib/db/invoices";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import { deleteTransaction } from "@/lib/db/transactions";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

function revalidateCashflowPaths() {
  revalidatePath("/cashflow");
  // "layout" covers the list and every transaction's detail/edit/invoice
  // page under it, so nothing keeps showing stale totals.
  revalidatePath("/cashflow/transactions", "layout");
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

function parseInvoiceInput(
  input: InvoiceInput,
): { ok: true; data: InvoiceInput } | { ok: false; result: ActionResult<never> } {
  const parsed = InvoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      result: { ok: false, message: "Please fix the highlighted fields.", fieldErrors },
    };
  }
  return { ok: true, data: parsed.data };
}

type SavedInvoice = { invoiceId: string; firstLineId: string };

export async function createInvoiceAction(
  input: InvoiceInput,
): Promise<ActionResult<SavedInvoice>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: "You must be signed in to add a transaction." };
  }

  const parsed = parseInvoiceInput(input);
  if (!parsed.ok) {
    return parsed.result;
  }

  const result = await createInvoice(parsed.data, { userId: session.user.id });
  if (!result.ok) {
    return result;
  }
  revalidateCashflowPaths();
  return { ok: true, data: { invoiceId: result.invoiceId, firstLineId: result.firstLineId } };
}

export async function updateInvoiceAction(
  invoiceId: string,
  input: InvoiceInput,
): Promise<ActionResult<SavedInvoice>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: "You must be signed in to edit a transaction." };
  }

  const parsed = parseInvoiceInput(input);
  if (!parsed.ok) {
    return parsed.result;
  }

  const result = await updateInvoice(invoiceId, parsed.data, { userId: session.user.id });
  if (!result.ok) {
    return result;
  }
  revalidateCashflowPaths();
  return { ok: true, data: { invoiceId: result.invoiceId, firstLineId: result.firstLineId } };
}

/**
 * Loads one visit's header and lines for the edit pop-up opened from the
 * transactions table (which only holds the rows on the current page, so
 * the other lines of a multi-procedure visit have to be fetched).
 */
export async function getInvoiceForEditAction(
  invoiceId: string,
): Promise<ActionResult<{ invoice: Invoice; lines: CashflowTransaction[] }>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: "You must be signed in to edit a transaction." };
  }
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    return { ok: false, message: "That transaction no longer exists." };
  }
  const lines = await listLinesForInvoice(invoiceId);
  return { ok: true, data: { invoice, lines } };
}

/**
 * Lets the form warn about a reused booklet number as soon as staff tab out
 * of the field, instead of only when they press Save. Returns the problem
 * text, or null when the number is free (or blank).
 */
export async function checkInvoiceNumberAction(
  invoiceNumber: string,
  branchId: string,
  excludeInvoiceId?: string,
): Promise<{ ok: true; problem: string | null } | { ok: false; message: string }> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: "You must be signed in." };
  }
  const clash = await findInvoiceByNumber(invoiceNumber, branchId || null, excludeInvoiceId);
  if (!clash) {
    return { ok: true, problem: null };
  }
  const who = clash.patientName ? ` for ${clash.patientName}` : "";
  return {
    ok: true,
    problem: `Invoice number ${invoiceNumber.trim()} is already used${who} on ${clash.visitDate}.`,
  };
}

export type ImportCsvData = {
  /** Procedure lines imported. */
  importedCount: number;
  invoiceCount: number;
  paymentCount: number;
  errors: CsvRowError[];
  /** Branch the rows were filed under, if one was chosen or matched. */
  branchName: string | null;
  /** Set when "auto-detect" found nothing, so the screen can say so. */
  branchNote: string | null;
};

/**
 * `branchId` empty means "work it out from the report title" (e.g. a file
 * headed "MARIKINA DAY END REPORT" goes to the branch named Marikina).
 */
export async function importCsvAction(
  csvText: string,
  branchId?: string,
): Promise<ActionResult<ImportCsvData>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: "You must be signed in to import transactions." };
  }

  const { transactions, errors, branchName: detectedName } = parseCashflowCsv(csvText);

  let resolvedBranchId: string | null = branchId || null;
  let branchName: string | null = null;
  let branchNote: string | null = null;
  if (transactions.length > 0 || resolvedBranchId) {
    const branches = await listBranches();
    if (resolvedBranchId) {
      branchName = branches.find((branch) => branch.id === resolvedBranchId)?.name ?? null;
    } else if (detectedName) {
      const wanted = detectedName.trim().toLowerCase();
      const match =
        branches.find((branch) => branch.name.trim().toLowerCase() === wanted) ??
        branches.find((branch) => branch.name.toLowerCase().includes(wanted)) ??
        branches.find((branch) => wanted.includes(branch.name.trim().toLowerCase()));
      if (match) {
        resolvedBranchId = match.id;
        branchName = match.name;
      } else {
        branchNote = `The file is titled "${detectedName}", but no branch with that name exists, so the rows were saved without a branch.`;
      }
    } else {
      branchNote = "The file has no branch in its title, so the rows were saved without a branch.";
    }
  }

  let summary = { lineCount: 0, invoiceCount: 0, paymentCount: 0 };
  if (transactions.length > 0) {
    summary = await importTransactionsWithInvoices(transactions, {
      branchId: resolvedBranchId,
      userId: session.user.id,
    });
    revalidateCashflowPaths();
  }

  return {
    ok: true,
    data: {
      importedCount: summary.lineCount,
      invoiceCount: summary.invoiceCount,
      paymentCount: summary.paymentCount,
      errors,
      branchName,
      branchNote,
    },
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

/** Removes a whole visit — all its procedure lines, the invoice and its
 * payments. Admin-only, like removing a single transaction. */
export async function removeInvoiceAction(invoiceId: string): Promise<ActionResult<null>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: "You must be signed in to remove a transaction." };
  }
  if (session.user.role !== "admin") {
    return { ok: false, message: "Only admins can remove transactions." };
  }

  await deleteInvoice(invoiceId);
  revalidateCashflowPaths();
  return { ok: true, data: null };
}
