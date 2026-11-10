-- DRAFT - not run. Fills the commission gaps found by
-- scripts/audit-commission-sheet.ts. Read the notes, change any number you
-- disagree with, then run it in the Neon SQL Editor (safe to run twice).
-- Afterwards run `yarn db:backfill-links` so already-saved rows are re-priced.
--
-- Rates below are SUGGESTIONS that follow the groups already used by the tier
-- table (Ortho group: Tier 3 25 / Tier 2 20 / Tier 1 20). The old per-dentist
-- sheet disagrees with itself for some of these (e.g. Ortho Adj: Teope 25,
-- Ayapana/Ahmad/Roldan 20, Banawa/Perez 15), so please confirm.

BEGIN;

INSERT INTO "commission_tier_rates" ("tier", "procedure_id", "rate_percent")
SELECT x.tier, p."id", x.pct
FROM (VALUES
  ('Ortho Adj',              25, 20, 20),
  ('Sanitation + Ortho Adj', 25, 20, 20),   -- confirm: pays like Ortho Adj?
  ('RCM',                    25, 20, 20),
  ('Lost Bracket',           25, 20, 20),   -- sheet spells it "Loss Bracket"
  ('Cosmetic Filling',       20, 15, 15),   -- sheet: Bandayrel 20, Ahmad 15
  ('Flouride Varnish',       10, 10, 10)    -- same as Fluoride (Pedia Only)
) AS s(name, t3, t2, t1)
CROSS JOIN LATERAL (VALUES (3, s.t3), (2, s.t2), (1, s.t1)) AS x(tier, pct)
JOIN "procedures" p ON lower(p."name") = lower(s.name)
ON CONFLICT ("tier", "procedure_id") DO UPDATE SET
  "rate_percent" = EXCLUDED."rate_percent", "updated_at" = now();

-- OPTIONAL - HMO 10% beyond OP. The sheet merges the HMO 10% cell over OP, PF,
-- TF and Simple extraction; the app only pays HMO commission on OP. Remove the
-- comment markers to match the sheet.
-- UPDATE "commission_tier_rates" r SET "hmo_rate_percent" = 10, "updated_at" = now()
-- FROM "procedures" p
-- WHERE p."id" = r."procedure_id"
--   AND (p."name" LIKE 'Permanent Filling%' OR p."name" IN ('Temporary Filling', 'Simple Tooth Extraction'));

COMMIT;

-- Not on the price list at all (add each one under Procedures first, then give
-- it a tier rate on the Commissions page): Build Up, Coronectomy, Esthetics
-- Filling, Expander, Gingivectomy, High Impact Plastic Dentures, Thermosens
-- Dentures, Twin block, TMJ Adjust, TMJ Down payment, Transcranial Xray (HMO
-- peso 50), Pedia Handling Fee (seen on the Transactions screenshot).
