import { Suspense } from "react";
import { AddTransactionModal } from "@/components/cashflow/add-transaction-modal";
import { TransactionsPagination } from "@/components/cashflow/transactions-pagination";
import { TransactionsToolbar } from "@/components/cashflow/transactions-toolbar";
import {
  TransactionsTable,
  type InvoiceSummaries,
} from "@/components/cashflow/transactions-table";
import {
  hasActiveTransactionFilters,
  type TransactionsQueryParams,
} from "@/lib/cashflow/transactions-query";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import Link from "next/link";
import type { VisitCheck } from "@/lib/cashflow/transaction-lock";
import { buildTransactionsSearch } from "@/lib/cashflow/transactions-query";
import type { Branch } from "@/lib/db/branches";
import type { DiscountTypeOption } from "@/lib/db/discount-types";
import type { ProcedureOption } from "@/lib/db/procedures";

export function TransactionsList({
  transactions,
  canDelete = false,
  canEditCleared = false,
  query,
  total,
  totalPages,
  dentistOptions,
  branches,
  defaultBranchId,
  procedures,
  discountTypes,
  invoiceSummaries,
  visitChecks,
  checksReady,
  canVerify,
  canVerifyHq,
  hqReady,
  currentUserId,
  isSuperuser,
}: {
  transactions: CashflowTransaction[];
  canDelete?: boolean;
  canEditCleared?: boolean;
  query: TransactionsQueryParams;
  total: number;
  totalPages: number;
  dentistOptions: string[];
  branches: Branch[];
  /** The signed-in user's own branch: what the list shows by default. */
  defaultBranchId: string | null;
  procedures: ProcedureOption[];
  discountTypes: DiscountTypeOption[];
  invoiceSummaries: InvoiceSummaries;
  visitChecks: Record<string, VisitCheck>;
  /** False until scripts/sql/2026-11-transaction-checks.sql has been run. */
  checksReady: boolean;
  canVerify: boolean;
  /** May give the Headquarters check (the second one). */
  canVerifyHq: boolean;
  /** False until scripts/sql/2026-11-transaction-hq-checks.sql has been run. */
  hqReady: boolean;
  currentUserId: string | null;
  isSuperuser: boolean;
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
            {total} {filtered ? "matching" : "recorded"}. Click a patient name
            to see the full detail.
          </p>
        </div>
        <AddTransactionModal
          dentistOptions={dentistOptions}
          branches={branches}
          procedures={procedures}
          discountTypes={discountTypes}
        />
      </div>
      <TransactionsToolbar
        query={query}
        dentistOptions={dentistOptions}
        branches={branches}
        defaultBranchId={defaultBranchId}
      />
      {(canVerify || canVerifyHq || isSuperuser) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">Daily check:</span>
          {(
            [
              { value: undefined, label: "All" },
              { value: "no", label: "To check (Branch)" },
              { value: "hq", label: "Waiting for HQ" },
              { value: "approved", label: "Approved by HQ" },
            ] as const
          ).map((option) => (
            <Link
              key={option.label}
              href={`/cashflow/transactions${buildTransactionsSearch(query, { checked: option.value, page: 1 })}`}
              aria-current={query.checked === option.value ? "true" : undefined}
              className={`rounded-full border px-3 py-1 font-medium transition-colors ${
                query.checked === option.value
                  ? "border-amber-600 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      )}
      {checksReady && !hqReady && (canVerifyHq || isSuperuser) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          The Headquarters check isn&apos;t set up in the database yet. Run{" "}
          <code>scripts/sql/2026-11-transaction-hq-checks.sql</code> in Neon. Until
          then the Branch manager check works as before and Headquarters can&apos;t approve.
        </p>
      )}
      {!checksReady && (canVerify || isSuperuser) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Checking transactions isn&apos;t set up in the database yet. Run{" "}
          <code>scripts/sql/2026-11-transaction-checks.sql</code> in Neon. Until
          then nothing can be checked or locked.
        </p>
      )}
      <TransactionsTable
        transactions={transactions}
        visitChecks={visitChecks}
        checksReady={checksReady}
        canVerify={canVerify}
        canVerifyHq={canVerifyHq}
        hqReady={hqReady}
        currentUserId={currentUserId}
        isSuperuser={isSuperuser}
        canDelete={canDelete}
        canEditCleared={canEditCleared}
        invoiceSummaries={invoiceSummaries}
        query={query}
        hasActiveFilters={filtered}
        dentistOptions={dentistOptions}
        branches={branches}
        procedures={procedures}
        discountTypes={discountTypes}
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
