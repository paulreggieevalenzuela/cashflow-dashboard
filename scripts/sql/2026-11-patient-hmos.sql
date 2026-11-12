-- A patient can have several HMOs, each with its own company name and account
-- (member) number. Shown as a list on the patient profile.
--
-- One new table. Nothing existing is changed; the two columns on "patients"
-- (hmo_company, hmo_account_number) stay and keep holding the FIRST HMO, so the
-- Day end report, HMO billing and the patient search keep working.
-- Existing patients that already have an HMO company are copied into the list.
--
-- Run once in the Neon SQL Editor; safe to run more than once. Until it is run
-- the app keeps working with one HMO per patient and says so on the edit form.

CREATE TABLE IF NOT EXISTS "patient_hmos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "company" text NOT NULL,
  "company_key" text NOT NULL,
  "account_number" text NOT NULL DEFAULT '',
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "patient_hmos_patient_company_idx"
  ON "patient_hmos" ("patient_id", "company_key");

-- Copy each patient's current HMO into the list (position 0).
INSERT INTO "patient_hmos" ("patient_id", "company", "company_key", "account_number", "position")
SELECT "id", "hmo_company", lower(trim("hmo_company")), "hmo_account_number", 0
FROM "patients"
WHERE trim("hmo_company") <> ''
ON CONFLICT ("patient_id", "company_key") DO NOTHING;

-- Check: how many patients now have an HMO in the list.
SELECT count(DISTINCT "patient_id") AS patients_with_an_hmo, count(*) AS hmo_entries
FROM "patient_hmos";
