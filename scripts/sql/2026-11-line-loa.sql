-- LOA number per procedure. Until now the LOA (Letter of Authorization) was
-- one number for the whole visit (invoices.loa_number). On an HMO visit each
-- procedure can now have its own LOA (Maxicare asks for one per procedure).
--
-- invoices.loa_number stays as the visit's summary: the app keeps it equal to
-- the procedures' LOA numbers (comma-separated when they differ) once EVERY
-- procedure has one, and blank while any procedure is still waiting for its
-- LOA. So "LOA pending", Day end and the Cleared rule keep working unchanged.
--
-- Safe to run more than once. Run in the Neon SQL Editor BEFORE starting the
-- updated app: until it is run, pages that list transactions show "This page
-- couldn't load".

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "loa_number" text NOT NULL DEFAULT '';

-- Existing visits: every procedure takes the LOA its visit already has.
UPDATE "transactions" AS t
SET "loa_number" = i."loa_number"
FROM "invoices" AS i
WHERE t."invoice_id" = i."id"
  AND i."loa_number" <> ''
  AND t."loa_number" = ''
  AND t."procedure" <> 'No procedures yet';

-- Check: HMO visits that have an LOA on the visit but a procedure without one
-- (should return no rows).
SELECT i."id", i."loa_number", t."procedure"
FROM "invoices" i
JOIN "transactions" t ON t."invoice_id" = i."id"
WHERE i."loa_number" <> '' AND t."loa_number" = '' AND t."procedure" <> 'No procedures yet'
LIMIT 20;
