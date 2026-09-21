-- Adds the `expenses` table for the new "Add Expenses" feature.
--
-- Run this manually (e.g. via `psql "$DATABASE_URL" -f scripts/sql/2026-09-expenses.sql`
-- or pasted into `yarn db:studio`'s SQL runner) rather than `yarn db:push` —
-- see the note in 2026-09-commission-schema.sql: drizzle-kit 0.28.1
-- generates a spurious NOT NULL constraint drop against Postgres 17+ (Neon)
-- that aborts push before it reaches the real, additive statements below.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" text DEFAULT '' NOT NULL,
	"branch_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
