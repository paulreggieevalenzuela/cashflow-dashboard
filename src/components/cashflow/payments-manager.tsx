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
  paidAt: string;
  notes: string;
};

function emptyForm(): FormState {
  return { amount: "", paymentType: "", paidAt: todayInputValue(), notes: "" };
}

export function PaymentsManager({
  transactionId,
  totalDue,
  payments,
  canDelete = false,
  readOnly = false,
}: {
  transactionId: string;
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

  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balanceDue = Math.max(totalDue - collected, 0);
  const isFullyPaid = balanceDue < 0.01;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setStatus("submitting");

    const result = await addPaymentAction(transactionId, {
      amount: Number(form.amount) || 0,
      paymentType: form.paymentType,
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
      const result = await deletePaymentAction(paymentId, transactionId);
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
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Payments</h3>
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
        <SummaryField label="Total due" value={currencyFormatter.format(totalDue)} />
        <SummaryField label="Collected" value={currencyFormatter.format(collected)} />
        <SummaryField label="Balance due" value={currencyFormatter.format(balanceDue)} />
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
                  {payment.paymentType && (
                    <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      {payment.paymentType}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {dateFormatter.format(new Date(payment.paidAt))}
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

          <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="Amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(event) => updateField("amount", event.target.value)}
            />
            <SelectField
              label="Payment type"
              placeholder="Select payment type"
              options={PAYMENT_TYPES}
              value={form.paymentType}
              onChange={(event) => updateField("paymentType", event.target.value)}
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
