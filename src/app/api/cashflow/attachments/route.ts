import { auth } from "@/auth";
import {
  attachmentProblem,
  isAttachmentKind,
} from "@/lib/cashflow/attachment-rules";
import { addAttachment, listPaymentIdsForInvoice } from "@/lib/db/attachments";
import { getExpenseById } from "@/lib/db/expenses";
import { getInvoiceById } from "@/lib/db/invoices";

export const runtime = "nodejs";

function problem(message: string, status: number) {
  return Response.json({ message }, { status });
}

/**
 * Upload one invoice / proof-of-payment file for a visit. Multipart form:
 * `file`, `invoiceId`, `kind` ("invoice" | "receipt"), and optionally
 * `paymentId` (which payment a proof belongs to) or `toOnlyPayment` (the
 * visit's single payment — used right after a visit is added).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return problem("You must be signed in to attach a file.", 401);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem("The upload could not be read.", 400);
  }

  const file = form.get("file");
  const invoiceIdField = form.get("invoiceId");
  const expenseIdField = form.get("expenseId");
  const kind = form.get("kind");
  const paymentIdField = form.get("paymentId");

  if (!(file instanceof File)) {
    return problem("Choose a file to attach.", 400);
  }
  const invoiceId = typeof invoiceIdField === "string" ? invoiceIdField : "";
  const expenseId = typeof expenseIdField === "string" ? expenseIdField : "";
  if (!invoiceId && !expenseId) {
    return problem("Missing transaction or expense.", 400);
  }
  if (!isAttachmentKind(kind)) {
    return problem("Unknown file type.", 400);
  }

  const fileProblem = attachmentProblem({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (fileProblem) {
    return problem(fileProblem, 400);
  }

  if (expenseId) {
    // An expense's receipt / proof.
    if (kind !== "receipt") {
      return problem("An expense can only have a receipt attached.", 400);
    }
    if (!(await getExpenseById(expenseId))) {
      return problem("That expense no longer exists.", 404);
    }
  } else if (!(await getInvoiceById(invoiceId))) {
    return problem("That transaction no longer exists.", 404);
  }

  let paymentId: string | null = null;
  if (!expenseId && kind === "receipt") {
    const paymentIds = await listPaymentIdsForInvoice(invoiceId);
    if (typeof paymentIdField === "string" && paymentIdField) {
      if (!paymentIds.includes(paymentIdField)) {
        return problem("That payment is not part of this transaction.", 400);
      }
      paymentId = paymentIdField;
    } else if (form.get("toOnlyPayment") && paymentIds.length === 1) {
      paymentId = paymentIds[0];
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const id = await addAttachment({
      invoiceId: expenseId ? null : invoiceId,
      expenseId: expenseId || null,
      paymentId,
      kind,
      fileName: file.name.slice(0, 200) || "file",
      contentType: file.type,
      sizeBytes: bytes.length,
      dataBase64: bytes.toString("base64"),
      createdByUserId: session.user.id,
    });
    return Response.json({ id });
  } catch {
    return problem(
      "The file could not be saved. If this is new, run the attachments SQL file (scripts/sql/2026-10-attachments.sql) first.",
      500,
    );
  }
}
