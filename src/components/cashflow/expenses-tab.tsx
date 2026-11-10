import Link from "next/link";
import { AddExpenseModal } from "@/components/cashflow/add-expense-modal";
import { AttachmentsPanel } from "@/components/cashflow/attachments-panel";
import { ExpenseRowActions } from "@/components/cashflow/expense-row-actions";
import type { Expense } from "@/lib/cashflow/expense-schema";
import type { AttachmentInfo } from "@/lib/db/attachments";
import type { Branch } from "@/lib/db/branches";
import type { Supplier } from "@/lib/db/suppliers";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

// Newest expenses only, so the tab stays quick as the list grows. Use the
// search and date filters to reach older ones.
const MAX_ROWS = 200;

/** `branch` is "" (all branches), a branch id, or "none" (clinic-wide). */
export type ExpensesFilters = {
  q: string;
  from: string;
  to: string;
  branch: string;
};

export const NO_BRANCH = "none";

/** The Expenses tab inside the Transactions page. */
export function ExpensesTab({
  expenses,
  suppliers,
  branches,
  files,
  canDelete,
  filters,
}: {
  expenses: Expense[];
  suppliers: Supplier[];
  branches: Branch[];
  files: AttachmentInfo[];
  canDelete: boolean;
  filters: ExpensesFilters;
}) {
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const q = filters.q.trim().toLowerCase();
  const matching = expenses.filter((expense) => {
    if (filters.from && expense.date < filters.from) return false;
    if (filters.to && expense.date > filters.to) return false;
    if (filters.branch === NO_BRANCH) {
      if (expense.branchId) return false;
    } else if (filters.branch && expense.branchId !== filters.branch) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      expense.category,
      expense.description,
      expense.referenceNo,
      expense.remarks,
      expense.supplierId ? supplierName.get(expense.supplierId) : "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
  const shown = matching.slice(0, MAX_ROWS);
  const total = matching.reduce((sum, expense) => sum + expense.amount, 0);
  const filtered = Boolean(q || filters.from || filters.to || filters.branch);

  // Total of the matching expenses for each branch (and clinic-wide ones),
  // so each branch's spending can be read at a glance.
  const perBranch = new Map<string, { label: string; total: number; count: number }>();
  for (const expense of matching) {
    const key = expense.branchId ?? NO_BRANCH;
    const entry = perBranch.get(key) ?? {
      label: expense.branchId
        ? (branchName.get(expense.branchId) ?? "Unknown branch")
        : "No branch / clinic-wide",
      total: 0,
      count: 0,
    };
    entry.total += expense.amount;
    entry.count += 1;
    perBranch.set(key, entry);
  }
  const branchTotals = [...perBranch.entries()].sort((a, b) =>
    a[1].label.localeCompare(b[1].label),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Expenses
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {matching.length} {filtered ? "matching" : "recorded"} &middot;{" "}
            {currencyFormatter.format(total)} total. Newest first, with the
            receipt or proof.{canDelete && " You can edit or delete an expense."}
          </p>
        </div>
        <AddExpenseModal branches={branches} suppliers={suppliers} />
      </div>

      <form
        method="get"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="tab" value="expenses" />
        <label className="flex-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Search
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Expense, supplier, reference, remarks"
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Branch
          <select
            name="branch"
            defaultValue={filters.branch}
            className="select-chevron mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
            <option value={NO_BRANCH}>No branch / clinic-wide</option>
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          From
          <input
            type="date"
            name="from"
            defaultValue={filters.from}
            className="mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          To
          <input
            type="date"
            name="to"
            defaultValue={filters.to}
            className="mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Filter
          </button>
          {filtered && (
            <Link
              href="/cashflow/transactions?tab=expenses"
              className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {branchTotals.length > 0 && (
        <ul
          aria-label="Total expenses per branch"
          className="flex flex-wrap gap-2"
        >
          {branchTotals.map(([key, entry]) => (
            <li
              key={key}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className="text-zinc-500 dark:text-zinc-400">
                {entry.label}
              </span>{" "}
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {currencyFormatter.format(entry.total)}
              </span>{" "}
              <span className="text-xs text-zinc-400">
                ({entry.count})
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Expense</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Receipt / proof</th>
              {canDelete && <th className="px-4 py-3 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {shown.length === 0 ? (
              <tr>
                <td
                  colSpan={canDelete ? 6 : 5}
                  className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  {filtered
                    ? "No expenses match these filters."
                    : "No expenses recorded yet."}
                </td>
              </tr>
            ) : (
              shown.map((expense) => (
                <tr
                  key={expense.id}
                  className="align-top text-zinc-700 dark:text-zinc-300"
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    {expense.date}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      {expense.category}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {[
                        expense.description,
                        expense.referenceNo && `Ref. ${expense.referenceNo}`,
                        expense.branchId && branchName.get(expense.branchId),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {(expense.supplierId &&
                      supplierName.get(expense.supplierId)) ||
                      "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {currencyFormatter.format(expense.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <AttachmentsPanel
                      expenseId={expense.id}
                      kind="receipt"
                      items={files.filter(
                        (file) => file.expenseId === expense.id,
                      )}
                      buttonLabel="Attach receipt / proof"
                    />
                  </td>
                  {canDelete && (
                    <td className="px-4 py-3">
                      <ExpenseRowActions
                        expense={expense}
                        branches={branches}
                        suppliers={suppliers}
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {matching.length > MAX_ROWS && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Showing the newest {MAX_ROWS} of {matching.length}. Narrow the search
          or dates to see older ones.
        </p>
      )}
    </div>
  );
}
