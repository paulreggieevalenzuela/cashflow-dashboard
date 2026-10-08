-- Commission rates per dentist / procedure, from the clinic's
-- "LIST - COMMISSION" sheet (cash-paying % plus the HMO column: OP 10% and
-- a fixed peso value per X-ray).
--
-- Run this in the Neon SQL Editor. Safe to run more than once: it adds the
-- two HMO columns if missing, adds any procedure that isn't in the list
-- yet, then sets each rate (update if the dentist + procedure already has
-- one, otherwise add it). It also adds a dentist account for each of the
-- 7 dentists on the sheet that doesn't have one yet (profile-only, no
-- sign-in). Dentists are matched to their account by full name
-- (case-insensitive); if one still isn't found it is listed in the check at
-- the bottom.
--
-- After running it, run `yarn db:backfill-links` once so existing
-- transactions pick up the new rates.

-- 1. HMO columns on the rates table.
ALTER TABLE "dentist_commission_rates"
  ADD COLUMN IF NOT EXISTS "hmo_rate_percent" numeric(5, 2);
ALTER TABLE "dentist_commission_rates"
  ADD COLUMN IF NOT EXISTS "hmo_peso_value" numeric(12, 2);

-- 1b. The dentists on the sheet. Adds a dentist account for each one that
--     doesn't have one yet (matched by full name). These are profile-only
--     accounts so they appear in the Dentist dropdown and can have rates:
--     the e-mail is a placeholder and the password is one nobody can type,
--     so nobody can sign in as them. To let a dentist sign in later, create
--     their real account on the Users page and remove the placeholder one.
INSERT INTO "users" ("name", "email", "password_hash", "role")
SELECT d.name, d.email, '!no-login', 'dentist'
FROM (VALUES
  ('Dawn Rufino Rey Teope', 'dawn.teope@adt-dental.invalid'),
  ('Rearosa Ayapana', 'rearosa.ayapana@adt-dental.invalid'),
  ('Beatrice Kiara Bandayrel', 'beatrice.bandayrel@adt-dental.invalid'),
  ('Kyla Denise Ahmad', 'kyla.ahmad@adt-dental.invalid'),
  ('Katherine Roldan', 'katherine.roldan@adt-dental.invalid'),
  ('James Russel Banawa', 'james.banawa@adt-dental.invalid'),
  ('Anna Beatrice Perez', 'anna.perez@adt-dental.invalid')
) AS d(name, email)
WHERE NOT EXISTS (
  SELECT 1 FROM "users" u
  WHERE lower(u."name") = lower(d.name) OR u."email" = d.email
);

-- 2. Load the sheet. cash_pct is 0 where the sheet has no cash-paying
--    percentage (the HMO-only rows: OP and the X-rays). Everything runs as
--    one block so it either all applies or none of it does.
DO $$
DECLARE
  s record;
  v_dentist uuid;
  v_procedure uuid;
BEGIN
  FOR s IN
    SELECT * FROM (VALUES
    ('DAWN RUFINO REY TEOPE', 'Consultation', 10.00, NULL, NULL),
    ('DAWN RUFINO REY TEOPE', 'Ortho Install', 25.00, NULL, NULL),
    ('DAWN RUFINO REY TEOPE', 'Complicated extraction', 15.00, NULL, NULL),
    ('DAWN RUFINO REY TEOPE', 'Cosmetic Filling', 20.00, NULL, NULL),
    ('DAWN RUFINO REY TEOPE', 'OP', 0.00, 10.00, NULL),
    ('DAWN RUFINO REY TEOPE', 'Panoramic xray', 0.00, NULL, 50.00),
    ('DAWN RUFINO REY TEOPE', 'Periapical Xray', 0.00, NULL, 30.00),
    ('DAWN RUFINO REY TEOPE', 'Transcranial Xray', 0.00, NULL, 50.00),
    ('REAROSA AYAPANA', 'Consultation', 10.00, NULL, NULL),
    ('REAROSA AYAPANA', 'Ortho Install', 20.00, NULL, NULL),
    ('REAROSA AYAPANA', 'Complicated extraction', 15.00, NULL, NULL),
    ('REAROSA AYAPANA', 'Cosmetic Filling', 20.00, NULL, NULL),
    ('REAROSA AYAPANA', 'OP', 0.00, 10.00, NULL),
    ('REAROSA AYAPANA', 'Panoramic xray', 0.00, NULL, 50.00),
    ('REAROSA AYAPANA', 'Periapical Xray', 0.00, NULL, 30.00),
    ('BEATRICE KIARA BANDAYREL', 'Consultation', 10.00, NULL, NULL),
    ('BEATRICE KIARA BANDAYREL', 'Ortho Install', 20.00, NULL, NULL),
    ('BEATRICE KIARA BANDAYREL', 'Complicated extraction', 15.00, NULL, NULL),
    ('BEATRICE KIARA BANDAYREL', 'Cosmetic Filling', 20.00, NULL, NULL),
    ('BEATRICE KIARA BANDAYREL', 'OP', 0.00, 10.00, NULL),
    ('BEATRICE KIARA BANDAYREL', 'Panoramic xray', 0.00, NULL, 50.00),
    ('BEATRICE KIARA BANDAYREL', 'Periapical Xray', 0.00, NULL, 30.00),
    ('KYLA DENISE AHMAD', 'Consultation', 10.00, NULL, NULL),
    ('KYLA DENISE AHMAD', 'Ortho Install', 20.00, NULL, NULL),
    ('KYLA DENISE AHMAD', 'Complicated extraction', 15.00, NULL, NULL),
    ('KYLA DENISE AHMAD', 'Root Canal Treatment (Anterior/Posterior)', 20.00, NULL, NULL),
    ('KYLA DENISE AHMAD', 'OP', 0.00, 10.00, NULL),
    ('KYLA DENISE AHMAD', 'Panoramic xray', 0.00, NULL, 50.00),
    ('KYLA DENISE AHMAD', 'Periapical Xray', 0.00, NULL, 30.00),
    ('KATHERINE ROLDAN', 'Consultation', 10.00, NULL, NULL),
    ('KATHERINE ROLDAN', 'Ortho Install', 20.00, NULL, NULL),
    ('KATHERINE ROLDAN', 'Complicated extraction', 15.00, NULL, NULL),
    ('KATHERINE ROLDAN', 'Root Canal Treatment (Anterior/Posterior)', 20.00, NULL, NULL),
    ('KATHERINE ROLDAN', 'OP', 0.00, 10.00, NULL),
    ('KATHERINE ROLDAN', 'Panoramic xray', 0.00, NULL, 50.00),
    ('KATHERINE ROLDAN', 'Periapical Xray', 0.00, NULL, 30.00),
    ('JAMES RUSSEL BANAWA', 'Consultation', 10.00, NULL, NULL),
    ('JAMES RUSSEL BANAWA', 'Ortho Install', 15.00, NULL, NULL),
    ('JAMES RUSSEL BANAWA', 'Root Canal Treatment (Anterior/Posterior)', 20.00, NULL, NULL),
    ('JAMES RUSSEL BANAWA', 'OP', 0.00, 10.00, NULL),
    ('JAMES RUSSEL BANAWA', 'Panoramic xray', 0.00, NULL, 50.00),
    ('JAMES RUSSEL BANAWA', 'Periapical Xray', 0.00, NULL, 30.00),
    ('ANNA BEATRICE PEREZ', 'Consultation', 10.00, NULL, NULL),
    ('ANNA BEATRICE PEREZ', 'Ortho Install', 15.00, NULL, NULL),
    ('ANNA BEATRICE PEREZ', 'Root Canal Treatment (Anterior/Posterior)', 20.00, NULL, NULL),
    ('ANNA BEATRICE PEREZ', 'OP', 0.00, 10.00, NULL),
    ('ANNA BEATRICE PEREZ', 'Panoramic xray', 0.00, NULL, 50.00),
    ('ANNA BEATRICE PEREZ', 'Periapical Xray', 0.00, NULL, 30.00)
    ) AS t(dentist_name, procedure_name, cash_pct, hmo_pct, hmo_peso)
  LOOP
    -- The dentist's account (skipped when there isn't one yet).
    SELECT u."id" INTO v_dentist
    FROM "users" u
    WHERE lower(u."name") = lower(s.dentist_name) AND u."role" = 'dentist'
    LIMIT 1;
    IF v_dentist IS NULL THEN
      RAISE NOTICE 'No dentist account named %, skipped', s.dentist_name;
      CONTINUE;
    END IF;

    -- The procedure (added to the list when it isn't there yet).
    SELECT p."id" INTO v_procedure
    FROM "procedures" p
    WHERE lower(p."name") = lower(s.procedure_name)
    LIMIT 1;
    IF v_procedure IS NULL THEN
      INSERT INTO "procedures" ("name") VALUES (s.procedure_name)
      RETURNING "id" INTO v_procedure;
    END IF;

    -- Update the rate if this dentist + procedure has one, otherwise add it.
    UPDATE "dentist_commission_rates"
    SET "rate_percent" = s.cash_pct,
        "hmo_rate_percent" = s.hmo_pct,
        "hmo_peso_value" = s.hmo_peso,
        "updated_at" = now()
    WHERE "dentist_user_id" = v_dentist AND "procedure_id" = v_procedure;
    IF NOT FOUND THEN
      INSERT INTO "dentist_commission_rates"
        ("dentist_user_id", "procedure_id", "rate_percent", "hmo_rate_percent", "hmo_peso_value")
      VALUES (v_dentist, v_procedure, s.cash_pct, s.hmo_pct, s.hmo_peso);
    END IF;
  END LOOP;
END $$;

-- 3. Check A: dentists on the sheet with no dentist account (their rates
--    were NOT loaded). Empty = everyone matched.
SELECT n.name AS "no dentist account named"
FROM (VALUES ('DAWN RUFINO REY TEOPE'), ('REAROSA AYAPANA'), ('BEATRICE KIARA BANDAYREL'), ('KYLA DENISE AHMAD'), ('KATHERINE ROLDAN'), ('JAMES RUSSEL BANAWA'), ('ANNA BEATRICE PEREZ')) AS n(name)
WHERE NOT EXISTS (
  SELECT 1 FROM "users" u
  WHERE lower(u."name") = lower(n.name) AND u."role" = 'dentist'
);

-- 4. Check B: rates now on file per dentist.
SELECT u."name" AS dentist, count(*) AS rates
FROM "dentist_commission_rates" r
JOIN "users" u ON u."id" = r."dentist_user_id"
GROUP BY u."name"
ORDER BY u."name";
