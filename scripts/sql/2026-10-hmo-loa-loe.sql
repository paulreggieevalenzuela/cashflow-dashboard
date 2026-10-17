-- HMO authorization on a visit: the LOA (Letter of Authorization) number and
-- the optional LOE number. Both are plain text and blank by default, because
-- the LOA often arrives the day after the visit; an HMO visit with a blank
-- LOA is shown as "LOA pending" and cannot be Cleared until it is filled in.
--
-- Safe to run more than once. Run in the Neon SQL Editor before using the
-- new fields.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "loa_number" text NOT NULL DEFAULT '';
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "loe_number" text NOT NULL DEFAULT '';
