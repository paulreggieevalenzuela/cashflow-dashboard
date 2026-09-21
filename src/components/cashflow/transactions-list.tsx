import { Suspense } from "react";
import { AddTransactionModal } from "@/components/cashflow/add-transaction-modal";
import { TransactionsPagination } from "@/components/cashflow/transactions-pagination";
import { TransactionsToolbar } from "@/components/cashflow/transactions-toolbar";
import {
  TransactionsTable,
  type CollectedTotals,
} from "@/components/cashflow/transactions-table";
import { hasActiveTransactionFilters, type TransactionsQueryParams } from "@/lib/cashflow/transactions-query";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import type { Branch } from "@/lib/db/branches";

export function TransactionsList({
  transactions,
  canDelete = false,
  query,
  total,
  totalPages,
  dentistOptions,
  branches,
  procedures,
  collectedTotals,
}: {
  transactions: CashflowTransaction[];
  canDelete?: boolean;
  query: TransactionsQueryParams;
  total: number;
  totalPages: number;
  dentistOptions: string[];
  branches: Branch[];
  procedures: string[];
  collectedTotals: CollectedTotals;
}) {
  const filtered = hasActiveTransactionFilters(query);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            All transactions
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {total} {filtered ? "matching" : "recorded"}. Click a patient name to see the full detail.
          </p>
        </div>
        <AddTransactionModal
          dentistOptions={dentistOptions}
          branches={branches}
          procedures={procedures}
        />
      </div>
      <TransactionsToolbar query={query} dentistOptions={dentistOptions} />
      <TransactionsTable
        transactions={transactions}
        canDelete={canDelete}
        collectedTotals={collectedTotals}
        query={query}
        hasActiveFilters={filtered}
        dentistOptions={dentistOptions}
        branches={branches}
        procedures={procedures}
      />
      {/* useSearchParams() inside TransactionsPagination needs a Suspense
          boundary — otherwise Next.js bails this route out of static
          rendering (it's already dynamic here, but this keeps it warning-free
          and future-proof if that ever changes). */}
      <Suspense fallback={null}>
        <TransactionsPagination
          page={query.page}
          pageSize={query.pageSize}
          total={total}
          totalPages={totalPages}
        />
      </Suspense>
    </div>
  );
}
