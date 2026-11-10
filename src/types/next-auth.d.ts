import type { DefaultSession } from "next-auth";
import type { SessionRole } from "@/lib/cashflow/user-schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: SessionRole;
      /** The one person with access to everything (counts as "admin" above). */
      isSuperuser: boolean;
      /** An owner (counts as "admin" above, with the owner's extra rights). */
      isOwner: boolean;
      /** What this person may do right now (role defaults + their own changes). */
      permissions: string[];
      /** The clinics they work in; null = every clinic (owner, admin, superuser). */
      branchIds: string[] | null;
      /** Their home clinic (the first one ticked), if any. */
      branchId: string | null;
      /** Still has to choose their own password before using the app. */
      mustChangePassword: boolean;
    } & DefaultSession["user"];
    /** Raised whenever the person's password changes (ends old sign-ins). */
    sessionVersion: number;
    /** Seconds left before the login ends (30-minute idle rule). */
    expiresInSeconds: number;
    /** False when the 12-hour limit, not inactivity, is what ends the login. */
    canExtend: boolean;
  }

  interface User {
    role: SessionRole;
    isSuperuser?: boolean;
    mustChangePassword?: boolean;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: SessionRole;
    isSuperuser: boolean;
    mustChangePassword: boolean;
    sessionVersion: number;
    /** ms since epoch the person originally signed in (for the 12 h limit). */
    signedInAt: number;
    /** ms since epoch the login ends unless it is extended. */
    activeUntil: number;
  }
}
