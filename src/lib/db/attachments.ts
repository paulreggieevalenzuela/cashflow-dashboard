import { asc, eq, isNotNull } from "drizzle-orm";
import {
  ATTACHMENT_KINDS,
  type AttachmentKind,
} from "@/lib/cashflow/attachment-rules";
import { db } from "@/lib/db/client";
import { attachments, payments } from "@/lib/db/schema";

/** A file's details without its content — what lists and screens need. */
export type AttachmentInfo = {
  id: string;
  invoiceId: string | null;
  expenseId: string | null;
  paymentId: string | null;
  kind: AttachmentKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

function toKind(value: string): AttachmentKind {
  return (ATTACHMENT_KINDS as readonly string[]).includes(value)
    ? (value as AttachmentKind)
    : "invoice";
}

const INFO_COLUMNS = {
  id: attachments.id,
  invoiceId: attachments.invoiceId,
  expenseId: attachments.expenseId,
  paymentId: attachments.paymentId,
  kind: attachments.kind,
  fileName: attachments.fileName,
  contentType: attachments.contentType,
  sizeBytes: attachments.sizeBytes,
  createdAt: attachments.createdAt,
} as const;

function toInfo(row: {
  id: string;
  invoiceId: string | null;
  expenseId: string | null;
  paymentId: string | null;
  kind: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}): AttachmentInfo {
  return {
    ...row,
    kind: toKind(row.kind),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Every file on a visit (invoice photos and proofs of payment), oldest
 * first. Does not read the file contents. */
export async function listAttachmentsForInvoice(
  invoiceId: string,
): Promise<AttachmentInfo[]> {
  // Until `scripts/sql/2026-10-attachments.sql` has been run there is no
  // attachments table; show the page without files rather than failing it.
  try {
    const rows = await db
      .select(INFO_COLUMNS)
      .from(attachments)
      .where(eq(attachments.invoiceId, invoiceId))
      .orderBy(asc(attachments.createdAt));
    return rows.map(toInfo);
  } catch {
    return [];
  }
}

/** Every file attached to any expense (for the Expenses page). Does not
 * read the file contents. */
export async function listExpenseAttachments(): Promise<AttachmentInfo[]> {
  try {
    const rows = await db
      .select(INFO_COLUMNS)
      .from(attachments)
      .where(isNotNull(attachments.expenseId))
      .orderBy(asc(attachments.createdAt));
    return rows.map(toInfo);
  } catch {
    return [];
  }
}

/** One file with its content (for opening it). */
export async function getAttachmentFile(id: string) {
  const [row] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);
  return row;
}

export async function addAttachment(data: {
  invoiceId: string | null;
  expenseId?: string | null;
  paymentId: string | null;
  kind: AttachmentKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  dataBase64: string;
  createdByUserId: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(attachments)
    .values(data)
    .returning({ id: attachments.id });
  return row.id;
}

export async function deleteAttachment(id: string): Promise<void> {
  await db.delete(attachments).where(eq(attachments.id, id));
}

/** The visit's payment ids (to check a payment belongs to the visit, or to
 * find the only one). */
export async function listPaymentIdsForInvoice(
  invoiceId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId));
  return rows.map((row) => row.id);
}
