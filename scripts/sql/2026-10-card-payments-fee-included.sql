-- OPTIONAL. Run only if you already have visits paid by card that were
-- entered under the short-lived "merchant fee added on top" rule (for
-- example a 1,000 bill saved with a 1,050 card payment).
--
-- The merchant fee is now INSIDE the payment: a 3,500 bill paid by card is
-- paid in full by a 3,500 payment (the fee, 175 at 5%, comes out of it and
-- the clinic receives 3,325). A payment that was entered as bill + fee
-- would now show as more than the bill, so this sets it back to the bill.
--
-- It only touches a visit that has exactly ONE payment, by a card type, that
-- is more than the total due but no more than the total due plus its fee.
-- Safe to run more than once. Run `yarn db:recompute-fees` afterwards.

-- Preview (nothing changes):
SELECT p."id", p."payment_type", p."amount" AS payment, t.total AS total_due
FROM "payments" p
JOIN (
  SELECT "invoice_id", sum("amount_paid") AS total
  FROM "transactions" WHERE "invoice_id" IS NOT NULL GROUP BY "invoice_id"
) t ON t."invoice_id" = p."invoice_id"
WHERE lower(trim(p."payment_type")) LIKE 'pos (%'
  AND p."amount" > t.total + 0.005
  AND (SELECT count(*) FROM "payments" x WHERE x."invoice_id" = p."invoice_id") = 1;

UPDATE "payments" p
SET "amount" = t.total
FROM (
  SELECT "invoice_id", sum("amount_paid") AS total
  FROM "transactions" WHERE "invoice_id" IS NOT NULL GROUP BY "invoice_id"
) t
WHERE t."invoice_id" = p."invoice_id"
  AND lower(trim(p."payment_type")) LIKE 'pos (%'
  AND p."amount" > t.total + 0.005
  AND p."amount" <= round(t.total * (1 + CASE
        WHEN lower(p."payment_type") LIKE 'pos (bdo)%' THEN 0.05
        WHEN lower(p."payment_type") LIKE 'pos (maya)%' THEN 0.034
        ELSE 0.028 END), 2) + 0.01
  AND (SELECT count(*) FROM "payments" x WHERE x."invoice_id" = p."invoice_id") = 1;
