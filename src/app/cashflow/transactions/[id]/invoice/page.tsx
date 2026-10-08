import Link from "next/link";
import type { Metadata } from "next";
import { InvoiceView } from "@/components/cashflow/invoice-view";
import { getBranchById } from "@/lib/db/branches";
import { getInvoiceDetail } from "@/lib/db/invoices";
import { getTransactionById } from "@/lib/db/transactions";

export const metadata: Metadata = {
  title: "Invoice",
};

function NotFound({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      <p>{message}</p>
      <Link
        href="/cashflow/transactions"
        className="mt-3 inline-block font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
      >
        ← Back to transactions
      </Link>
    </div>
  );
}

export default async function TransactionInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const transaction = await getTransactionById(decodeURIComponent(id));

  if (!transaction) {
    return <NotFound message="We couldn't find that transaction. It may have been removed." />;
  }
  if (!transaction.invoiceId) {
    return (
      <NotFound message="This transaction isn't linked to an invoice yet. Run the database update script, then reload." />
    );
  }

  const detail = await getInvoiceDetail(transaction.invoiceId);
  if (!detail || detail.lines.length === 0) {
    return <NotFound message="We couldn't find that transaction. It may have been removed." />;
  }

  const branch = detail.invoice.branchId ? await getBranchById(detail.invoice.branchId) : undefined;

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
      <InvoiceView detail={detail} branchName={branch?.name} />
    </div>
  );
}
