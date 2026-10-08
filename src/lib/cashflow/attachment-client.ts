import {
  attachmentProblem,
  type AttachmentKind,
} from "@/lib/cashflow/attachment-rules";

/** Longest side a photo is shrunk to before upload (plenty to read an
 * invoice or a card slip, and keeps phone photos around a few hundred KB). */
const MAX_IMAGE_SIDE = 1800;

/**
 * Shrinks a phone photo to a reasonable size and saves it as JPEG. PDFs and
 * anything the browser can't decode are returned as they are (the size
 * check then decides whether they are allowed).
 */
export async function prepareUpload(file: File): Promise<File> {
  const shrinkable =
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/webp";
  if (!shrinkable) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }
    // JPEG has no transparency: paint white first so PNG screenshots with a
    // transparent background don't turn black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    // Only use the shrunk copy when it is actually smaller.
    if (!blob || blob.size >= file.size) {
      return file;
    }
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export type UploadResult = { ok: true } | { ok: false; message: string };

/** Sends one file to the server and attaches it to a visit (and, for proof
 * of payment, to a payment). */
export async function uploadAttachment(options: {
  /** The visit the file belongs to... */
  invoiceId?: string;
  /** ...or the expense (a receipt / proof). */
  expenseId?: string;
  kind: AttachmentKind;
  file: File;
  /** Attach to this payment. */
  paymentId?: string;
  /** Attach to the visit's only payment (used right after a visit is added
   * with its first payment, when the payment's id isn't known yet). */
  toOnlyPayment?: boolean;
}): Promise<UploadResult> {
  const problem = attachmentProblem(options.file);
  if (problem) {
    return { ok: false, message: problem };
  }

  const body = new FormData();
  if (options.invoiceId) {
    body.set("invoiceId", options.invoiceId);
  }
  if (options.expenseId) {
    body.set("expenseId", options.expenseId);
  }
  body.set("kind", options.kind);
  if (options.paymentId) {
    body.set("paymentId", options.paymentId);
  }
  if (options.toOnlyPayment) {
    body.set("toOnlyPayment", "1");
  }
  body.set("file", options.file);

  try {
    const response = await fetch("/api/cashflow/attachments", {
      method: "POST",
      body,
    });
    if (response.ok) {
      return { ok: true };
    }
    const data = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    return {
      ok: false,
      message: data?.message ?? "The file could not be uploaded.",
    };
  } catch {
    return {
      ok: false,
      message: "The file could not be uploaded (no connection).",
    };
  }
}
