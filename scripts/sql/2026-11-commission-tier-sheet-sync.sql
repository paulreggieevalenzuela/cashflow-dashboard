-- Brings the app in line with the clinic's "LIST - TIER" sheet (the sheet the
-- clinic chose to follow, 9 Nov 2026), plus Pedia Handling Fee at 10%.
--
-- Run this in the Neon SQL Editor. Safe to run more than once. NOT run yet.
-- Afterwards run `yarn db:backfill-links` once so saved transactions are
-- re-priced (commission is stored on each line when it is saved).
--
-- What it does
--   1. Adds the procedures that are on the sheet but not on the price list.
--      They are added WITHOUT a price (staff type the price on the form until
--      you set one on the Procedures page). VAT type is a guess (basic
--      procedures non_vat, everything else vat): please check it.
--   2. Writes the sheet's tier rate for every procedure on it. Only the cash
--      % (and the X-ray peso) are written; HMO rates already set are kept.
--
-- Tier 3 / Tier 2 / Tier 1 per sheet group:
--   10 / 10 / 10   Consultation, OP, PF, TF, Simple extraction, Flouride, Calcimol, Pedia Handling Fee
--   25 / 20 / 20   Ortho Install ... Splint per arch (incl. Ortho Adj, RCM, Lost Bracket, TMJ)
--   15 / 15 / 15   Complicated extraction, Bone Reduction, Teeth Whitening, Gingivectomy
--   25 / 15 / 15   Cosmetic Filling, Esthetics Filling, Direct composite Veneers, Surgery, Coronectomy
--   20 / 15 / 15   Build Up, Root Canal Treatment, Post & Core, Post & Build Up
--   20 / 20 / 20   Dentures, Jacket Crowns, Veneers (Emax/Zirconia), Onlay, Temporary Crown, etc.
--   X-rays         Panoramic Xray P70, Periapical Xray P30 (every tier)

BEGIN;

-- 1. Missing procedures.
INSERT INTO "procedures" ("name", "default_price", "default_vat_type")
VALUES
  ('Pedia Handling Fee', 500.00, 'non_vat'),
  ('Build Up', NULL, 'vat'),
  ('Coronectomy', NULL, 'vat'),
  ('Esthetics Filling', NULL, 'vat'),
  ('Expander', NULL, 'vat'),
  ('Gingivectomy', NULL, 'vat'),
  ('High Impact Plastic Dentures', NULL, 'vat'),
  ('Thermosens Dentures', NULL, 'vat'),
  ('Twin block', NULL, 'vat'),
  ('TMJ Adjust', NULL, 'vat'),
  ('TMJ Down payment', NULL, 'vat')
ON CONFLICT ("name") DO NOTHING;

-- 2. Tier rates (procedure, Tier 3 %, Tier 2 %, Tier 1 %, flat peso).
INSERT INTO "commission_tier_rates" ("tier", "procedure_id", "rate_percent", "peso_value")
SELECT x.tier, p."id", x.pct, s.peso
FROM (VALUES
  -- 10% group
  ('Consultation', 10, 10, 10, NULL),
  ('Oral Prophylaxis (MILD)', 10, 10, 10, NULL),
  ('Oral Prophylaxis (MODERATE)', 10, 10, 10, NULL),
  ('Oral Prophylaxis (SEVERE)', 10, 10, 10, NULL),
  ('Oral Prophylaxis (PEDIA)', 10, 10, 10, NULL),
  ('Permanent Filling (Posterior)', 10, 10, 10, NULL),
  ('Permanent Filling (Anterior)', 10, 10, 10, NULL),
  ('Permanent Filling - Per Surface (Voco)', 10, 10, 10, NULL),
  ('Temporary Filling', 10, 10, 10, NULL),
  ('Simple Tooth Extraction', 10, 10, 10, NULL),
  ('Fluoride (Pedia Only)', 10, 10, 10, NULL),
  ('Flouride Varnish', 10, 10, 10, NULL),
  ('Calcimol', 10, 10, 10, NULL),
  ('Pedia Handling Fee', 10, 10, 10, NULL),
  -- Ortho / TMJ group: Tier 3 25, Tier 2 and 1 20
  ('Ortho Package (Simple Case)', 25, 20, 20, NULL),
  ('Ortho Package (Complex Case)', 25, 20, 20, NULL),
  ('Ortho Adj', 25, 20, 20, NULL),
  ('RCM', 25, 20, 20, NULL),
  ('Lost Bracket', 25, 20, 20, NULL),
  ('Expander', 25, 20, 20, NULL),
  ('Bite Raiser per arch', 25, 20, 20, NULL),
  ('Twin block', 25, 20, 20, NULL),
  ('Ortho Diagnostic Fee Simple case', 25, 20, 20, NULL),
  ('Retainers (Hawley)-per arch', 25, 20, 20, NULL),
  ('Retainers (Invisible)-per arch', 25, 20, 20, NULL),
  ('Ortho Removal w/ OP', 25, 20, 20, NULL),
  ('Retainers (additional pontic)', 25, 20, 20, NULL),
  ('TMJ Consultation', 25, 20, 20, NULL),
  ('TMJ Down payment', 25, 20, 20, NULL),
  ('TMJ Adjust', 25, 20, 20, NULL),
  ('Myofunctional Appliance', 25, 20, 20, NULL),
  ('Splint per arch', 25, 20, 20, NULL),
  -- 15% group
  ('Complicated Tooth Extraction w/ suture (silk)', 15, 15, 15, NULL),
  ('Bone Reduction', 15, 15, 15, NULL),
  ('Teeth Whitening (3 cycles)', 15, 15, 15, NULL),
  ('Gingivectomy', 15, 15, 15, NULL),
  -- Cosmetic group: Tier 3 25, Tier 2 and 1 15
  ('Cosmetic Filling', 25, 15, 15, NULL),
  ('Esthetics Filling', 25, 15, 15, NULL),
  ('Veneers (Direct composite) per tooth (warranty of 1 visit)', 25, 15, 15, NULL),
  -- Build up / RCT / post: Tier 3 20, Tier 2 and 1 15
  ('Build Up', 20, 15, 15, NULL),
  ('Root Canal Treatment (Anterior)', 20, 15, 15, NULL),
  ('Root Canal Treatment (Posterior)', 20, 15, 15, NULL),
  ('Post & Core (per post)', 20, 15, 15, NULL),
  ('Post & Build Up (Per tooth)', 20, 15, 15, NULL),
  -- Dentures / crowns / veneers / appliances: 20 for every tier
  ('Flexible Denture - Partial (Per Arch) 1-8 pontics', 20, 20, 20, NULL),
  ('Plastic Denture - Partial (Per Arch) 1-3 pontics', 20, 20, 20, NULL),
  ('Plastic Denture - Partial 4 pontics up to full', 20, 20, 20, NULL),
  ('Plastic Denture - Complete', 20, 20, 20, NULL),
  ('Thermosens Dentures', 20, 20, 20, NULL),
  ('High Impact Plastic Dentures', 20, 20, 20, NULL),
  ('Denture (IVOCAP) - Per Arch', 20, 20, 20, NULL),
  ('Jacket Crown (Plastic)', 20, 20, 20, NULL),
  ('Jacket Crown (PFM)- Samurai Europe made', 20, 20, 20, NULL),
  ('Jacket Crown (PFM)-Tilite (Samurai) (Europe made)', 20, 20, 20, NULL),
  ('Jacket Crown (PFM)-Tilite (Swiss or JR)', 20, 20, 20, NULL),
  ('Jacket Crown (Emax)- Samurai (Europe made)', 20, 20, 20, NULL),
  ('Jacket Crown (Zirconia)- Samurai', 20, 20, 20, NULL),
  ('Veneers (Emax)-Samurai Europe made', 20, 20, 20, NULL),
  ('Veneers (Zirconia)-Samurai Europe made', 20, 20, 20, NULL),
  ('Onlay Ceramage (Samurai)', 20, 20, 20, NULL),
  ('Temporary Crown', 20, 20, 20, NULL),
  ('Ceramage Removal', 20, 20, 20, NULL),
  ('Clasp for Maryland', 20, 20, 20, NULL),
  ('Mouth Guard', 20, 20, 20, NULL),
  ('Denture Repair', 20, 20, 20, NULL),
  -- Surgery: Tier 3 25, Tier 2 and 1 15
  ('Wisdom Tooth Removal', 25, 15, 15, NULL),
  ('Coronectomy', 25, 15, 15, NULL),
  -- X-rays: flat pesos, every tier
  ('Panoramic Xray w/ hard copy', 0, 0, 0, 70),
  ('Periapical Xray', 0, 0, 0, 30)
) AS s(name, t3, t2, t1, peso)
CROSS JOIN LATERAL (VALUES (3, s.t3), (2, s.t2), (1, s.t1)) AS x(tier, pct)
JOIN "procedures" p ON lower(p."name") = lower(s.name)
ON CONFLICT ("tier", "procedure_id") DO UPDATE SET
  "rate_percent" = EXCLUDED."rate_percent",
  "peso_value" = EXCLUDED."peso_value",
  "updated_at" = now();

-- 3. OPTIONAL, only if you decide the sheet has no individual exceptions:
--    removes the 2 individual rates on dentists who have a tier (Perez
--    Temporary Filling 0% + P250 HMO, Bandayrel Ortho Adj 20%). Perez's
--    override currently stops her earning on cash Temporary Filling.
-- DELETE FROM "dentist_commission_rates"
-- WHERE "dentist_user_id" IN (SELECT "dentist_user_id" FROM "dentist_commission_tiers");

-- 4. OPTIONAL, waiting for your answer: the older per-dentist sheet gives HMO
--    10% to OP, PF, TF and Simple extraction (the app pays HMO commission on
--    OP only). The tier sheet has no HMO column. The 10% is the dentist's
--    commission on that procedure line (line amount / 1.12 x 10%).
-- UPDATE "commission_tier_rates" r SET "hmo_rate_percent" = 10, "updated_at" = now()
-- FROM "procedures" p
-- WHERE p."id" = r."procedure_id"
--   AND (p."name" LIKE 'Permanent Filling%' OR p."name" IN ('Temporary Filling', 'Simple Tooth Extraction'));

COMMIT;

-- Checks -------------------------------------------------------------------
-- a) Every tier should have the same number of procedures with a rate.
SELECT "tier", count(*) AS procedures
FROM "commission_tier_rates" GROUP BY "tier" ORDER BY "tier" DESC;

-- b) Procedures with no tier rate at all (these earn nothing).
SELECT p."name" AS "no tier rate"
FROM "procedures" p
WHERE NOT EXISTS (SELECT 1 FROM "commission_tier_rates" r WHERE r."procedure_id" = p."id")
ORDER BY p."name";
