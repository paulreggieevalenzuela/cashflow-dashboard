-- Merge two accounts of the same dentist into one.
--
-- Prepared for: Dawn Rufino Rey Teope. KEEP the account with the e-mail
-- dawnteope@adtdentalclinics.com; everything of the other account (visits,
-- including today's, second-dentist lines, who-did-what history, commission
-- rates and the rest) moves to it, then the other account is removed.
--
-- HOW TO RUN (Neon SQL Editor), in this order:
--   1. Run PART 1 (the preview) on its own and read it. Check that it shows
--      exactly two accounts: the one to keep and the one that will be removed.
--   2. Run PART 2 (the merge) on its own. It is ONE block: either everything
--      is merged or nothing is changed (it stops with a message if anything
--      looks wrong: no account to keep, no duplicate, more than one duplicate,
--      or an account that is not a dentist).
--   3. Run PART 3 (the check) to see what was moved.
-- Best done when nobody is saving visits (for example early morning).
-- After it, the removed account can no longer sign in; the kept account is
-- unchanged (same password, role and access).
--
-- What moves to the kept account
--   visit lines where she is the dentist or the second (transfer) dentist,
--   and the commission amounts already stored on them (not recalculated);
--   visits, payments' files, expenses, HMO billings, status changes, audit
--   lines and price changes she made; password-reset requests; her entries in
--   Deleted items (including items waiting to be restored);
--   her commission rates (where the kept account has none for that procedure),
--   her commission tier (if the kept account has none), her clinics (added to
--   the kept account's), her display setting (if the kept account has none).
-- What is NOT moved (the kept account's own always wins)
--   a commission rate for a procedure the kept account already has a rate for,
--   the commission tier or theme when the kept account has one, and the
--   removed account's per-user access overrides.
-- Visit lines that only have her NAME typed and no account link are left as
-- they are, unless you set link_unlinked_rows to true in PART 2.
--
-- Change the e-mail and name only if you reuse this for another person.


-- ===========================================================================
-- PART 1: PREVIEW (read-only). Run this first, on its own.
-- ===========================================================================

-- 1a. The accounts involved: the one to keep and every other account with the
--     same name. You expect exactly two rows.
SELECT
  CASE WHEN lower(trim(email)) = lower('dawnteope@adtdentalclinics.com')
       THEN 'KEEP' ELSE 'MERGE INTO THE KEPT ONE, THEN REMOVE' END AS what_happens,
  name, email, role, created_at,
  (SELECT count(*) FROM transactions t WHERE t.dentist_user_id = u.id) AS visit_lines_as_dentist,
  (SELECT count(*) FROM transactions t
    WHERE t.dentist_user_id = u.id
      AND t.date >= to_char((now() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD')) AS visit_lines_today_or_later,
  (SELECT count(*) FROM dentist_commission_rates r WHERE r.dentist_user_id = u.id) AS commission_rates
FROM users u
WHERE lower(trim(email)) = lower('dawnteope@adtdentalclinics.com')
   OR lower(regexp_replace(trim(name), '\s+', ' ', 'g')) = lower('Dawn Rufino Rey Teope')
ORDER BY (lower(trim(email)) = lower('dawnteope@adtdentalclinics.com')) DESC, created_at;

-- 1b. Commission rates both accounts have for the same procedure. The kept
--     account's rate stays; the other one's is dropped. Empty = no conflicts.
SELECT p.name AS procedure,
       k.rate_percent AS kept_rate, d.rate_percent AS other_rate,
       k.hmo_rate_percent AS kept_hmo_rate, d.hmo_rate_percent AS other_hmo_rate
FROM users ku
JOIN dentist_commission_rates k ON k.dentist_user_id = ku.id
JOIN users du ON du.id <> ku.id
 AND lower(regexp_replace(trim(du.name), '\s+', ' ', 'g')) = lower('Dawn Rufino Rey Teope')
JOIN dentist_commission_rates d ON d.dentist_user_id = du.id AND d.procedure_id = k.procedure_id
JOIN procedures p ON p.id = k.procedure_id
WHERE lower(trim(ku.email)) = lower('dawnteope@adtdentalclinics.com')
  AND (k.rate_percent IS DISTINCT FROM d.rate_percent
       OR k.hmo_rate_percent IS DISTINCT FROM d.hmo_rate_percent
       OR k.hmo_peso_value IS DISTINCT FROM d.hmo_peso_value)
ORDER BY p.name;

-- 1c. Visit lines with her name typed but no account link (left alone unless
--     link_unlinked_rows is true in PART 2).
SELECT count(*) AS lines_with_her_name_but_no_account_link
FROM transactions
WHERE dentist_user_id IS NULL
  AND lower(regexp_replace(trim(dentist), '\s+', ' ', 'g')) = lower('Dawn Rufino Rey Teope');


-- ===========================================================================
-- PART 2: THE MERGE. Run this on its own, after reading PART 1.
-- ===========================================================================

DO $merge$
DECLARE
  keep_email         constant text    := 'dawnteope@adtdentalclinics.com';
  person_name        constant text    := 'Dawn Rufino Rey Teope';
  link_unlinked_rows constant boolean := false;

  keeper    users%ROWTYPE;
  dup       users%ROWTYPE;
  dup_count integer;
  dup_list  text;
  pair      text[];
  n         bigint;
  summary   text := '';
  clean     text;
BEGIN
  clean := lower(regexp_replace(trim(person_name), '\s+', ' ', 'g'));

  -- The account to keep.
  SELECT * INTO keeper FROM users WHERE lower(trim(email)) = lower(trim(keep_email));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOPPED: no account with the e-mail % was found. Nothing was changed.', keep_email;
  END IF;
  IF keeper.role::text <> 'dentist' THEN
    RAISE EXCEPTION 'STOPPED: % is a "%" account, not a dentist. Nothing was changed.', keep_email, keeper.role;
  END IF;

  -- The account to merge into it: same name, any other e-mail.
  SELECT count(*), string_agg(email || ' (' || role::text || ')', ', ')
    INTO dup_count, dup_list
    FROM users
   WHERE id <> keeper.id
     AND lower(regexp_replace(trim(name), '\s+', ' ', 'g')) = clean;
  IF dup_count = 0 THEN
    RAISE EXCEPTION 'STOPPED: there is no other account named "%". It may already be merged. Nothing was changed.', person_name;
  ELSIF dup_count > 1 THEN
    RAISE EXCEPTION 'STOPPED: % other accounts are named "%": %. Merge them one at a time after checking which are real. Nothing was changed.', dup_count, person_name, dup_list;
  END IF;
  SELECT * INTO dup FROM users
   WHERE id <> keeper.id
     AND lower(regexp_replace(trim(name), '\s+', ' ', 'g')) = clean;
  IF dup.role::text <> 'dentist' THEN
    RAISE EXCEPTION 'STOPPED: the other account % is a "%" account, not a dentist. Nothing was changed.', dup.email, dup.role;
  END IF;

  -- 1. Everything that points at the other account now points at the kept one.
  --    (table, column) pairs; a table or column that does not exist yet in this
  --    database (an older SQL file not run) is skipped.
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['transactions',             'dentist_user_id'],
    ['transactions',             'transfer_dentist_user_id'],
    ['transactions',             'created_by_user_id'],
    ['invoices',                 'created_by_user_id'],
    ['invoice_status_history',   'changed_by_user_id'],
    ['attachments',              'created_by_user_id'],
    ['expenses',                 'created_by_user_id'],
    ['hmo_billings',             'created_by_user_id'],
    ['audit_log',                'user_id'],
    ['password_reset_requests',  'user_id'],
    ['password_reset_requests',  'handled_by'],
    ['procedure_price_history',  'changed_by_user_id'],
    ['deleted_items',            'deleted_by_user_id']
  ] LOOP
    IF to_regclass('public.' || pair[1]) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = pair[1] AND column_name = pair[2]) THEN
      EXECUTE format('UPDATE %I SET %I = $1 WHERE %I = $2', pair[1], pair[2], pair[2])
        USING keeper.id, dup.id;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN summary := summary || format('%s.%s: %s; ', pair[1], pair[2], n); END IF;
    END IF;
  END LOOP;

  -- 2. The name written on the visit lines follows the kept account.
  UPDATE transactions SET dentist = keeper.name
   WHERE dentist_user_id = keeper.id
     AND lower(regexp_replace(trim(dentist), '\s+', ' ', 'g')) = clean
     AND dentist <> keeper.name;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'transfer_dentist_user_id') THEN
    EXECUTE 'UPDATE transactions SET transfer_dentist = $1
              WHERE transfer_dentist_user_id = $2
                AND lower(regexp_replace(trim(transfer_dentist), ''\s+'', '' '', ''g'')) = $3
                AND transfer_dentist <> $1'
      USING keeper.name, keeper.id, clean;
  END IF;

  -- 3. Lines with only her name typed (no account link): only when asked.
  IF link_unlinked_rows THEN
    UPDATE transactions SET dentist_user_id = keeper.id, dentist = keeper.name
     WHERE dentist_user_id IS NULL
       AND lower(regexp_replace(trim(dentist), '\s+', ' ', 'g')) = clean;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN summary := summary || format('unlinked lines linked: %s; ', n); END IF;
  END IF;

  -- 4. Items waiting in Deleted items still hold the old account's id inside
  --    their saved copy: point those at the kept account too.
  IF to_regclass('public.deleted_items') IS NOT NULL THEN
    UPDATE deleted_items
       SET snapshot = replace(snapshot::text, dup.id::text, keeper.id::text)::jsonb
     WHERE snapshot::text LIKE '%' || dup.id::text || '%';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN summary := summary || format('deleted-item copies updated: %s; ', n); END IF;
  END IF;

  -- 5. Commission rates: move the ones the kept account does not have; for a
  --    procedure both have, the kept account's rate stays (the other is dropped).
  UPDATE dentist_commission_rates r
     SET dentist_user_id = keeper.id
   WHERE r.dentist_user_id = dup.id
     AND NOT EXISTS (SELECT 1 FROM dentist_commission_rates k
                      WHERE k.dentist_user_id = keeper.id AND k.procedure_id = r.procedure_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN summary := summary || format('commission rates moved: %s; ', n); END IF;
  SELECT count(*) INTO n FROM dentist_commission_rates WHERE dentist_user_id = dup.id;
  IF n > 0 THEN summary := summary || format('commission rates dropped (kept account already had one): %s; ', n); END IF;

  -- 6. Commission tier, display setting, clinics.
  IF to_regclass('public.dentist_commission_tiers') IS NOT NULL THEN
    UPDATE dentist_commission_tiers SET dentist_user_id = keeper.id
     WHERE dentist_user_id = dup.id
       AND NOT EXISTS (SELECT 1 FROM dentist_commission_tiers WHERE dentist_user_id = keeper.id);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN summary := summary || 'commission tier moved; '; END IF;
  END IF;
  IF to_regclass('public.user_preferences') IS NOT NULL THEN
    UPDATE user_preferences SET user_id = keeper.id
     WHERE user_id = dup.id
       AND NOT EXISTS (SELECT 1 FROM user_preferences WHERE user_id = keeper.id);
  END IF;
  IF to_regclass('public.user_branches') IS NOT NULL THEN
    INSERT INTO user_branches (user_id, branch_id)
    SELECT keeper.id, branch_id FROM user_branches WHERE user_id = dup.id
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN summary := summary || format('clinics added: %s; ', n); END IF;
  END IF;
  IF keeper.branch_id IS NULL AND dup.branch_id IS NOT NULL THEN
    UPDATE users SET branch_id = dup.branch_id WHERE id = keeper.id;
  END IF;

  -- 7. Write down what was done, then remove the other account (its own rows
  --    in the tables above that were not moved go with it).
  INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, summary)
  VALUES (keeper.id, 'System (account merge)', 'user.access_changed', 'user', keeper.id::text,
          format('Merged the duplicate account %s (%s) into %s (%s). Moved: %s',
                 dup.email, dup.id, keeper.email, keeper.id,
                 CASE WHEN summary = '' THEN 'nothing to move' ELSE summary END));

  DELETE FROM users WHERE id = dup.id;

  RAISE NOTICE 'Merged % into %. Moved: %', dup.email, keeper.email, CASE WHEN summary = '' THEN 'nothing to move' ELSE summary END;
END
$merge$;


-- ===========================================================================
-- PART 3: CHECK. Run after PART 2.
-- ===========================================================================

-- 3a. What was moved (the newest merge note), and 3b. the accounts that remain
--     (you expect exactly one, the kept e-mail).
SELECT created_at, summary
FROM audit_log
WHERE user_name = 'System (account merge)'
ORDER BY created_at DESC
LIMIT 1;

SELECT name, email, role,
       (SELECT count(*) FROM transactions t WHERE t.dentist_user_id = u.id) AS visit_lines_as_dentist,
       (SELECT count(*) FROM dentist_commission_rates r WHERE r.dentist_user_id = u.id) AS commission_rates
FROM users u
WHERE lower(regexp_replace(trim(name), '\s+', ' ', 'g')) = lower('Dawn Rufino Rey Teope');
