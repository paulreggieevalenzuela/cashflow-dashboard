"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { removeTransactionAction } from "@/app/cashflow/actions";
import { TransactionForm } from "@/components/cashflow/transaction-form";
import {
  buildTransactionsSearch,
  type TransactionSortKey,
  type TransactionsQueryParams,
} from "@/lib/cashflow/transactions-query";
import { Modal } from "@/components/ui/modal";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import type { Branch } from "@/lib/db/branches";

/**
 * Keyed by transaction id, in the whole-cents-safe plain-number form a
 * Server Component can pass a Client Component (a `Map` doesn't survive
 * that boundary as cleanly as a plain object). A missing key means "no
 * payments recorded yet" — same as an explicit 0.
 */
export type CollectedTotals = Record<string, number>;

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

function SortableHeader({
  label,
  column,
  query,
  align = "left",
}: {
  label: string;
  column: TransactionSortKey;
  query: TransactionsQueryParams;
  align?: "left" | "right";
}) {
  const isActive = query.sort === column;
  const nextDir: "asc" | "desc" = isActive && query.dir === "asc" ? "desc" : "asc";
  const href = `/cashflow/transactions${buildTransactionsSearch(query, {
    sort: column,
    dir: nextDir,
    page: 1,
  })}`;

  return (
    <th className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : ""}`}>
      <Link
        href={href}
        className={`inline-flex items-center gap-1 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100 ${
          align === "right" ? "flex-row-reverse" : ""
        } ${isActive ? "text-zinc-900 dark:text-zinc-100" : ""}`}
      >
        {label}
        <span className="text-[10px] leading-none" aria-hidden="true">
          {isActive ? (query.dir === "desc" ? "▼" : "▲") : "⇅"}
        </span>
      </Link>
    </th>
  );
}

function BalanceBadge({ amountPaid, collected }: { amountPaid: number; collected: number }) {
  const balanceDue = Math.max(amountPaid - collected, 0);

  if (balanceDue < 0.01) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
        Paid
      </span>
    );
  }

  if (collected > 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        {currencyFormatter.format(balanceDue)} due
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      Not paid
    </span>
  );
}

function RowActionsMenu({
  transaction,
  canDelete,
  isRemoving,
  onRemove,
  onEdit,
}: {
  transaction: CashflowTransaction;
  canDelete: boolean;
  isRemoving: boolean;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Same click-outside / Escape pattern as the header's account menu — the
  // listeners are only attached while open, and every setState call lives
  // inside their callbacks rather than the effect body.
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Actions for ${transaction.patientName}`}
        className="inline-flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4.5 w-4.5" aria-hidden="true">
          <path d="M10 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM10 11.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM10 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="animate-modal-panel-in absolute right-0 top-full z-30 mt-1 w-36 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          <Link
            href={`/cashflow/transactions/${encodeURIComponent(transaction.id)}`}
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-amber-50 hover:text-amber-700 dark:text-zinc-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-zinc-400" aria-hidden="true">
              <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
              <path
                fillRule="evenodd"
                d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
                clipRule="evenodd"
              />
            </svg>
            View
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-amber-50 hover:text-amber-700 dark:text-zinc-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-zinc-400" aria-hidden="true">
              <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
            </svg>
            Edit
          </button>
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onRemove();
              }}
              disabled={isRemoving}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482 41.03 41.03 0 0 0-2.365-.298V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                  clipRule="evenodd"
                />
              </svg>
              {isRemoving ? "Removing..." : "Remove"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TransactionsTable({
  transactions,
  canDelete = false,
  collectedTotals = {},
  query,
  hasActiveFilters = false,
  dentistOptions,
  branches,
  procedures,
}: {
  transactions: CashflowTransaction[];
  canDelete?: boolean;
  collectedTotals?: CollectedTotals;
  query: TransactionsQueryParams;
  hasActiveFilters?: boolean;
  dentistOptions: string[];
  branches: Branch[];
  procedures: string[];
}) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  // One shared modal for the whole table rather than one per row — opened
  // by whichever row's action menu was used to edit.
  const [editingTransaction, setEditingTransaction] = useState<CashflowTransaction | null>(null);

  async function handleRemove(id: string, patientName: string) {
    if (!window.confirm(`Remove the transaction for ${patientName}?`)) {
      return;
    }
    setRemovingId(id);
    try {
      await removeTransactionAction(id);
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  const editModal = (
    <Modal
      open={editingTransaction !== null}
      onClose={() => setEditingTransaction(null)}
      title="Edit transaction"
      description={editingTransaction ? `${editingTransaction.patientName} · ${editingTransaction.date}` : undefined}
    >
      {editingTransaction && (
        <TransactionForm
          mode="edit"
          transaction={editingTransaction}
          dentistOptions={dentistOptions}
          branches={branches}
          procedures={procedures}
          onSuccess={() => setEditingTransaction(null)}
        />
      )}
    </Modal>
  );

  if (transactions.length === 0) {
    return (
      <>
        <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {hasActiveFilters
            ? "No transactions match your search or filters."
            : "No transactions yet. Add one manually or import a CSV."}
        </div>
        {editModal}
      </>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <SortableHeader label="Date" column="date" query={query} />
            <SortableHeader label="Patient" column="patientName" query={query} />
            <SortableHeader label="Dentist" column="dentist" query={query} />
            <th className="px-4 py-3 font-medium">Procedure</th>
            <th className="px-4 py-3 font-medium">Payment</th>
            <SortableHeader label="Amount paid" column="amountPaid" query={query} align="right" />
            <SortableHeader label="Net collection" column="netCollection" query={query} align="right" />
            <th className="px-4 py-3 font-medium">Balance</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {transactions.map((transaction) => {
            const collected = collectedTotals[transaction.id] ?? 0;

            return (
            <tr key={transaction.id} className="text-zinc-700 dark:text-zinc-300">
              <td className="whitespace-nowrap px-4 py-3">{transaction.date}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/cashflow/transactions/${encodeURIComponent(transaction.id)}`}
                  className="font-medium text-amber-700 hover:underline dark:text-amber-400"
                >
                  {transaction.patientName}
                </Link>
              </td>
              <td className="whitespace-nowrap px-4 py-3">{transaction.dentist || "—"}</td>
              <td className="px-4 py-3">{transaction.procedure}</td>
              <td className="whitespace-nowrap px-4 py-3">{transaction.paymentType || "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {currencyFormatter.format(transaction.amountPaid)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {currencyFormatter.format(transaction.netCollection)}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <BalanceBadge amountPaid={transaction.amountPaid} collected={collected} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <div className="flex items-center justify-end">
                  <RowActionsMenu
                    transaction={transaction}
                    canDelete={canDelete}
                    isRemoving={removingId === transaction.id}
                    onRemove={() => handleRemove(transaction.id, transaction.patientName)}
                    onEdit={() => setEditingTransaction(transaction)}
                  />
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {editModal}
    </div>
  );
}
