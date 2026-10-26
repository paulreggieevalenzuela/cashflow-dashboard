-- Patient profile: HMO company, birthday and HMO account number.
-- All three are plain text and blank by default (a birthday is stored as
-- YYYY-MM-DD). Existing patients keep blanks until someone fills them in.
--
-- Safe to run more than once. Run in the Neon SQL Editor BEFORE starting the
-- updated app: the patient screens and the Day end report read these columns.

ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "birth_date" text NOT NULL DEFAULT '';
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "hmo_company" text NOT NULL DEFAULT '';
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "hmo_account_number" text NOT NULL DEFAULT '';

-- Check: how many patients already have each detail (all 0 right after running).
SELECT
  count(*) FILTER (WHERE birth_date <> '')         AS with_birthday,
  count(*) FILTER (WHERE hmo_company <> '')        AS with_hmo_company,
  count(*) FILTER (WHERE hmo_account_number <> '') AS with_hmo_account_number
FROM "patients";
