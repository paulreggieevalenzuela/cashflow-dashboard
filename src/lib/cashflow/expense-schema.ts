import { z } from "zod";
import { VAT_TYPES } from "@/lib/cashflow/pricing";

/**
 * A single recorded expense. Mirrors `CashflowTransactionSchema` in
 * schema.ts — validated as plain strings for category/paymentMethod
 * rather than strict enums for the same reason (the option lists in
 * constants.ts are today's known values, not a fixed taxonomy).
 *
 * Follows the clinic's Operating Expenses sheet: `category` is the sheet's
 * "Particulars", `paymentMethod` is its "Source of fund", `amount` is the
 * invoice amount (VAT included). `vatableAmount` and `vatAmount` are
 * computed from `amount` and `vatType`, never typed.
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
  supplierId: z.string().nullable().optional(),
  referenceNo: z.string().optional().default(""),
  remarks: z.string().optional().default(""),
  nature: z.string().optional().default(""),
  vatType: z.string().optional().default("non_vat"),
  vatableAmount: z.number().nonnegative().optional().default(0),
  vatAmount: z.number().nonnegative().optional().default(0),
});

export type Expense = z.infer<typeof ExpenseSchema>;

/**
 * Input schema for the "Add Expenses" form, before the derived fields (id,
 * supplier link, VAT split) are filled in. See `expense-form.tsx`.
 */
export const ManualExpenseInputSchema = z
  .object({
    date: z.string().min(1, "Date is required."),
    category: z.string().min(1, "Select a category."),
    description: z.string().optional().default(""),
    amount: z.number().positive("Amount must be greater than 0."),
    paymentMethod: z.string().optional().default(""),
    // Empty string means "no branch selected" — normalized to null before
    // hitting the DB (see expense-actions.ts), same convention as
    // InvoiceInputSchema.branchId.
    branchId: z.string().optional().default(""),
    supplierName: z.string().trim().optional().default(""),
    supplierAddress: z.string().trim().optional().default(""),
    supplierTin: z.string().trim().optional().default(""),
    referenceNo: z.string().trim().optional().default(""),
    remarks: z.string().optional().default(""),
    nature: z.enum(["", "services", "goods"]).default(""),
    vatType: z.enum(VAT_TYPES).default("non_vat"),
    // Set by the "Add it anyway" button after a likely-duplicate warning.
    allowDuplicate: z.boolean().default(false),
  })
  .superRefine((expense, ctx) => {
    // A VAT purchase is only useful for the books with a supplier and TIN
    // (true for every VAT row in the clinic's sheet); non-VAT and cash
    // purchases don't need either.
    if (expense.vatType === "vat") {
      if (!expense.supplierName) {
        ctx.addIssue({
          code: "custom",
          path: ["supplierName"],
          message: "A VAT expense needs a supplier name.",
        });
      }
      if (!expense.supplierTin) {
        ctx.addIssue({
          code: "custom",
          path: ["supplierTin"],
          message: "A VAT expense needs the supplier's TIN.",
        });
      }
    }
  });

export type ManualExpenseInput = z.infer<typeof ManualExpenseInputSchema>;
