-- Second check of the daily transaction check: Headquarters.
--
-- The Branch manager's check (table "transaction_checks", the tick box and the
-- lock) is unchanged. Headquarters approves a visit AFTER the Branch manager
-- has checked it; this table holds that second check, one row per procedure
-- line, same shape as "transaction_checks".
--
-- Nothing existing is changed. Run once in the Neon SQL Editor (safe to run
-- more than once). It works whether or not 2026-11-transaction-checks.sql was
-- run before; run that one first if it wasn't.
-- Until this is run the app keeps working: the Branch manager check is as
-- before, and the Headquarters column says it isn't set up.
--
-- The two privileges need no SQL: "Check transactions: Branch manager" is on by
-- default for owners and admins, "Check transactions: Headquarters" for owners;
-- both can be ticked for any person under Users -> Manage -> Access.

CREATE TABLE IF NOT EXISTS "transaction_hq_checks" (
  "transaction_id" text PRIMARY KEY REFERENCES "transactions"("id") ON DELETE CASCADE,
  "checked_at" timestamptz NOT NULL DEFAULT now(),
  "checked_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "checked_by_name" text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS "transaction_hq_checks_checked_at_idx"
  ON "transaction_hq_checks" ("checked_at");
