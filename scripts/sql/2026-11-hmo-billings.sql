-- HMO billing (Transactions -> HMO billing tab).
--
-- A billing is one HMO + one branch + one cut-off date range. It is saved
-- with an automatic number (HMO-MAR-26-0001: branch code, year, running
-- number per branch per year) and keeps its own copy of every row, so a
-- file sent to the HMO can always be produced again exactly as it was.
--
-- Run this in the Neon SQL Editor BEFORE starting the updated app: until it
-- is run, the HMO billing tab shows "This page couldn't load". Safe to run
-- more than once.
--
-- Three tables
--   hmo_billings          one row per billing (number, HMO, branch, cut-off
--                         range, totals, who made it, Active / Void)
--   hmo_billing_lines     the saved rows of a billing (patient, account #,
--                         LOA, LOE, procedure, tooth #, amount)
--   hmo_billing_counters  the running number per branch code and year

CREATE TABLE IF NOT EXISTS "hmo_billings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "billing_number" text NOT NULL UNIQUE,
  "hmo" text NOT NULL,
  "branch_id" uuid REFERENCES "branches"("id") ON DELETE SET NULL,
  -- The branch name as it was when the billing was made.
  "branch_name" text NOT NULL DEFAULT '',
  -- The cut-off range, clinic dates (YYYY-MM-DD), both days included.
  "period_from" text NOT NULL,
  "period_to" text NOT NULL,
  "total_amount" numeric(12, 2) NOT NULL DEFAULT 0,
  "line_count" integer NOT NULL DEFAULT 0,
  "patient_count" integer NOT NULL DEFAULT 0,
  -- Lines with no LOA yet when the billing was made.
  "pending_loa_count" integer NOT NULL DEFAULT 0,
  -- 'Active' | 'Void'. A voided billing releases its lines for a new one.
  "status" text NOT NULL DEFAULT 'Active',
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by_name" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "voided_at" timestamptz,
  "voided_by_name" text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS "hmo_billings_branch_created_idx"
  ON "hmo_billings" ("branch_id", "created_at");
CREATE INDEX IF NOT EXISTS "hmo_billings_hmo_idx" ON "hmo_billings" ("hmo");

CREATE TABLE IF NOT EXISTS "hmo_billing_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "billing_id" uuid NOT NULL REFERENCES "hmo_billings"("id") ON DELETE CASCADE,
  -- The procedure line (transactions.id) this row was made from. Kept as
  -- plain text, not a link, so removing a visit never changes a billing.
  "transaction_id" text NOT NULL,
  "line_number" integer NOT NULL DEFAULT 0,
  "visit_id" text NOT NULL DEFAULT '',
  "visit_date" text NOT NULL,
  "patient_name" text NOT NULL DEFAULT '',
  "hmo_account_number" text NOT NULL DEFAULT '',
  "loa_number" text NOT NULL DEFAULT '',
  "loe_number" text NOT NULL DEFAULT '',
  "procedure" text NOT NULL DEFAULT '',
  "teeth" text NOT NULL DEFAULT '',
  "amount" numeric(12, 2) NOT NULL DEFAULT 0,
  -- True while the billing is Active. The unique index below lets a
  -- procedure line be on ONE active billing only, even if two people press
  -- Generate at the same moment.
  "active" boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS "hmo_billing_lines_billing_idx"
  ON "hmo_billing_lines" ("billing_id", "line_number");
CREATE UNIQUE INDEX IF NOT EXISTS "hmo_billing_lines_active_transaction_idx"
  ON "hmo_billing_lines" ("transaction_id") WHERE "active";

CREATE TABLE IF NOT EXISTS "hmo_billing_counters" (
  "prefix" text NOT NULL,
  "year" smallint NOT NULL,
  "last_number" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("prefix", "year")
);

-- Check: the three tables exist (should return 3 rows).
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('hmo_billings', 'hmo_billing_lines', 'hmo_billing_counters')
ORDER BY table_name;
