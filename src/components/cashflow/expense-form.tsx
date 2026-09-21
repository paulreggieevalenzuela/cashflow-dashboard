"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { addExpenseAction } from "@/app/cashflow/expense-actions";
import { FormField } from "@/components/auth/form-field";
import { SelectField } from "@/components/cashflow/select-field";
import { EXPENSE_CATEGORIES, PAYMENT_TYPES } from "@/lib/cashflow/constants";
import { ManualExpenseInputSchema } from "@/lib/cashflow/expense-schema";
import type { Branch } from "@/lib/db/branches";

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
};

function blankFormState(): FormState {
  return {
    date: todayIsoDate(),
    category: "",
    description: "",
    amount: "",
    paymentMethod: "",
    branchId: "",
  };
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

export function ExpenseForm({
  branches,
  onSuccess,
}: {
  branches?: Branch[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(blankFormState());
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

    const input = ManualExpenseInputSchema.safeParse({
      date: form.date,
      category: form.category,
      description: form.description,
      amount: Number(form.amount) || 0,
      paymentMethod: form.paymentMethod,
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

    const result = await addExpenseAction(input.data);

    if (!result.ok) {
      setStatus("idle");
      setFormError(result.message);
      if (result.fieldErrors) {
        setErrors(result.fieldErrors as FieldErrors);
      }
      return;
    }

    setStatus("idle");
    setForm(blankFormState());
    setJustAdded(true);
    router.refresh();
    window.setTimeout(() => setJustAdded(false), 2500);
    if (onSuccess) {
      window.setTimeout(() => onSuccess(), 700);
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
          label="Amount"
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
          label="Category"
          required
          placeholder="Select category"
          options={EXPENSE_CATEGORIES}
          value={form.category}
          error={errors.category}
          onChange={(event) => updateField("category", event.target.value)}
        />
        <SelectField
          label="Payment method"
          placeholder="Select payment method"
          options={PAYMENT_TYPES}
          value={form.paymentMethod}
          error={errors.paymentMethod}
          onChange={(event) => updateField("paymentMethod", event.target.value)}
        />
      </div>

      <FormField
        label="Description"
        type="text"
        placeholder="Optional — what this expense was for"
        value={form.description}
        onChange={(event) => updateField("description", event.target.value)}
      />

      {branches && branches.length > 0 && (
        <div className="flex flex-col gap-1.5 sm:w-1/2 sm:pr-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Branch</label>
          <select
            value={form.branchId}
            onChange={(event) => updateField("branchId", event.target.value)}
            className="select-chevron w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
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
