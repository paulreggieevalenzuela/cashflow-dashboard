import type { UserRole } from "@/lib/cashflow/user-schema";

/**
 * Who may reset whose password. Pure, so the Users screen (to decide which
 * buttons to show) and the server action (to refuse) use the same table.
 *
 * - The superuser can reset anyone except themselves.
 * - An admin can reset dentists and staff only (not other admins, not the
 *   superuser, not themselves).
 * - Nobody resets their own password this way: use Profile > Change password.
 * - Nobody can reset the superuser: that is the developer's break-glass
 *   script (scripts/reset-password.ts).
 */
export type ResetDecision = { ok: true } | { ok: false; reason: string };

export function canResetPassword(
  actor: { id: string; role: UserRole },
  target: { id: string; role: UserRole },
): ResetDecision {
  if (actor.id === target.id) {
    return {
      ok: false,
      reason: "Use Change password on your own profile.",
    };
  }
  if (target.role === "superuser") {
    return {
      ok: false,
      reason: "The superuser's password can't be reset from here.",
    };
  }
  if (actor.role === "superuser") {
    return { ok: true };
  }
  if (actor.role === "admin") {
    if (target.role === "admin") {
      return {
        ok: false,
        reason: "Only the superuser can reset an admin's password.",
      };
    }
    return { ok: true };
  }
  return { ok: false, reason: "Only admins can reset passwords." };
}

/** Can this person see (and act on) a reset request for an account with this role? */
export function canActOnRequestFor(
  actorRole: UserRole,
  targetRole: UserRole | null,
): boolean {
  if (targetRole === null) return actorRole === "admin" || actorRole === "superuser";
  return canResetPassword({ id: "actor", role: actorRole }, { id: "target", role: targetRole }).ok;
}
