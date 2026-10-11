-- HMO prices per procedure.
--
-- Run in the Neon SQL Editor. Safe to run more than once.
-- Run AFTER 2026-10-procedures-settings-and-line-fields.sql.
--
-- Adds:
--   procedure_prices          one price per procedure x HMO (Cash keeps using
--                             procedures.default_price)
--   procedure_price_history   a "payer" column, so history says which price changed
--
-- Then loads the clinic's HMO price list for the six accepted HMOs:
--   Maxicare, Intellicare, Avega, Valucare, Medicard, Elite Dental Network
-- A price that is already there is NOT overwritten, so running this again
-- never undoes an edit made on the Procedures tab.

-- 1. Tables / columns ---------------------------------------------------
CREATE TABLE IF NOT EXISTS procedure_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id uuid NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  -- The payment type name exactly as on the form (e.g. 'Maxicare').
  payer text NOT NULL,
  price numeric(12, 2) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (procedure_id, payer)
);

ALTER TABLE procedure_price_history
  ADD COLUMN IF NOT EXISTS payer text NOT NULL DEFAULT 'Cash';

-- 2. The HMO price list ---------------------------------------------------
BEGIN;

-- item: how the clinic's sheet names it. Each item applies to the procedures
-- in the mapping below.
CREATE TEMP TABLE hmo_sheet (payer text, item text, price numeric(12, 2)) ON COMMIT DROP;
INSERT INTO hmo_sheet (payer, item, price) VALUES
  ('Maxicare', 'Consultation', 150), ('Maxicare', 'OP', 250), ('Maxicare', 'PF', 350),
  ('Maxicare', 'TF', 120), ('Maxicare', 'EXO', 235),
  ('Intellicare', 'Consultation', 200), ('Intellicare', 'OP', 300), ('Intellicare', 'PF', 250),
  ('Intellicare', 'TF', 100), ('Intellicare', 'EXO', 200),
  ('Avega', 'Consultation', 200), ('Avega', 'OP', 300), ('Avega', 'PF', 250),
  ('Avega', 'TF', 100), ('Avega', 'EXO', 200),
  ('Valucare', 'Consultation', 150), ('Valucare', 'OP', 275), ('Valucare', 'PF', 350),
  ('Valucare', 'TF', 150), ('Valucare', 'EXO', 350),
  ('Medicard', 'Consultation', 150), ('Medicard', 'OP', 250), ('Medicard', 'PF', 250),
  ('Medicard', 'TF', 250), ('Medicard', 'EXO', 200),
  ('Elite Dental Network', 'Consultation', 100), ('Elite Dental Network', 'OP', 400),
  ('Elite Dental Network', 'PF', 400), ('Elite Dental Network', 'TF', 100),
  ('Elite Dental Network', 'EXO', 400);

-- Maxicare's sheet has Simple EXO (A) 235 and Simple EXO (P) 270; our list has
-- one "Simple Tooth Extraction", loaded at the anterior price (235). Change it
-- on the Procedures tab (or on the line) for a posterior tooth.

CREATE TEMP TABLE hmo_map (item text, procedure_name text) ON COMMIT DROP;
INSERT INTO hmo_map (item, procedure_name) VALUES
  ('Consultation', 'Consultation'),
  ('OP', 'Oral Prophylaxis (MILD)'),
  ('OP', 'Oral Prophylaxis (MODERATE)'),
  ('OP', 'Oral Prophylaxis (SEVERE)'),
  ('OP', 'Oral Prophylaxis (PEDIA)'),
  ('PF', 'Permanent Filling (Posterior)'),
  ('PF', 'Permanent Filling (Anterior)'),
  ('PF', 'Permanent Filling - Per Surface (Voco)'),
  ('TF', 'Temporary Filling'),
  ('EXO', 'Simple Tooth Extraction');

WITH wanted AS (
  SELECT p.id AS procedure_id, s.payer, s.price
    FROM hmo_sheet s
    JOIN hmo_map m ON m.item = s.item
    JOIN procedures p ON lower(p.name) = lower(m.procedure_name)
),
inserted AS (
  INSERT INTO procedure_prices (procedure_id, payer, price)
  SELECT procedure_id, payer, price FROM wanted
  ON CONFLICT (procedure_id, payer) DO NOTHING
  RETURNING procedure_id, payer, price
)
INSERT INTO procedure_price_history (procedure_id, payer, old_price, new_price, changed_by_name, note)
SELECT procedure_id, payer, NULL, price, 'System', 'HMO price list loaded'
  FROM inserted;

-- Procedures in the mapping that were not found on the price list (should be none):
SELECT m.procedure_name
  FROM hmo_map m
  LEFT JOIN procedures p ON lower(p.name) = lower(m.procedure_name)
 WHERE p.id IS NULL;

COMMIT;

-- Checks -------------------------------------------------------------------
SELECT payer, count(*) AS procedures_with_price
  FROM procedure_prices GROUP BY payer ORDER BY payer;
