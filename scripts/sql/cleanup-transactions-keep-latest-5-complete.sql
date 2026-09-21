-- Cleanup: keep only the 5 most recent transactions that have "complete
-- data" (a non-blank patient name, dentist, procedure, and payment type,
-- plus an amount paid greater than 0). Everything else is deleted:
--   - any transaction missing one of those key fields, regardless of date
--   - any "complete" transaction beyond the latest 5 (ordered by date,
--     then created_at as a tiebreaker for same-day rows)
--
-- `payments` rows cascade-delete automatically — payments.transaction_id
-- has ON DELETE CASCADE — so removing a transaction here also removes its
-- payment history. No orphaned payment rows are left behind.
--
-- THIS IS IRREVERSIBLE. Run the SELECT preview below first and check the
-- row count/contents look right before running the DELETE. If you want a
-- safety net, back up first:
--   CREATE TABLE transactions_backup_2026_09 AS SELECT * FROM "transactions";

-- ── 1. Preview what will be KEPT ──────────────────────────────────────
SELECT *
FROM "transactions"
WHERE trim("patient_name") <> ''
  AND trim("dentist") <> ''
  AND trim("procedure") <> ''
  AND trim("payment_type") <> ''
  AND "amount_paid" > 0
ORDER BY "date" DESC, "created_at" DESC
LIMIT 5;

-- ── 2. Preview what will be DELETED (everything NOT in the keep set) ──
-- SELECT *
-- FROM "transactions"
-- WHERE "id" NOT IN (
--   SELECT "id" FROM "transactions"
--   WHERE trim("patient_name") <> ''
--     AND trim("dentist") <> ''
--     AND trim("procedure") <> ''
--     AND trim("payment_type") <> ''
--     AND "amount_paid" > 0
--   ORDER BY "date" DESC, "created_at" DESC
--   LIMIT 5
-- );

-- ── 3. The actual delete — uncomment and run once the previews above
--       look right ─────────────────────────────────────────────────────
-- DELETE FROM "transactions"
-- WHERE "id" NOT IN (
--   SELECT "id" FROM "transactions"
--   WHERE trim("patient_name") <> ''
--     AND trim("dentist") <> ''
--     AND trim("procedure") <> ''
--     AND trim("payment_type") <> ''
--     AND "amount_paid" > 0
--   ORDER BY "date" DESC, "created_at" DESC
--   LIMIT 5
-- );
