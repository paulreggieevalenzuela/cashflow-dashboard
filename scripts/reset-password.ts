import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Break-glass: gives ONE account a new temporary password from the command
 * line. For the case nobody can do it from the Users screen, mainly the
 * superuser who forgot their password (no one is above them). The person must
 * choose their own password when they sign in, and every device they were
 * signed in on is signed out.
 *
 *   yarn db:reset-password someone@example.com
 *
 * The temporary password is printed once, here. It is never stored in
 * readable form and never written to the audit trail. Run this only on a
 * computer you trust, with the database connection in .env.local.
 */
async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: yarn db:reset-password <email>");
    process.exit(1);
  }

  const { hashPassword } = await import("../src/lib/auth/password");
  const { generateTempPassword, tempPasswordExpiry } = await import("../src/lib/auth/temp-password");
  const { getUserByEmail, setUserPassword, passwordSchemaReady } = await import("../src/lib/db/users");
  const { recordLoginAttempt } = await import("../src/lib/db/login-attempts");
  const { logAudit } = await import("../src/lib/db/audit");

  if (!(await passwordSchemaReady())) {
    console.error("Run scripts/sql/2026-11-password-management.sql in Neon first.");
    process.exit(1);
  }

  const user = await getUserByEmail(email);
  if (!user) {
    console.error(`No account has the e-mail ${email}.`);
    process.exit(1);
  }

  const tempPassword = generateTempPassword();
  const expiresAt = tempPasswordExpiry();
  await setUserPassword({
    id: user.id,
    passwordHash: await hashPassword(tempPassword),
    mustChange: true,
    tempPasswordExpiresAt: expiresAt,
  });
  // A correct sign-in resets the wrong-password count, so this clears a lock.
  await recordLoginAttempt({
    emailKey: user.email,
    ip: "",
    userAgent: "password reset from the command line",
    outcome: "ok",
  });
  await logAudit({
    action: "user.password_reset",
    entityType: "user",
    entityId: user.id,
    summary: `The password of ${user.name} (${user.email}) was reset from the command line`,
    actor: { userId: null, name: "System (command line)" },
  });

  console.log(`Temporary password for ${user.email}: ${tempPassword}`);
  console.log(`Valid until ${expiresAt.toLocaleString()}. They must choose their own password at sign-in.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
