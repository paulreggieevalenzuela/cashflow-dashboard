"use client";

import type { CashflowTransaction } from "@/lib/cashflow/schema";
import { CLINIC_NAME } from "@/lib/cashflow/constants";
import type { Payment } from "@/lib/db/payments";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

export function InvoiceView({
  transaction,
  payments,
  branchName,
}: {
  transaction: CashflowTransaction;
  payments: Payment[];
  branchName?: string;
}) {
  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balanceDue = Math.max(transaction.amountPaid - collected, 0);
  const invoiceNumber = transaction.transactionNumber || transaction.invoiceNumber || transaction.id;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Screen-only controls — invisible on the printed page itself. */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Review the details below, then print or save as PDF.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="w-fit rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
        >
          Print invoice
        </button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-sm sm:p-8 print:rounded-none print:border-none print:p-0 print:shadow-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 print:dark:bg-white print:dark:text-black">
        <div className="flex flex-col gap-3 border-b border-zinc-200 pb-6 dark:border-zinc-800 print:border-black/20 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{CLINIC_NAME}</h1>
            {branchName && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 print:text-black/70">
                {branchName}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 print:text-black/50">
              Invoice
            </p>
            <p className="font-mono text-sm">{invoiceNumber}</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 print:text-black/70">
              {dateFormatter.format(new Date(`${transaction.date}T00:00:00`))}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 print:text-black/50">
              Patient
            </p>
            <p className="mt-1 text-sm font-medium">{transaction.patientName}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 print:text-black/50">
              Dentist
            </p>
            <p className="mt-1 text-sm font-medium">{transaction.dentist || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 print:text-black/50">
              Visit ID
            </p>
            <p className="mt-1 font-mono text-sm">{transaction.visitId}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 print:text-black/50">
              Visit type
            </p>
            <p className="mt-1 text-sm font-medium">{transaction.visitType || "—"}</p>
          </div>
        </div>

        <table className="w-full border-t border-zinc-200 text-left text-sm dark:border-zinc-800 print:border-black/20">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500 print:text-black/50">
              <th className="py-3 font-medium">Description</th>
              <th className="py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 print:divide-black/10">
            <tr>
              <td className="py-3">{transaction.procedure}</td>
              <td className="py-3 text-right tabular-nums">
                {currencyFormatter.format(transaction.amountPaid)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="ml-auto mt-4 w-full max-w-xs space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 dark:text-zinc-400 print:text-black/70">
              Total amount due
            </span>
            <span className="font-medium tabular-nums">
              {currencyFormatter.format(transaction.amountPaid)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 dark:text-zinc-400 print:text-black/70">
              Amount collected
            </span>
            <span className="font-medium tabular-nums">{currencyFormatter.format(collected)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-base font-semibold dark:border-zinc-800 print:border-black/20">
            <span>Balance due</span>
            <span className="tabular-nums">{currencyFormatter.format(balanceDue)}</span>
          </div>
        </div>

        {payments.length > 0 && (
          <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800 print:border-black/20">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 print:text-black/50">
              Payment history
            </p>
            <table className="w-full text-left text-xs">
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 print:divide-black/10">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="py-2 text-zinc-500 dark:text-zinc-400 print:text-black/70">
                      {dateFormatter.format(new Date(payment.paidAt))}
                    </td>
                    <td className="py-2 text-zinc-500 dark:text-zinc-400 print:text-black/70">
                      {payment.paymentType || "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {currencyFormatter.format(payment.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-10 text-center text-xs text-zinc-400 dark:text-zinc-500 print:text-black/50">
          Thank you for choosing {CLINIC_NAME}.
        </p>
      </div>
    </div>
  );
}
