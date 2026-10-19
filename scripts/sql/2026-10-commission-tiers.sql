-- Tier-based dentist commission, from the clinic's "LIST - TIER" sheet.
--
-- Run this in the Neon SQL Editor. Safe to run more than once. Run
-- 2026-10-procedure-pricelist.sql first (procedure names below follow it).
--
-- What it does
--   1. Creates the two tier tables (dentist -> tier, and tier -> procedure
--      rate).
--   2. CLEANS UP THE OLD DATA: deletes every individual (one-by-one)
--      commission rate that belongs to a DENTIST account. Staff bonus rates
--      are not touched. The tier rates below replace them.
--   3. Puts the 7 dentists in their tier: Tier 3 Teope, Ayapana; Tier 2
--      Bandayrel, Ahmad; Tier 1 Roldan, Banawa, Perez.
--   4. Loads the tier rates. The sheet merges Tier 1 with Tier 2 on every
--      row, so they share a rate.
--
-- Afterwards run `yarn db:backfill-links` once so existing transactions are
-- re-priced with the tier rates (commission is saved on each line).
--
-- Assumptions you can change on the Commissions page afterwards:
--   * X-rays pay a flat peso amount (70 / 30) on every payment type, HMO
--     included (the old sheet had 50 / 30 for HMO only).
--   * OP keeps a 10% HMO rate. Other procedures earn nothing when billed to
--     an HMO, as before.
--   * Sheet names mapped to price-list names: OP = Oral Prophylaxis (all 4),
--     PF = Permanent Filling (3), TF = Temporary Filling, Ortho Install =
--     Ortho Package (Simple/Complex), Bite plane = Bite Raiser per arch,
--     Surgery = Wisdom Tooth Removal. Sheet items that are not on the price
--     list (Ortho Adj, RCM, Loss Bracket, Expander, Twin block, TMJ Down
--     payment, TMJ Adjust, Gingivectomy, Cosmetic / Esthetics Filling, Build
--     Up, Thermosens, High Impact, Coronectomy) are listed in the check at
--     the bottom -- add the procedure, then add it to the tier on the page.

BEGIN;

-- 1. Tables.
CREATE TABLE IF NOT EXISTS "dentist_commission_tiers" (
  "dentist_user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "tier" smallint NOT NULL CHECK ("tier" BETWEEN 1 AND 3),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "commission_tier_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tier" smallint NOT NULL CHECK ("tier" BETWEEN 1 AND 3),
  "procedure_id" uuid NOT NULL REFERENCES "procedures"("id") ON DELETE CASCADE,
  "rate_percent" numeric(5, 2) NOT NULL,
  "hmo_rate_percent" numeric(5, 2),
  "peso_value" numeric(12, 2),
  "hmo_peso_value" numeric(12, 2),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tier", "procedure_id")
);

-- 2. Clean up: remove the old one-by-one rates of every dentist account.
DELETE FROM "dentist_commission_rates"
WHERE "dentist_user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'dentist');

-- 3. Dentist -> tier (matched on surname; Banawa/Banawe spelling both work).
INSERT INTO "dentist_commission_tiers" ("dentist_user_id", "tier")
SELECT u."id", t.tier
FROM "users" u
JOIN (VALUES
  ('%teope%', 3), ('%ayapana%', 3),
  ('%bandayrel%', 2), ('%ahmad%', 2),
  ('%roldan%', 1), ('%banaw%', 1), ('%perez%', 1)
) AS t(pattern, tier) ON lower(u."name") LIKE t.pattern
WHERE u."role" = 'dentist'
ON CONFLICT ("dentist_user_id") DO UPDATE
  SET "tier" = EXCLUDED."tier", "updated_at" = now();

-- 4. Tier rates. Columns: procedure, Tier 3 %, Tier 2 %, Tier 1 %,
--    HMO %, flat peso (any payment).
INSERT INTO "commission_tier_rates"
  ("tier", "procedure_id", "rate_percent", "hmo_rate_percent", "peso_value")
SELECT x.tier, p."id", x.pct, s.hmo_pct, s.peso
FROM (VALUES
  -- 10% group
  ('Consultation', 10, 10, 10, NULL, NULL),
  ('Oral Prophylaxis (MILD)', 10, 10, 10, 10, NULL),
  ('Oral Prophylaxis (MODERATE)', 10, 10, 10, 10, NULL),
  ('Oral Prophylaxis (SEVERE)', 10, 10, 10, 10, NULL),
  ('Oral Prophylaxis (PEDIA)', 10, 10, 10, 10, NULL),
  ('Permanent Filling (Posterior)', 10, 10, 10, NULL, NULL),
  ('Permanent Filling (Anterior)', 10, 10, 10, NULL, NULL),
  ('Permanent Filling - Per Surface (Voco)', 10, 10, 10, NULL, NULL),
  ('Temporary Filling', 10, 10, 10, NULL, NULL),
  ('Simple Tooth Extraction', 10, 10, 10, NULL, NULL),
  ('Fluoride (Pedia Only)', 10, 10, 10, NULL, NULL),
  ('Calcimol', 10, 10, 10, NULL, NULL),
  -- Ortho / TMJ group: Tier 3 25%, Tier 2 and 1 20%
  ('Ortho Package (Simple Case)', 25, 20, 20, NULL, NULL),
  ('Ortho Package (Complex Case)', 25, 20, 20, NULL, NULL),
  ('Bite Raiser per arch', 25, 20, 20, NULL, NULL),
  ('Ortho Diagnostic Fee Simple case', 25, 20, 20, NULL, NULL),
  ('Retainers (Hawley)-per arch', 25, 20, 20, NULL, NULL),
  ('Retainers (Invisible)-per arch', 25, 20, 20, NULL, NULL),
  ('Ortho Removal w/ OP', 25, 20, 20, NULL, NULL),
  ('Retainers (additional pontic)', 25, 20, 20, NULL, NULL),
  ('TMJ Consultation', 25, 20, 20, NULL, NULL),
  ('Myofunctional Appliance', 25, 20, 20, NULL, NULL),
  ('Splint per arch', 25, 20, 20, NULL, NULL),
  -- 15% group
  ('Complicated Tooth Extraction w/ suture (silk)', 15, 15, 15, NULL, NULL),
  ('Bone Reduction', 15, 15, 15, NULL, NULL),
  ('Teeth Whitening (3 cycles)', 15, 15, 15, NULL, NULL),
  -- Cosmetic group: Tier 3 25%, Tier 2 and 1 15%
  ('Veneers (Direct composite) per tooth (warranty of 1 visit)', 25, 15, 15, NULL, NULL),
  -- Build up / RCT / post: Tier 3 20%, Tier 2 and 1 15%
  ('Root Canal Treatment (Anterior)', 20, 15, 15, NULL, NULL),
  ('Root Canal Treatment (Posterior)', 20, 15, 15, NULL, NULL),
  ('Post & Core (per post)', 20, 15, 15, NULL, NULL),
  ('Post & Build Up (Per tooth)', 20, 15, 15, NULL, NULL),
  -- Dentures / crowns / veneers / appliances: 20% for every tier
  ('Flexible Denture - Partial (Per Arch) 1-8 pontics', 20, 20, 20, NULL, NULL),
  ('Plastic Denture - Partial (Per Arch) 1-3 pontics', 20, 20, 20, NULL, NULL),
  ('Plastic Denture - Partial 4 pontics up to full', 20, 20, 20, NULL, NULL),
  ('Plastic Denture - Complete', 20, 20, 20, NULL, NULL),
  ('Denture (IVOCAP) - Per Arch', 20, 20, 20, NULL, NULL),
  ('Jacket Crown (Plastic)', 20, 20, 20, NULL, NULL),
  ('Jacket Crown (PFM)- Samurai Europe made', 20, 20, 20, NULL, NULL),
  ('Jacket Crown (PFM)-Tilite (Samurai) (Europe made)', 20, 20, 20, NULL, NULL),
  ('Jacket Crown (PFM)-Tilite (Swiss or JR)', 20, 20, 20, NULL, NULL),
  ('Jacket Crown (Emax)- Samurai (Europe made)', 20, 20, 20, NULL, NULL),
  ('Jacket Crown (Zirconia)- Samurai', 20, 20, 20, NULL, NULL),
  ('Veneers (Emax)-Samurai Europe made', 20, 20, 20, NULL, NULL),
  ('Veneers (Zirconia)-Samurai Europe made', 20, 20, 20, NULL, NULL),
  ('Onlay Ceramage (Samurai)', 20, 20, 20, NULL, NULL),
  ('Temporary Crown', 20, 20, 20, NULL, NULL),
  ('Ceramage Removal', 20, 20, 20, NULL, NULL),
  ('Clasp for Maryland', 20, 20, 20, NULL, NULL),
  ('Mouth Guard', 20, 20, 20, NULL, NULL),
  ('Denture Repair', 20, 20, 20, NULL, NULL),
  -- Surgery: Tier 3 25%, Tier 2 and 1 15%
  ('Wisdom Tooth Removal', 25, 15, 15, NULL, NULL),
  -- X-rays: flat pesos, every tier
  ('Panoramic Xray w/ hard copy', 0, 0, 0, NULL, 70),
  ('Periapical Xray', 0, 0, 0, NULL, 30)
) AS s(name, t3, t2, t1, hmo_pct, peso)
CROSS JOIN LATERAL (VALUES (3, s.t3), (2, s.t2), (1, s.t1)) AS x(tier, pct)
JOIN "procedures" p ON lower(p."name") = lower(s.name)
ON CONFLICT ("tier", "procedure_id") DO UPDATE SET
  "rate_percent" = EXCLUDED."rate_percent",
  "hmo_rate_percent" = EXCLUDED."hmo_rate_percent",
  "peso_value" = EXCLUDED."peso_value",
  "hmo_peso_value" = EXCLUDED."hmo_peso_value",
  "updated_at" = now();

COMMIT;

-- Checks -------------------------------------------------------------------
-- a) Dentists and their tier (all 7 should show a tier).
SELECT u."name", t."tier"
FROM "users" u
LEFT JOIN "dentist_commission_tiers" t ON t."dentist_user_id" = u."id"
WHERE u."role" = 'dentist'
ORDER BY t."tier" DESC NULLS LAST, u."name";

-- b) Tier rates loaded per tier (should be the same count for each tier).
SELECT "tier", count(*) AS procedures
FROM "commission_tier_rates" GROUP BY "tier" ORDER BY "tier" DESC;

-- c) Sheet procedures NOT found on the price list (nothing was loaded for
--    these; add the procedure, then add it to the tier on the Commissions page).
SELECT m.name AS "not on the price list"
FROM (VALUES
  ('Ortho Adj'), ('RCM'), ('Loss Bracket'), ('Expander'), ('Twin block'),
  ('TMJ Down payment'), ('TMJ Adjust'), ('Gingivectomy'), ('Cosmetic Filling'),
  ('Esthetics Filling'), ('Build Up'), ('Thermosens Dentures'),
  ('High Impact Plastic Dentures'), ('Coronectomy')
) AS m(name)
WHERE NOT EXISTS (SELECT 1 FROM "procedures" p WHERE lower(p."name") = lower(m.name));
