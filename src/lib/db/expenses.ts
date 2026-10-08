import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { expenses, type ExpenseRow, type NewExpenseRow } from "@/lib/db/schema";
import type { Expense } from "@/lib/cashflow/expense-schema";

/**
 * `numeric` columns round-trip as strings through the Postgres driver (see
 * the note in schema.ts) but the rest of the app works with JS numbers.
 * These two helpers are the only place that conversion happens, same
 * pattern as `toAppTransaction`/`toDbRow` in `db/transactions.ts`.
 */
function toAppExpense(row: ExpenseRow): Expense {
  return {
    ...row,
    amount: Number(row.amount),
    vatableAmount: Number(row.vatableAmount),
    vatAmount: Number(row.vatAmount),
  };
}

function toDbRow(expense: Expense): NewExpenseRow {
  return {
    ...expense,
    amount: expense.amount.toString(),
    vatableAmount: expense.vatableAmount.toString(),
    vatAmount: expense.vatAmount.toString(),
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

/**
 * Looks for an expense that is probably the same one entered twice: the
 * same supplier and receipt/reference number, or the same date, amount and
 * category from the same supplier (or both with none). Used to warn before
 * saving — never to block, since two identical real purchases do happen.
 */
export async function findLikelyDuplicateExpense(candidate: {
  date: string;
  category: string;
  amount: number;
  supplierId: string | null;
  referenceNo: string;
}): Promise<Expense | undefined> {
  const sameSupplier = candidate.supplierId
    ? eq(expenses.supplierId, candidate.supplierId)
    : sql`${expenses.supplierId} is null`;

  const sameSheetLine = and(
    eq(expenses.date, candidate.date),
    eq(expenses.category, candidate.category),
    sql`${expenses.amount} = ${candidate.amount.toFixed(2)}::numeric`,
    sameSupplier,
  );
  const sameReference =
    candidate.referenceNo && candidate.supplierId
      ? and(eq(expenses.supplierId, candidate.supplierId), eq(expenses.referenceNo, candidate.referenceNo))
      : undefined;

  const [row] = await db
    .select()
    .from(expenses)
    .where(sameReference ? or(sameSheetLine, sameReference) : sameSheetLine)
    .limit(1);
  return row ? toAppExpense(row) : undefined;
}
