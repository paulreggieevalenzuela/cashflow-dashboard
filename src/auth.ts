import { createHmac, timingSafeEqual } from "node:crypto";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  checkLoginLock,
  normalizeEmailKey,
  recordLoginAttempt,
} from "@/lib/db/login-attempts";
import { getAuthState, getUserByEmail } from "@/lib/db/users";
import { sessionRoleOf, type SessionRole } from "@/lib/cashflow/user-schema";
import { canonicalTempPassword, isTempPasswordExpired } from "@/lib/auth/temp-password";
import {
  ABSOLUTE_LIMIT_MS,
  canExtend,
  isExpired,
  nextActiveUntil,
} from "@/lib/auth/session-policy";

/** Too many wrong passwords: the sign-in page shows its own message. */
class AccountLockedError extends CredentialsSignin {
  code = "locked";
}

/** The temporary password was right but is past its expiry date. */
class TempPasswordExpiredError extends CredentialsSignin {
  code = "temp_expired";
}

/**
 * Proof, made only on the server, that the person's own browser may take the
 * new session version after THEY changed their password. A browser cannot
 * make this itself, so it cannot use the "update" call to dodge the sign-out
 * that follows a reset.
 */
export function adoptionProof(userId: string, sessionVersion: number): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  if (!secret) return "";
  return createHmac("sha256", secret).update(`adopt:${userId}:${sessionVersion}`).digest("hex");
}

function proofMatches(given: unknown, expected: string): boolean {
  if (typeof given !== "string" || !expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// A real hash to compare against when the e-mail does not exist, so an
// unknown e-mail takes as long to refuse as a wrong password does.
let decoyHash: Promise<string> | undefined;

function clientAddress(request: Request | undefined): string {
  const forwarded = request?.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request?.headers.get("x-real-ip") ||
    ""
  );
}

const nextAuth = NextAuth({
  // maxAge only bounds the cookie itself. The real rules (30 minutes idle,
  // 12 hours in total) live in the token — see session-policy.ts and the jwt
  // callback below.
  session: { strategy: "jwt", maxAge: ABSOLUTE_LIMIT_MS / 1000 },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) {
          return null;
        }

        const emailKey = normalizeEmailKey(email);
        const ip = clientAddress(request);
        const userAgent = request?.headers.get("user-agent") ?? "";

        // Locked after repeated wrong passwords (see login-throttle.ts).
        const lock = await checkLoginLock({ emailKey, ip });
        if (lock.locked) {
          await recordLoginAttempt({ emailKey, ip, userAgent, outcome: "locked" });
          throw new AccountLockedError();
        }

        const user = await getUserByEmail(email);
        if (!user) {
          decoyHash ??= hashPassword("decoy-password-for-timing");
          await verifyPassword(password, await decoyHash);
          await recordLoginAttempt({ emailKey, ip, userAgent, outcome: "unknown_email" });
          return null;
        }

        let isValid = await verifyPassword(password, user.passwordHash);
        // A temporary password may be typed in lower case or without dashes.
        if (!isValid && user.mustChangePassword) {
          const canonical = canonicalTempPassword(password);
          if (canonical && canonical !== password) {
            isValid = await verifyPassword(canonical, user.passwordHash);
          }
        }
        if (!isValid) {
          await recordLoginAttempt({ emailKey, ip, userAgent, outcome: "wrong_password" });
          return null;
        }

        // Right password, but a temporary one that has run out: say so (only
        // now that it is known to be the right one), and ask for a new one.
        if (user.mustChangePassword && isTempPasswordExpired(user.tempPasswordExpiresAt)) {
          await recordLoginAttempt({ emailKey, ip, userAgent, outcome: "expired_temp" });
          throw new TempPasswordExpiredError();
        }
        await recordLoginAttempt({ emailKey, ip, userAgent, outcome: "ok" });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: sessionRoleOf(user.role),
          isSuperuser: user.role === "superuser",
          mustChangePassword: user.mustChangePassword,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session: updateData }) {
      const now = Date.now();

      // Fresh sign-in: start the 30-minute clock.
      if (user) {
        token.id = user.id as string;
        const signedIn = user as {
          role: SessionRole;
          isSuperuser?: boolean;
          mustChangePassword?: boolean;
          sessionVersion?: number;
        };
        token.role = signedIn.role;
        token.isSuperuser = Boolean(signedIn.isSuperuser);
        token.mustChangePassword = Boolean(signedIn.mustChangePassword);
        token.sessionVersion = signedIn.sessionVersion ?? 0;
        token.signedInAt = now;
        token.activeUntil = nextActiveUntil(now, now);
        return token;
      }

      // Logins created before this rule existed have no clock yet: start
      // one now rather than signing everyone out at deploy time.
      if (typeof token.signedInAt !== "number" || typeof token.activeUntil !== "number") {
        token.signedInAt = now;
        token.activeUntil = nextActiveUntil(now, now);
        return token;
      }

      // Time is up: returning null ends the session (cookie is cleared).
      if (isExpired(token.activeUntil, now)) {
        return null;
      }

      // The ONLY place the login is extended: an explicit refresh from the
      // browser (activity, or "Stay signed in"). Ordinary page loads, the
      // Queue auto-refresh and background polling never reach this branch,
      // so they cannot keep a login alive.
      if (trigger === "update") {
        // Re-check the account while we're here, so a removed user is signed
        // out and a changed role takes effect at the next refresh.
        const current = await getAuthState(token.id as string);
        if (!current) {
          return null;
        }
        // The password was changed or reset since this sign-in: end it,
        // unless the server itself says this is the person who just changed it.
        if (current.sessionVersion !== (token.sessionVersion ?? 0)) {
          const proof = (updateData as { adopt?: unknown } | undefined)?.adopt;
          if (!proofMatches(proof, adoptionProof(current.id, current.sessionVersion))) {
            return null;
          }
        }
        token.sessionVersion = current.sessionVersion;
        token.role = sessionRoleOf(current.role);
        token.isSuperuser = current.role === "superuser";
        token.mustChangePassword = current.mustChangePassword;
        token.name = current.name;
        token.email = current.email;
        token.activeUntil = nextActiveUntil(now, token.signedInAt as number);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as SessionRole;
        session.user.isSuperuser = Boolean(token.isSuperuser);
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }
      session.sessionVersion = (token.sessionVersion as number | undefined) ?? 0;
      // The browser counts down from these (seconds, not a clock time, so a
      // wrong clock on the computer cannot make the warning early or late).
      const activeUntil = token.activeUntil as number;
      session.expiresInSeconds = Math.max(
        0,
        Math.floor((activeUntil - Date.now()) / 1000),
      );
      session.canExtend = canExtend(activeUntil, token.signedInAt as number);
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

/**
 * The raw sign-in check (is the token valid?). Only the proxy and the access
 * module use it; pages, actions and routes use `auth` from
 * "@/lib/auth/access", which also asks the database.
 */
export const rawAuth = nextAuth.auth;

/** Refreshes the signed-in person's token from the server side. */
export const updateSessionToken = nextAuth.unstable_update;
