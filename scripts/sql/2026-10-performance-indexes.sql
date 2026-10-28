-- Suggested speed-up indexes (NOT yet applied). Every column below is used to
-- filter or sort in the Transactions list, Day end, Queue, dashboards or the
-- commission report, and none of them has an index today (only the ones that
-- earlier SQL files created exist: invoice_id, patient_id, status, etc.).
--
-- Safe to run more than once. Run in the Neon SQL Editor. The tables are small
-- today, so each statement takes well under a second; the gain shows as the
-- data grows (thousands of visits).

-- Day end, Queue, "today" screens: visits of one day, per branch.
CREATE INDEX IF NOT EXISTS invoices_visit_date_idx    ON invoices (visit_date);
CREATE INDEX IF NOT EXISTS invoices_branch_visit_idx  ON invoices (branch_id, visit_date);

-- Transactions list (sorted by date), branch filter, dentist reports.
CREATE INDEX IF NOT EXISTS transactions_date_idx         ON transactions (date, created_at);
CREATE INDEX IF NOT EXISTS transactions_branch_idx       ON transactions (branch_id);
CREATE INDEX IF NOT EXISTS transactions_visit_id_idx     ON transactions (visit_id);
CREATE INDEX IF NOT EXISTS transactions_dentist_user_idx ON transactions (dentist_user_id);

-- Day end: payments received in a time window.
CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON payments (paid_at);

-- Expenses tab and Day end.
CREATE INDEX IF NOT EXISTS expenses_date_idx        ON expenses (date);
CREATE INDEX IF NOT EXISTS expenses_branch_date_idx ON expenses (branch_id, date);

-- Check: the indexes of the main tables.
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('invoices', 'transactions', 'payments', 'expenses')
ORDER BY tablename, indexname;
