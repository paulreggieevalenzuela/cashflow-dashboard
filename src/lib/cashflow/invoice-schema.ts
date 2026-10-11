import { z } from "zod";
import { computeListPrice, isStatutoryDiscount, VAT_TYPES } from "@/lib/cashflow/pricing";
import { teethError } from "@/lib/cashflow/teeth";

/**
 * One procedure line on the Add/Edit transaction form. Each line has its
 * own price, discount and VAT setting (the dentist is one per transaction,
 * on `InvoiceInputSchema`); the peso figures (discount
 * amount, line total, VAT split) are never typed — they are computed from
 * these inputs by `pricing.ts`, on the form for display and again on the
 * server for what is actually saved.
 *
 * `id` is only filled when editing an existing line; a blank id means "new
 * line".
 */
export const InvoiceLineInputSchema = z
  .object({
    id: z.string().optional().default(""),
    procedure: z.string().trim().min(1, "Procedure is required."),
    // Price of ONE unit (tooth, surface, arch, unit — see the procedure's
    // price basis); the line's price is unitPrice × quantity.
    unitPrice: z.number().nonnegative("Price can't be negative."),
    quantity: z
      .number()
      .int("Quantity must be a whole number.")
      .min(1, "Quantity must be at least 1.")
      .max(99, "Quantity looks too high.")
      .default(1),
    // FDI tooth numbers and/or upper arch / lower arch / full mouth.
    teeth: z.string().trim().optional().default(""),
    // The discount type picked from the list; the type decides the VAT rule
    // and whether an ID is needed. Blank for no discount (or an old reason).
    discountTypeId: z.string().optional().default(""),
    discountReason: z.string().optional().default(""),
    // "" = no discount; otherwise a percentage or a fixed peso amount.
    discountMode: z.enum(["", "percent", "amount"]).default(""),
    discountValue: z
      .number()
      .nonnegative("Discount can't be negative.")
      .default(0),
    // VAT is never typed: it is 12% (price is VAT-inclusive) on a "vat"
    // procedure and none on a "non_vat" one. The procedure list decides; the
    // server looks the procedure up and only falls back to this for a
    // procedure that isn't on the list.
    vatType: z.enum(VAT_TYPES).default("vat"),
  })
  .superRefine((line, ctx) => {
    const message = teethError(line.teeth);
    if (message) {
      ctx.addIssue({ code: "custom", path: ["teeth"], message });
    }
    const listPrice = computeListPrice(line.unitPrice, line.quantity);
    if (line.discountValue > 0) {
      if (!line.discountMode) {
        ctx.addIssue({
          code: "custom",
          path: ["discountMode"],
          message: "Choose % or ₱ for the discount.",
        });
      }
      if (line.discountMode === "percent" && line.discountValue > 100) {
        ctx.addIssue({
          code: "custom",
          path: ["discountValue"],
          message: "A percentage can't be more than 100.",
        });
      }
      if (
        line.discountMode === "amount" &&
        line.discountValue > listPrice
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["discountValue"],
          message: "The discount can't be more than the price.",
        });
      }
      if (!line.discountReason.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["discountReason"],
          message: "Give a reason for the discount.",
        });
      }
    }
  });

export type InvoiceLineInput = z.infer<typeof InvoiceLineInputSchema>;

/**
 * The first payment taken together with a brand-new invoice. Only used on
 * create — once an invoice exists, payments are added or removed from the
 * Payments panel.
 */
export const InvoicePaymentInputSchema = z.object({
  amount: z.number().nonnegative("Amount can't be negative.").default(0),
  paymentType: z.string().optional().default(""),
  referenceNo: z.string().trim().optional().default(""),
});

/**
 * Input for the Add/Edit transaction form: one visit, one invoice, one or
 * more procedure lines. The merchant fee is not typed: it is worked out from
 * the payment type of each payment (see `computeMerchantFee`) and shared
 * across the lines.
 */
export const InvoiceInputSchema = z.object({
  date: z.string().min(1, "Date is required."),
  // Typed from the paper invoice booklet. Optional: blank means there is no
  // invoice for this transaction (e.g. a reservation fee). When given, it
  // must not already be used at the same branch.
  invoiceNumber: z.string().trim().optional().default(""),
  patientName: z.string().trim().min(1, "Patient name is required."),
  // One dentist per transaction; every procedure line is saved under them.
  dentist: z.string().optional().default(""),
  transactionType: z.string().min(1, "Select a transaction type."),
  // "" = work it out automatically (new vs returning from past visits).
  visitType: z.enum(["", "NEW", "RETURNING"]).default(""),
  // Empty string means "no branch selected", normalized to null on save.
  branchId: z.string().optional().default(""),
  remarks: z.string().optional().default(""),
  // PWD / Senior citizen ID. Required when a line uses one of those
  // discounts (the server checks this against the discount type's own
  // "needs ID" flag too); ignored otherwise.
  discountIdType: z.string().trim().optional().default(""),
  discountIdNumber: z.string().trim().optional().default(""),
  // Optional recall: when to bring the patient back, and why.
  recallDate: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Recall date must be a valid date.")
    .optional()
    .default(""),
  recallReason: z.string().trim().optional().default(""),
  lines: z.array(InvoiceLineInputSchema).min(1, "Add at least one procedure."),
  payment: InvoicePaymentInputSchema.optional(),
})
.superRefine((input, ctx) => {
  const needsId = input.lines.some(
    (line) => line.discountValue > 0 && isStatutoryDiscount(line.discountReason),
  );
  if (needsId) {
    if (!input.discountIdNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["discountIdNumber"],
        message: "Enter the PWD / Senior citizen ID number.",
      });
    }
    if (!input.discountIdType) {
      ctx.addIssue({
        code: "custom",
        path: ["discountIdType"],
        message: "Choose the ID type.",
      });
    }
  }
  if (input.recallReason && !input.recallDate) {
    ctx.addIssue({
      code: "custom",
      path: ["recallDate"],
      message: "Pick the recall date, or clear the reason.",
    });
  }
});

export type InvoiceInput = z.infer<typeof InvoiceInputSchema>;
