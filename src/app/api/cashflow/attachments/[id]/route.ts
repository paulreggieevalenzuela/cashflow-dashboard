import { auth } from "@/auth";
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

/** Removes a file (admins only). */
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
  if (session.user.role !== "admin") {
    return Response.json(
      { message: "Only admins can remove a file." },
      { status: 403 },
    );
  }

  const { id } = await params;
  await deleteAttachment(id);
  return Response.json({ ok: true });
}
