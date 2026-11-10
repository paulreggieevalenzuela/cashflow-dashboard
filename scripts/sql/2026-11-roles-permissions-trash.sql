-- Roles, per-user access and the Deleted items (restore) list.
--
-- What this adds
--   * a new role "owner" (same controls as an admin, and can also manage
--     admins; the superuser stays above both)
--   * user_branches            the clinics each person is authorized for
--   * user_permission_overrides  per-person privileges that differ from the
--                              role's defaults (only the differences are stored)
--   * deleted_items            what an owner / admin deletes is kept here, out
--                              of every report, so the superuser can restore it
--
-- IMPORTANT: run STEP 1 by itself first and wait for "success", then run
-- STEP 2. (Postgres cannot use a new enum value in the same run that adds it.)
-- Safe to run more than once. Nothing that exists is changed or removed.

-- ===== STEP 1: run this statement by itself =====
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'owner';

-- ===== STEP 2: run everything below after step 1 has finished =====

CREATE TABLE IF NOT EXISTS "user_branches" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "branch_id")
);
CREATE INDEX IF NOT EXISTS "user_branches_branch_idx" ON "user_branches" ("branch_id");

-- Everybody keeps the clinic they have today.
INSERT INTO "user_branches" ("user_id", "branch_id")
SELECT "id", "branch_id" FROM "users" WHERE "branch_id" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS "user_permission_overrides" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "permission" text NOT NULL,
  "granted" boolean NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "permission")
);

CREATE TABLE IF NOT EXISTS "deleted_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- visit | transaction | payment | expense | attachment
  "kind" text NOT NULL,
  "entity_id" text NOT NULL,
  "label" text NOT NULL DEFAULT '',
  "summary" text NOT NULL DEFAULT '',
  "branch_id" uuid,
  "amount" numeric(12,2),
  "snapshot" jsonb NOT NULL,
  "deleted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "deleted_by_name" text NOT NULL DEFAULT '',
  "deleted_at" timestamptz NOT NULL DEFAULT now(),
  "restored_at" timestamptz,
  "restored_by_name" text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "deleted_items_deleted_at_idx" ON "deleted_items" ("deleted_at" DESC);
CREATE INDEX IF NOT EXISTS "deleted_items_open_idx" ON "deleted_items" ("kind") WHERE "restored_at" IS NULL;

-- Check
SELECT count(*) AS user_branch_rows FROM "user_branches";
