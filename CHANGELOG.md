# Changelog

All notable changes to the ADT Dental Clinic Cashflow app. The version is in
`package.json` and `src/lib/cashflow/version.ts` (shown at the foot of the Help
page). Newest first.

## 0.4.1 — 2026-11-10

Deleted items housekeeping and an access review. No database changes.

### Added

- **Count badge on Deleted items.** The superuser sees the number of items
  waiting on the avatar and next to "Deleted items" in the profile menu (desktop
  and mobile), so a deletion is noticed without opening the page.
- **30-day retention.** Deleted items are removed for good 30 days after they
  were deleted (restored records, which are empty, 30 days after restoring), so
  deleted photos do not fill the database. The clean-up runs by itself when
  something is deleted and when the superuser opens Deleted items (at most once an
  hour), is written to the audit trail ("Deleted items cleaned up"), and has an
  optional daily route, `/api/cron/purge-deleted`, which stays switched off until
  a `CRON_SECRET` is set. The page shows the days left for each item and a red
  warning when any will go within 7 days.
- **Access review** (Users → "Access review: who has extra privileges", for
  owners, admins and the superuser; each sees only the people they manage). Lists
  every person's extra and removed privileges beyond their role, their clinics and
  when/by whom their access was last changed, with sensitive extras in red and
  people with exceptions first. Can be printed or saved as PDF.
- Help: "What are extra privileges?".

## 0.4.0 — 2026-11-10

Roles, per-user access and deleted items.

### Added

- **Owner role.** Owners sit above admins: same controls as an admin, and they
  can also manage and reset admins. Several owners are allowed. Only the
  superuser can create or change an owner.
- **Manage a user** (Users → Manage): a screen with three tabs, like the staff
  details form: **Personal Information** (name, e-mail), **Access & Permissions**
  (role, authorized clinics and 24 grouped privilege checkboxes) and **Account
  Settings** (reset password, remove account).
- **Per-user privileges.** The role gives default ticks; each can be switched on
  or off for one person (only the differences are stored, so a later change to a
  role default still reaches everyone who was not customized). *Extra* /
  *removed* markers show what differs; *Reset to role defaults* clears it. You
  can only give privileges you hold yourself, and nobody changes their own access.
- **Several clinics per person.** Dentists and staff can be ticked for more than
  one clinic. They save visits only under, and see the Queue, Day end, HMO
  billing and Overview only for, their own clinics (home clinic first).
- **Deleted items** (superuser only, `/cashflow/trash`, opened from the
  avatar/profile menu, not the top navigation). Deleting a visit,
  procedure line, payment, expense or attached file by an owner or admin now
  moves it here instead of destroying it; it no longer counts in any report.
  The superuser can **Restore** it exactly as it was (payments and files
  included) or **Delete permanently**. Restores are checked first (the visit it
  belongs to still exists, a reused invoice number is flagged) and never leave
  half a visit behind.

### Changed

- Every admin-only check now uses a privilege, so what a person can do follows
  their ticks (visits, payments, files, expenses, reports, rates, targets, users,
  clinics).
- The superuser is no longer listed on the Users screen.
- **CSV import is owner/admin only by default** (it can be given to anyone on
  the Manage screen).
- Admins and owners work in every clinic; non-admins with several clinics start
  on their home clinic.

### Database

Run `scripts/sql/2026-11-roles-permissions-trash.sql` in the Neon SQL Editor
**before** starting this version: first STEP 1 (adds the `owner` role) on its
own, then STEP 2 (three new tables; existing users keep their clinic).

## 0.3.0 — 2026-11-10

Commission update: editable rates and transferred patients.

### Added

- **Transferred patients (50 / 50).** The visit form has a new optional field,
  **Transferred to dentist**. The commission of every procedure on that visit
  is worked out once, at the **main dentist's** rate (their tier, or their own
  rate), and then split: 50% to the main dentist and 50% to the dentist the
  patient was transferred to. The two halves always add up to exactly the
  commission (an odd centavo goes to the transferred dentist).
- The **Commission report** (screen, Excel and CSV) lists a transferred line
  twice, once per dentist, with a new **Note** column
  ("50% — shared with …" / "50% — transferred from …"). The net collection is
  divided the same way, so totals are never counted twice; the Rate column
  still shows the main dentist's rate on both lines.
- **Performance** counts the transferred dentist's half in their commission
  (leaderboard, monthly / quarterly / annual, procedure breakdown) and lists
  the patient under them. Sales stay with the main dentist.
- The edit history (audit trail) records changes to "Transferred to dentist".
- Help page: new "Commission" section.

### Changed

- **Commissions page: editable grids.** The tier table is now one grid with
  every procedure down and Tier 3 / 2 / 1 across: click a rate to change it in
  place (Enter saves, Esc cancels), click a dash to set one. *More* opens the
  flat peso value (X-rays) and the HMO rate; *Also set* applies the same rate
  to other tiers in one save. A procedure search box finds a row quickly.
- **One person's own rates** is a second grid: choose a dentist (or staff
  member for a bonus), see the tier rate next to their own rate, and change or
  remove their own rate per procedure. It replaces the old "Set a commission
  rate" form and list.
- Saving a cell shows a spinner and cannot be pressed twice.

### Database

Run `scripts/sql/2026-11-commission-transfer-split.sql` in the Neon SQL Editor
**before** starting this version (adds three columns to `transactions`; nothing
existing is changed). Then, optionally, `yarn db:backfill-links` to re-price
saved visits after rate changes.

## 0.2.0 — 2026-11-09

HMO billing and a cleaner Day end report.

### Added

- **HMO billing tab** under Transactions (`/cashflow/hmo`). Pick an HMO, a
  branch and a cut-off date range, see every HMO procedure line in range with
  its total, then press **Generate billing**.
- **Auto-generated billing number** per branch per year, e.g.
  `HMO-MAR-26-0001` (HMO – branch code – 2-digit year – running number).
- **Cut-off date** (free From / To dates, both days included, up to one year).
- **Billing fields on every row:** HMO company, patient, HMO account #, LOA #,
  LOE #, procedure, tooth # and amount. A line with no LOA shows "LOA pending"
  and is still counted.
- **Total amount of billing**, plus line, patient and LOA-pending counts.
- **Downloads:** Print / Save as PDF (print-ready A4 page), Excel (.xlsx) and
  CSV, all named `<billing number>_<HMO>`.
- **Saved billings list** and a saved-billing page (frozen copy of the rows).
- **No double billing:** a line already on an active billing is left out of
  the next one (enforced by the database, safe against two people clicking at
  once). An admin can **void** a billing to release its lines.
- Audit trail entries for `hmo_billing.created` and `hmo_billing.voided`.
- **Loading states for documents:** Generate billing and Void show a spinner
  ("Generating billing…") and cannot be pressed twice; Excel and CSV buttons on
  HMO billing, Day end and the Commission report show a spinner ("Preparing…")
  while the file is built and show an error next to the button if it fails;
  the print page shows a spinner while it loads and while the PDF dialog opens.
- Help page: new "HMO billing" section and the app version.

### Changed

- **Day end is one table.** HMO details sit on the same row as the payment
  or visit: HMO, HMO account #, LOA #, LOE #, tooth # and HMO billed (after
  the clinic's original columns, in the screen, Excel and CSV). There is no
  separate HMO summary or HMO list any more; the breakdown by payment method
  and the totals remain, plus a "billed to HMOs" figure. A visit with several
  procedures is one row (LOA and tooth numbers joined), and the billed amount
  is counted once per visit.

### Removed

- **Expenses are no longer part of the Day end report** (page, totals, Excel
  and CSV). Expenses are still recorded and listed under the Expenses tab.

### Database

- Run `scripts/sql/2026-11-hmo-billings.sql` once in the Neon SQL Editor
  (adds `hmo_billings`, `hmo_billing_lines`, `hmo_billing_counters`; safe to
  run twice). Until it is run the tab shows a notice and Generate is disabled.

## 0.1.0

Everything built before versioning started: transactions and visits, patients,
queue, payments and merchant fees, commissions (tier and individual rates),
branches and branch policy, users and permissions, password management,
attachments, recalls, expenses, Day end report, audit trail. See
`docs/IMPLEMENTATION_UPDATES.md`.
