-- Invoices (multiple procedures per visit), patients, suppliers, per-line
-- discounts and VAT type, payment reference numbers, and the richer
-- expense fields.
--
-- Run this manually in Neon's SQL Editor (or `psql "$DATABASE_URL" -f ...`)
-- rather than `yarn db:push` — drizzle-kit 0.28.1 still generates a
-- spurious NOT NULL constraint drop against Postgres 17+ that aborts push
-- (see 2026-09-commission-schema.sql). Everything below is idempotent, so
-- it is safe to run more than once.
--
-- Order of operations: new tables -> new columns -> constraints/indexes ->
-- backfills (pure SQL, no separate script needed) -> expense label cleanup.
-- Run this BEFORE starting the updated app; the app now reads the new
-- columns on every transaction query.

-- ── 1. New tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"name_key" text NOT NULL,
	"contact_number" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "patients_name_key_unique" ON "patients" ("name_key");
CREATE INDEX IF NOT EXISTS "patients_name_key_prefix_idx" ON "patients" ("name_key" text_pattern_ops);

CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"tin" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_name_key_unique" ON "suppliers" ("name_key");

CREATE TABLE IF NOT EXISTS "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text DEFAULT '' NOT NULL,
	"visit_date" text NOT NULL,
	"patient_id" uuid,
	"branch_id" uuid,
	"transaction_type" text DEFAULT 'Visit' NOT NULL,
	"visit_type" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "invoices_invoice_number_idx" ON "invoices" ("invoice_number") WHERE "invoice_number" <> '';

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── 2. New columns on existing tables ──────────────────────────────────

-- One row in `transactions` is still one procedure line; `invoice_id`
-- groups the lines of one visit. Discounts and VAT are per line.
ALTER TABLE "transactions"
	ADD COLUMN IF NOT EXISTS "invoice_id" uuid,
	ADD COLUMN IF NOT EXISTS "patient_id" uuid,
	ADD COLUMN IF NOT EXISTS "line_number" integer DEFAULT 1 NOT NULL,
	ADD COLUMN IF NOT EXISTS "list_price" numeric(12, 2) DEFAULT 0 NOT NULL,
	ADD COLUMN IF NOT EXISTS "discount_mode" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "discount_value" numeric(12, 2) DEFAULT 0 NOT NULL,
	ADD COLUMN IF NOT EXISTS "discount_amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	ADD COLUMN IF NOT EXISTS "discount_reason" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "vat_type" text DEFAULT 'non_vat' NOT NULL;

DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "transactions_invoice_id_idx" ON "transactions" ("invoice_id");
CREATE INDEX IF NOT EXISTS "transactions_patient_id_idx" ON "transactions" ("patient_id");

-- Payments now belong to an invoice (one payment can cover several
-- lines). `transaction_id` stays for history but is no longer required.
ALTER TABLE "payments"
	ADD COLUMN IF NOT EXISTS "invoice_id" uuid,
	ADD COLUMN IF NOT EXISTS "reference_no" text DEFAULT '' NOT NULL;

ALTER TABLE "payments" ALTER COLUMN "transaction_id" DROP NOT NULL;

DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "payments_invoice_id_idx" ON "payments" ("invoice_id");

-- A procedure remembers the price and VAT type it was last sold with, so
-- the form can pre-fill them.
ALTER TABLE "procedures"
	ADD COLUMN IF NOT EXISTS "default_vat_type" text DEFAULT 'non_vat' NOT NULL,
	ADD COLUMN IF NOT EXISTS "default_price" numeric(12, 2);

ALTER TABLE "expenses"
	ADD COLUMN IF NOT EXISTS "supplier_id" uuid,
	ADD COLUMN IF NOT EXISTS "reference_no" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "remarks" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "nature" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "vat_type" text DEFAULT 'non_vat' NOT NULL,
	ADD COLUMN IF NOT EXISTS "vatable_amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	ADD COLUMN IF NOT EXISTS "vat_amount" numeric(12, 2) DEFAULT 0 NOT NULL;

DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── 3. Backfills ───────────────────────────────────────────────────────

-- Existing rows keep behaving as before: before discounts existed, the
-- amount on a line was its list price; a line with VAT recorded was a VAT
-- line.
UPDATE "transactions" SET "list_price" = "amount_paid" WHERE "list_price" = 0 AND "amount_paid" > 0;
UPDATE "transactions" SET "vat_type" = 'vat' WHERE "vat_amount" > 0 AND "vat_type" = 'non_vat';

-- Patients: one per distinct normalized name (trimmed, single spaces,
-- lower-cased). The id is derived from the name key so re-running this
-- never creates duplicates.
INSERT INTO "patients" ("id", "full_name", "name_key")
SELECT md5('pat:' || k."name_key")::uuid, k."full_name", k."name_key"
FROM (
	SELECT
		lower(regexp_replace(btrim("patient_name"), '\s+', ' ', 'g')) AS "name_key",
		min(regexp_replace(btrim("patient_name"), '\s+', ' ', 'g')) AS "full_name"
	FROM "transactions"
	WHERE btrim("patient_name") <> ''
	GROUP BY 1
) k
ON CONFLICT DO NOTHING;

UPDATE "transactions" t
SET "patient_id" = p."id"
FROM "patients" p
WHERE t."patient_id" IS NULL
	AND p."name_key" = lower(regexp_replace(btrim(t."patient_name"), '\s+', ' ', 'g'));

-- Invoices: every existing transaction becomes its own one-line invoice
-- (same behaviour as before). The auto-generated invoice numbers the old
-- form produced (YYYYMMDD-####-HHMMSS) were not booklet numbers, so they
-- are not carried over; numbers typed in by hand or imported are.
INSERT INTO "invoices" ("id", "invoice_number", "visit_date", "branch_id", "transaction_type", "visit_type", "created_by_user_id", "created_at")
SELECT
	md5('inv:' || t."id")::uuid,
	CASE WHEN t."invoice_number" ~ '^\d{8}-\d{4}-\d{6}$' THEN '' ELSE t."invoice_number" END,
	t."date",
	t."branch_id",
	t."transaction_type",
	t."visit_type",
	t."created_by_user_id",
	t."created_at"
FROM "transactions" t
WHERE t."invoice_id" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "transactions" SET "invoice_id" = md5('inv:' || "id")::uuid WHERE "invoice_id" IS NULL;

UPDATE "invoices" i
SET "patient_id" = t."patient_id"
FROM "transactions" t
WHERE t."invoice_id" = i."id" AND i."patient_id" IS NULL AND t."patient_id" IS NOT NULL;

-- Existing payments follow their transaction onto its invoice.
UPDATE "payments" p
SET "invoice_id" = t."invoice_id"
FROM "transactions" t
WHERE p."transaction_id" = t."id" AND p."invoice_id" IS NULL;

-- ── 4. Expense label cleanup ───────────────────────────────────────────

-- The expense categories now use the clinic's own wording ("Particulars").
-- Re-label anything saved under the old names so the dashboard groups it
-- with the new ones instead of showing two near-identical slices.
UPDATE "expenses" SET "category" = 'Dental Supplies' WHERE "category" = 'Dental supplies';
UPDATE "expenses" SET "category" = 'Repairs' WHERE "category" = 'Maintenance & repairs';
UPDATE "expenses" SET "category" = 'Office Supplies & equipment' WHERE "category" = 'Equipment';
UPDATE "expenses" SET "category" = 'Miscellaneous' WHERE "category" = 'Other';

-- Expenses were paid with "payment methods" from the income list before;
-- nothing to convert, the values are free text and stay as they were.
