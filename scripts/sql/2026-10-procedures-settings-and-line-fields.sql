-- Procedures settings + new transaction line fields.
--
-- Run in the Neon SQL Editor. Safe to run more than once.
-- Run AFTER 2026-10-procedure-pricelist.sql (it sets price_basis by name).
--
-- What this adds:
--   procedures            price_basis, active (hide), updated_at
--   procedure_price_history   every price change (old, new, who, when, note)
--   discount_types        PWD 20%, Senior citizen 20%, Promo (statutory / needs_id flags)
--   transactions          quantity, unit_price, teeth, discount_type_id
--   invoices              discount_id_type, discount_id_number, recall_date, recall_reason
--
-- Existing transactions are not changed in value: quantity = 1 and
-- unit_price = list_price, so every old amount stays exactly as it was.

-- 1. Procedures ---------------------------------------------------------
ALTER TABLE procedures
  ADD COLUMN IF NOT EXISTS price_basis text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Price history ------------------------------------------------------
CREATE TABLE IF NOT EXISTS procedure_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id uuid NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  old_price numeric(12, 2),
  new_price numeric(12, 2),
  changed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  changed_by_name text NOT NULL DEFAULT '',
  changed_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS procedure_price_history_procedure_idx
  ON procedure_price_history (procedure_id, changed_at DESC);

-- 3. Discount types -----------------------------------------------------
CREATE TABLE IF NOT EXISTS discount_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  -- Fixed percentage for the type (PWD / Senior 20). NULL = typed per line.
  default_percent numeric(5, 2),
  -- PWD / Senior by law: VAT is removed first, then 20% off the VAT-free price.
  statutory boolean NOT NULL DEFAULT false,
  -- An ID number (and ID type) must be recorded on the visit.
  needs_id boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO discount_types (name, default_percent, statutory, needs_id, sort_order)
VALUES
  ('PWD', 20, true, true, 1),
  ('Senior citizen', 20, true, true, 2),
  ('Promo', NULL, false, false, 3)
ON CONFLICT (name) DO UPDATE
  SET default_percent = EXCLUDED.default_percent,
      statutory = EXCLUDED.statutory,
      needs_id = EXCLUDED.needs_id,
      sort_order = EXCLUDED.sort_order,
      active = true;

-- 4. Transaction lines --------------------------------------------------
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teeth text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS discount_type_id uuid REFERENCES discount_types(id) ON DELETE SET NULL;

-- Old lines: one unit at the price they were sold for.
UPDATE transactions
   SET unit_price = list_price
 WHERE unit_price = 0 AND list_price > 0;

-- Old lines whose discount reason matches a discount type keep working as is;
-- link them so reports can group by type.
UPDATE transactions t
   SET discount_type_id = d.id
  FROM discount_types d
 WHERE t.discount_type_id IS NULL
   AND t.discount_reason <> ''
   AND lower(t.discount_reason) = lower(d.name);

-- 5. Visits (invoices) ---------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS discount_id_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS discount_id_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS recall_date text,
  ADD COLUMN IF NOT EXISTS recall_reason text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS invoices_recall_date_idx
  ON invoices (recall_date) WHERE recall_date IS NOT NULL;

-- 6. Price basis per procedure (how the price is counted) ---------------
-- flat (default) | tooth | surface | arch | unit
-- Only rows still on the default ('flat') are touched, so running this again
-- never undoes a basis an admin has chosen on the Procedures tab.

UPDATE procedures SET price_basis = 'surface'
 WHERE price_basis = 'flat' AND (name ILIKE 'Permanent Filling%'
    OR name ILIKE 'Temporary Filling%'
    OR name ILIKE 'Calcimol%');

UPDATE procedures SET price_basis = 'tooth'
 WHERE price_basis = 'flat' AND (name ILIKE 'Veneers%'
    OR name ILIKE 'Jacket Crown%'
    OR name ILIKE 'Onlay Ceramage%'
    OR name ILIKE 'Post & Build Up%'
    OR name ILIKE 'Wisdom Tooth Removal%'
    OR name ILIKE 'Complicated Tooth Extraction%'
    OR name ILIKE 'Simple Tooth Extraction%'
    OR name ILIKE 'Root Canal Treatment%'
    OR name ILIKE 'Bone Reduction%');

UPDATE procedures SET price_basis = 'arch'
 WHERE price_basis = 'flat' AND ((name ILIKE '%denture%' AND name NOT ILIKE '%repair%' AND name NOT ILIKE '%complete%')
    OR name ILIKE 'Retainers (Hawley)%'
    OR name ILIKE 'Retainers (Invisible)%'
    OR name ILIKE 'Splint%'
    OR name ILIKE 'Bite Raiser%');

UPDATE procedures SET price_basis = 'unit'
 WHERE price_basis = 'flat' AND (name ILIKE 'Post & Core%'
    OR name ILIKE 'Retainers (additional pontic)%'
    OR name ILIKE 'Additional Whitening Cycle%'
    OR name ILIKE 'Extra Anesthesia%'
    OR name ILIKE 'Temporary Crown%'
    OR name ILIKE 'Ceramage Removal%'
    OR name ILIKE 'Suture%');

-- Checks -----------------------------------------------------------------
SELECT price_basis, count(*) AS procedures FROM procedures GROUP BY 1 ORDER BY 1;
SELECT name, default_percent, statutory, needs_id FROM discount_types ORDER BY sort_order;
SELECT count(*) AS lines_without_unit_price
  FROM transactions WHERE unit_price = 0 AND list_price > 0;
