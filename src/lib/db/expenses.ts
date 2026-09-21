import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { expenses, type ExpenseRow, type NewExpenseRow } from "@/lib/db/schema";
import type { Expense } from "@/lib/cashflow/expense-schema";

/**
 * `amount` round-trips as a string through the Postgres driver (`numeric`
 * columns — see the note on this in schema.ts) but the rest of the app
 * works with JS numbers. These two helpers are the only place that
 * conversion happens, same pattern as `toAppTransaction`/`toDbRow` in
 * `db/transactions.ts`.
 */
function toAppExpense(row: ExpenseRow): Expense {
  return {
    ...row,
    amount: Number(row.amount),
  };
}

function toDbRow(expense: Expense): NewExpenseRow {
  return {
    ...expense,
    amount: expense.amount.toString(),
  };
}

export async function listExpenses(): Promise<Expense[]> {
  const rows = await db.select().from(expenses).orderBy(desc(expenses.date));
  return rows.map(toAppExpense);
}

export async function getExpenseById(id: string): Promise<Expense | undefined> {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  return row ? toAppExpense(row) : undefined;
}

export async function createExpense(expense: Expense): Promise<Expense> {
  const [row] = await db.insert(expenses).values(toDbRow(expense)).returning();
  return toAppExpense(row);
}

export async function updateExpense(id: string, expense: Expense): Promise<Expense> {
  const [row] = await db
    .update(expenses)
    .set(toDbRow(expense))
    .where(eq(expenses.id, id))
    .returning();
  return toAppExpense(row);
}

export async function deleteExpense(id: string): Promise<void> {
  await db.delete(expenses).where(eq(expenses.id, id));
}
