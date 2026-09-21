import { z } from "zod";

/**
 * A single recorded expense. Mirrors `CashflowTransactionSchema` in
 * schema.ts — validated as plain strings for category/paymentMethod
 * rather than strict enums for the same reason (the option lists in
 * constants.ts are today's known values, not a fixed taxonomy).
 */
export const ExpenseSchema = z.object({
  id: z.string().min(1),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format."),
  category: z.string().min(1, "Category is required."),
  description: z.string().optional().default(""),
  amount: z.number().positive("Amount must be greater than 0."),
  paymentMethod: z.string().optional().default(""),
  branchId: z.string().nullable().optional(),
  createdByUserId: z.string().nullable().optional(),
});

export type Expense = z.infer<typeof ExpenseSchema>;

/**
 * Input schema for the "Add Expenses" form, before the derived fields (id,
 * createdAt) are filled in. See `expense-form.tsx`.
 */
export const ManualExpenseInputSchema = z.object({
  date: z.string().min(1, "Date is required."),
  category: z.string().min(1, "Select a category."),
  description: z.string().optional().default(""),
  amount: z.number().positive("Amount must be greater than 0."),
  paymentMethod: z.string().optional().default(""),
  // Empty string means "no branch selected" — normalized to null before
  // hitting the DB (see expense-actions.ts), same convention as
  // ManualTransactionInputSchema.branchId.
  branchId: z.string().optional().default(""),
});

export type ManualExpenseInput = z.infer<typeof ManualExpenseInputSchema>;
