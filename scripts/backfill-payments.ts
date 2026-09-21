import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * One-time backfill for the "payments" table, added alongside the
 * staggered-payments feature. Before this table existed, `amountPaid` on a
 * transaction WAS the collected amount; it's now reinterpreted as the
 * total amount due, with `payments` rows as the source of truth for what's
 * actually been collected (see the architecture note in schema.ts, on the
 * `payments` table's doc comment). Every transaction saved before this
 * migration has zero payment rows, which would make it read as "fully
 * unpaid" everywhere balance-due is shown — this backfills one payment row
 * per such transaction, equal to its existing `amountPaid`, so historical
 * transactions still read as fully paid.
 *
 * Safe to run more than once: it only inserts for transactions that don't
 * already have at least one payment row, so a manually-recorded partial
 * payment (or a previous backfill run) is never touched or duplicated.
 * Transactions with `amountPaid` of exactly 0 are skipped — there's
 * nothing to record.
 */
async function main() {
  const { listTransactions } = await import("../src/lib/db/transactions");
  const { bulkInsertPayments, listTransactionIdsWithPayments } = await import(
    "../src/lib/db/payments"
  );

  const [transactions, alreadyCovered] = await Promise.all([
    listTransactions(),
    listTransactionIdsWithPayments(),
  ]);

  const toBackfill = transactions.filter(
    (transaction) => transaction.amountPaid > 0 && !alreadyCovered.has(transaction.id),
  );

  if (toBackfill.length === 0) {
    console.log("Nothing to backfill — every transaction already has a payment record.");
    return;
  }

  await bulkInsertPayments(
    toBackfill.map((transaction) => ({
      transactionId: transaction.id,
      amount: transaction.amountPaid,
      paymentType: transaction.paymentType || "",
      // The transaction's own recorded date, not "now" — this is
      // historical data, so the payment should read as having happened
      // when the visit did.
      paidAt: new Date(`${transaction.date}T00:00:00Z`),
      notes: "Backfilled from the transaction's original amount paid.",
    })),
  );

  console.log(`Backfilled ${toBackfill.length} payment record(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
