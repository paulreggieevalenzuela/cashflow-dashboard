import { cache } from "react";
import type { Session } from "next-auth";
import { rawAuth } from "@/auth";
import { getAuthState } from "@/lib/db/users";
import { getAccessProfile } from "@/lib/db/user-access";
import { ensurePaymentMethods } from "@/lib/db/payment-methods";
import { sessionRoleOf } from "@/lib/cashflow/user-schema";

/**
 * The one place that decides, on EVERY request, whether a signed-in person
 * may carry on. The sign-in token is only a hint (it can be up to 30 minutes
 * old); the database is the truth:
 *
 * - account removed, or the password was changed / reset after this sign-in
 *   (session version differs)            -> "revoked": sign in again
 * - the person still has to choose their own password
 *                                         -> "must_change": Change password only
 * - otherwise                             -> "ok", with the role, name and
 *   e-mail as they are in the database right now
 *
 * `auth()` below returns the session only for "ok". Every page, server action
 * and API route already calls `auth()`, so a person who must change their
 * password gets "not signed in" from all of them — they cannot reach data
 * through a URL, a form action or an API call.
 */
export type Access =
  | { status: "anonymous" }
  | { status: "revoked" }
  | { status: "must_change"; session: Session; tokenSaysMustChange: boolean }
  | { status: "ok"; session: Session; tokenSaysMustChange: boolean };

export const getAccess = cache(async (): Promise<Access> => {
  const session = (await rawAuth()) as Session | null;
  if (!session?.user?.id) {
    return { status: "anonymous" };
  }

  const state = await getAuthState(session.user.id);
  if (!state || state.sessionVersion !== (session.sessionVersion ?? 0)) {
    return { status: "revoked" };
  }

  const tokenSaysMustChange = Boolean(session.user.mustChangePassword);
  // What this person may do, and in which clinics, from the database right now
  // (a change made on the Users screen applies on their next click).
  // The payment methods an owner or admin added are loaded in the same step
  // (at most once every 10 seconds), so every page, action and API route knows
  // which payment types are HMOs.
  const [profile] = await Promise.all([
    getAccessProfile({
      userId: state.id,
      role: state.role,
      branchId: state.branchId,
    }),
    ensurePaymentMethods(),
  ]);
  const fresh: Session = {
    ...session,
    user: {
      ...session.user,
      name: state.name,
      email: state.email,
      role: sessionRoleOf(state.role),
      isSuperuser: state.role === "superuser",
      isOwner: state.role === "owner",
      permissions: profile.permissions,
      branchIds: profile.branchIds,
      branchId: state.branchId,
      mustChangePassword: state.mustChangePassword,
    },
  };

  if (state.mustChangePassword) {
    return { status: "must_change", session: fresh, tokenSaysMustChange };
  }
  return { status: "ok", session: fresh, tokenSaysMustChange };
});

/** The signed-in session, or null (also null while a password change is pending). */
export async function auth(): Promise<Session | null> {
  const access = await getAccess();
  return access.status === "ok" ? access.session : null;
}

/** Like auth(), but also lets through a person who must change their password. */
export async function authForPasswordChange(): Promise<Session | null> {
  const access = await getAccess();
  return access.status === "ok" || access.status === "must_change" ? access.session : null;
}
