import Link from "next/link";
import { TransactionForm } from "@/components/cashflow/transaction-form";
import { listBranches } from "@/lib/db/branches";
import { listDentistUsers } from "@/lib/db/dentists";
import { listProcedures } from "@/lib/db/procedures";
import { getTransactionById } from "@/lib/db/transactions";

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
          {transaction.patientName} · {transaction.date}
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <TransactionForm
          mode="edit"
          transaction={transaction}
          dentistOptions={dentists.map((dentist) => dentist.name)}
          branches={branches}
          procedures={procedures.map((procedure) => procedure.name)}
        />
      </div>
    </div>
  );
}
