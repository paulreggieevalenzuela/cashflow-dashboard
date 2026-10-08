import { z } from "zod";
import { VAT_TYPES } from "@/lib/cashflow/pricing";

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
    listPrice: z.number().nonnegative("Price can't be negative."),
    discountReason: z.string().optional().default(""),
    // "" = no discount; otherwise a percentage or a fixed peso amount.
    discountMode: z.enum(["", "percent", "amount"]).default(""),
    discountValue: z
      .number()
      .nonnegative("Discount can't be negative.")
      .default(0),
    // The VAT field: a peso amount. Blank/0 = non-VAT (VAT-exempt is the
    // same); any amount makes the line VATable. The server works out the
    // VAT type from this — `vatType` is only kept so older callers still fit.
    vatAmount: z.number().nonnegative("VAT can't be negative.").default(0),
    vatType: z.enum(VAT_TYPES).default("non_vat"),
  })
  .superRefine((line, ctx) => {
    if (line.vatAmount > line.listPrice) {
      ctx.addIssue({
        code: "custom",
        path: ["vatAmount"],
        message: "VAT can't be more than the price.",
      });
    }
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
        line.discountValue > line.listPrice
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
  // Typed from the paper invoice booklet. Optional on purpose — some
  // transactions (reservation fees, HMO-covered visits) have no invoice.
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
  lines: z.array(InvoiceLineInputSchema).min(1, "Add at least one procedure."),
  payment: InvoicePaymentInputSchema.optional(),
});

export type InvoiceInput = z.infer<typeof InvoiceInputSchema>;
