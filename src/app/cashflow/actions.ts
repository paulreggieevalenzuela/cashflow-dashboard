"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/access";
import {
  getBranchPolicy,
  isBranchAllowed,
  NO_BRANCH_MESSAGE,
} from "@/lib/auth/branch-policy";
import { can, requirePermission } from "@/lib/auth/guards";
import { InvoiceInputSchema, type InvoiceInput } from "@/lib/cashflow/invoice-schema";
import { parseCashflowCsv, type CsvRowError } from "@/lib/cashflow/parse-csv";
import { isHmoPayment, canonicalPaymentName } from "@/lib/cashflow/payment-methods";
import { logAudit } from "@/lib/db/audit";
import { learnPatientHmo, saveVisitHmoDetails } from "@/lib/db/visit-hmo";
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
import { listPaymentsForInvoice, type Payment } from "@/lib/db/payments";
import { lineLockMessage, visitLockMessage } from "@/lib/db/transaction-checks";

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

/**
 * Keeps what was typed for the visit's HMO (the patient's company and account
 * number) with the visit, and lets the patient's profile learn an HMO it did
 * not have. A visit that is not paid through an HMO keeps nothing. Never
 * fails the save: the details are a convenience on top of the visit.
 */
async function saveHmoDetailsForVisit(invoiceId: string, input: InvoiceInput) {
  try {
    const method = input.payment?.paymentType ?? "";
    if (!isHmoPayment(method)) {
      await saveVisitHmoDetails(invoiceId, null);
      return;
    }
    const details = {
      hmoName: canonicalPaymentName(method) ?? method.trim(),
      employer: input.hmoEmployer ?? "",
      accountNumber: input.hmoAccountNumber ?? "",
    };
    // Nothing typed and nothing offered: leave whatever the visit already
    // has (a form saved before the details loaded must not wipe them).
    if (details.employer.trim() === "" && details.accountNumber.trim() === "") return;
    await saveVisitHmoDetails(invoiceId, details);
    await learnPatientHmo(invoiceId, details);
  } catch (error) {
    console.error("Could not save the visit's HMO details", error);
  }
}

export async function createInvoiceAction(
  input: InvoiceInput,
): Promise<ActionResult<SavedInvoice>> {
  const guard = await requirePermission(
    "visit.create",
    "You don't have permission to add visits.",
  );
  if (!guard.ok) {
    return { ok: false, message: guard.message };
  }
  const session = guard.session;

  const parsed = parseInvoiceInput(input);
  if (!parsed.ok) {
    return parsed.result;
  }

  // Owners and admins pick any clinic. Everyone else saves under a clinic
  // they are ticked for: their only one, or the one they picked among
  // several — never one they are not allowed in, whatever the screen sent.
  const policy = await getBranchPolicy(session);
  if (policy.allowedBranchIds !== null) {
    if (!policy.canChoose) {
      if (!policy.branchId) {
        return { ok: false, message: NO_BRANCH_MESSAGE };
      }
      parsed.data = { ...parsed.data, branchId: policy.branchId };
    } else {
      const chosen = parsed.data.branchId || policy.branchId;
      if (!isBranchAllowed(policy, chosen)) {
        return { ok: false, message: "You can only add visits to your own clinics." };
      }
      parsed.data = { ...parsed.data, branchId: chosen ?? "" };
    }
  }

  const result = await createInvoice(parsed.data, {
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "",
  });
  if (!result.ok) {
    return result;
  }
  await saveHmoDetailsForVisit(result.invoiceId, parsed.data);
  revalidateCashflowPaths();
  return { ok: true, data: { invoiceId: result.invoiceId, firstLineId: result.firstLineId } };
}

export async function updateInvoiceAction(
  invoiceId: string,
  input: InvoiceInput,
): Promise<ActionResult<SavedInvoice>> {
  const guard = await requirePermission(
    "visit.edit",
    "You don't have permission to edit visits.",
  );
  if (!guard.ok) {
    return { ok: false, message: guard.message };
  }
  const session = guard.session;

  // A checked visit is locked: only the superuser can change it.
  const locked = await visitLockMessage(
    invoiceId,
    { isSuperuser: session.user.isSuperuser },
    "edit",
  );
  if (locked) {
    return { ok: false, message: locked };
  }

  const parsed = parseInvoiceInput(input);
  if (!parsed.ok) {
    return parsed.result;
  }

  // Moving a visit to another clinic: owners and admins anywhere; people
  // with several clinics only among theirs; anyone else cannot move it (an
  // empty value means "unchanged").
  const policy = await getBranchPolicy(session);
  if (!policy.canChoose) {
    parsed.data = { ...parsed.data, branchId: "" };
  } else if (
    policy.allowedBranchIds !== null &&
    parsed.data.branchId &&
    !isBranchAllowed(policy, parsed.data.branchId)
  ) {
    return { ok: false, message: "You can only use your own clinics." };
  }

  const mayEditCleared = can(session, "visit.edit_cleared");
  const result = await updateInvoice(invoiceId, parsed.data, {
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "",
    isAdmin: mayEditCleared,
    canEditCleared: mayEditCleared,
  });
  if (!result.ok) {
    return result;
  }
  await saveHmoDetailsForVisit(result.invoiceId, parsed.data);
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
): Promise<
  ActionResult<{
    invoice: Invoice;
    lines: CashflowTransaction[];
    payments: Payment[];
  }>
> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, message: "You must be signed in to edit a transaction." };
  }
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    return { ok: false, message: "That transaction no longer exists." };
  }
  const [lines, payments] = await Promise.all([
    listLinesForInvoice(invoiceId),
    listPaymentsForInvoice(invoiceId),
  ]);
  return { ok: true, data: { invoice, lines, payments } };
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
  const guard = await requirePermission(
    "import.csv",
    "You don't have permission to import transactions.",
  );
  if (!guard.ok) {
    return { ok: false, message: guard.message };
  }
  const session = guard.session;

  const { transactions, errors, branchName: detectedName } = parseCashflowCsv(csvText);
  const importPolicy = await getBranchPolicy(session);

  let resolvedBranchId: string | null = branchId || null;
  if (resolvedBranchId && !isBranchAllowed(importPolicy, resolvedBranchId) && importPolicy.allowedBranchIds !== null) {
    return { ok: false, message: "You can only import into your own clinics." };
  }
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
      if (match && isBranchAllowed(importPolicy, match.id) === false && importPolicy.allowedBranchIds !== null) {
        branchNote = `The file is for ${match.name}, which is not one of your clinics, so the rows were saved without a clinic.`;
      } else if (match) {
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
    await logAudit({
      action: "visit.imported",
      entityType: "invoice",
      summary: `Imported ${summary.invoiceCount} ${summary.invoiceCount === 1 ? "visit" : "visits"} (${summary.lineCount} procedure ${summary.lineCount === 1 ? "line" : "lines"}, ${summary.paymentCount} ${summary.paymentCount === 1 ? "payment" : "payments"}) from a CSV file${branchName ? ` into ${branchName}` : ""}.`,
      actor: {
        userId: session.user.id,
        name: session.user.name ?? session.user.email ?? "",
      },
    });
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
  const guard = await requirePermission(
    "visit.delete",
    "You don't have permission to remove transactions.",
  );
  if (!guard.ok) {
    return { ok: false, message: guard.message };
  }
  const session = guard.session;

  const locked = await lineLockMessage(id, { isSuperuser: session.user.isSuperuser }, "remove");
  if (locked) {
    return { ok: false, message: locked };
  }

  try {
    await deleteTransaction(id, {
      userId: session.user.id,
      name: session.user.name ?? session.user.email ?? "",
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not remove the transaction." };
  }
  revalidateCashflowPaths();
  return { ok: true, data: null };
}

/** Removes a whole visit — all its procedure lines, the invoice and its
 * payments. Kept in Deleted items; needs the same privilege as removing a
 * single transaction. */
export async function removeInvoiceAction(invoiceId: string): Promise<ActionResult<null>> {
  const guard = await requirePermission(
    "visit.delete",
    "You don't have permission to remove transactions.",
  );
  if (!guard.ok) {
    return { ok: false, message: guard.message };
  }
  const session = guard.session;

  const locked = await visitLockMessage(
    invoiceId,
    { isSuperuser: session.user.isSuperuser },
    "remove",
  );
  if (locked) {
    return { ok: false, message: locked };
  }

  try {
    await deleteInvoice(invoiceId, {
      userId: session.user.id,
      name: session.user.name ?? session.user.email ?? "",
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not remove the visit." };
  }
  revalidateCashflowPaths();
  return { ok: true, data: null };
}
