import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { SEED_TRANSACTIONS } = await import("../src/lib/cashflow/seed-data");
  const { importTransactionsWithInvoices } = await import("../src/lib/db/invoices");

  const summary = await importTransactionsWithInvoices(SEED_TRANSACTIONS, {
    branchId: null,
    userId: null,
  });
  console.log(
    `Seeded ${summary.lineCount} transactions across ${summary.invoiceCount} invoices (${summary.paymentCount} payments).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
