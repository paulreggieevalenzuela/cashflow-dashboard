-- Password management: temporary passwords, forced change at first sign-in,
-- sign-out of other devices after a change, and admin-handled reset requests.
-- Design: docs/PASSWORD_CHANGE_RESET_ARCHITECTURE.md
--
-- Until this file is run the app still signs people in (nobody is forced to
-- change a password, resets and "Add user" show a message asking for this
-- file). Safe to run more than once. Run in the Neon SQL Editor.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "temp_password_expires_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "password_reset_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "email_key" text NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "ip" text DEFAULT '' NOT NULL,
  "user_agent" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "handled_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "handled_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "password_reset_requests_status_idx" ON "password_reset_requests" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "password_reset_requests_email_idx" ON "password_reset_requests" ("email_key", "created_at");

-- Check: all four columns exist (expect 4 rows) and the table is empty.
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'users'
   AND column_name IN ('must_change_password', 'password_changed_at', 'temp_password_expires_at', 'session_version')
 ORDER BY column_name;
SELECT count(*) AS requests_on_file FROM "password_reset_requests";

-- OPTIONAL, run only when the clinic decides (decision D6): make every existing
-- account choose its own password at its next sign-in. Do NOT include the
-- account you are testing with, or the person running the rollout.
-- UPDATE "users" SET "must_change_password" = true
--  WHERE "email" NOT IN ('superuser@admin.com');
