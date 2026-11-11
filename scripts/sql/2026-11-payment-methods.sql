-- Payment methods added by an owner or admin (Transactions -> Payment methods).
--
-- The built-in methods (Cash, GCash, Maxicare, Asiancare, ...) are part of the
-- app and need nothing here. This table holds the ones added from the screen,
-- so a new HMO, card machine or e-wallet can be added without a new release.
--
-- Run this in the Neon SQL Editor. Until it is run the app keeps working with
-- the built-in methods only, and the "Add" button on the Payment methods screen
-- says it isn't set up yet. Safe to run more than once. Nothing is changed in
-- the existing tables: visits and payments keep storing the method's name.

CREATE TABLE IF NOT EXISTS "payment_methods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- As shown on screen (for example "Pacific Cross").
  "name" text NOT NULL,
  -- The lower-case, single-spaced name: keeps the names unique ignoring capitals.
  "name_key" text NOT NULL UNIQUE,
  -- 'hmo' = an HMO / insurance company billed directly; 'other' = paid by the patient.
  "kind" text NOT NULL CHECK ("kind" IN ('hmo', 'other')),
  -- Hidden methods are not offered on new visits; old visits keep them.
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by_name" text NOT NULL DEFAULT ''
);
