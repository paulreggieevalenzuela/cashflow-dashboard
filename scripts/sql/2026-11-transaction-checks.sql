-- Daily check of transactions by the branch manager / admin (a tick box in the
-- Transactions list). A checked visit is locked: only the superuser can edit,
-- remove or unlock it.
--
-- One row per checked transaction line. Nothing in the existing tables is
-- changed. Run this once in the Neon SQL Editor; safe to run more than once.
-- Until it is run the app keeps working and the tick box says it isn't set up.
--
-- The new privilege "Check transactions" needs no SQL: owners and admins have it
-- by default, and it can be given to a person under Users -> Manage.

CREATE TABLE IF NOT EXISTS "transaction_checks" (
  "transaction_id" text PRIMARY KEY REFERENCES "transactions"("id") ON DELETE CASCADE,
  "checked_at" timestamptz NOT NULL DEFAULT now(),
  "checked_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "checked_by_name" text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS "transaction_checks_checked_at_idx"
  ON "transaction_checks" ("checked_at");
