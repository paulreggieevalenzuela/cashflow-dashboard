import Link from "next/link";
import { auth } from "@/auth";
import { TransactionDetail } from "@/components/cashflow/transaction-detail";
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

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, transaction, dentists, branches, procedures] = await Promise.all([
    auth(),
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

  // Any line of a visit opens the whole visit.
  const detail = await getInvoiceDetail(transaction.invoiceId);
  if (!detail || detail.lines.length === 0) {
    return <NotFound message="We couldn't find that transaction. It may have been removed." />;
  }

  return (
    <TransactionDetail
      detail={detail}
      openedLineId={transaction.id}
      canDelete={session?.user.role === "admin"}
      dentistOptions={dentists.map((dentist) => dentist.name)}
      branches={branches}
      procedures={procedures}
    />
  );
}
