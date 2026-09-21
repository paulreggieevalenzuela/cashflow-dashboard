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
});

export type CashflowTransaction = z.infer<typeof CashflowTransactionSchema>;

/**
 * Input schema for the manual "Add transaction" form, before the
 * derived/synthesized fields (id, month, year, netCollection) are filled
 * in. See `transaction-form.tsx` for how this is combined with
 * `CashflowTransactionSchema`.
 */
export const ManualTransactionInputSchema = z.object({
  date: z.string().min(1, "Date is required."),
  // No visitId here: it's server-generated (see generateVisitId in
  // transactions.ts) on create, and preserved as-is on edit — the manual
  // form never collects it. CSV-imported rows still carry their own
  // visitId straight from the source data (see parse-csv.ts).
  patientName: z.string().min(1, "Patient name is required."),
  transactionType: z.string().min(1, "Select a transaction type."),
  visitType: z.string().optional().default(""),
  dentist: z.string().optional().default(""),
  procedure: z.string().min(1, "Procedure is required."),
  paymentType: z.string().optional().default(""),
  amountPaid: z.number().nonnegative("Amount paid can't be negative."),
  merchantFee: z.number().nonnegative().default(0),
  withholdingTax: z.number().nonnegative().default(0),
  // No invoiceNumber here either: same reasoning as visitId above — it's
  // server-generated (see generateInvoiceNumber) on create and preserved
  // as-is on edit, shown in the form as a disabled/display-only field.
  remarks: z.string().optional().default(""),
  // Empty string means "no branch selected" — normalized to null before
  // hitting the DB (see actions.ts). Optional because branches are opt-in:
  // a clinic with a single location has none, and the picker just won't
  // render (see transaction-form.tsx).
  branchId: z.string().optional().default(""),
});

export type ManualTransactionInput = z.infer<typeof ManualTransactionInputSchema>;
