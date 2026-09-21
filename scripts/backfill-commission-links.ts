import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * One-time backfill for transactions that were saved before the
 * dentist-account link, procedure link, and commission columns existed.
 * Re-runs every existing row back through `upsertTransactions`, which
 * resolves those three fields the same way a fresh save does — so this is
 * just "touch every row once" rather than separate logic to maintain.
 *
 * Safe to run more than once (upsert by id; a row with no dentist/procedure
 * match just gets re-resolved to the same nulls/zero it already had).
 */
async function main() {
  const { listTransactions, upsertTransactions } = await import("../src/lib/db/transactions");

  const rows = await listTransactions();
  if (rows.length === 0) {
    console.log("No transactions to backfill.");
    return;
  }

  await upsertTransactions(rows);
  console.log(
    `Backfilled dentist/procedure links and commission for ${rows.length} transaction(s).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
