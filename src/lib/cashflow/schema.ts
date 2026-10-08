import { z } from "zod";

/**
 * A single cashflow transaction, normalized from either a CSV row or the
 * manual "Add transaction" form. Field names and set mirror the clinic's
 * CSV export columns (Date, Visit ID, Patient Name, Transaction Type,
 * Visit Type, Dentist, Procedure, Payment Type, Amount Paid, Vat Exclusive,
 * Vat Amount, Month, Year, Invoice Number, Remarks, Merchant Fee,
 * Withholding Tax, Net Collection).
 *
 * Categorical fields (transactionType, visitType, dentist, paymentType) are
 * validated as plain strings rather than strict enums on purpose: the
 * dropdown options in `constants.ts` are today's known values, not a fixed
 * taxonomy, and a CSV import shouldn't fail just because the clinic added a
 * new dentist or payment processor.
 */
export const CashflowTransactionSchema = z.object({
  // Synthesized, not part of the source data: `${visitId}-${lineNumber}`.
  // A Visit ID can repeat across multiple line items for one visit (e.g.
  // separate procedure + payment rows), so this disambiguates rows.
  id: z.string().min(1),

  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format."),
  visitId: z.string().min(1, "Visit ID is required."),
  patientName: z.string().min(1, "Patient name is required."),
  transactionType: z.string().min(1, "Transaction type is required."),
  visitType: z.string().optional().default(""),
  dentist: z.string().optional().default(""),
  procedure: z.string().min(1, "Procedure is required."),
  paymentType: z.string().optional().default(""),

  amountPaid: z.number().nonnegative("Amount paid can't be negative."),
  vatExclusive: z.number().nonnegative().default(0),
  vatAmount: z.number().nonnegative().default(0),

  // Derived from `date` rather than trusted from raw input — the source
  // sheet sometimes left these blank even when Date was filled in.
  month: z.string().min(1),
  year: z.number().int(),

  invoiceNumber: z.string().optional().default(""),
  remarks: z.string().optional().default(""),

  merchantFee: z.number().nonnegative().default(0),
  withholdingTax: z.number().nonnegative().default(0),
  netCollection: z.number().nonnegative(),

  // Everything below is resolved/generated server-side, never present in
  // a raw CSV row or the manual form's input — all optional/nullable so
  // parsing a plain CSV row still validates. See schema.ts (the Drizzle
  // table) for what sets each one.
  dentistUserId: z.string().nullable().optional(),
  procedureId: z.string().nullable().optional(),
  commissionAmount: z.number().nonnegative().optional(),
  branchId: z.string().nullable().optional(),
  createdByUserId: z.string().nullable().optional(),
  transactionNumber: z.string().nullable().optional(),

  // Invoice grouping, patient link and per-line pricing. All optional so a
  // plain CSV row (and seed-data.ts) still validates; the data layer fills
  // them in. `amountPaid` above is the line total due AFTER discount;
  // `listPrice` is the price before it.
  invoiceId: z.string().nullable().optional(),
  patientId: z.string().nullable().optional(),
  lineNumber: z.number().int().positive().optional(),
  listPrice: z.number().nonnegative().optional(),
  discountMode: z.string().optional(),
  discountValue: z.number().nonnegative().optional(),
  discountAmount: z.number().nonnegative().optional(),
  discountReason: z.string().optional(),
  vatType: z.string().optional(),
});

export type CashflowTransaction = z.infer<typeof CashflowTransactionSchema>;
