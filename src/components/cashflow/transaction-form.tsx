"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { addTransactionAction, updateTransactionAction } from "@/app/cashflow/actions";
import { FormField } from "@/components/auth/form-field";
import { ProcedureCombobox } from "@/components/cashflow/procedure-combobox";
import { SelectField } from "@/components/cashflow/select-field";
import {
  PAYMENT_TYPES,
  TRANSACTION_TYPES,
  VISIT_TYPES,
} from "@/lib/cashflow/constants";
import { ManualTransactionInputSchema } from "@/lib/cashflow/schema";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import type { Branch } from "@/lib/db/branches";

/** Local YYYY-MM-DD for "today" — used to auto-populate the Date field on a
 * fresh form, computed from the browser's local date/time rather than
 * `toISOString()` (which is UTC and can land on the wrong day near
 * midnight in the clinic's timezone). */
function todayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type FormState = {
  date: string;
  patientName: string;
  transactionType: string;
  visitType: string;
  dentist: string;
  procedure: string;
  paymentType: string;
  amountPaid: string;
  merchantFee: string;
  withholdingTax: string;
  invoiceNumber: string;
  remarks: string;
  branchId: string;
};

const EMPTY_STATE: FormState = {
  date: "",
  patientName: "",
  transactionType: "",
  visitType: "",
  dentist: "",
  procedure: "",
  paymentType: "",
  amountPaid: "",
  merchantFee: "",
  withholdingTax: "",
  invoiceNumber: "",
  remarks: "",
  branchId: "",
};

function blankFormState(): FormState {
  return { ...EMPTY_STATE, date: todayIsoDate() };
}

function toFormState(transaction: CashflowTransaction): FormState {
  return {
    date: transaction.date,
    patientName: transaction.patientName,
    transactionType: transaction.transactionType,
    visitType: transaction.visitType,
    dentist: transaction.dentist,
    procedure: transaction.procedure,
    paymentType: transaction.paymentType,
    amountPaid: transaction.amountPaid.toString(),
    merchantFee: transaction.merchantFee.toString(),
    withholdingTax: transaction.withholdingTax.toString(),
    invoiceNumber: transaction.invoiceNumber,
    remarks: transaction.remarks,
    branchId: transaction.branchId ?? "",
  };
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

type TransactionFormProps = {
  dentistOptions: string[];
  branches?: Branch[];
  /** Known procedure names from the `procedures` table, for the Procedure
   * dropdown. When omitted or empty, the field falls back to a plain text
   * input (e.g. before any procedure has ever been recorded). */
  procedures?: string[];
} & (
  | { mode?: "create"; onSuccess?: () => void }
  | { mode: "edit"; transaction: CashflowTransaction; onSuccess?: () => void }
);

export function TransactionForm(props: TransactionFormProps) {
  const mode = props.mode ?? "create";
  const router = useRouter();
  const [form, setForm] = useState<FormState>(
    props.mode === "edit" ? toFormState(props.transaction) : blankFormState(),
  );
  const procedureOptions = props.procedures ?? [];
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [justAdded, setJustAdded] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setJustAdded(false);

    const input = ManualTransactionInputSchema.safeParse({
      date: form.date,
      patientName: form.patientName,
      transactionType: form.transactionType,
      visitType: form.visitType,
      dentist: form.dentist,
      procedure: form.procedure,
      paymentType: form.paymentType,
      amountPaid: Number(form.amountPaid) || 0,
      merchantFee: Number(form.merchantFee) || 0,
      withholdingTax: Number(form.withholdingTax) || 0,
      remarks: form.remarks,
      branchId: form.branchId,
    });

    if (!input.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of input.error.issues) {
        const key = issue.path[0] as keyof FormState | undefined;
        if (key && !nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setStatus("submitting");

    const result =
      props.mode === "edit"
        ? await updateTransactionAction(props.transaction.id, input.data)
        : await addTransactionAction(input.data);

    if (!result.ok) {
      setStatus("idle");
      setFormError(result.message);
      if (result.fieldErrors) {
        setErrors(result.fieldErrors as FieldErrors);
      }
      return;
    }

    setStatus("idle");

    if (props.mode !== "edit") {
      setForm(blankFormState());
    }
    setJustAdded(true);
    router.refresh();
    window.setTimeout(() => setJustAdded(false), 2500);
    if (props.onSuccess) {
      window.setTimeout(() => props.onSuccess?.(), 700);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {formError}
        </div>
      )}
      {justAdded && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {mode === "edit" ? "Transaction updated." : "Transaction added."}
        </div>
      )}

      <div className="sm:w-1/2 sm:pr-2">
        <FormField
          label="Invoice number"
          type="text"
          disabled
          value={form.invoiceNumber}
          placeholder={mode === "edit" ? "—" : "Generated automatically when saved"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Date"
          type="date"
          required
          value={form.date}
          error={errors.date}
          onChange={(event) => updateField("date", event.target.value)}
        />
        <FormField
          label="Patient name"
          type="text"
          required
          placeholder="Full name"
          value={form.patientName}
          error={errors.patientName}
          onChange={(event) => updateField("patientName", event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Transaction type"
          required
          placeholder="Select transaction type"
          options={TRANSACTION_TYPES}
          value={form.transactionType}
          error={errors.transactionType}
          onChange={(event) => updateField("transactionType", event.target.value)}
        />
        <SelectField
          label="Visit type"
          placeholder="Select visit type"
          options={VISIT_TYPES}
          value={form.visitType}
          error={errors.visitType}
          onChange={(event) => updateField("visitType", event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Dentist"
          placeholder={
            props.dentistOptions.length > 0 ? "Select dentist" : "No dentist accounts yet"
          }
          options={props.dentistOptions}
          value={form.dentist}
          error={errors.dentist}
          disabled={props.dentistOptions.length === 0}
          onChange={(event) => updateField("dentist", event.target.value)}
        />
        <SelectField
          label="Payment type"
          placeholder="Select payment type"
          options={PAYMENT_TYPES}
          value={form.paymentType}
          error={errors.paymentType}
          onChange={(event) => updateField("paymentType", event.target.value)}
        />
      </div>

      <ProcedureCombobox
        value={form.procedure}
        options={procedureOptions}
        onChange={(value) => updateField("procedure", value)}
        error={errors.procedure}
        required
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField
          label="Amount paid"
          type="number"
          required
          min="0"
          step="0.01"
          placeholder="0.00"
          value={form.amountPaid}
          error={errors.amountPaid}
          onChange={(event) => updateField("amountPaid", event.target.value)}
        />
        <FormField
          label="Merchant fee"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={form.merchantFee}
          error={errors.merchantFee}
          onChange={(event) => updateField("merchantFee", event.target.value)}
        />
        <FormField
          label="Withholding tax"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={form.withholdingTax}
          error={errors.withholdingTax}
          onChange={(event) => updateField("withholdingTax", event.target.value)}
        />
      </div>

      <FormField
        label="Remarks"
        type="text"
        placeholder="Optional"
        value={form.remarks}
        onChange={(event) => updateField("remarks", event.target.value)}
      />

      {props.branches && props.branches.length > 0 && (
        <div className="flex flex-col gap-1.5 sm:w-1/2 sm:pr-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Branch</label>
          <select
            value={form.branchId}
            onChange={(event) => updateField("branchId", event.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
          >
            <option value="">No branch</option>
            {props.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {mode === "edit"
            ? status === "submitting"
              ? "Saving..."
              : "Save changes"
            : status === "submitting"
              ? "Adding..."
              : "Add transaction"}
        </button>
        {props.mode === "edit" &&
          (props.onSuccess ? (
            // Modal context (table row action, or the detail page's Edit
            // button) — just close it, no save, no navigation.
            <button
              type="button"
              onClick={() => props.onSuccess?.()}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
          ) : (
            // Standalone /edit page fallback (no modal to close) — back out
            // to the transaction's detail page instead.
            <Link
              href={`/cashflow/transactions/${encodeURIComponent(props.transaction.id)}`}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Cancel
            </Link>
          ))}
      </div>
    </form>
  );
}
