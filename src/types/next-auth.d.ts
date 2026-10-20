import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/lib/cashflow/user-schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
    /** Seconds left before the login ends (30-minute idle rule). */
    expiresInSeconds: number;
    /** False when the 12-hour limit, not inactivity, is what ends the login. */
    canExtend: boolean;
  }

  interface User {
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    /** ms since epoch the person originally signed in (for the 12 h limit). */
    signedInAt: number;
    /** ms since epoch the login ends unless it is extended. */
    activeUntil: number;
  }
}
