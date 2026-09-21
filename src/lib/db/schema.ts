import { integer, numeric, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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
  // Every transaction is linked to a row in `procedures` (created
  // automatically the first time a given procedure name is seen — see
  // `src/lib/db/procedures.ts`), which is what commission rates are set
  // against.
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
export const userRoleEnum = pgEnum("user_role", ["admin", "dentist", "staff"]);

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
 * stable to attach to. Procedures aren't gated behind an admin UI — a row
 * is created automatically the first time a given name is seen, from
 * either manual entry or CSV import (see `getOrCreateProcedureByName` in
 * `src/lib/db/procedures.ts`), matched case-insensitively so "Ortho Adj"
 * and "ortho adj" resolve to the same row. The free-text `procedure` column
 * on `transactions` is unchanged (still what's displayed/exported); this
 * table exists purely so procedures can be referenced (and rated) as an
 * entity instead of matched by string every time.
 */
export const procedures = pgTable("procedures", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProcedureRow = typeof procedures.$inferSelect;
export type NewProcedureRow = typeof procedures.$inferInsert;

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.dentistUserId, table.procedureId)],
);

export type DentistCommissionRateRow = typeof dentistCommissionRates.$inferSelect;
export type NewDentistCommissionRateRow = typeof dentistCommissionRates.$inferInsert;
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
  transactionId: text("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  // Reuses the same free-text vocabulary as transactions.paymentType (Cash,
  // GCash, a specific HMO, etc.) — one installment can be paid a different
  // way than another.
  paymentType: text("payment_type").notNull().default(""),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentRow = typeof payments.$inferSelect;
export type NewPaymentRow = typeof payments.$inferInsert;

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
