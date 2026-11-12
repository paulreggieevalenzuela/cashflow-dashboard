-- Patient HMO details.
--
-- A patient can have several HMOs. Each entry has three details:
--   * HMO name            (Maxicare, Medicard ...)        -> column "company"
--   * the patient's company (their employer)              -> column "employer"
--   * HMO account number                                  -> column "account_number"
-- The same three can also be typed on a visit (table "invoice_hmo_details"), so
-- an old Day end or HMO billing keeps what was true on that day.
--
-- Nothing existing is changed or removed. The two columns on "patients"
-- (hmo_company, hmo_account_number) stay and keep holding the FIRST HMO, so the
-- Day end report, HMO billing and the patient search keep working.
-- Existing patients that already have an HMO are copied into the list.
--
-- Run once in the Neon SQL Editor; safe to run more than once (also if an
-- earlier version of this script was already run). Until it is run the app keeps
-- working with one HMO per patient and says so on the edit form.

-- 1. The patient's HMO list.
CREATE TABLE IF NOT EXISTS "patient_hmos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "company" text NOT NULL,            -- the HMO's name
  "company_key" text NOT NULL,
  "employer" text NOT NULL DEFAULT '', -- the patient's company
  "account_number" text NOT NULL DEFAULT '',
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- If an earlier version of this script created the table, add the new column.
ALTER TABLE "patient_hmos" ADD COLUMN IF NOT EXISTS "employer" text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS "patient_hmos_patient_company_idx"
  ON "patient_hmos" ("patient_id", "company_key");

-- Copy each patient's current HMO into the list (position 0).
INSERT INTO "patient_hmos" ("patient_id", "company", "company_key", "account_number", "position")
SELECT "id", "hmo_company", lower(trim("hmo_company")), "hmo_account_number", 0
FROM "patients"
WHERE trim("hmo_company") <> ''
ON CONFLICT ("patient_id", "company_key") DO NOTHING;

-- 2. What was typed on each visit for its HMO.
CREATE TABLE IF NOT EXISTS "invoice_hmo_details" (
  "invoice_id" uuid PRIMARY KEY REFERENCES "invoices"("id") ON DELETE CASCADE,
  "hmo_name" text NOT NULL DEFAULT '',
  "employer" text NOT NULL DEFAULT '',
  "account_number" text NOT NULL DEFAULT '',
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- 3. The patient's company on each saved HMO billing line (a frozen copy, like
-- the rest of a saved billing). Needs the HMO billing tables
-- (2026-11-hmo-billings.sql) to exist first; skipped if they do not.
DO $$
BEGIN
  IF to_regclass('public.hmo_billings') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS "hmo_billing_employers" (
      "billing_id" uuid NOT NULL REFERENCES "hmo_billings"("id") ON DELETE CASCADE,
      "transaction_id" text NOT NULL,
      "employer" text NOT NULL DEFAULT '',
      PRIMARY KEY ("billing_id", "transaction_id")
    );
  ELSE
    RAISE NOTICE 'hmo_billings does not exist yet: run 2026-11-hmo-billings.sql, then run this script again.';
  END IF;
END $$;

-- Check: how many patients have an HMO in the list, and how many have a company.
SELECT count(DISTINCT "patient_id") AS patients_with_an_hmo,
       count(*) AS hmo_entries,
       count(*) FILTER (WHERE "employer" <> '') AS entries_with_a_company
FROM "patient_hmos";
