"use client";

import { CLINIC_NAME } from "@/lib/cashflow/constants";
import {
  computeMerchantFee,
  isStatutoryDiscount,
  round2,
  summarizeOr,
} from "@/lib/cashflow/pricing";
import { OrBreakdown, hasOrDetail } from "@/components/cashflow/or-breakdown";
import type { InvoiceDetail } from "@/lib/db/invoices";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

export function InvoiceView({
  detail,
  branchName,
}: {
  detail: InvoiceDetail;
  branchName?: string;
}) {
  const { invoice, lines, payments, totalDue, collected } = detail;
  const first = lines[0];
  const dentistNames = [
    ...new Set(lines.map((line) => line.dentist).filter(Boolean)),
  ].join(", ");
  // Card payments carry a merchant fee on top of the bill.
  const cardFee = round2(
    payments.reduce(
      (sum, payment) =>
        sum + computeMerchantFee(payment.amount, payment.paymentType),
      0,
    ),
  );
  const balanceDue = Math.max(round2(totalDue - collected), 0);

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

  // The number written in the paper booklet comes first; our own reference
  // number is only shown as the main number when there is no booklet one.
  const referenceNumber = first?.transactionNumber || first?.visitId || "";

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
            <h1 className="text-xl font-semibold tracking-tight">
              {CLINIC_NAME}
            </h1>
            {branchName && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 print:text-black/70">
                {branchName}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 print:text-black/50">
              {invoice.invoiceNumber ? "Invoice no." : "Reference no."}
            </p>
            <p className="font-mono text-sm">
              {invoice.invoiceNumber || referenceNumber}
            </p>
            {invoice.invoiceNumber && referenceNumber && (
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 print:text-black/60">
                Ref. {referenceNumber}
              </p>
            )}
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 print:text-black/70">
              {dateFormatter.format(new Date(`${invoice.visitDate}T00:00:00`))}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 print:text-black/50">
              Patient
            </p>
            <p className="mt-1 text-sm font-medium">{first?.patientName}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 print:text-black/50">
              Visit type
            </p>
            <p className="mt-1 text-sm font-medium">
              {invoice.visitType || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 print:text-black/50">
              Dentist
            </p>
            <p className="mt-1 text-sm font-medium">{dentistNames || "—"}</p>
          </div>
        </div>

        <table className="w-full border-t border-zinc-200 text-left text-sm dark:border-zinc-800 print:border-black/20">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500 print:text-black/50">
              <th className="py-3 font-medium">Description</th>
              <th className="py-3 text-right font-medium">Price</th>
              <th className="py-3 text-right font-medium">Discount</th>
              <th className="py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 print:divide-black/10">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="py-3">{line.procedure}</td>
                <td className="py-3 text-right tabular-nums">
                  {currencyFormatter.format(line.listPrice ?? line.amountPaid)}
                </td>
                <td className="py-3 text-right tabular-nums">
                  {(line.discountAmount ?? 0) > 0 ? (
                    <>
                      −{currencyFormatter.format(line.discountAmount ?? 0)}
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400 print:text-black/60">
                        {line.discountReason}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-3 text-right tabular-nums">
                  {currencyFormatter.format(line.amountPaid)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-4 w-full max-w-xs space-y-2 text-sm">
          {hasOrDetail(orSummary) ? (
            <OrBreakdown summary={orSummary} />
          ) : (
            <Row
              label="Total amount due"
              value={currencyFormatter.format(totalDue)}
              strong
            />
          )}
          <Row
            label="Amount collected"
            value={currencyFormatter.format(collected)}
          />
          {cardFee > 0 && (
            <>
              <Row
                label="Merchant fee (card)"
                value={currencyFormatter.format(cardFee)}
                small
              />
              <Row
                label="Total paid"
                value={currencyFormatter.format(round2(collected + cardFee))}
                strong
              />
            </>
          )}
          <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-base font-semibold dark:border-zinc-800 print:border-black/20">
            <span>Balance due</span>
            <span className="tabular-nums">
              {currencyFormatter.format(balanceDue)}
            </span>
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
                      {payment.referenceNo
                        ? ` · Ref. ${payment.referenceNo}`
                        : ""}
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

function Row({
  label,
  value,
  strong,
  small,
}: {
  label: string;
  value: string;
  strong?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${small ? "text-xs" : ""} ${
        strong ? "font-medium" : ""
      }`}
    >
      <span className="text-zinc-500 dark:text-zinc-400 print:text-black/70">
        {label}
      </span>
      <span
        className={`tabular-nums ${strong ? "font-medium" : "font-medium"}`}
      >
        {value}
      </span>
    </div>
  );
}
