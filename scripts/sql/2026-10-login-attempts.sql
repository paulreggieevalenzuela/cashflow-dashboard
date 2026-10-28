-- Sign-in history and lock-out after repeated wrong passwords.
-- One row per sign-in attempt (when, e-mail typed, address, browser, result).
-- Until this file is run the app still signs people in; it just does not lock
-- accounts or keep a history (one warning is printed in the server log).
--
-- Safe to run more than once. Run in the Neon SQL Editor.

CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "email_key" text NOT NULL,
  "ip" text DEFAULT '' NOT NULL,
  "user_agent" text DEFAULT '' NOT NULL,
  "success" boolean NOT NULL,
  "outcome" text DEFAULT '' NOT NULL
);

CREATE INDEX IF NOT EXISTS "login_attempts_email_idx" ON "login_attempts" ("email_key", "created_at");
CREATE INDEX IF NOT EXISTS "login_attempts_ip_idx" ON "login_attempts" ("ip", "created_at");

-- Check: the table is empty right after creating it.
SELECT count(*) AS attempts_on_file FROM "login_attempts";
