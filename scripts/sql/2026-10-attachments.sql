-- Invoice / receipt uploads: a table that holds the photos and PDFs attached
-- to a visit (the paper invoice), to a payment (proof of payment) or to an
-- expense (its receipt).
--
-- Safe to run more than once. Run in the Neon SQL Editor before using the
-- upload buttons.

CREATE TABLE IF NOT EXISTS "attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid,
  "expense_id" uuid,
  "payment_id" uuid,
  "kind" text NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "data_base64" text NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- A file belongs to a visit OR to an expense. (These two statements bring a
-- table created by an earlier version of this file up to date; they do
-- nothing on a fresh one.)
ALTER TABLE "attachments" ALTER COLUMN "invoice_id" DROP NOT NULL;
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "expense_id" uuid;

DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "attachments_invoice_id_idx" ON "attachments" ("invoice_id");
CREATE INDEX IF NOT EXISTS "attachments_expense_id_idx" ON "attachments" ("expense_id");
