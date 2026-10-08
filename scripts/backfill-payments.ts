import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Backfill for visits that have NO payment record at all.
 *
 * Payments belong to an invoice, and "collected" is the sum of its payment
 * rows. Visits entered through the app before the Add Transaction form
 * started recording its first payment (and some old imports) have none, so
 * they read as "not paid" everywhere balance due is shown. This records one
 * payment per such invoice, equal to its total due, dated on the visit — so
 * historical visits read as fully paid.
 *
 * Only run it if those older visits really were paid in full. Visits that
 * already have any payment (typed in, imported, or from an earlier run) are
 * never touched, so it is safe to run more than once. Invoices with a total
 * of exactly 0 are skipped — nothing to record.
 */
async function main() {
  const { listTransactions } = await import("../src/lib/db/transactions");
  const { bulkInsertPayments, listInvoiceIdsWithPayments } =
    await import("../src/lib/db/payments");
  const { receivedForBill, round2 } =
    await import("../src/lib/cashflow/pricing");

  const [transactions, alreadyCovered] = await Promise.all([
    listTransactions(),
    listInvoiceIdsWithPayments(),
  ]);

  const byInvoice = new Map<
    string,
    { amount: number; paymentType: string; date: string }
  >();
  for (const transaction of transactions) {
    if (!transaction.invoiceId || alreadyCovered.has(transaction.invoiceId)) {
      continue;
    }
    const entry = byInvoice.get(transaction.invoiceId) ?? {
      amount: 0,
      paymentType: "",
      date: transaction.date,
    };
    entry.amount = round2(entry.amount + transaction.amountPaid);
    entry.paymentType = entry.paymentType || transaction.paymentType || "";
    entry.date = transaction.date < entry.date ? transaction.date : entry.date;
    byInvoice.set(transaction.invoiceId, entry);
  }

  const toBackfill = [...byInvoice.entries()].filter(
    ([, entry]) => entry.amount > 0,
  );

  if (toBackfill.length === 0) {
    console.log(
      "Nothing to backfill — every visit already has a payment record.",
    );
    return;
  }

  await bulkInsertPayments(
    toBackfill.map(([invoiceId, entry]) => ({
      invoiceId,
      // A card payment carries its merchant fee on top of the bill, so the
      // visit still reads as fully paid.
      amount: receivedForBill(entry.amount, entry.paymentType),
      paymentType: entry.paymentType,
      // The visit's own date, not "now" — this is historical data, so the
      // payment should read as having happened when the visit did.
      paidAt: new Date(`${entry.date}T00:00:00Z`),
      notes: "Backfilled from the visit's total amount due.",
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
