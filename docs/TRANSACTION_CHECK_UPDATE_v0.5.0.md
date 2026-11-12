# Daily check and lock of transactions: Update v0.5.0

**ADT Dental Clinic Cashflow · 2026-11-11**

## What was asked

1. Each day the transactions are cleared and then **checked by the BM / admin**; when a transaction is complete there is a **checkbox** in the list to tick it.
2. A ticked transaction is **locked**: it cannot be edited or deleted except by the **superuser**.
3. Queue: the **Cleared** column is removed at the end of the day.

## Decisions made with you

| Question | Decision |
|---|---|
| What is ticked | Each transaction line is stored with its own check. The list shows a visit as one row, so ticking a row checks all its lines. |
| Who ticks | New privilege **Check transactions**: owners and admins by default, and anyone else the superuser gives it to (Users -> Manage). There is no separate "BM" role. |
| Who unticks | Superuser only. |
| What locks | Editing the visit and its lines, removing it, recording or removing payments, attaching or removing files, and moving its status. |
| Queue | Cleared visits are removed from the Queue at the end of the day. |

## How it works day to day

1. During the day, visits are Cleared as before.
2. At the end of the day the BM / admin opens **Transactions**, uses **To check** to list what is left, ticks the visits that are right, and presses **Check and lock N** (one confirmation).
3. The visit shows a lock and "Checked by <name> on <date>". Staff and admins cannot change it. The superuser can edit it or unlock it.
4. Every check and every unlock is written to the audit trail.

Rules a visit must meet to be ticked: it is **Cleared**, it has at least one real procedure, it belongs to one of the person's clinics, and it isn't checked already. A visit that cannot be ticked has a greyed box with the reason on hover. A visit that fails when many are checked at once is skipped with the reason; the rest go ahead.

## Where the lock is enforced (on the server)

Edit a visit (form and standalone edit page), remove a visit, remove a single line, record a payment, remove a payment, attach a file, remove a file, change status, remove from the Queue. The superuser is never blocked. Screens also hide or grey the buttons.

Two side effects of "no edits": renaming a patient leaves the name on checked visits unchanged, and merging a patient who has checked visits needs the superuser. The older `backfill-commission-links` and `recompute-merchant-fees` scripts skip checked visits.

## Queue

The Cleared column already showed only visits finished today. The note now says so ("gone at the end of the day"), and the rule is one tested function (`isOnQueueBoard`). A Cleared visit stays in Transactions where it is checked. If you wanted the column removed completely, or emptied at a set closing time instead of midnight, say so.

## Run this once

`scripts/sql/2026-11-transaction-checks.sql` in the Neon SQL Editor (safe to run twice). It adds one table, `transaction_checks`. Until it is run the app works as before and the list shows a notice. The privilege needs no SQL.

## Notes and limits

- A visit with some lines checked counts as locked (its header, payments and files are shared by all lines).
- Deleting a line (superuser only) removes its check; restoring it from Deleted items does not bring the check back.
- Unlocking removes the checks of every line of the visit.
- Check-ins with no procedures yet cannot be ticked.

## How it was tested

- 44 automated checks on a test database (`scripts/test-transaction-checks.ts`): rules, privilege defaults and overrides, checking (Cleared only, own clinic, placeholders, missing visits, twice), locks for every action name, the superuser bypass, unlock (admin refused, superuser allowed), audit entries, the To check / Checked filter, line deletion, table-missing behaviour, and the Queue's daily rule.
- Browser walkthrough with staff, admin and superuser accounts: no boxes for staff, box states and reasons, selecting, Check and lock, lock icon, disabled Edit, no Remove, filters, visit page banner, no attach buttons, edit page refused, upload to a locked visit refused (403), superuser sees Unlock and can edit, unlock flips the banner.
- TypeScript and ESLint clean; the earlier test scripts still pass.
