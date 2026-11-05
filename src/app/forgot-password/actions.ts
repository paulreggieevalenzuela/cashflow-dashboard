"use server";

import { headers } from "next/headers";
import { logAudit } from "@/lib/db/audit";
import { normalizeEmailKey } from "@/lib/db/login-attempts";
import { createResetRequest, findAccountForRequest } from "@/lib/db/password-requests";
import { validateEmail } from "@/lib/validation";

export type RequestResetResult = { ok: true } | { ok: false; message: string };

/**
 * "I forgot my password". Records a request for an admin to see; it changes
 * nothing about any account. The answer is the same whether or not an account
 * has that e-mail, so this can't be used to find out who has one.
 */
export async function requestPasswordResetAction(input: {
  email: string;
  note: string;
}): Promise<RequestResetResult> {
  const email = typeof input?.email === "string" ? input.email : "";
  const note = typeof input?.note === "string" ? input.note.trim().slice(0, 300) : "";

  const problem = validateEmail(email);
  if (problem) {
    return { ok: false, message: problem };
  }

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    "";
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const emailKey = normalizeEmailKey(email);

  await createResetRequest({ emailKey, note, ip, userAgent });

  const account = await findAccountForRequest(emailKey).catch(() => null);
  if (account) {
    await logAudit({
      action: "auth.reset_requested",
      entityType: "user",
      entityId: account.id,
      summary: `${account.name} asked for a password reset from the sign-in page`,
      actor: { userId: null, name: "Sign-in page" },
    });
  }

  return { ok: true };
}
