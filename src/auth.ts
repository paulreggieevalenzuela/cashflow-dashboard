import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPassword } from "@/lib/auth/password";
import { getUserByEmail, getUserById } from "@/lib/db/users";
import {
  ABSOLUTE_LIMIT_MS,
  canExtend,
  isExpired,
  nextActiveUntil,
} from "@/lib/auth/session-policy";

export const { handlers, auth, signIn, signOut } = NextAuth({
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
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) {
          return null;
        }

        const user = await getUserByEmail(email);
        if (!user) {
          return null;
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      const now = Date.now();

      // Fresh sign-in: start the 30-minute clock.
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: "admin" | "dentist" | "staff" }).role;
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
        const current = await getUserById(token.id as string);
        if (!current) {
          return null;
        }
        token.role = current.role;
        token.name = current.name;
        token.email = current.email;
        token.activeUntil = nextActiveUntil(now, token.signedInAt as number);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "dentist" | "staff";
      }
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
