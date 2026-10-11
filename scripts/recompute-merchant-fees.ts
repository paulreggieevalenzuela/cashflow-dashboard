import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * One-time refresh of merchant fees on existing visits.
 *
 * The merchant fee is worked out from each payment's type (GHL 2.8%,
 * BDO 5%, MAYA 3.4%) and is INCLUDED in the payment: a 3,500 card payment
 * pays a 3,500 bill in full, the fee (175) comes out of it and the clinic's
 * net collection is 3,325. Visits saved earlier (fee typed by hand, or under
 * the short-lived "fee on top" rule) have other figures. This re-works the
 * visits that have a card payment (a payment type with a merchant fee), so
 * their merchant fee, net collection and commission match this rule.
 *
 * Visits with no card payment are never touched, so older hand-typed fees on
 * cash / GCash / HMO visits are left exactly as they are. Safe to run more
 * than once.
 */
async function main() {
  const { sql, inArray } = await import("drizzle-orm");
  const { db } = await import("../src/lib/db/client");
  const { payments } = await import("../src/lib/db/schema");
  const { recomputeInvoiceFees } = await import("../src/lib/db/invoices");
  const { MERCHANT_FEE_RATES } = await import("../src/lib/cashflow/pricing");

  const cardTypes = Object.keys(MERCHANT_FEE_RATES).map((name) => name.toLowerCase());
  const rows = await db
    .selectDistinct({ invoiceId: payments.invoiceId })
    .from(payments)
    .where(inArray(sql`lower(trim(${payments.paymentType}))`, cardTypes));

  const invoiceIds = rows.flatMap((row) => (row.invoiceId ? [row.invoiceId] : []));
  if (invoiceIds.length === 0) {
    console.log("No visits with a card payment — nothing to refresh.");
    return;
  }

  for (const invoiceId of invoiceIds) {
    await recomputeInvoiceFees(invoiceId);
  }
  console.log(`Refreshed the merchant fee on ${invoiceIds.length} visit(s) with a card payment.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
