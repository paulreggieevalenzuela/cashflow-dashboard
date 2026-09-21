import Link from "next/link";
import { auth } from "@/auth";
import { TransactionDetail } from "@/components/cashflow/transaction-detail";
import { listBranches } from "@/lib/db/branches";
import { listDentistUsers } from "@/lib/db/dentists";
import { listPaymentsForTransaction } from "@/lib/db/payments";
import { listProcedures } from "@/lib/db/procedures";
import { getTransactionById } from "@/lib/db/transactions";

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
    listProcedures(),
  ]);

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

  const canDelete = session?.user.role === "admin";
  const payments = await listPaymentsForTransaction(transaction.id);

  return (
    <TransactionDetail
      transaction={transaction}
      canDelete={canDelete}
      payments={payments}
      dentistOptions={dentists.map((dentist) => dentist.name)}
      branches={branches}
      procedures={procedures.map((procedure) => procedure.name)}
    />
  );
}
