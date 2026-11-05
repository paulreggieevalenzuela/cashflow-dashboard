-- The one superuser: a person with access to everything, who is also the only
-- one who can reset an admin's password. Design:
-- docs/PASSWORD_CHANGE_RESET_ARCHITECTURE.md, section 5A.
--
-- IMPORTANT: run the two steps below ONE AT A TIME, in the Neon SQL Editor.
-- Postgres cannot use a new enum value in the same run that adds it.
-- Safe to run more than once.

-- ===== STEP 1: run this statement by itself, then wait for "success" =====
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'superuser';

-- ===== STEP 2: run this after step 1 has finished =====
-- Only one row may ever hold the superuser role.
CREATE UNIQUE INDEX IF NOT EXISTS "users_single_superuser" ON "users" ("role") WHERE "role" = 'superuser';

-- Make ONE account the superuser (change the e-mail first). It only runs when
-- no superuser exists yet, so running it twice does nothing.
UPDATE "users" SET "role" = 'superuser'
 WHERE "email" = 'superuser@admin.com'
   AND NOT EXISTS (SELECT 1 FROM "users" WHERE "role" = 'superuser');

-- Check: exactly one row.
SELECT name, email, role FROM "users" WHERE "role" = 'superuser';
