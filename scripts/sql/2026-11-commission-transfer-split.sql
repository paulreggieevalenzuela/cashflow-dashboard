-- Commission update: transferred patients (50% main dentist / 50% the
-- dentist the patient was transferred to).
--
-- Run this in the Neon SQL Editor BEFORE starting the updated app: the app
-- reads these columns on every transaction, so until it is run the
-- Transactions pages cannot load. Safe to run more than once; it only adds
-- columns, nothing is changed or removed, and every existing row keeps its
-- commission exactly as it is (transfer columns are blank / 0).
--
-- On a visit that has a "Transferred to dentist":
--   commission_amount           = the MAIN dentist's half
--   transfer_dentist(_user_id)  = the second dentist
--   transfer_commission_amount  = the second dentist's half
-- The two halves always add up to the commission worked out at the main
-- dentist's rate.

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "transfer_dentist" text NOT NULL DEFAULT '';
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "transfer_dentist_user_id" uuid
    REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "transfer_commission_amount" numeric(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "transactions_transfer_dentist_user_idx"
  ON "transactions" ("transfer_dentist_user_id")
  WHERE "transfer_dentist_user_id" IS NOT NULL;
