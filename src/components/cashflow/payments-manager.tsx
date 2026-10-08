"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  addPaymentAction,
  deletePaymentAction,
} from "@/app/cashflow/transactions/payment-actions";
import { FormField } from "@/components/auth/form-field";
import { SelectField } from "@/components/cashflow/select-field";
import { PAYMENT_TYPES } from "@/lib/cashflow/constants";
import {
  appliedToBill,
  computeMerchantFee,
  merchantFeeRateFor,
  receivedForBill,
} from "@/lib/cashflow/pricing";
import type { Payment } from "@/lib/db/payments";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

type FormState = {
  amount: string;
  paymentType: string;
  referenceNo: string;
  paidAt: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    amount: "",
    paymentType: "",
    referenceNo: "",
    paidAt: todayInputValue(),
    notes: "",
  };
}

export function PaymentsManager({
  invoiceId,
  totalDue,
  payments,
  canDelete = false,
  readOnly = false,
}: {
  invoiceId: string;
  totalDue: number;
  payments: Payment[];
  canDelete?: boolean;
  /** Viewing a transaction shows payments as read-only — no "Record a
   * payment" form, no "Remove" buttons. Recording or removing a payment is
   * only available from the edit flow, where this is rendered without
   * `readOnly`. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  // "Collected" counts towards the bill: a card payment includes its
  // merchant fee, which is taken out here.
  const collected = payments.reduce(
    (sum, payment) => sum + appliedToBill(payment.amount, payment.paymentType),
    0,
  );
  const balanceDue = Math.max(totalDue - collected, 0);
  const isFullyPaid = balanceDue < 0.01;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setStatus("submitting");

    const result = await addPaymentAction(invoiceId, {
      amount: Number(form.amount) || 0,
      paymentType: form.paymentType,
      referenceNo: form.referenceNo,
      paidAt: form.paidAt,
      notes: form.notes,
    });

    setStatus("idle");
    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    setForm(emptyForm());
    router.refresh();
  }

  async function handleDelete(paymentId: string) {
    if (!window.confirm("Remove this payment record?")) {
      return;
    }
    setRowBusyId(paymentId);
    try {
      const result = await deletePaymentAction(paymentId);
      if (!result.ok) {
        window.alert(result.message);
      }
      router.refresh();
    } finally {
      setRowBusyId(null);
    }
  }

  return (
    <div className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Payments
          </h3>
          {readOnly && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Read-only — edit the transaction to record or remove a payment.
            </p>
          )}
        </div>
        <span
          className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ${
            isFullyPaid
              ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          }`}
        >
          {isFullyPaid
            ? "Fully paid"
            : collected > 0
              ? `Partially paid · ${currencyFormatter.format(balanceDue)} due`
              : `Not yet paid · ${currencyFormatter.format(balanceDue)} due`}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryField
          label="Total due"
          value={currencyFormatter.format(totalDue)}
        />
        <SummaryField
          label="Collected"
          value={currencyFormatter.format(collected)}
        />
        <SummaryField
          label="Balance due"
          value={currencyFormatter.format(balanceDue)}
        />
      </div>

      {payments.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {currencyFormatter.format(payment.amount)}
                  {computeMerchantFee(payment.amount, payment.paymentType) >
                    0 && (
                    <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      incl.{" "}
                      {currencyFormatter.format(
                        computeMerchantFee(payment.amount, payment.paymentType),
                      )}{" "}
                      fee
                    </span>
                  )}
                  {payment.paymentType && (
                    <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      {payment.paymentType}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {dateFormatter.format(new Date(payment.paidAt))}
                  {payment.referenceNo ? ` · Ref. ${payment.referenceNo}` : ""}
                  {payment.notes ? ` · ${payment.notes}` : ""}
                </p>
              </div>
              {!readOnly && canDelete && (
                <button
                  type="button"
                  onClick={() => handleDelete(payment.id)}
                  disabled={rowBusyId === payment.id}
                  className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  {rowBusyId === payment.id ? "Removing..." : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div>
          <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Record a payment
          </h4>

          {formError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              {formError}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            noValidate
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div className="flex flex-col gap-1.5">
              <FormField
                label="Amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(event) => updateField("amount", event.target.value)}
              />
              {balanceDue >= 0.01 &&
                Number(form.amount) !==
                  receivedForBill(balanceDue, form.paymentType) && (
                  <button
                    type="button"
                    onClick={() =>
                      updateField(
                        "amount",
                        receivedForBill(
                          balanceDue,
                          form.paymentType,
                        ).toString(),
                      )
                    }
                    className="w-fit text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                  >
                    Pay balance in full (
                    {currencyFormatter.format(
                      receivedForBill(balanceDue, form.paymentType),
                    )}
                    )
                  </button>
                )}
            </div>
            <SelectField
              label="Payment type"
              placeholder="Select payment type"
              options={PAYMENT_TYPES}
              value={form.paymentType}
              onChange={(event) =>
                updateField("paymentType", event.target.value)
              }
            />
            {merchantFeeRateFor(form.paymentType) > 0 && (
              <p className="text-xs text-zinc-600 dark:text-zinc-300 sm:col-span-2">
                Merchant fee ({merchantFeeRateFor(form.paymentType)}% for{" "}
                {form.paymentType}) is added on top: to pay the balance of{" "}
                {currencyFormatter.format(balanceDue)} in full the patient pays{" "}
                <span className="font-medium tabular-nums">
                  {currencyFormatter.format(
                    receivedForBill(balanceDue, form.paymentType),
                  )}
                </span>
                .
                {Number(form.amount) > 0 && (
                  <>
                    {" "}
                    Of the {currencyFormatter.format(Number(form.amount))}{" "}
                    entered,{" "}
                    {currencyFormatter.format(
                      appliedToBill(Number(form.amount), form.paymentType),
                    )}{" "}
                    pays the bill and{" "}
                    {currencyFormatter.format(
                      computeMerchantFee(Number(form.amount), form.paymentType),
                    )}{" "}
                    is the merchant fee.
                  </>
                )}
              </p>
            )}
            <FormField
              label="Reference no."
              type="text"
              placeholder="Card slip / GCash / transfer ref."
              value={form.referenceNo}
              onChange={(event) =>
                updateField("referenceNo", event.target.value)
              }
            />
            <FormField
              label="Date"
              type="date"
              value={form.paidAt}
              onChange={(event) => updateField("paidAt", event.target.value)}
            />
            <FormField
              label="Notes"
              type="text"
              placeholder="Optional"
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
            />
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={status === "submitting"}
                className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {status === "submitting" ? "Recording..." : "Record payment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
    </div>
  );
}
