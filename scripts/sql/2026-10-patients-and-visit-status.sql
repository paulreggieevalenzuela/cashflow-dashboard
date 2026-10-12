-- Patients page + visit status tracking.
--
-- Run in the Neon SQL Editor. Safe to run more than once.
--
-- Adds:
--   invoices.status / status_changed_at   Arrived | On-going | For Payment | Cleared
--   invoice_status_history                who moved a visit, when, and why
--   audit_log                             who created / edited / removed what, and when
--   an index so a patient's invoices load fast
--
-- Existing visits are set ONCE, when the column is first created:
--   paid in full (or nothing owed)  -> Cleared
--   money still owed                -> For Payment
-- Running this file again never changes a status.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'invoices' AND column_name = 'status'
  ) THEN
    ALTER TABLE invoices
      ADD COLUMN status text NOT NULL DEFAULT 'Cleared',
      ADD COLUMN status_changed_at timestamptz NOT NULL DEFAULT now();

    -- Old visits that still owe money: lines total minus payments received.
    UPDATE invoices i
       SET status = 'For Payment'
     WHERE (
       SELECT coalesce(sum(t.amount_paid), 0) FROM transactions t WHERE t.invoice_id = i.id
     ) - (
       SELECT coalesce(sum(p.amount), 0) FROM payments p WHERE p.invoice_id = i.id
     ) > 0.005;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_status_check'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_status_check
      CHECK (status IN ('Arrived', 'On-going', 'For Payment', 'Cleared'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS invoice_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  changed_by_name text NOT NULL DEFAULT '',
  changed_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS invoice_status_history_invoice_idx
  ON invoice_status_history (invoice_id, changed_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  user_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL DEFAULT '',
  invoice_id uuid,
  patient_id uuid,
  summary text NOT NULL DEFAULT '',
  details jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_invoice_idx ON audit_log (invoice_id, created_at);
CREATE INDEX IF NOT EXISTS audit_log_patient_idx ON audit_log (patient_id, created_at);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status, visit_date);
CREATE INDEX IF NOT EXISTS invoices_patient_visit_idx ON invoices (patient_id, visit_date);

COMMIT;

-- Checks -------------------------------------------------------------------
SELECT status, count(*) AS visits FROM invoices GROUP BY status ORDER BY status;
SELECT count(*) AS history_rows FROM invoice_status_history;
SELECT count(*) AS audit_rows FROM audit_log;
