import Link from "next/link";
import type { Metadata } from "next";
import { InvoiceView } from "@/components/cashflow/invoice-view";
import { getBranchById } from "@/lib/db/branches";
import { listPaymentsForTransaction } from "@/lib/db/payments";
import { getTransactionById } from "@/lib/db/transactions";

export const metadata: Metadata = {
  title: "Invoice",
};

export default async function TransactionInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const transaction = await getTransactionById(decodeURIComponent(id));

  if (!transaction) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        <p>We couldn&apos;t find that transaction. It may have been removed.</p>
        <Link
          href="/cashflow/transactions"
          className="mt-3 inline-block font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
        >
          ← Back to transactions
        </Link>
      </div>
    );
  }

  const [payments, branch] = await Promise.all([
    listPaymentsForTransaction(transaction.id),
    transaction.branchId ? getBranchById(transaction.branchId) : Promise.resolve(undefined),
  ]);

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link
          href={`/cashflow/transactions/${encodeURIComponent(transaction.id)}`}
          className="text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
        >
          ← Back to transaction
        </Link>
      </div>
      <InvoiceView transaction={transaction} payments={payments} branchName={branch?.name} />
    </div>
  );
}
