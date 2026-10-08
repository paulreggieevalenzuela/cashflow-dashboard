import Link from "next/link";
import { TransactionForm } from "@/components/cashflow/transaction-form";
import { listBranches } from "@/lib/db/branches";
import { listDentistUsers } from "@/lib/db/dentists";
import { getInvoiceDetail } from "@/lib/db/invoices";
import { listProcedureOptions } from "@/lib/db/procedures";
import { getTransactionById } from "@/lib/db/transactions";

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

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [transaction, dentists, branches, procedures] = await Promise.all([
    getTransactionById(decodeURIComponent(id)),
    listDentistUsers(),
    listBranches(),
    listProcedureOptions(),
  ]);

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

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/cashflow/transactions/${encodeURIComponent(transaction.id)}`}
          className="text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
        >
          ← Back to transaction
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Edit transaction
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {transaction.patientName} · {detail.invoice.visitDate}
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <TransactionForm
          mode="edit"
          invoice={detail.invoice}
          lines={detail.lines}
          dentistOptions={dentists.map((dentist) => dentist.name)}
          branches={branches}
          procedures={procedures}
        />
      </div>
    </div>
  );
}
