"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  getInvoiceForEditAction,
  removeInvoiceAction,
} from "@/app/cashflow/actions";
import {
  approveVisitsHqAction,
  checkVisitsAction,
  uncheckVisitAction,
} from "@/app/cashflow/transactions/check-actions";
import { LoaPendingBadge } from "@/components/cashflow/loa-pending-badge";
import { Spinner } from "@/components/ui/spinner";
import {
  approvalStageOf,
  canApproveVisitHq,
  canCheckVisit,
  checkStateOf,
  formatCheckedAt,
  isVisitLocked,
  NO_CHECK,
  type VisitCheck,
} from "@/lib/cashflow/transaction-lock";
import { PaymentsManager } from "@/components/cashflow/payments-manager";
import { TransactionForm } from "@/components/cashflow/transaction-form";
import {
  buildTransactionsSearch,
  type TransactionSortKey,
  type TransactionsQueryParams,
} from "@/lib/cashflow/transactions-query";
import { Modal } from "@/components/ui/modal";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import type { Branch } from "@/lib/db/branches";
import type { Invoice, InvoiceSummary } from "@/lib/db/invoices";
import type { Payment } from "@/lib/db/payments";
import type { DiscountTypeOption } from "@/lib/db/discount-types";
import type { ProcedureOption } from "@/lib/db/procedures";

/**
 * Keyed by invoice id, as a plain object (a `Map` doesn't survive the
 * Server -> Client Component boundary as cleanly). Carries what the table
 * needs per visit without loading every line: the invoice number, how many
 * procedures it has, what is due and what has been collected. A transaction
 * whose invoice is missing from here is shown as "not paid".
 */
export type InvoiceSummaries = Record<string, InvoiceSummary>;

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
  const nextDir: "asc" | "desc" =
    isActive && query.dir === "asc" ? "desc" : "asc";
  const href = `/cashflow/transactions${buildTransactionsSearch(query, {
    sort: column,
    dir: nextDir,
    page: 1,
  })}`;

  return (
    <th
      className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : ""}`}
    >
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

function BalanceBadge({
  amountPaid,
  collected,
}: {
  amountPaid: number;
  collected: number;
}) {
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

function ApprovedIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function RowActionsMenu({
  transaction,
  canDelete,
  isRemoving,
  onRemove,
  onEdit,
  editLocked = false,
  lockedNote,
}: {
  transaction: CashflowTransaction;
  canDelete: boolean;
  isRemoving: boolean;
  onRemove: () => void;
  onEdit: () => void;
  /** Cleared visits can be edited only by admins and staff. */
  editLocked?: boolean;
  /** Shown instead of the default reason when the visit is checked and locked. */
  lockedNote?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Same click-outside / Escape pattern as the header's account menu — the
  // listeners are only attached while open, and every setState call lives
  // inside their callbacks rather than the effect body.
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4.5 w-4.5"
          aria-hidden="true"
        >
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 text-zinc-400"
              aria-hidden="true"
            >
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
            disabled={editLocked}
            title={
              editLocked
                ? (lockedNote ??
                  "Cleared visits are locked. An admin or staff member can correct it.")
                : undefined
            }
            onClick={() => {
              setIsOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-50 hover:text-amber-700 dark:text-zinc-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 text-zinc-400"
              aria-hidden="true"
            >
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
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
  canEditCleared = false,
  invoiceSummaries = {},
  query,
  hasActiveFilters = false,
  dentistOptions,
  branches,
  procedures,
  discountTypes,
  visitChecks = {},
  checksReady = false,
  canVerify = false,
  canVerifyHq = false,
  hqReady = false,
  currentUserId = null,
  isSuperuser = false,
}: {
  transactions: CashflowTransaction[];
  canDelete?: boolean;
  /** Admins and staff can edit a Cleared visit; dentists cannot. */
  canEditCleared?: boolean;
  invoiceSummaries?: InvoiceSummaries;
  query: TransactionsQueryParams;
  hasActiveFilters?: boolean;
  dentistOptions: string[];
  branches: Branch[];
  procedures: ProcedureOption[];
  discountTypes: DiscountTypeOption[];
  /** The daily check per visit (how many lines are ticked, by whom, when). */
  visitChecks?: Record<string, VisitCheck>;
  /** False until the transaction_checks SQL script has been run. */
  checksReady?: boolean;
  /** May give the Branch manager check (the first one). */
  canVerify?: boolean;
  /** May give the Headquarters check (the second one). */
  canVerifyHq?: boolean;
  /** False until scripts/sql/2026-11-transaction-hq-checks.sql has been run. */
  hqReady?: boolean;
  /** The signed-in person (Headquarters can't be the one who gave the Branch check). */
  currentUserId?: string | null;
  /** The superuser can still edit a checked visit, and unlock it. */
  isSuperuser?: boolean;
}) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  // The daily check: visits ticked on this page, waiting for "Check and lock".
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  // Headquarters' own selection (visits the Branch manager has already checked).
  const [selectedHq, setSelectedHq] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [checkNotice, setCheckNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const checkOf = (invoiceId: string | null | undefined): VisitCheck =>
    (invoiceId && visitChecks[invoiceId]) || NO_CHECK;
  const showCheckColumn =
    canVerify ||
    canVerifyHq ||
    isSuperuser ||
    transactions.some((row) => isVisitLocked(checkOf(row.invoiceId)));
  const eligible = (row: CashflowTransaction) =>
    canVerify &&
    checksReady &&
    Boolean(row.invoiceId) &&
    canCheckVisit({
      status: (row.invoiceId && invoiceSummaries[row.invoiceId]?.status) || "",
      procedures: [row.procedure],
      state: checkStateOf(checkOf(row.invoiceId)),
    }).ok;
  const hqDecision = (row: CashflowTransaction) =>
    canApproveVisitHq({
      check: checkOf(row.invoiceId),
      actorUserId: currentUserId,
      isSuperuser,
    });
  const eligibleHq = (row: CashflowTransaction) =>
    canVerifyHq && hqReady && Boolean(row.invoiceId) && hqDecision(row).ok;
  const eligibleHqIds = transactions.flatMap((row) =>
    eligibleHq(row) && row.invoiceId ? [row.invoiceId] : [],
  );
  const allHqSelected =
    eligibleHqIds.length > 0 && eligibleHqIds.every((id) => selectedHq.has(id));
  const eligibleIds = transactions.flatMap((row) =>
    eligible(row) && row.invoiceId ? [row.invoiceId] : [],
  );
  const allSelected =
    eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id));

  function toggleOne(invoiceId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  }

  function toggleOneHq(invoiceId: string) {
    setSelectedHq((current) => {
      const next = new Set(current);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  }

  async function handleApproveSelected() {
    const ids = [...selectedHq];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Approve ${ids.length} ${ids.length === 1 ? "visit" : "visits"} as Headquarters? This is the last check.`,
      )
    ) {
      return;
    }
    setApproving(true);
    setCheckNotice(null);
    try {
      const result = await approveVisitsHqAction(ids);
      setCheckNotice({ ok: result.ok, text: result.message });
      setSelectedHq(new Set());
      router.refresh();
    } finally {
      setApproving(false);
    }
  }

  async function handleCheckSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Check ${ids.length} ${ids.length === 1 ? "visit" : "visits"}? Each will be locked: only the superuser can edit, remove or unlock it.`,
      )
    ) {
      return;
    }
    setChecking(true);
    setCheckNotice(null);
    try {
      const result = await checkVisitsAction(ids);
      setCheckNotice({ ok: result.ok, text: result.message });
      setSelected(new Set());
      router.refresh();
    } finally {
      setChecking(false);
    }
  }

  async function handleUnlock(invoiceId: string) {
    if (!window.confirm("Unlock this visit so it can be edited again?")) return;
    setUnlockingId(invoiceId);
    setCheckNotice(null);
    try {
      const result = await uncheckVisitAction(invoiceId);
      setCheckNotice({ ok: result.ok, text: result.message });
      router.refresh();
    } finally {
      setUnlockingId(null);
    }
  }
  // One shared modal for the whole table rather than one per row — opened
  // by whichever row's action menu was used to edit. The visit's full set of
  // lines is fetched when it opens (the table only holds this page's rows).
  const [editing, setEditing] = useState<{
    transaction: CashflowTransaction;
    data: {
      invoice: Invoice;
      lines: CashflowTransaction[];
      payments: Payment[];
    } | null;
    error: string | null;
  } | null>(null);

  async function openEditor(transaction: CashflowTransaction) {
    if (!transaction.invoiceId) {
      window.alert(
        "This transaction isn't linked to an invoice yet, so it can't be edited here.",
      );
      return;
    }
    setEditing({ transaction, data: null, error: null });
    const result = await getInvoiceForEditAction(transaction.invoiceId);
    setEditing((current) =>
      current && current.transaction.id === transaction.id
        ? result.ok
          ? { ...current, data: result.data }
          : { ...current, error: result.message }
        : current,
    );
  }

  // After a payment is recorded or removed in the pop-up, reload this visit's
  // payments (the pop-up holds its own copy) without touching the form.
  async function reloadPayments(invoiceId: string) {
    const result = await getInvoiceForEditAction(invoiceId);
    if (!result.ok) return;
    setEditing((current) =>
      current?.data && current.data.invoice.id === invoiceId
        ? {
            ...current,
            data: { ...current.data, payments: result.data.payments },
          }
        : current,
    );
  }

  async function handleRemove(transaction: CashflowTransaction) {
    if (!transaction.invoiceId) {
      window.alert(
        "This transaction isn't linked to an invoice, so it can't be removed here.",
      );
      return;
    }
    const lineCount = invoiceSummaries[transaction.invoiceId]?.lineCount ?? 1;
    const what =
      lineCount > 1
        ? `this visit (${lineCount} procedures)`
        : "this transaction";
    if (!window.confirm(`Remove ${what} for ${transaction.patientName}?`)) {
      return;
    }
    setRemovingId(transaction.id);
    try {
      await removeInvoiceAction(transaction.invoiceId);
      router.refresh();
    } finally {
      setRemovingId(null);
    }
  }

  const editModal = (
    <Modal
      open={editing !== null}
      onClose={() => setEditing(null)}
      title="Edit transaction"
      size="wide"
      description={
        editing
          ? `${editing.transaction.patientName} · ${editing.transaction.date}`
          : undefined
      }
    >
      {editing?.data && (
        <div className="space-y-6">
          <TransactionForm
            mode="edit"
            invoice={editing.data.invoice}
            lines={editing.data.lines}
            dentistOptions={dentistOptions}
            branches={branches}
            procedures={procedures}
            discountTypes={discountTypes}
            onSuccess={() => setEditing(null)}
          />
          {/* Same Payments section as the Edit transaction pop-up on the
              visit page: what was paid and how, and record / remove. */}
          <PaymentsManager
            invoiceId={editing.data.invoice.id}
            totalDue={editing.data.lines.reduce(
              (sum, line) => sum + line.amountPaid,
              0,
            )}
            payments={editing.data.payments}
            onChanged={() => void reloadPayments(editing.data!.invoice.id)}
          />
        </div>
      )}
      {editing && !editing.data && !editing.error && (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Loading...
        </p>
      )}
      {editing?.error && (
        <p
          role="alert"
          className="py-6 text-center text-sm text-red-600 dark:text-red-400"
        >
          {editing.error}
        </p>
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
    <>
    {checkNotice && (
      <p
        role={checkNotice.ok ? "status" : "alert"}
        className={`mb-3 rounded-lg border px-4 py-3 text-sm ${
          checkNotice.ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
            : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        }`}
      >
        {checkNotice.text}
      </p>
    )}
    {canVerify && selected.size > 0 && (
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        <span>
          {selected.size} {selected.size === 1 ? "visit" : "visits"} selected for the Branch
          manager check. Checking locks them: only the superuser can edit, remove or unlock
          them. Headquarters checks them next.
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={checking}
            className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={() => void handleCheckSelected()}
            disabled={checking}
            aria-busy={checking}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {checking && <Spinner className="h-3 w-3" />}
            {checking ? "Checking..." : `Check and lock ${selected.size}`}
          </button>
        </span>
      </div>
    )}
    {canVerifyHq && selectedHq.size > 0 && (
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
        <span>
          {selectedHq.size} {selectedHq.size === 1 ? "visit" : "visits"} selected for the
          Headquarters check. This is the last check.
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedHq(new Set())}
            disabled={approving}
            className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={() => void handleApproveSelected()}
            disabled={approving}
            aria-busy={approving}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {approving && <Spinner className="h-3 w-3" />}
            {approving ? "Approving..." : `Approve ${selectedHq.size} as Headquarters`}
          </button>
        </span>
      </div>
    )}
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            {showCheckColumn && (
              <>
                <th className="w-20 px-3 py-3 text-center font-medium">
                  <span className="block text-[10px] leading-none">Branch</span>
                  {canVerify ? (
                    <input
                      type="checkbox"
                      aria-label="Select every visit on this page that the Branch manager can check"
                      title="Select every visit on this page that can be checked"
                      checked={allSelected}
                      disabled={eligibleIds.length === 0 || checking}
                      onChange={() =>
                        setSelected(allSelected ? new Set() : new Set(eligibleIds))
                      }
                      className="mx-auto mt-1.5 block h-4 w-4 rounded border-zinc-300 accent-emerald-600 disabled:opacity-40"
                    />
                  ) : (
                    <span className="sr-only">Checked by the Branch manager</span>
                  )}
                </th>
                <th className="w-28 px-6 py-3 text-center font-medium">
                  <span className="block text-[10px] leading-none">HQ</span>
                  {canVerifyHq ? (
                    <input
                      type="checkbox"
                      aria-label="Select every visit on this page that Headquarters can approve"
                      title="Select every visit on this page that Headquarters can approve"
                      checked={allHqSelected}
                      disabled={eligibleHqIds.length === 0 || approving}
                      onChange={() =>
                        setSelectedHq(allHqSelected ? new Set() : new Set(eligibleHqIds))
                      }
                      className="mx-auto mt-1.5 block h-4 w-4 rounded border-zinc-300 accent-sky-600 disabled:opacity-40"
                    />
                  ) : (
                    <span className="sr-only">Approved by Headquarters</span>
                  )}
                </th>
              </>
            )}
            <SortableHeader label="Date" column="date" query={query} />
            <SortableHeader
              label="Patient"
              column="patientName"
              query={query}
            />
            <SortableHeader label="Dentist" column="dentist" query={query} />
            <th className="px-4 py-3 font-medium">Procedure</th>
            <th className="px-4 py-3 font-medium">Payment</th>
            <SortableHeader
              label="Amount paid"
              column="amountPaid"
              query={query}
              align="right"
            />
            <SortableHeader
              label="Net collection"
              column="netCollection"
              query={query}
              align="right"
            />
            <th className="px-4 py-3 font-medium">Balance</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {transactions.map((transaction) => {
            const summary = transaction.invoiceId
              ? invoiceSummaries[transaction.invoiceId]
              : undefined;
            const check = checkOf(transaction.invoiceId);
            const isChecked = isVisitLocked(check);
            const checkedLock = isChecked && !isSuperuser;
            const canTick = eligible(transaction);
            const why =
              !isChecked && canVerify
                ? canCheckVisit({
                    status: summary?.status ?? "",
                    procedures: [transaction.procedure],
                    state: "none",
                  })
                : null;

            return (
              <tr
                key={transaction.id}
                className={`text-zinc-700 dark:text-zinc-300 ${
                  isChecked ? "bg-emerald-50/40 dark:bg-emerald-950/20" : ""
                }`}
              >
                {showCheckColumn && (
                  <>
                  <td className="w-20 px-3 py-3 text-center">
                    {isChecked ? (
                      isSuperuser ? (
                        <button
                          type="button"
                          onClick={() =>
                            transaction.invoiceId && void handleUnlock(transaction.invoiceId)
                          }
                          disabled={unlockingId === transaction.invoiceId}
                          title={`Checked by the Branch manager: ${check.checkedBy || "someone"}${check.checkedAt ? ` on ${formatCheckedAt(check.checkedAt)}` : ""}. Click to unlock (removes both checks).`}
                          aria-label="Checked and locked. Click to unlock."
                          className="inline-flex h-5 w-5 items-center justify-center rounded text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                        >
                          {unlockingId === transaction.invoiceId ? (
                            <Spinner className="h-3.5 w-3.5" />
                          ) : (
                            <LockIcon />
                          )}
                        </button>
                      ) : (
                        <span
                          title={`Checked by the Branch manager: ${check.checkedBy || "someone"}${check.checkedAt ? ` on ${formatCheckedAt(check.checkedAt)}` : ""}. Locked: only the superuser can change it.`}
                          className="inline-flex h-5 w-5 items-center justify-center text-emerald-600 dark:text-emerald-400"
                        >
                          <LockIcon />
                          <span className="sr-only">Checked and locked</span>
                        </span>
                      )
                    ) : canVerify ? (
                      <input
                        type="checkbox"
                        aria-label={`Check the visit of ${transaction.patientName}`}
                        title={
                          canTick
                            ? "Tick to check this visit, then press Check and lock"
                            : !checksReady
                              ? "Run the transaction-checks SQL script first."
                              : (why && !why.ok ? why.reason : undefined)
                        }
                        disabled={!canTick || checking}
                        checked={Boolean(
                          transaction.invoiceId && selected.has(transaction.invoiceId),
                        )}
                        onChange={() =>
                          transaction.invoiceId && toggleOne(transaction.invoiceId)
                        }
                        className="h-4 w-4 rounded border-zinc-300 accent-emerald-600 disabled:opacity-40"
                      />
                    ) : null}
                  </td>
                  <td className="w-28 px-6 py-3 text-center">
                    {(() => {
                      const stage = approvalStageOf(check);
                      if (stage === "approved") {
                        return (
                          <span
                            title={`Approved by Headquarters: ${check.hqCheckedBy || "someone"}${check.hqCheckedAt ? ` on ${formatCheckedAt(check.hqCheckedAt)}` : ""}.`}
                            className="inline-flex h-5 w-5 items-center justify-center text-sky-600 dark:text-sky-400"
                          >
                            <ApprovedIcon />
                            <span className="sr-only">Approved by Headquarters</span>
                          </span>
                        );
                      }
                      if (stage === "none") {
                        return (
                          <span
                            title="Waits for the Branch manager's check first."
                            className="text-zinc-300 dark:text-zinc-700"
                          >
                            &ndash;
                          </span>
                        );
                      }
                      // Checked by the branch, waiting for Headquarters.
                      if (!canVerifyHq) {
                        return (
                          <span
                            title="Checked by the Branch manager. Waiting for Headquarters."
                            className="text-[11px] font-medium text-amber-600 dark:text-amber-400"
                          >
                            Waiting
                          </span>
                        );
                      }
                      const decision = hqDecision(transaction);
                      return (
                        <input
                          type="checkbox"
                          aria-label={`Approve the visit of ${transaction.patientName} as Headquarters`}
                          title={
                            !hqReady
                              ? "Run the Headquarters SQL script first."
                              : decision.ok
                                ? "Tick to approve this visit as Headquarters, then press Approve"
                                : decision.reason
                          }
                          disabled={!eligibleHq(transaction) || approving}
                          checked={Boolean(
                            transaction.invoiceId && selectedHq.has(transaction.invoiceId),
                          )}
                          onChange={() =>
                            transaction.invoiceId && toggleOneHq(transaction.invoiceId)
                          }
                          className="h-4 w-4 rounded border-zinc-300 accent-sky-600 disabled:opacity-40"
                        />
                      );
                    })()}
                  </td>
                  </>
                )}
                <td className="whitespace-nowrap px-4 py-3">
                  {transaction.date}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/cashflow/transactions/${encodeURIComponent(transaction.id)}`}
                    className="font-medium text-amber-700 hover:underline dark:text-amber-400"
                  >
                    {transaction.patientName}
                  </Link>
                  {summary &&
                    (summary.invoiceNumber || summary.lineCount > 1) && (
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        {summary.invoiceNumber
                          ? `Inv. ${summary.invoiceNumber}`
                          : ""}
                        {summary.invoiceNumber && summary.lineCount > 1
                          ? " · "
                          : ""}
                        {summary.lineCount > 1
                          ? `${summary.lineCount} procedures`
                          : ""}
                      </span>
                    )}
                  {summary?.loaPending && (
                    <span className="mt-1 block">
                      <LoaPendingBadge />
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {transaction.dentist || "—"}
                </td>
                <td className="px-4 py-3">{transaction.procedure}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {transaction.paymentType || "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {currencyFormatter.format(transaction.amountPaid)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {currencyFormatter.format(transaction.netCollection)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <BalanceBadge
                    amountPaid={
                      summary ? summary.totalDue : transaction.amountPaid
                    }
                    collected={summary ? summary.collected : 0}
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex items-center justify-end">
                    <RowActionsMenu
                      transaction={transaction}
                      canDelete={canDelete && !checkedLock}
                      isRemoving={removingId === transaction.id}
                      onRemove={() => handleRemove(transaction)}
                      onEdit={() => openEditor(transaction)}
                      editLocked={
                        checkedLock ||
                        (!canDelete &&
                          !canEditCleared &&
                          summary?.status === "Cleared")
                      }
                      lockedNote={
                        checkedLock
                          ? "Checked and locked. Only the superuser can change it."
                          : undefined
                      }
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
    </>
  );
}
