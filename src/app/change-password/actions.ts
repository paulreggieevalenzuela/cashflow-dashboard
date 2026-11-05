"use server";

import { revalidatePath } from "next/cache";
import { adoptionProof, updateSessionToken } from "@/auth";
import { authForPasswordChange } from "@/lib/auth/access";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { validateNewPassword } from "@/lib/auth/password-policy";
import { canonicalTempPassword } from "@/lib/auth/temp-password";
import { logAudit } from "@/lib/db/audit";
import { checkLoginLock, recordLoginAttempt } from "@/lib/db/login-attempts";
import { getPasswordHashById, setUserPassword } from "@/lib/db/users";

export type ChangePasswordResult =
  | {
      ok: true;
      /** The sign-in could not be renewed here: sign out and in again. */
      signInAgain: boolean;
    }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * Chooses a new password for the signed-in person. Used by the first-sign-in
 * screen (a temporary password must be replaced) and by Profile (voluntary).
 * Whether it is the forced kind is decided from the database here, never from
 * what the browser says.
 */
export async function changePasswordAction(input: {
  current: string;
  next: string;
  confirm: string;
}): Promise<ChangePasswordResult> {
  const session = await authForPasswordChange();
  if (!session) {
    return { ok: false, message: "Your sign-in has ended. Please sign in again." };
  }

  const current = typeof input?.current === "string" ? input.current : "";
  const next = typeof input?.next === "string" ? input.next : "";
  const confirm = typeof input?.confirm === "string" ? input.confirm : "";

  if (!current) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { current: "Enter your current password." },
    };
  }
  if (next !== confirm) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { confirm: "The two passwords don't match." },
    };
  }

  // Same lock as signing in, so a stolen sign-in can't be used to guess the
  // current password.
  const userId = session.user.id;
  const emailKey = `pwchange:${userId}`;
  const lock = await checkLoginLock({ emailKey, ip: "" });
  if (lock.locked) {
    return {
      ok: false,
      message: "Too many wrong attempts. Please wait 15 minutes and try again.",
    };
  }

  const hash = await getPasswordHashById(userId);
  if (!hash) {
    return { ok: false, message: "Your sign-in has ended. Please sign in again." };
  }
  let currentOk = await verifyPassword(current, hash);
  if (!currentOk && session.user.mustChangePassword) {
    const canonical = canonicalTempPassword(current);
    if (canonical && canonical !== current) {
      currentOk = await verifyPassword(canonical, hash);
    }
  }
  if (!currentOk) {
    await recordLoginAttempt({ emailKey, ip: "", userAgent: "", outcome: "wrong_password" });
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { current: "That isn't your current password." },
    };
  }

  const problem = validateNewPassword(next, {
    email: session.user.email,
    name: session.user.name,
    current,
  });
  if (problem) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { next: problem },
    };
  }

  const version = await setUserPassword({
    id: userId,
    passwordHash: await hashPassword(next),
    mustChange: false,
    tempPasswordExpiresAt: null,
  });
  await recordLoginAttempt({ emailKey, ip: "", userAgent: "", outcome: "ok" });

  await logAudit({
    action: "auth.password_changed",
    entityType: "user",
    entityId: userId,
    summary: session.user.mustChangePassword
      ? `${session.user.name ?? "A user"} chose their own password`
      : `${session.user.name ?? "A user"} changed their password`,
    actor: { userId, name: session.user.name ?? session.user.email ?? "" },
  });

  // Every other sign-in of this person ends (the version moved on). Give THIS
  // browser the new version so it can carry on; if that fails for any reason
  // the next request simply asks the person to sign in again.
  let signInAgain = false;
  try {
    const proof = adoptionProof(userId, version);
    if (!proof) {
      signInAgain = true;
    } else {
      await updateSessionToken({ adopt: proof } as never);
    }
  } catch (error) {
    console.error("Could not renew the sign-in after a password change.", error);
    signInAgain = true;
  }

  revalidatePath("/cashflow", "layout");
  return { ok: true, signInAgain };
}
