import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Creates the first admin account so there's someone who can sign in and
 * add everyone else through Cashflow → Users. Safe to re-run: skips if the
 * email already exists rather than erroring or duplicating.
 *
 * Configure via env vars (in .env.local) or accept the defaults below, then:
 *   yarn db:seed-admin
 */
async function main() {
  const { hashPassword } = await import("../src/lib/auth/password");
  const { getUserByEmail, createUser } = await import("../src/lib/db/users");

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@yourclinic.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_ADMIN_NAME ?? "Clinic Admin";

  const existing = await getUserByEmail(email);
  if (existing) {
    console.log(`A user with email ${email} already exists — nothing to do.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await createUser({ name, email, passwordHash, role: "admin" });

  console.log(`Created admin account: ${email} / ${password}`);
  console.log("Sign in with this and change the password (or add your real account and remove this one) from Cashflow -> Users.");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
