import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * A physical clinic location. Dentist/staff accounts and transactions can
 * each be tagged with one, so performance and reporting can be sliced per
 * branch. Nullable everywhere it's referenced — a user or an older
 * transaction with no branch set just means "not yet assigned," not an
 * error, so this rolls out without needing to backfill every row at once.
 */
export const branches = pgTable("branches", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BranchRow = typeof branches.$inferSelect;
export type NewBranchRow = typeof branches.$inferInsert;

/**
 * Mirrors `CashflowTransactionSchema` in `src/lib/cashflow/schema.ts` field
 * for field. Keep the two in sync — this is the storage shape, that Zod
 * schema is the validation shape used before data ever reaches here.
 *
 * `id` is application-generated (`${visitId}-${lineNumber}` from CSV
 * imports, or a UUID from the manual form) rather than a serial column, so
 * re-importing the same CSV can upsert by id instead of creating
 * duplicates.
 *
 * NOTE: `numeric` columns always round-trip as strings through the
 * Postgres driver — there is no `mode: "number"` option in this version of
 * drizzle-orm. Conversion to/from JS numbers happens explicitly in
 * `src/lib/db/transactions.ts`, not here.
 */
export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  date: text("date").notNull(), // YYYY-MM-DD, stored as text to match the app's format exactly
  visitId: text("visit_id").notNull(),
  patientName: text("patient_name").notNull(),
  transactionType: text("transaction_type").notNull(),
  visitType: text("visit_type").notNull().default(""),
  dentist: text("dentist").notNull().default(""),
  // Best-effort link from the free-text `dentist` label above to a real
  // login account (role: dentist) — set when the name matches exactly
  // (case-insensitive) on manual entry (always, since the form now picks
  // from real accounts) or CSV import (only on an exact name match; left
  // null otherwise rather than guessing, since this drives commission).
  // `onDelete: "set null"` so removing a dentist's account never deletes
  // their historical transactions.
  dentistUserId: uuid("dentist_user_id").references(() => users.id, { onDelete: "set null" }),
  procedure: text("procedure").notNull(),
  // Linked to the row in `procedures` (the price list) with the same name,
  // when there is one — see `findProcedureByName` in
  // `src/lib/db/procedures.ts`. That is what commission rates are set
  // against; a name not on the price list stays unlinked.
  procedureId: uuid("procedure_id").references(() => procedures.id, { onDelete: "set null" }),
  paymentType: text("payment_type").notNull().default(""),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull(),
  vatExclusive: numeric("vat_exclusive", { precision: 12, scale: 2 }).notNull().default("0"),
  vatAmount: numeric("vat_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  month: text("month").notNull(),
  year: integer("year").notNull(),
  invoiceNumber: text("invoice_number").notNull().default(""),
  remarks: text("remarks").notNull().default(""),
  merchantFee: numeric("merchant_fee", { precision: 12, scale: 2 }).notNull().default("0"),
  withholdingTax: numeric("withholding_tax", { precision: 12, scale: 2 }).notNull().default("0"),
  netCollection: numeric("net_collection", { precision: 12, scale: 2 }).notNull(),
  // Computed and stored at insert/update time from whatever commission rate
  // was in effect then (dentistUserId + procedureId -> dentist_commission_rates),
  // not recalculated on the fly — so a later rate change doesn't rewrite
  // history. Zero when there's no linked dentist, no linked procedure, or no
  // rate set for that pair.
  commissionAmount: numeric("commission_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  // Transferred patient: when a visit is handed to a second dentist, the
  // commission (worked out once at the MAIN dentist's rate) is split 50/50.
  // `commissionAmount` above is then the main dentist's half, and these hold
  // the other dentist and their half. Blank / null / 0 on a normal visit.
  transferDentist: text("transfer_dentist").notNull().default(""),
  transferDentistUserId: uuid("transfer_dentist_user_id").references(() => users.id, { onDelete: "set null" }),
  transferCommissionAmount: numeric("transfer_commission_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  // Which physical location this transaction happened at. CSV imports are
  // tagged with whichever branch is selected for that upload batch (the
  // source CSV has no branch column of its own); manual entries default
  // to the creating user's own branch.
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
  // Who actually recorded this row in the app (manual entry) or ran the
  // CSV import it came from. An audit trail, and also how "staff
  // performance" is attributed, since there's no separate "staff" column
  // in the source data the way there's a "dentist" column.
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  // Human-facing reference number shown on the printed invoice, e.g.
  // "091726-0001" (MMDDYY of the day it was recorded + a same-day running
  // sequence). Generated once at insert time and never changed afterward —
  // distinct from `id` (the internal upsert key) and from `invoiceNumber`
  // (a free-text field CSV imports may already carry from the clinic's old
  // system). Nullable so older rows can be backfilled rather than blocking
  // the migration; unique once set (Postgres allows more than one NULL
  // under a unique constraint).
  transactionNumber: text("transaction_number").unique(),
  // One row here is still one procedure line. `invoiceId` groups the lines
  // of one visit (see `invoices` below); `patientId` links to the patients
  // table (the free-text `patientName` above stays as what is displayed and
  // exported). Both nullable + set null so removing either never deletes
  // history.
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  patientId: uuid("patient_id").references(() => patients.id, { onDelete: "set null" }),
  lineNumber: integer("line_number").notNull().default(1),
  // HMO Letter of Authorization for THIS procedure (blank until it arrives;
  // only used when the visit is billed to an HMO). The visit's own
  // invoices.loa_number is the summary of these.
  loaNumber: text("loa_number").notNull().default(""),
  // Price before any discount. `amountPaid` above stays "line total due
  // after discount" (list price - discountAmount), which is what
  // commission, net collection and the dashboards are all built on.
  listPrice: numeric("list_price", { precision: 12, scale: 2 }).notNull().default("0"),
  // "" (none), "percent" or "amount"; `discountValue` is the percentage or
  // the peso figure as typed, `discountAmount` the computed peso value.
  discountMode: text("discount_mode").notNull().default(""),
  discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  discountReason: text("discount_reason").notNull().default(""),
  // "vat" | "non_vat" | "vat_exempt". `vatExclusive`/`vatAmount` above are
  // derived from this and the line total.
  vatType: text("vat_type").notNull().default("non_vat"),
  // How many of the procedure's price unit (teeth, surfaces, arches, units)
  // and the price of one. `listPrice` above = unitPrice × quantity.
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  // FDI tooth numbers / arch words as entered, e.g. "11, 12, upper arch".
  teeth: text("teeth").notNull().default(""),
  // The discount type picked on the form (PWD, Senior citizen, Promo).
  // `discountReason` keeps the type's name as text so history reads the
  // same even if a type is renamed later.
  discountTypeId: uuid("discount_type_id").references(() => discountTypes.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("transactions_invoice_id_idx").on(table.invoiceId),
  index("transactions_patient_id_idx").on(table.patientId),
  index("transactions_date_idx").on(table.date, table.createdAt),
  index("transactions_branch_idx").on(table.branchId),
  index("transactions_visit_id_idx").on(table.visitId),
  index("transactions_dentist_user_idx").on(table.dentistUserId),
  index("transactions_transfer_dentist_user_idx")
    .on(table.transferDentistUserId)
    .where(sql`${table.transferDentistUserId} is not null`),
]);

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;

/**
 * Permission levels for logged-in users:
 * - admin: full access — add/import/delete transactions, manage users.
 * - dentist / staff: add and import transactions, view everything, but
 *   cannot delete records or manage users.
 *
 * See src/lib/cashflow/user-schema.ts for the shared Zod type.
 */
export const userRoleEnum = pgEnum("user_role", ["admin", "dentist", "staff", "superuser", "owner"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("staff"),
  // Which branch this dentist/staff member normally works at. Nullable —
  // admins in particular may not belong to a single branch, and existing
  // accounts start unassigned rather than blocking on a backfill.
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Password management (scripts/sql/2026-11-password-management.sql).
  // True after an admin creates or resets the account: the person may only
  // open the Change password page until they have chosen their own.
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  // When the temporary password stops working (null = not a temporary one).
  tempPasswordExpiresAt: timestamp("temp_password_expires_at", { withTimezone: true }),
  // Raised by one on every password change or reset; a sign-in whose token
  // carries an older number is ended (signs the person out on other devices).
  sessionVersion: integer("session_version").notNull().default(0),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/**
 * Per-user settings, kept separate from `users` (identity/auth) since this
 * is display preference, not account data. One row per user — `userId` is
 * both the primary key and the foreign key, so a user can have at most one
 * preferences row, and deleting a user cleans this up automatically
 * (`onDelete: "cascade"`).
 *
 * Only `theme` for now (this app intentionally defaults every viewer to
 * light mode regardless of their OS setting — see globals.css — so a
 * user's choice here is what actually controls dark mode, not a
 * `prefers-color-scheme` guess). Add more columns here as more per-user
 * settings show up, rather than growing the `users` table itself.
 */
export const themeEnum = pgEnum("theme", ["light", "dark"]);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: themeEnum("theme").notNull().default("light"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserPreferencesRow = typeof userPreferences.$inferSelect;
export type NewUserPreferencesRow = typeof userPreferences.$inferInsert;

/**
 * Canonical list of procedure names, so commission rates have something
 * stable to attach to. It is the clinic's price list (loaded from the
 * pricelist SQL file): a row is never created automatically from a
 * transaction's text. Names are matched case-insensitively (see
 * `findProcedureByName` in `src/lib/db/procedures.ts`). The free-text `procedure` column
 * on `transactions` is unchanged (still what's displayed/exported); this
 * table exists purely so procedures can be referenced (and rated) as an
 * entity instead of matched by string every time.
 */
export const procedures = pgTable("procedures", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  // The list price (filled in on the transaction form, still editable) and
  // whether the procedure carries 12% VAT. Nullable price: a procedure
  // that has no list price has no default.
  defaultVatType: text("default_vat_type").notNull().default("non_vat"),
  defaultPrice: numeric("default_price", { precision: 12, scale: 2 }),
  // What the price counts: flat | tooth | surface | arch | unit.
  priceBasis: text("price_basis").notNull().default("flat"),
  // false = hidden from the transaction form's list (never deleted once used).
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProcedureRow = typeof procedures.$inferSelect;
export type NewProcedureRow = typeof procedures.$inferInsert;

/**
 * Every change to a procedure's list price. Old transactions keep the price
 * they were sold at (it is stored on the line), so this table is the audit
 * trail of what the price list used to say.
 */
export const procedurePriceHistory = pgTable("procedure_price_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  procedureId: uuid("procedure_id")
    .notNull()
    .references(() => procedures.id, { onDelete: "cascade" }),
  oldPrice: numeric("old_price", { precision: 12, scale: 2 }),
  newPrice: numeric("new_price", { precision: 12, scale: 2 }),
  changedByUserId: uuid("changed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  changedByName: text("changed_by_name").notNull().default(""),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note").notNull().default(""),
  // Which price changed: "Cash" (procedures.default_price) or an HMO name.
  payer: text("payer").notNull().default("Cash"),
}, (table) => [
  index("procedure_price_history_procedure_idx").on(table.procedureId, table.changedAt.desc()),
]);

/**
 * The price of a procedure for one HMO (payer = the payment type name as on
 * the form, e.g. "Maxicare"). Cash and every other payment method use
 * `procedures.default_price`. No row = that HMO has no price for it.
 */
export const procedurePrices = pgTable(
  "procedure_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    procedureId: uuid("procedure_id")
      .notNull()
      .references(() => procedures.id, { onDelete: "cascade" }),
    payer: text("payer").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.procedureId, table.payer)],
);

/**
 * Payment methods added by an owner or admin (the built-in ones live in
 * src/lib/cashflow/payment-methods.ts). Visits and payments keep storing the
 * method's name as text, so a method is never renamed, only hidden.
 */
export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  kind: text("kind").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdByName: text("created_by_name").notNull().default(""),
});

export type PaymentMethodRow = typeof paymentMethods.$inferSelect;

/**
 * A transaction line the branch manager / admin has checked ("ticked") after
 * the daily review. A visit with a checked line is locked: only the superuser
 * can edit, remove or unlock it. Kept in its own table (one row per checked
 * line) so nothing existing changes and the app still runs before the SQL
 * script is run. Deleting the line deletes its check.
 */
export const transactionChecks = pgTable(
  "transaction_checks",
  {
    transactionId: text("transaction_id")
      .primaryKey()
      .references(() => transactions.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    checkedByUserId: uuid("checked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    checkedByName: text("checked_by_name").notNull().default(""),
  },
  (table) => [index("transaction_checks_checked_at_idx").on(table.checkedAt)],
);

/**
 * The second check, by Headquarters, on a visit the Branch manager has already
 * checked (a row in `transaction_checks`). Same shape, own table, so the first
 * check and its lock are untouched. One row per line; deleting the line
 * deletes it. Created by scripts/sql/2026-11-transaction-hq-checks.sql.
 */
export const transactionHqChecks = pgTable(
  "transaction_hq_checks",
  {
    transactionId: text("transaction_id")
      .primaryKey()
      .references(() => transactions.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    checkedByUserId: uuid("checked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    checkedByName: text("checked_by_name").notNull().default(""),
  },
  (table) => [index("transaction_hq_checks_checked_at_idx").on(table.checkedAt)],
);

export type TransactionCheckRow = typeof transactionChecks.$inferSelect;

export type PriceHistoryRow = typeof procedurePriceHistory.$inferSelect;

/**
 * The discounts the form offers. `statutory` (PWD / Senior citizen) is what
 * switches on the "VAT removed first, then 20%" rule; `needsId` is what makes
 * an ID number mandatory on the visit. Managed here, not in code.
 */
export const discountTypes = pgTable("discount_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  defaultPercent: numeric("default_percent", { precision: 5, scale: 2 }),
  statutory: boolean("statutory").notNull().default(false),
  needsId: boolean("needs_id").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DiscountTypeRow = typeof discountTypes.$inferSelect;

/**
 * A commission percentage for one (person, procedure) pair — set by an
 * admin on the Commissions page. Despite the column name, `dentistUserId`
 * accepts any user id, dentist or staff: there's no role CHECK constraint
 * at the database level, only application logic (see
 * `listCommissionEligibleUsers` in `dentists.ts`), so staff bonuses reuse
 * this exact table rather than needing a parallel one. One rate per
 * (person, procedure) pair; both sides cascade-delete (removing an
 * account or a procedure clears any rates tied to it, rather than leaving
 * orphaned rows).
 *
 * Rates are read at the moment a transaction is saved and baked into that
 * transaction's `commissionAmount` (see `transactions.ts`) — changing a
 * rate here only affects transactions recorded *after* the change, not
 * historical ones. For staff, "the transaction" a rate applies to is the
 * one they recorded (`createdByUserId`), since staff don't have a
 * `dentist`-style free-text field of their own in the source data.
 */
export const dentistCommissionRates = pgTable(
  "dentist_commission_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dentistUserId: uuid("dentist_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    procedureId: uuid("procedure_id")
      .notNull()
      .references(() => procedures.id, { onDelete: "cascade" }),
    // Percent, e.g. "12.50" for 12.5%.
    ratePercent: numeric("rate_percent", { precision: 5, scale: 2 }).notNull(),
    // What the same procedure earns when the visit is paid by an HMO
    // (Maxicare, Medicard, ...): a percent of net collection (e.g. OP 10%)
    // and/or a fixed peso amount (X-rays). Null = not set. An HMO visit for
    // a procedure with neither set earns no commission.
    hmoRatePercent: numeric("hmo_rate_percent", { precision: 5, scale: 2 }),
    hmoPesoValue: numeric("hmo_peso_value", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.dentistUserId, table.procedureId)],
);

export type DentistCommissionRateRow = typeof dentistCommissionRates.$inferSelect;
export type NewDentistCommissionRateRow = typeof dentistCommissionRates.$inferInsert;

/**
 * Which commission tier (1, 2 or 3) a dentist belongs to. Kept in its own
 * table rather than as a column on `users` so the sign-in query (which reads
 * every `users` column) never depends on this migration. A dentist with no
 * row here has no tier and only earns from individual rates.
 */
export const dentistCommissionTiers = pgTable("dentist_commission_tiers", {
  dentistUserId: uuid("dentist_user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  tier: smallint("tier").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DentistCommissionTierRow = typeof dentistCommissionTiers.$inferSelect;

/**
 * The commission a procedure earns for every dentist in a tier — the
 * clinic's "LIST - TIER" sheet. Same four settings as an individual rate
 * (cash %, HMO %, HMO peso) plus `pesoValue`, a flat peso amount that
 * applies to every payment type (the X-rays: ₱70 panoramic, ₱30 periapical).
 *
 * At save time a dentist's own row in `dentist_commission_rates` (an
 * individual override) wins; otherwise the tier's rate for the procedure is
 * used. Adding a procedure here gives it to every dentist in that tier.
 */
export const commissionTierRates = pgTable(
  "commission_tier_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tier: smallint("tier").notNull(),
    procedureId: uuid("procedure_id")
      .notNull()
      .references(() => procedures.id, { onDelete: "cascade" }),
    ratePercent: numeric("rate_percent", { precision: 5, scale: 2 }).notNull(),
    hmoRatePercent: numeric("hmo_rate_percent", { precision: 5, scale: 2 }),
    pesoValue: numeric("peso_value", { precision: 12, scale: 2 }),
    hmoPesoValue: numeric("hmo_peso_value", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.tier, table.procedureId)],
);

export type CommissionTierRateRow = typeof commissionTierRates.$inferSelect;
/**
 * One transaction can be paid off in more than one installment (different
 * dates, different methods) rather than fully paid in one shot. Each row
 * here is one real payment received; `transactions.amountPaid` is the
 * total amount actually due for that visit, and "balance due" is always
 * computed as amountPaid minus the sum of its payments — never stored, so
 * it can't drift out of sync with the payment history.
 *
 * Every pre-existing transaction is backfilled with exactly one payment
 * row equal to its `amountPaid` (see the backfill script), so historical
 * data reads as "fully paid in one payment," not "unpaid."
 */
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Legacy link, kept for history. Payments now belong to an invoice (one
  // payment can cover several procedure lines), so this is no longer
  // required.
  transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  // Reuses the same free-text vocabulary as transactions.paymentType (Cash,
  // GCash, a specific HMO, etc.) — one installment can be paid a different
  // way than another.
  paymentType: text("payment_type").notNull().default(""),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  // Card slip / GCash / bank transfer reference, for proof of payment.
  referenceNo: text("reference_no").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("payments_invoice_id_idx").on(table.invoiceId),
  index("payments_paid_at_idx").on(table.paidAt),
]);

export type PaymentRow = typeof payments.$inferSelect;
export type NewPaymentRow = typeof payments.$inferInsert;

/**
 * A photo or PDF attached to a visit or to an expense. On a visit it is the
 * paper invoice or a proof of payment (card slip, GCash / bank-transfer
 * screenshot); `kind` says which, and a proof of payment can also point at
 * the specific payment it proves (`paymentId`). On an expense it is the
 * receipt / proof. All the links cascade, so removing a visit, a payment or
 * an expense removes its files.
 *
 * The file itself is stored in the database as base64 text in `dataBase64`
 * (simple, no extra service, and works wherever the app is hosted — files
 * are kept small, see `attachment-rules.ts`). Lists and screens read only
 * the other columns; the data column is read only when a file is opened.
 */
export const attachments = pgTable("attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  // A file belongs to a visit (invoice photo, proof of payment) or to an
  // expense (receipt / proof) — exactly one of the two is set.
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
  expenseId: uuid("expense_id").references(() => expenses.id, { onDelete: "cascade" }),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "cascade" }),
  // "invoice" | "receipt"
  kind: text("kind").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  dataBase64: text("data_base64").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("attachments_invoice_id_idx").on(table.invoiceId),
  index("attachments_expense_id_idx").on(table.expenseId),
]);

export type AttachmentRow = typeof attachments.$inferSelect;
export type NewAttachmentRow = typeof attachments.$inferInsert;

export const targetPeriodEnum = pgEnum("target_period", ["month", "quarter", "year"]);
export type TargetPeriodType = (typeof targetPeriodEnum.enumValues)[number];

/**
 * An admin-set collection target for one period, compared against real net
 * collection on the dashboard's "target vs actual" card. `periodKey` uses
 * the same key shape the dashboard's granularity series already compute —
 * "2026-09" for a month, "2026-Q3" for a quarter, "2026" for a year — so
 * the target and the actual totals line up on identical period boundaries
 * without a separate date-range calculation.
 */
export const salesTargets = pgTable(
  "sales_targets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    periodType: targetPeriodEnum("period_type").notNull(),
    periodKey: text("period_key").notNull(),
    targetAmount: numeric("target_amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.periodType, table.periodKey)],
);

export type SalesTargetRow = typeof salesTargets.$inferSelect;
export type NewSalesTargetRow = typeof salesTargets.$inferInsert;

/**
 * A clinic operating expense — rent, supplies, salaries, utilities, and so
 * on. Mirrors the same "record what actually happened" shape as
 * `transactions`, just on the outflow side, so the same list/filter/modal
 * UI patterns apply. See `docs/PROPOSAL_GAP_ANALYSIS.md` — before this,
 * the dashboard's expense cards were 100% sample data (no real tracking
 * existed anywhere).
 */
export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: text("date").notNull(), // YYYY-MM-DD, same convention as transactions.date
  category: text("category").notNull(),
  description: text("description").notNull().default(""),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  // Reuses the same free-text vocabulary as transactions.paymentType (Cash,
  // GCash, bank transfer, etc.) — how the expense was actually paid, not
  // required since it's sometimes recorded after the fact from a receipt.
  paymentMethod: text("payment_method").notNull().default(""),
  // Which physical location this expense applies to. Nullable — a
  // clinic-wide expense (e.g. a shared software subscription) has none.
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
  // Who recorded this row — same audit-trail purpose as
  // transactions.createdByUserId.
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  referenceNo: text("reference_no").notNull().default(""),
  remarks: text("remarks").notNull().default(""),
  // "" | "services" | "goods"
  nature: text("nature").notNull().default(""),
  vatType: text("vat_type").notNull().default("non_vat"),
  vatableAmount: numeric("vatable_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  vatAmount: numeric("vat_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("expenses_date_idx").on(table.date),
  index("expenses_branch_date_idx").on(table.branchId, table.date),
]);

export type ExpenseRow = typeof expenses.$inferSelect;
export type NewExpenseRow = typeof expenses.$inferInsert;

/**
 * One row per real patient. Matched by name only (trimmed, single spaces,
 * lower-cased -> `nameKey`), so "Maria  Santos" and "maria santos" are the
 * same patient. Created automatically the first time a name is saved, the
 * same way procedures are; the transaction form's typeahead searches this
 * table.
 */
export const patients = pgTable("patients", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: text("full_name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  contactNumber: text("contact_number").notNull().default(""),
  notes: text("notes").notNull().default(""),
  /** YYYY-MM-DD, or "" when not known. */
  birthDate: text("birth_date").notNull().default(""),
  /** The patient's HMO / insurance company (free text, suggestions offered). */
  hmoCompany: text("hmo_company").notNull().default(""),
  /** The patient's member / account number with that HMO. */
  hmoAccountNumber: text("hmo_account_number").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("patients_name_key_prefix_idx").on(table.nameKey.op("text_pattern_ops")),
]);

/**
 * A patient's HMOs: one row per company with the patient's member / account
 * number for it (a patient can belong to several). The first one (position 0)
 * is also copied into `patients.hmo_company` / `hmo_account_number`, which the
 * older screens and searches still read. Created by
 * scripts/sql/2026-11-patient-hmos.sql.
 */
export const patientHmos = pgTable(
  "patient_hmos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    /** The company name, lower case, so "Maxicare" and "maxicare " are one. */
    companyKey: text("company_key").notNull(),
    accountNumber: text("account_number").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("patient_hmos_patient_company_idx").on(table.patientId, table.companyKey),
  ],
);

export type PatientHmoRow = typeof patientHmos.$inferSelect;

export type PatientRow = typeof patients.$inferSelect;
export type NewPatientRow = typeof patients.$inferInsert;

/**
 * Who an expense was paid to. Same auto-create-by-name approach as
 * patients; name, address and TIN are what the clinic's books need for a
 * VAT purchase.
 */
export const suppliers = pgTable("suppliers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  address: text("address").notNull().default(""),
  tin: text("tin").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SupplierRow = typeof suppliers.$inferSelect;
export type NewSupplierRow = typeof suppliers.$inferInsert;

/**
 * One visit's bill: the header that groups one or more procedure lines
 * (rows in `transactions`) and the payments taken against them.
 * `invoiceNumber` is typed in by staff from the paper invoice booklet and
 * may be blank (some transactions have no invoice or receipt).
 */
export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceNumber: text("invoice_number").notNull().default(""),
  visitDate: text("visit_date").notNull(), // YYYY-MM-DD
  patientId: uuid("patient_id").references(() => patients.id, { onDelete: "set null" }),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
  transactionType: text("transaction_type").notNull().default("Visit"),
  visitType: text("visit_type").notNull().default(""),
  // PWD / Senior citizen ID, recorded once per visit (required when a line
  // uses a discount type that needs an ID).
  discountIdType: text("discount_id_type").notNull().default(""),
  discountIdNumber: text("discount_id_number").notNull().default(""),
  // When the patient should come back, and why (optional). YYYY-MM-DD.
  recallDate: text("recall_date"),
  recallReason: text("recall_reason").notNull().default(""),
  // HMO authorization. The LOA (Letter of Authorization) often arrives the
  // day after the visit, so it starts blank: an HMO visit with no LOA is
  // "LOA pending" and cannot be Cleared. The LOE is optional.
  loaNumber: text("loa_number").notNull().default(""),
  loeNumber: text("loe_number").notNull().default(""),
  // Internal tracking: Arrived | On-going | For Payment | Cleared (see
  // src/lib/cashflow/visit-status.ts). A work-flow label only — it never
  // changes sales, collections or commission. Old visits are Cleared.
  status: text("status").notNull().default("Cleared"),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("invoices_invoice_number_idx").on(table.invoiceNumber).where(sql`${table.invoiceNumber} <> ''`),
  index("invoices_status_idx").on(table.status, table.visitDate),
  index("invoices_patient_visit_idx").on(table.patientId, table.visitDate),
  index("invoices_recall_date_idx").on(table.recallDate).where(sql`${table.recallDate} is not null`),
  index("invoices_visit_date_idx").on(table.visitDate),
  index("invoices_branch_visit_idx").on(table.branchId, table.visitDate),
]);

/**
 * Every status change of a visit: who, when, from, to and why. Gives the
 * audit trail and the waiting times (arrival to treatment to payment).
 * Removed with the visit.
 */
export const invoiceStatusHistory = pgTable("invoice_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedByUserId: uuid("changed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  changedByName: text("changed_by_name").notNull().default(""),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note").notNull().default(""),
}, (table) => [
  index("invoice_status_history_invoice_idx").on(table.invoiceId, table.changedAt),
]);

/**
 * Who did what, and when: visits created / edited / removed, payments added
 * or removed, patients edited or merged, status changes. `invoiceId` and
 * `patientId` are plain ids (no foreign key) so the trail survives the
 * visit or patient being removed afterwards.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name").notNull().default(""),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull().default(""),
  invoiceId: uuid("invoice_id"),
  patientId: uuid("patient_id"),
  summary: text("summary").notNull().default(""),
  details: jsonb("details"),
}, (table) => [
  index("audit_log_invoice_idx").on(table.invoiceId, table.createdAt),
  index("audit_log_patient_idx").on(table.patientId, table.createdAt),
  index("audit_log_created_idx").on(table.createdAt.desc()),
]);

/**
 * Every sign-in attempt, successful or not: when, which e-mail, from which
 * address and browser. Used to lock an account (or address) for a while
 * after repeated wrong passwords, and as a sign-in history for admins.
 * `emailKey` is the typed e-mail, trimmed and lower-cased (it may be one
 * that does not exist). Rows older than 90 days are removed as new ones are
 * added.
 */
export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  emailKey: text("email_key").notNull(),
  ip: text("ip").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  success: boolean("success").notNull(),
  /** "ok" | "wrong_password" | "unknown_email" | "locked" */
  outcome: text("outcome").notNull().default(""),
}, (table) => [
  index("login_attempts_email_idx").on(table.emailKey, table.createdAt),
  index("login_attempts_ip_idx").on(table.ip, table.createdAt),
]);

/**
 * "I forgot my password" requests. A request changes nothing by itself: an
 * admin (or the superuser, for admin accounts) checks who is asking and then
 * resets the password. `userId` is null when no account has that e-mail.
 */
export const passwordResetRequests = pgTable("password_reset_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  emailKey: text("email_key").notNull(),
  note: text("note").notNull().default(""),
  ip: text("ip").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  /** "open" | "done" | "dismissed" */
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
  handledAt: timestamp("handled_at", { withTimezone: true }),
}, (table) => [
  index("password_reset_requests_status_idx").on(table.status, table.createdAt.desc()),
  index("password_reset_requests_email_idx").on(table.emailKey, table.createdAt),
]);

export type PasswordResetRequestRow = typeof passwordResetRequests.$inferSelect;

export type AuditLogRow = typeof auditLog.$inferSelect;

export type InvoiceStatusHistoryRow = typeof invoiceStatusHistory.$inferSelect;

export type InvoiceRow = typeof invoices.$inferSelect;
export type NewInvoiceRow = typeof invoices.$inferInsert;

/**
 * An HMO billing: one HMO + one branch + one cut-off date range, saved with
 * an automatic number (HMO-MAR-26-0001). The saved rows live in
 * `hmoBillingLines`; a billing keeps its own copy of each row so the file
 * sent to the HMO can always be produced again as it was. Created by
 * `scripts/sql/2026-11-hmo-billings.sql`.
 */
export const hmoBillings = pgTable("hmo_billings", {
  id: uuid("id").defaultRandom().primaryKey(),
  billingNumber: text("billing_number").notNull().unique(),
  hmo: text("hmo").notNull(),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
  // The branch name as it was when the billing was made.
  branchName: text("branch_name").notNull().default(""),
  // Cut-off range, clinic dates (YYYY-MM-DD), both days included.
  periodFrom: text("period_from").notNull(),
  periodTo: text("period_to").notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  lineCount: integer("line_count").notNull().default(0),
  patientCount: integer("patient_count").notNull().default(0),
  // Lines with no LOA yet when the billing was made.
  pendingLoaCount: integer("pending_loa_count").notNull().default(0),
  // "Active" | "Void". A voided billing releases its lines.
  status: text("status").notNull().default("Active"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdByName: text("created_by_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedByName: text("voided_by_name").notNull().default(""),
}, (table) => [
  index("hmo_billings_branch_created_idx").on(table.branchId, table.createdAt),
  index("hmo_billings_hmo_idx").on(table.hmo),
]);

export const hmoBillingLines = pgTable("hmo_billing_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  billingId: uuid("billing_id").notNull().references(() => hmoBillings.id, { onDelete: "cascade" }),
  // The procedure line (transactions.id) the row was made from. Plain text,
  // not a link: removing a visit never changes a saved billing.
  transactionId: text("transaction_id").notNull(),
  lineNumber: integer("line_number").notNull().default(0),
  visitId: text("visit_id").notNull().default(""),
  visitDate: text("visit_date").notNull(),
  patientName: text("patient_name").notNull().default(""),
  hmoAccountNumber: text("hmo_account_number").notNull().default(""),
  loaNumber: text("loa_number").notNull().default(""),
  loeNumber: text("loe_number").notNull().default(""),
  procedure: text("procedure").notNull().default(""),
  teeth: text("teeth").notNull().default(""),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  // True while the billing is Active. The unique index lets a procedure line
  // be on ONE active billing only, even if two people generate at once.
  active: boolean("active").notNull().default(true),
}, (table) => [
  index("hmo_billing_lines_billing_idx").on(table.billingId, table.lineNumber),
  uniqueIndex("hmo_billing_lines_active_transaction_idx").on(table.transactionId).where(sql`${table.active}`),
]);

/** The running billing number per branch code and year. */
export const hmoBillingCounters = pgTable("hmo_billing_counters", {
  prefix: text("prefix").notNull(),
  year: smallint("year").notNull(),
  lastNumber: integer("last_number").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.prefix, table.year] }),
]);

export type HmoBillingRow = typeof hmoBillings.$inferSelect;
export type HmoBillingLineRow = typeof hmoBillingLines.$inferSelect;

/**
 * The clinics (branches) a person is authorized for
 * (scripts/sql/2026-11-roles-permissions-trash.sql). Owners, admins and the
 * superuser work in every clinic and need no rows; a dentist or staff member
 * works in the clinics listed here. `users.branchId` stays their first
 * ("home") clinic.
 */
export const userBranches = pgTable(
  "user_branches",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.branchId] })],
);

/**
 * One person's privileges that differ from their role's defaults: granted =
 * true adds a privilege the role does not have, false takes away one it has.
 * Only the differences are stored, so changing a role default later still
 * reaches everyone who was not customized.
 */
export const userPermissionOverrides = pgTable(
  "user_permission_overrides",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    granted: boolean("granted").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.permission] })],
);

/**
 * Everything an owner or admin deletes (a visit, a transaction line, a
 * payment, an expense or a file) is copied here as a snapshot and removed
 * from the live tables — so it disappears from every list, total and report
 * — and the superuser can restore it (or erase it for good). Nothing else
 * reads this table.
 */
export const deletedItems = pgTable(
  "deleted_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind").notNull(),
    entityId: text("entity_id").notNull(),
    label: text("label").notNull().default(""),
    summary: text("summary").notNull().default(""),
    branchId: uuid("branch_id"),
    amount: numeric("amount", { precision: 12, scale: 2 }),
    snapshot: jsonb("snapshot").notNull(),
    deletedByUserId: uuid("deleted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    deletedByName: text("deleted_by_name").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    restoredByName: text("restored_by_name").notNull().default(""),
  },
  (table) => [index("deleted_items_deleted_at_idx").on(table.deletedAt.desc())],
);

export type DeletedItemRow = typeof deletedItems.$inferSelect;
