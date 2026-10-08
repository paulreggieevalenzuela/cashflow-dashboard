-- Fixes: "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" when setting a dentist's commission rate for a procedure.
--
-- The live database is missing the unique (dentist, procedure) constraint on
-- dentist_commission_rates that the schema declares. The app now works even
-- without it, but the constraint is what stops the same dentist + procedure
-- from ever getting two rates, so add it.
--
-- Safe to run more than once. Run in the Neon SQL Editor.

-- 1. If any dentist + procedure pair somehow has more than one rate row, keep
--    only the most recently updated one (the constraint can't be added while
--    duplicates exist). Does nothing when there are no duplicates.
DELETE FROM "dentist_commission_rates" a
USING "dentist_commission_rates" b
WHERE a."dentist_user_id" = b."dentist_user_id"
  AND a."procedure_id" = b."procedure_id"
  AND (a."updated_at", a."id") < (b."updated_at", b."id");

-- 2. Add the constraint if it isn't there yet.
DO $$ BEGIN
 ALTER TABLE "dentist_commission_rates"
   ADD CONSTRAINT "dentist_commission_rates_dentist_user_id_procedure_id_unique"
   UNIQUE ("dentist_user_id", "procedure_id");
EXCEPTION
 WHEN duplicate_object THEN null;
 WHEN duplicate_table THEN null;
END $$;

-- 3. Check: should list one row named ..._unique.
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.dentist_commission_rates'::regclass AND contype = 'u';
