-- Price list VAT types: only the basic procedures are Non-VAT (clinic, 24 Nov 2026):
--   Consultation, Oral Prophylaxis (every kind), Temporary Filling,
--   Permanent Filling (every kind), Simple Tooth Extraction.
-- Every other procedure is VAT.
--
-- Optional tidying. The app already applies this rule itself (procedureVatType):
-- the price list shows the VAT type from the name, new procedure lines are
-- saved with it, and commission uses it, whatever the stored value says. This
-- script only makes the stored price-list values match (for SQL reports and
-- exports). Saved visits are not changed: their receipts were already issued.
--
-- Run in the Neon SQL Editor, staging first. Safe to run more than once.

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
