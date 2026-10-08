"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeInvoiceAction } from "@/app/cashflow/actions";
import { EditTransactionModal } from "@/components/cashflow/edit-transaction-modal";
import { PaymentsManager } from "@/components/cashflow/payments-manager";
import {
  isStatutoryDiscount,
  round2,
  summarizeOr,
} from "@/lib/cashflow/pricing";
import { OrBreakdown, hasOrDetail } from "@/components/cashflow/or-breakdown";
import type { Branch } from "@/lib/db/branches";
import type { InvoiceDetail } from "@/lib/db/invoices";
import type { ProcedureOption } from "@/lib/db/procedures";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

export function TransactionDetail({
  detail,
  /** The line the user clicked in the table; the "Print invoice" link and
   * the page address use it (any line of the visit opens the whole visit). */
  openedLineId,
  canDelete = false,
  dentistOptions,
  branches,
  procedures,
}: {
  detail: InvoiceDetail;
  openedLineId: string;
  canDelete?: boolean;
  dentistOptions: string[];
  branches: Branch[];
  procedures: ProcedureOption[];
}) {
  const router = useRouter();
  const [isRemoving, setIsRemoving] = useState(false);
  const { invoice, lines, payments, totalDue } = detail;
  const first = lines[0];
  const dentistNames = [
    ...new Set(lines.map((line) => line.dentist).filter(Boolean)),
  ].join(", ");
  const branchName = branches.find(
    (branch) => branch.id === invoice.branchId,
  )?.name;

  const orSummary = summarizeOr(
    lines.map((line) => ({
      listPrice: line.listPrice ?? line.amountPaid,
      discountAmount: line.discountAmount ?? 0,
      total: line.amountPaid,
      vatBase: line.vatExclusive,
      vat: line.vatAmount,
      statutory:
        isStatutoryDiscount(line.discountReason) &&
        (line.discountAmount ?? 0) > 0,
    })),
  );
  const merchantFee = round2(
    lines.reduce((sum, line) => sum + line.merchantFee, 0),
  );
  const withholdingTax = round2(
    lines.reduce((sum, line) => sum + line.withholdingTax, 0),
  );
  const netCollection = round2(
    lines.reduce((sum, line) => sum + line.netCollection, 0),
  );

  async function handleRemove() {
    const what =
      lines.length > 1
        ? `this visit (${lines.length} procedures)`
        : "this transaction";
    if (
      !window.confirm(
        `Remove ${what} for ${first?.patientName ?? "this patient"}?`,
      )
    ) {
      return;
    }
    setIsRemoving(true);
    try {
      await removeInvoiceAction(invoice.id);
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
            {first?.patientName}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {invoice.visitDate} ·{" "}
            {lines.length > 1 ? `${lines.length} procedures` : first?.procedure}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 self-start">
          <Link
            href={`/cashflow/transactions/${encodeURIComponent(openedLineId)}/invoice`}
            className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Print invoice
          </Link>
          <EditTransactionModal
            invoice={invoice}
            lines={lines}
            dentistOptions={dentistOptions}
            branches={branches}
            procedures={procedures}
            payments={payments}
            totalDue={totalDue}
            canDelete={canDelete}
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
        <DetailField
          label="Invoice number"
          value={invoice.invoiceNumber || "—"}
          mono
        />
        <DetailField label="Date" value={invoice.visitDate} />
        <DetailField label="Patient name" value={first?.patientName ?? "—"} />
        <DetailField label="Dentist" value={dentistNames || "—"} />
        <DetailField label="Visit ID" value={first?.visitId ?? "—"} mono />
        <DetailField label="Transaction type" value={invoice.transactionType} />
        <DetailField label="Visit type" value={invoice.visitType || "—"} />
        <DetailField label="Branch" value={branchName ?? "—"} />
        <DetailField
          label="Reference no."
          value={first?.transactionNumber ?? "—"}
          mono
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Procedure</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Discount</th>
              <th className="px-4 py-3 font-medium">VAT</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {lines.map((line) => (
              <tr key={line.id} className="text-zinc-700 dark:text-zinc-300">
                <td className="px-4 py-3">{line.procedure}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {currencyFormatter.format(line.listPrice ?? line.amountPaid)}
                </td>
                <td className="px-4 py-3">
                  {(line.discountAmount ?? 0) > 0 ? (
                    <>
                      <span className="tabular-nums">
                        −{currencyFormatter.format(line.discountAmount ?? 0)}
                      </span>
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        {line.discountReason}
                        {line.discountMode === "percent"
                          ? ` (${line.discountValue}%)`
                          : ""}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {line.vatType === "vat" ? "VAT" : "Non-VAT"}
                  {line.vatAmount > 0 && (
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      {currencyFormatter.format(line.vatAmount)}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                  {currencyFormatter.format(line.amountPaid)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-3">
        <DetailField
          label="Total due"
          value={currencyFormatter.format(totalDue)}
          currency
        />
        <DetailField
          label="VAT charged"
          value={currencyFormatter.format(orSummary.vat)}
          currency
        />
        <DetailField
          label="Merchant fee (added on top)"
          value={currencyFormatter.format(merchantFee)}
          currency
        />
        {merchantFee > 0 && (
          <DetailField
            label="Total paid by patient"
            value={currencyFormatter.format(
              round2(
                payments.reduce((sum, payment) => sum + payment.amount, 0),
              ),
            )}
            currency
          />
        )}
        {withholdingTax > 0 && (
          <DetailField
            label="Withholding tax"
            value={currencyFormatter.format(withholdingTax)}
            currency
          />
        )}
        <DetailField
          label="Net collection"
          value={currencyFormatter.format(netCollection)}
          currency
        />
      </div>

      {hasOrDetail(orSummary) && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            OR breakdown
          </h3>
          <div className="max-w-sm">
            <OrBreakdown summary={orSummary} />
          </div>
        </div>
      )}

      <PaymentsManager
        invoiceId={invoice.id}
        totalDue={totalDue}
        payments={payments}
        canDelete={canDelete}
        readOnly
      />

      {first?.remarks && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Remarks
          </p>
          <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            {first.remarks}
          </p>
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
