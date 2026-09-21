import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { SEED_TRANSACTIONS } = await import("../src/lib/cashflow/seed-data");
  const { upsertTransactions } = await import("../src/lib/db/transactions");

  await upsertTransactions(SEED_TRANSACTIONS);
  console.log(`Seeded ${SEED_TRANSACTIONS.length} transactions.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
