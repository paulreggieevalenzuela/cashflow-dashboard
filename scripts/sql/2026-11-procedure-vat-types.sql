-- Price list VAT types: the clinic's rule (24 Nov 2026) is that only the basic
-- procedures are Non-VAT:
--   Consultation, Oral Prophylaxis (every kind), Temporary Filling,
--   Permanent Filling (every kind), Simple Tooth Extraction.
-- Every other procedure is VAT.
--
-- REQUIRED ONCE before deploying 0.11.0. From 0.11.0 the VAT type stored on
-- the price list is what the app uses (it can be changed per procedure under
-- Transactions -> Procedures), for new lines and for commission. Some old
-- procedures are stored as Non-VAT (Ortho Adj, RCM, Lost Bracket ...); this
-- sets every stored value to the rule above. Afterwards, change any exception
-- in the app (it recalculates that procedure's commissions and logs it).
-- Saved visits are not changed: their receipts were already issued.
--
-- Run it ONCE only: running it again later would undo VAT types changed in
-- the app on purpose.
--
-- After it: yarn db:recalc-commissions --dry-run, check, then without --dry-run.
--
-- Run in the Neon SQL Editor, staging first.

-- 1. Preview: what would change (run this alone first and check the list).
--    Look closely at the non-treatment items (Reservation Fee, Dental
--    Certificate, Rush Fee, X-rays ...). If one of them must stay Non-VAT, add
--    its name to the NOT IN list in step 2 before running it.
SELECT "name", "default_vat_type" AS now,
       CASE WHEN "name" ~* '^\s*(consultation|oral\s+prophylaxis|temporary\s+filling|permanent\s+filling|simple\s+(tooth\s+)?extraction)\M'
            THEN 'non_vat' ELSE 'vat' END AS becomes
FROM "procedures"
WHERE "default_vat_type" <> CASE WHEN "name" ~* '^\s*(consultation|oral\s+prophylaxis|temporary\s+filling|permanent\s+filling|simple\s+(tooth\s+)?extraction)\M'
                                 THEN 'non_vat' ELSE 'vat' END
ORDER BY 3, 1;

-- 2. Apply.
BEGIN;
UPDATE "procedures"
SET "default_vat_type" = CASE
      WHEN "name" ~* '^\s*(consultation|oral\s+prophylaxis|temporary\s+filling|permanent\s+filling|simple\s+(tooth\s+)?extraction)\M'
      THEN 'non_vat' ELSE 'vat' END
WHERE "default_vat_type" <> CASE
      WHEN "name" ~* '^\s*(consultation|oral\s+prophylaxis|temporary\s+filling|permanent\s+filling|simple\s+(tooth\s+)?extraction)\M'
      THEN 'non_vat' ELSE 'vat' END
  AND "name" NOT IN ('__keep_non_vat_example__');
COMMIT;

-- 3. Check: the Non-VAT procedures that remain.
SELECT "name" FROM "procedures" WHERE "default_vat_type" <> 'vat' ORDER BY "name";
