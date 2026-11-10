import type { Session } from "next-auth";
import { auth } from "@/lib/auth/access";
import {
  PERMISSION_GROUPS,
  hasPermission,
  type Permission,
} from "@/lib/auth/permissions";

/** Can this signed-in person do this? (From the session built on every request.) */
export function can(
  session: Session | null | undefined,
  permission: Permission,
): boolean {
  return Boolean(session?.user) && hasPermission(session?.user.permissions, permission);
}

export function permissionLabel(permission: Permission): string {
  for (const group of PERMISSION_GROUPS) {
    for (const entry of group.permissions) {
      if (entry.key === permission) return entry.label;
    }
  }
  return permission;
}

export type Guarded =
  | { ok: true; session: Session }
  | { ok: false; message: string };

/**
 * For server actions: the signed-in session when the person holds the
 * privilege, otherwise a message to hand back. `denied` is the sentence shown
 * ("Only people allowed to X can ...").
 */
export async function requirePermission(
  permission: Permission,
  denied?: string,
): Promise<Guarded> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "You must be signed in." };
  }
  if (!can(session, permission)) {
    return {
      ok: false,
      message:
        denied ?? `You don't have permission to do this (${permissionLabel(permission)}).`,
    };
  }
  return { ok: true, session };
}
