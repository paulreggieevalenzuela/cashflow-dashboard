/**
 * Rules for the invoice / receipt files attached to a visit or a payment.
 * Shared by the upload screens (which check before sending) and the server
 * (which checks again, since the browser can't be trusted).
 *
 * Files are kept in the database, so they are kept small: phone photos are
 * shrunk in the browser before upload (see `attachment-client.ts`), and
 * anything still over the limit is refused.
 */

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4 MB

export const ATTACHMENT_KINDS = ["invoice", "receipt"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  invoice: "Invoice",
  receipt: "Proof of payment",
};

export const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

/** For the file picker's `accept` attribute. */
export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_TYPES.join(",");

export function isAttachmentKind(value: unknown): value is AttachmentKind {
  return (
    typeof value === "string" &&
    (ATTACHMENT_KINDS as readonly string[]).includes(value)
  );
}

export function isAllowedAttachmentType(type: string): boolean {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(type);
}

/** Why a file can't be attached, or null when it is fine. */
export function attachmentProblem(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!isAllowedAttachmentType(file.type)) {
    return `${file.name} is not a photo (JPG, PNG, WebP) or a PDF.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name} is too large (${formatFileSize(file.size)}). The most is ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`;
  }
  if (file.size === 0) {
    return `${file.name} is empty.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
