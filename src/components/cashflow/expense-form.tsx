"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { addExpenseAction } from "@/app/cashflow/expense-actions";
import { FormField } from "@/components/auth/form-field";
import { FilePicker } from "@/components/cashflow/file-picker";
import { ProcedureCombobox } from "@/components/cashflow/procedure-combobox";
import { SelectField } from "@/components/cashflow/select-field";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_NATURES,
  EXPENSE_SOURCES,
} from "@/lib/cashflow/constants";
import { uploadAttachment } from "@/lib/cashflow/attachment-client";
import { ManualExpenseInputSchema } from "@/lib/cashflow/expense-schema";
import {
  VAT_TYPES,
  VAT_TYPE_LABELS,
  computeVat,
  normalizeVatType,
  type VatType,
} from "@/lib/cashflow/pricing";
import type { Branch } from "@/lib/db/branches";
import type { Supplier } from "@/lib/db/suppliers";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const selectClass =
  "select-chevron w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40";

/** Local YYYY-MM-DD for "today" — same helper as transaction-form.tsx,
 * computed from local time rather than `toISOString()` so it lands on the
 * right day near midnight in the clinic's timezone. */
function todayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type FormState = {
  date: string;
  category: string;
  description: string;
  amount: string;
  paymentMethod: string;
  branchId: string;
  supplierName: string;
  supplierAddress: string;
  supplierTin: string;
  referenceNo: string;
  remarks: string;
  nature: string;
  vatType: VatType;
};

function blankFormState(): FormState {
  return {
    date: todayIsoDate(),
    category: "",
    description: "",
    amount: "",
    paymentMethod: "",
    branchId: "",
    supplierName: "",
    supplierAddress: "",
    supplierTin: "",
    referenceNo: "",
    remarks: "",
    nature: "",
    vatType: "non_vat",
  };
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

/**
 * Add Expenses, laid out like the clinic's Operating Expenses sheet:
 * date, particulars (category), supplier with address and TIN, reference
 * (receipt/invoice) number, services-or-goods, VAT type with the VAT worked
 * out from the amount, and the source of fund. The supplier field searches
 * suppliers entered before and fills in their address and TIN.
 */
export function ExpenseForm({
  branches,
  suppliers = [],
  onSuccess,
}: {
  branches?: Branch[];
  suppliers?: Supplier[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(blankFormState());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [justAdded, setJustAdded] = useState(false);
  // Receipt / proof photos or PDFs, uploaded once the expense is saved.
  const [proofFiles, setProofFiles] = useState<File[]>([]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSupplierChange(name: string) {
    const known = suppliers.find(
      (supplier) => supplier.name.toLowerCase() === name.trim().toLowerCase(),
    );
    setForm((prev) => ({
      ...prev,
      supplierName: name,
      // A supplier already on file brings its address and TIN along, but
      // never over what was typed on this form.
      supplierAddress: prev.supplierAddress || known?.address || "",
      supplierTin: prev.supplierTin || known?.tin || "",
    }));
  }

  const amount = Number(form.amount) || 0;
  const vat = computeVat(amount, form.vatType);

  async function submit(allowDuplicate: boolean) {
    setFormError(null);
    setDuplicateWarning(null);
    setJustAdded(false);

    const input = ManualExpenseInputSchema.safeParse({
      date: form.date,
      category: form.category,
      description: form.description,
      amount,
      paymentMethod: form.paymentMethod,
      branchId: form.branchId,
      supplierName: form.supplierName,
      supplierAddress: form.supplierAddress,
      supplierTin: form.supplierTin,
      referenceNo: form.referenceNo,
      remarks: form.remarks,
      nature: form.nature,
      vatType: form.vatType,
      allowDuplicate,
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

    const result = await addExpenseAction(input.data);

    if (!result.ok) {
      setStatus("idle");
      if (result.duplicate) {
        setDuplicateWarning(result.message);
        return;
      }
      setFormError(result.message);
      if (result.fieldErrors) {
        setErrors(result.fieldErrors as FieldErrors);
      }
      return;
    }

    // Attach the chosen receipt / proof files to the new expense.
    let uploadProblem: string | null = null;
    for (const file of proofFiles) {
      const uploaded = await uploadAttachment({
        expenseId: result.data.expenseId,
        kind: "receipt",
        file,
      });
      if (!uploaded.ok) {
        uploadProblem = `${file.name}: ${uploaded.message}`;
        break;
      }
    }

    setStatus("idle");
    setForm(blankFormState());
    setProofFiles([]);
    if (uploadProblem) {
      // The expense itself is saved; only a file failed.
      setFormError(
        `The expense was saved, but a file could not be attached (${uploadProblem}). You can attach it again from the Expenses page.`,
      );
      router.refresh();
      return;
    }
    setJustAdded(true);
    router.refresh();
    window.setTimeout(() => setJustAdded(false), 2500);
    if (onSuccess) {
      window.setTimeout(() => onSuccess(), 700);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(false);
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
      {duplicateWarning && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <p>{duplicateWarning}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void submit(true)}
              disabled={status === "submitting"}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-70"
            >
              Add it anyway
            </button>
            <button
              type="button"
              onClick={() => setDuplicateWarning(null)}
              className="text-xs font-medium text-amber-800 hover:underline dark:text-amber-300"
            >
              Go back and check
            </button>
          </div>
        </div>
      )}
      {justAdded && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Expense added.
        </div>
      )}

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
          label="Amount (VAT included)"
          type="number"
          required
          min="0"
          step="0.01"
          placeholder="0.00"
          value={form.amount}
          error={errors.amount}
          onChange={(event) => updateField("amount", event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Particulars"
          required
          placeholder="Select category"
          options={EXPENSE_CATEGORIES}
          value={form.category}
          error={errors.category}
          onChange={(event) => updateField("category", event.target.value)}
        />
        <SelectField
          label="Source of fund"
          placeholder="Select source of fund"
          options={EXPENSE_SOURCES}
          value={form.paymentMethod}
          error={errors.paymentMethod}
          onChange={(event) => updateField("paymentMethod", event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Services or goods
          </label>
          <select
            value={form.nature}
            onChange={(event) => updateField("nature", event.target.value)}
            className={selectClass}
          >
            <option value="">Not specified</option>
            {EXPENSE_NATURES.map((nature) => (
              <option key={nature.value} value={nature.value}>
                {nature.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            VAT
          </label>
          <select
            value={form.vatType}
            onChange={(event) =>
              updateField("vatType", normalizeVatType(event.target.value))
            }
            className={selectClass}
          >
            {VAT_TYPES.map((type) => (
              <option key={type} value={type}>
                {VAT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          {form.vatType === "vat" && amount > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Vatable amount {currencyFormatter.format(vat.base)} · VAT{" "}
              {currencyFormatter.format(vat.vat)}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <ProcedureCombobox
          label="Supplier"
          entityName="supplier"
          value={form.supplierName}
          options={suppliers.map((supplier) => supplier.name)}
          onChange={handleSupplierChange}
          error={errors.supplierName}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Supplier TIN"
            type="text"
            required={form.vatType === "vat"}
            placeholder="000-000-000-000"
            value={form.supplierTin}
            error={errors.supplierTin}
            onChange={(event) => updateField("supplierTin", event.target.value)}
          />
          <FormField
            label="Supplier address"
            type="text"
            placeholder="Optional"
            value={form.supplierAddress}
            error={errors.supplierAddress}
            onChange={(event) =>
              updateField("supplierAddress", event.target.value)
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Reference no."
          type="text"
          placeholder="Receipt / invoice number"
          value={form.referenceNo}
          error={errors.referenceNo}
          onChange={(event) => updateField("referenceNo", event.target.value)}
        />
        <FormField
          label="Description"
          type="text"
          placeholder="Optional — what this expense was for"
          value={form.description}
          onChange={(event) => updateField("description", event.target.value)}
        />
      </div>

      <FormField
        label="Remarks"
        type="text"
        placeholder="Optional"
        value={form.remarks}
        onChange={(event) => updateField("remarks", event.target.value)}
      />

      <FilePicker
        label="Receipt / proof (optional)"
        hint="Photo or PDF of the receipt or proof of payment. Phone photos are shrunk automatically."
        files={proofFiles}
        onChange={setProofFiles}
      />

      {branches && branches.length > 0 && (
        <div className="flex flex-col gap-1.5 sm:w-1/2 sm:pr-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Branch
          </label>
          <select
            value={form.branchId}
            onChange={(event) => updateField("branchId", event.target.value)}
            className={selectClass}
          >
            <option value="">No branch / clinic-wide</option>
            {branches.map((branch) => (
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
          {status === "submitting" ? "Adding..." : "Add expense"}
        </button>
        {onSuccess && (
          <button
            type="button"
            onClick={onSuccess}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
