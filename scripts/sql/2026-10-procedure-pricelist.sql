-- Procedure list and price list, from "Procedure and pricelist w/ HMO - Sheet1"
-- (the CASH PAYING column). Replaces the whole old procedure list.
--
-- Run this in the Neon SQL Editor. Safe to run more than once.
--
-- What it does
--   1. Adds each procedure below (or updates it, if the name is already
--      there) with its list price and VAT setting. The price is what the
--      Add transaction form fills in when the procedure is picked (staff can
--      still change it on the form). VAT is fixed at 12% for "vat"
--      procedures (the price is VAT-inclusive); "non_vat" procedures have no
--      VAT.
--   2. Carries the commission rates over to the new names (see the mapping
--      in step 2) so no rate is lost where the procedure still exists.
--   3. Deletes every procedure that is not in the new list. Commission rates
--      tied to a deleted procedure go with it. Past transactions are NOT
--      deleted: they keep their procedure text, only the link to the
--      procedure is cleared.
--
-- Afterwards run `yarn db:backfill-links` once so commission is worked out
-- again against the new list.

BEGIN;

-- 1. The new list: name, cash price (VAT-inclusive), VAT setting.
CREATE TEMP TABLE new_procedures (name text, price numeric(12, 2), vat_type text) ON COMMIT DROP;
INSERT INTO new_procedures (name, price, vat_type) VALUES
  ('Consultation', 600.00, 'non_vat'),
  ('Oral Prophylaxis (MILD)', 1200.00, 'non_vat'),
  ('Oral Prophylaxis (MODERATE)', 1700.00, 'non_vat'),
  ('Oral Prophylaxis (SEVERE)', 3200.00, 'non_vat'),
  ('Oral Prophylaxis (PEDIA)', 650.00, 'non_vat'),
  ('Permanent Filling (Posterior)', 1200.00, 'non_vat'),
  ('Permanent Filling (Anterior)', 2000.00, 'non_vat'),
  ('Permanent Filling - Per Surface (Voco)', 2700.00, 'non_vat'),
  ('Simple Tooth Extraction', 1200.00, 'non_vat'),
  ('Complicated Tooth Extraction w/ suture (silk)', 3000.00, 'vat'),
  ('Suture (Silk USP 3/0)-Reverse Cutting', 500.00, 'vat'),
  ('Extra Anesthesia', 100.00, 'non_vat'),
  ('Bone Reduction', 2000.00, 'vat'),
  ('Wisdom Tooth Removal', 15000.00, 'vat'),
  ('Fluoride (Pedia Only)', 1500.00, 'vat'),
  ('Temporary Filling', 750.00, 'non_vat'),
  ('Calcimol', 750.00, 'non_vat'),
  ('Ortho Removal w/ OP', 5000.00, 'vat'),
  ('Root Canal Treatment (Anterior)', 9000.00, 'vat'),
  ('Root Canal Treatment (Posterior)', 9500.00, 'vat'),
  ('Post & Core (per post)', 5000.00, 'vat'),
  ('Post & Build Up (Per tooth)', 6000.00, 'vat'),
  ('Panoramic Xray w/ hard copy', 1250.00, 'non_vat'),
  ('Periapical Xray', 650.00, 'non_vat'),
  ('Flexible Denture - Partial (Per Arch) 1-8 pontics', 22000.00, 'vat'),
  ('Plastic Denture - Partial (Per Arch) 1-3 pontics', 6000.00, 'vat'),
  ('Plastic Denture - Partial 4 pontics up to full', 9500.00, 'vat'),
  ('Plastic Denture - Complete', 19000.00, 'vat'),
  ('Immediate Dentures (Per Arch)', 15000.00, 'vat'),
  ('Rush Fee', 2000.00, 'vat'),
  ('Denture (IVOCAP) - Per Arch', 22000.00, 'vat'),
  ('Denture Repair', 3500.00, 'vat'),
  ('Retainer Repair', 2000.00, 'vat'),
  ('Porcelain Denture - Complete', 46000.00, 'vat'),
  ('Porcelain Denture - Per Arch', 23000.00, 'vat'),
  ('Porcelain Denture - Partial 1-3 pontics', 18000.00, 'vat'),
  ('Jacket Crown (Plastic)', 5000.00, 'vat'),
  ('Jacket Crown (PFM)- Samurai Europe made', 13000.00, 'vat'),
  ('Jacket Crown (PFM)-Tilite (Samurai) (Europe made)', 17000.00, 'vat'),
  ('Jacket Crown (Emax)- Samurai (Europe made)', 35000.00, 'vat'),
  ('Jacket Crown (Zirconia)- Samurai', 40000.00, 'vat'),
  ('Veneers (Emax)-Samurai Europe made', 35000.00, 'vat'),
  ('Veneers (Zirconia)-Samurai Europe made', 40000.00, 'vat'),
  ('Onlay Ceramage (Samurai)', 18000.00, 'vat'),
  ('Veneers (Direct composite) per tooth (warranty of 1 visit)', 10000.00, 'vat'),
  ('Temporary Crown', 2000.00, 'vat'),
  ('Ceramage Removal', 2500.00, 'vat'),
  ('Jacket Crown (PFM)-Tilite (Swiss or JR)', 12000.00, 'vat'),
  ('Clasp for Maryland', 2500.00, 'vat'),
  ('Retainers (Hawley)-per arch', 6000.00, 'vat'),
  ('Retainers (Invisible)-per arch', 7000.00, 'vat'),
  ('Mouth Guard', 12000.00, 'vat'),
  ('Retainers (additional pontic)', 1000.00, 'vat'),
  ('Dental Certificate', 250.00, 'non_vat'),
  ('Teeth Whitening (3 cycles)', 15000.00, 'vat'),
  ('Additional Whitening Cycle', 3500.00, 'vat'),
  ('TMJ Consultation', 2500.00, 'vat'),
  ('Myofunctional Appliance', 20000.00, 'vat'),
  ('Splint per arch', 10000.00, 'vat'),
  ('Bite Raiser per arch', 10000.00, 'vat'),
  ('Mock up wax', 2500.00, 'vat'),
  ('Ortho Package (Simple Case)', 70000.00, 'vat'),
  ('Ortho Package (Complex Case)', 85000.00, 'vat'),
  ('TMJ Package', 55000.00, 'vat'),
  ('Ortho Diagnostic Fee Simple case', 3000.00, 'vat'),
  ('Ortho Diagnostic Fee Complex case', 5000.00, 'vat');

UPDATE "procedures" p
SET "name" = n.name,
    "default_price" = n.price,
    "default_vat_type" = n.vat_type
FROM new_procedures n
WHERE lower(p."name") = lower(n.name);

INSERT INTO "procedures" ("name", "default_price", "default_vat_type")
SELECT n.name, n.price, n.vat_type
FROM new_procedures n
WHERE NOT EXISTS (
  SELECT 1 FROM "procedures" p WHERE lower(p."name") = lower(n.name)
);

-- 2. Commission rates: old procedure name -> new procedure name(s). Edit
--    this list if a rate should follow a different procedure. Old names
--    that are not mapped (Ortho Install, Cosmetic Filling, Transcranial
--    Xray) are not on the new price list, so their rates are removed.
CREATE TEMP TABLE rate_map (old_name text, new_name text) ON COMMIT DROP;
INSERT INTO rate_map (old_name, new_name) VALUES
  ('OP', 'Oral Prophylaxis (MILD)'),
  ('OP', 'Oral Prophylaxis (MODERATE)'),
  ('OP', 'Oral Prophylaxis (SEVERE)'),
  ('OP', 'Oral Prophylaxis (PEDIA)'),
  ('Complicated extraction', 'Complicated Tooth Extraction w/ suture (silk)'),
  ('Panoramic xray', 'Panoramic Xray w/ hard copy'),
  ('Root Canal Treatment (Anterior/Posterior)', 'Root Canal Treatment (Anterior)'),
  ('Root Canal Treatment (Anterior/Posterior)', 'Root Canal Treatment (Posterior)');

INSERT INTO "dentist_commission_rates"
  ("dentist_user_id", "procedure_id", "rate_percent", "hmo_rate_percent", "hmo_peso_value")
SELECT r."dentist_user_id", np."id", r."rate_percent", r."hmo_rate_percent", r."hmo_peso_value"
FROM rate_map m
JOIN "procedures" op ON lower(op."name") = lower(m.old_name)
JOIN "dentist_commission_rates" r ON r."procedure_id" = op."id"
JOIN "procedures" np ON lower(np."name") = lower(m.new_name)
WHERE NOT EXISTS (
  SELECT 1 FROM "dentist_commission_rates" x
  WHERE x."dentist_user_id" = r."dentist_user_id" AND x."procedure_id" = np."id"
);

-- 3. Remove the old list: everything that is not in the new list.
DELETE FROM "procedures" p
WHERE NOT EXISTS (
  SELECT 1 FROM new_procedures n WHERE lower(n.name) = lower(p."name")
);

COMMIT;

-- Check A: the procedure list now (should be 66 rows).
SELECT count(*) AS procedures FROM "procedures";

-- Check B: VAT setting and price per procedure.
SELECT "name", "default_price" AS price, "default_vat_type" AS vat
FROM "procedures"
ORDER BY ("default_vat_type" = 'vat'), "name";

-- Check C: commission rates on file per dentist.
SELECT u."name" AS dentist, count(*) AS rates
FROM "dentist_commission_rates" r
JOIN "users" u ON u."id" = r."dentist_user_id"
GROUP BY u."name"
ORDER BY u."name";
