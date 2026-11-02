"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteExpenseAction } from "@/app/cashflow/expense-actions";
import { ExpenseForm } from "@/components/cashflow/expense-form";
import { Modal } from "@/components/ui/modal";
import type { Expense } from "@/lib/cashflow/expense-schema";
import type { Branch } from "@/lib/db/branches";
import type { Supplier } from "@/lib/db/suppliers";

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

/**
 * Edit and Delete on an expense row (admins only: the Expenses tab decides
 * whether to show it, and the server refuses anyone else). Delete asks
 * first, because it is permanent; it is recorded in the audit trail.
 */
export function ExpenseRowActions({
  expense,
  branches,
  suppliers,
}: {
  expense: Expense;
  branches: Branch[];
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function closeDelete() {
    setDeleting(false);
    setError(null);
  }

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteExpenseAction(expense.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDeleting(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${expense.category} expense of ${peso.format(expense.amount)}`}
          className="text-xs font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setDeleting(true)}
          aria-label={`Delete ${expense.category} expense of ${peso.format(expense.amount)}`}
          className="text-xs font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400"
        >
          Delete
        </button>
      </div>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit expense"
        description="Correct a mistake. The change is recorded in the audit trail."
      >
        <ExpenseForm
          branches={branches}
          suppliers={suppliers}
          expense={expense}
          onSuccess={() => setEditing(false)}
        />
      </Modal>

      <Modal
        open={deleting}
        onClose={closeDelete}
        title="Delete this expense?"
        description={`${expense.category}, ${peso.format(expense.amount)} on ${expense.date}, and its attached receipts will be deleted for good. This is recorded in the audit trail.`}
      >
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeDelete}
              disabled={pending}
              className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={pending}
              className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Delete expense"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
