/**
 * Dropdown option sets for the cashflow transaction fields.
 *
 * These are seeded from the values actually observed in the clinic's sample
 * CSV export (Transaction Type, Visit Type, Dentist, Payment Type). They are
 * placeholders for now, not a fixed taxonomy — dentists and payment
 * processors will change over time, so the schema in `schema.ts`
 * deliberately validates these fields as plain strings rather than strict
 * enums. Update the arrays below as the clinic's real options change, or
 * swap this file for a data source (database table, settings page, etc.)
 * once one exists.
 */

export const TRANSACTION_TYPES = ["Visit", "Reservation"] as const;
export type TransactionTypeOption = (typeof TRANSACTION_TYPES)[number];

export const VISIT_TYPES = ["NEW", "RETURNING"] as const;
export type VisitTypeOption = (typeof VISIT_TYPES)[number];

// Observed in the sample CSV. A few entries ("Meds", "WALK IN") are
// placeholders the clinic used in place of an actual dentist, and a few are
// slash-separated combinations of two dentists on one visit — kept as-is
// rather than guessed at, since they reflect real data.
export const DENTISTS = [
  "AHMAD",
  "AHMAD/J. ROLDAN",
  "AHMAD/RUFINO",
  "AHMAD/TEOPE",
  "BANAWA",
  "BANDAYREL",
  "CARCELLAR",
  "J. ROLDAN",
  "J. ROLDAN/PEREZ",
  "K. ROLDAN",
  "Meds",
  "PEREZ",
  "PONGYAN",
  "RUFINO",
  "RUFINO/TEOPE",
  "TEOPE",
  "TEOPE/BANDAYREL",
  "TEOPE/J.ROLDAN",
  "WALK IN",
] as const;
export type DentistOption = (typeof DENTISTS)[number];

// Observed in the sample CSV. Cash/GCash/GoTyme/BDO/POS entries are payment
// methods; Maxicare/Medicard/Intellicare/Avega/Valucare/Elite Dental
// Network are insurance/HMO providers billed directly.
export const PAYMENT_TYPES = [
  "Avega",
  "BDO",
  "Cash",
  "Elite Dental Network",
  "GCash",
  "GoTyme",
  "Intellicare",
  "Maxicare",
  "Medicard",
  "POS (BDO) - CREDIT",
  "POS (BDO) - DEBIT",
  "POS (GHL) - CREDIT",
  "POS (GHL) - DEBIT",
  "POS (MAYA) - CREDIT",
  "POS (MAYA) - DEBIT",
  "Valucare",
] as const;
export type PaymentTypeOption = (typeof PAYMENT_TYPES)[number];

// Shown on the printable invoice (see invoice-view.tsx). Update this to the
// clinic's real name — there's no settings page for it yet, so it's a
// constant for now rather than a database value.
export const CLINIC_NAME = "ADT Dental Clinic";

/**
 * Discount presets offered on the transaction form. The rates are the
 * usual statutory/clinic ones but are starting points to confirm with the
 * clinic's accountant, not law baked into the app — staff can always type a
 * different percentage or a peso amount, and "Other" asks for a reason.
 */
export const DISCOUNT_PRESETS = [
  { reason: "PWD", mode: "percent", value: 20 },
  { reason: "Senior citizen", mode: "percent", value: 20 },
  { reason: "Dental Network Member", mode: "percent", value: 5 },
  { reason: "Promo", mode: "percent", value: 0 },
  { reason: "Other", mode: "percent", value: 0 },
] as const;

// The clinic's own "Particulars" list from its Operating Expenses sheet,
// plus a few common ones (utilities, salaries, taxes, marketing,
// insurance) the dashboard has always grouped by. A plain string list, not
// a fixed enum, so it's easy to extend without a schema change.
export const EXPENSE_CATEGORIES = [
  "Rent",
  "Dental Supplies",
  "Office Supplies & equipment",
  "Repairs",
  "Events",
  "Miscellaneous",
  "Utilities",
  "Salaries",
  "Taxes & licenses",
  "Marketing",
  "Insurance",
] as const;
export type ExpenseCategoryOption = (typeof EXPENSE_CATEGORIES)[number];

// How an expense was paid — the sheet's "Source of fund".
export const EXPENSE_SOURCES = [
  "Cash",
  "GCash",
  "Credit Card",
  "BDO Check",
  "Bank Transfer",
] as const;
export type ExpenseSourceOption = (typeof EXPENSE_SOURCES)[number];

export const EXPENSE_NATURES = [
  { value: "services", label: "Services" },
  { value: "goods", label: "Goods" },
] as const;
