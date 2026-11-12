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

  const all = await listTransactions();
  // Checked (locked) lines are never re-priced: they keep the numbers they
  // were checked with. (Nothing is skipped until the checks table exists.)
  const { getVisitChecks } = await import("../src/lib/db/transaction-checks");
  const invoiceIds = [...new Set(all.flatMap((row) => (row.invoiceId ? [row.invoiceId] : [])))];
  const checks = await getVisitChecks(invoiceIds);
  const rows = all.filter((row) => !(row.invoiceId && (checks[row.invoiceId]?.checked ?? 0) > 0));
  const skipped = all.length - rows.length;
  if (rows.length === 0) {
    console.log("No transactions to backfill.");
    return;
  }

  await upsertTransactions(rows);
  console.log(
    `Backfilled dentist/procedure links and commission for ${rows.length} transaction(s)${skipped > 0 ? `; left ${skipped} checked (locked) line(s) as they are` : ""}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
