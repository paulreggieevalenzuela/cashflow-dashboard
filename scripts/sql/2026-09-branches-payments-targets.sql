-- Manual unblock for the branches / staggered-payments / sales-target
-- feature's schema push.
--
-- WHY THIS FILE EXISTS: `yarn db:push` (drizzle-kit 0.28.1) generates a
-- spurious `ALTER TABLE ... DROP CONSTRAINT "<table>_<col>_not_null"` for
-- every NOT NULL column on every table, on every push, against Postgres
-- 17+ (Neon runs PG17). Postgres refuses to drop that constraint on a
-- primary-key column ("column \"id\" is in a primary key", error 42P16),
-- so push aborts before it can apply the *actual* new statements below.
-- This is a known unresolved drizzle-kit bug (see the note in
-- 2026-09-commission-schema.sql), not a problem with our schema.
--
-- This script contains only the real, additive changes for this round of
-- schema.ts edits: the new `branches`, `payments`, and `sales_targets`
-- tables, the new `target_period` enum, and the new nullable columns on
-- `transactions` and `users` (branch_id, created_by_user_id,
-- transaction_number). Safe to run more than once. Run this in the Neon
-- SQL Editor instead of `yarn db:push`.

CREATE TABLE IF NOT EXISTS "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_type" text DEFAULT '' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 CREATE TYPE "public"."target_period" AS ENUM('month', 'quarter', 'year');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "sales_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_type" "target_period" NOT NULL,
	"period_key" text NOT NULL,
	"target_amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_targets_period_type_period_key_unique" UNIQUE("period_type","period_key")
);

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "branch_id" uuid;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "transaction_number" text;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "branch_id" uuid;

DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transaction_number_unique" UNIQUE("transaction_number");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
