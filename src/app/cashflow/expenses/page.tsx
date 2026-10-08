import type { Metadata } from "next";
import { auth } from "@/auth";
import { AttachmentsPanel } from "@/components/cashflow/attachments-panel";
import { listExpenseAttachments } from "@/lib/db/attachments";
import { listBranches } from "@/lib/db/branches";
import { listExpenses } from "@/lib/db/expenses";
import { listSuppliers } from "@/lib/db/suppliers";

export const metadata: Metadata = {
  title: "Expenses",
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

// Newest expenses only, so the page stays quick as the list grows.
const MAX_ROWS = 200;

export default async function ExpensesPage() {
  const [session, expenses, suppliers, branches, files] = await Promise.all([
    auth(),
    listExpenses(),
    listSuppliers(),
    listBranches(),
    listExpenseAttachments(),
  ]);

  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const canDelete = session?.user.role === "admin";
  const shown = expenses.slice(0, MAX_ROWS);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Expenses
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Recorded expenses, newest first, with their receipt or proof. Use
          &ldquo;Add Expenses&rdquo; at the top to record a new one; you can
          attach a photo or PDF there, or add one to an expense below.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Expense</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Receipt / proof</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {shown.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  No expenses recorded yet.
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
                      canDelete={canDelete}
                      buttonLabel="Attach receipt / proof"
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {expenses.length > MAX_ROWS && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Showing the newest {MAX_ROWS} of {expenses.length} expenses.
        </p>
      )}
    </div>
  );
}
