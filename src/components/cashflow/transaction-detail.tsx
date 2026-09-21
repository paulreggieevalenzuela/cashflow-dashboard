"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeTransactionAction } from "@/app/cashflow/actions";
import { EditTransactionModal } from "@/components/cashflow/edit-transaction-modal";
import { PaymentsManager } from "@/components/cashflow/payments-manager";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import type { Branch } from "@/lib/db/branches";
import type { Payment } from "@/lib/db/payments";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

export function TransactionDetail({
  transaction,
  canDelete = false,
  payments,
  dentistOptions,
  branches,
  procedures,
}: {
  transaction: CashflowTransaction;
  canDelete?: boolean;
  payments: Payment[];
  dentistOptions: string[];
  branches: Branch[];
  procedures: string[];
}) {
  const router = useRouter();
  const [isRemoving, setIsRemoving] = useState(false);

  async function handleRemove() {
    if (!window.confirm(`Remove the transaction for ${transaction.patientName}?`)) {
      return;
    }
    setIsRemoving(true);
    try {
      await removeTransactionAction(transaction.id);
      router.push("/cashflow/transactions");
      router.refresh();
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Link
            href="/cashflow/transactions"
            className="text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
          >
            ← Back to transactions
          </Link>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {transaction.patientName}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {transaction.date} · {transaction.procedure}
          </p>
        </div>
        <div className="flex items-center gap-3 self-start">
          <Link
            href={`/cashflow/transactions/${encodeURIComponent(transaction.id)}/invoice`}
            className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Print invoice
          </Link>
          <EditTransactionModal
            transaction={transaction}
            dentistOptions={dentistOptions}
            branches={branches}
            procedures={procedures}
          />
          {canDelete && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isRemoving}
              className="rounded-lg border border-red-200 px-3.5 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              {isRemoving ? "Removing..." : "Remove transaction"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2">
        <DetailField label="Date" value={transaction.date} />
        <DetailField label="Visit ID" value={transaction.visitId} mono />
        <DetailField label="Patient name" value={transaction.patientName} />
        <DetailField label="Transaction type" value={transaction.transactionType} />
        <DetailField label="Visit type" value={transaction.visitType || "—"} />
        <DetailField label="Dentist" value={transaction.dentist || "—"} />
        <DetailField label="Procedure" value={transaction.procedure} />
        <DetailField label="Payment type" value={transaction.paymentType || "—"} />
        <DetailField label="Invoice number" value={transaction.invoiceNumber || "—"} />
        <DetailField label="Month / Year" value={`${transaction.month} ${transaction.year}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-3">
        <DetailField label="Amount paid" value={currencyFormatter.format(transaction.amountPaid)} currency />
        <DetailField
          label="Vat exclusive"
          value={currencyFormatter.format(transaction.vatExclusive)}
          currency
        />
        <DetailField label="Vat amount" value={currencyFormatter.format(transaction.vatAmount)} currency />
        <DetailField
          label="Merchant fee"
          value={currencyFormatter.format(transaction.merchantFee)}
          currency
        />
        <DetailField
          label="Withholding tax"
          value={currencyFormatter.format(transaction.withholdingTax)}
          currency
        />
        <DetailField
          label="Net collection"
          value={currencyFormatter.format(transaction.netCollection)}
          currency
        />
      </div>

      <PaymentsManager
        transactionId={transaction.id}
        totalDue={transaction.amountPaid}
        payments={payments}
        canDelete={canDelete}
      />

      {transaction.remarks && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Remarks
          </p>
          <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{transaction.remarks}</p>
        </div>
      )}
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  currency,
}: {
  label: string;
  value: string;
  mono?: boolean;
  currency?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-1 text-sm text-zinc-900 dark:text-zinc-100 ${mono ? "font-mono" : ""} ${
          currency ? "tabular-nums" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
