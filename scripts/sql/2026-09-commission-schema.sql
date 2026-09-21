-- Manual unblock for the commission/performance feature's schema push.
--
-- WHY THIS FILE EXISTS: `yarn db:push` (drizzle-kit 0.28.1) generates a
-- spurious `ALTER TABLE ... DROP CONSTRAINT "<table>_<col>_not_null"` for
-- every NOT NULL column on every table, on every push, against Postgres
-- 17+ (Neon runs PG17). Postgres refuses to drop that constraint on a
-- primary-key column ("column \"id\" is in a primary key", error 42P16),
-- so push aborts before it can apply the *actual* new statements below.
-- This is a known unresolved drizzle-kit bug, not a problem with our
-- schema.
--
-- This script contains only the real, additive changes drizzle-kit's own
-- push preview listed (the `procedures`, `user_preferences`, and
-- `dentist_commission_rates` tables already exist from an earlier push) —
-- with none of the bogus not-null drops. Safe to run more than once.

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "dentist_user_id" uuid;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "procedure_id" uuid;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "commission_amount" numeric(12, 2) DEFAULT '0' NOT NULL;

DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_dentist_user_id_users_id_fk" FOREIGN KEY ("dentist_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "dentist_commission_rates" ADD CONSTRAINT "dentist_commission_rates_dentist_user_id_users_id_fk" FOREIGN KEY ("dentist_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "dentist_commission_rates" ADD CONSTRAINT "dentist_commission_rates_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "dentist_commission_rates" ADD CONSTRAINT "dentist_commission_rates_dentist_user_id_procedure_id_unique" UNIQUE("dentist_user_id","procedure_id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
