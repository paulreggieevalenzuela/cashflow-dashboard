import { visitLockMessage } from "@/lib/db/transaction-checks";
import { auth } from "@/lib/auth/access";
import { can } from "@/lib/auth/guards";
import { ARCHIVE_NOT_READY } from "@/lib/db/deleted-items";
import { deleteAttachment, getAttachmentFile } from "@/lib/db/attachments";

export const runtime = "nodejs";

/** Opens a file in the browser (sign-in required). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json(
      { message: "You must be signed in." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const row = await getAttachmentFile(id);
  if (!row) {
    return Response.json({ message: "File not found." }, { status: 404 });
  }

  const bytes = new Uint8Array(Buffer.from(row.dataBase64, "base64"));
  const safeName = row.fileName.replace(/[^\w.\- ]+/g, "_");
  return new Response(bytes, {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** Removes a file (needs the "remove attached files" privilege). The file is kept in Deleted items. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json(
      { message: "You must be signed in." },
      { status: 401 },
    );
  }
  if (!can(session, "attachment.delete")) {
    return Response.json(
      { message: "You don't have permission to remove files." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const file = await getAttachmentFile(id);
  const locked = await visitLockMessage(
    file?.invoiceId,
    { isSuperuser: session.user.isSuperuser },
    "remove a file",
  );
  if (locked) {
    return Response.json({ message: locked }, { status: 403 });
  }
  try {
    await deleteAttachment(id, {
      userId: session.user.id,
      name: session.user.name ?? session.user.email ?? "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove the file.";
    return Response.json(
      { message: message === ARCHIVE_NOT_READY ? message : "Could not remove the file." },
      { status: 500 },
    );
  }
  return Response.json({ ok: true });
}
