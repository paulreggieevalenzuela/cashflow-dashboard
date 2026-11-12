# Changelog

All notable changes to the ADT Dental Clinic Cashflow app. The version is in
`package.json` and `src/lib/cashflow/version.ts` (shown at the foot of the Help
page). Newest first.

## 0.9.0 — 2026-11-12

HMO details: the patient's company, the HMO name and the account number, on the patient and on each visit.

### Added

- **Patient's company** on every HMO a patient has (the company the patient works
  for, not the HMO). Edit patient has three fields per HMO: HMO name, HMO account
  number and Patient's company; the profile lists the three; patient search also
  finds the patient by company.
- **Visit form:** choosing an HMO as the payment method shows an "HMO details" box
  (HMO name, Patient's company, HMO account number) filled in from the patient.
  What is left there is saved with the visit and shown again when the visit is
  edited. An HMO the patient's profile does not have yet is added to the profile;
  nothing the profile already has is overwritten.
- **Day end** (screen, Excel and CSV) and the **HMO billing sheet** (screen, print,
  Excel and CSV) have a "Patient's company" column next to the account number. A
  saved billing keeps the company as it was when the billing was made.
- Help explains the new details.

### Needs

- Run `scripts/sql/2026-11-patient-hmos.sql` again (safe to repeat): adds the
  company to the patient's HMOs and creates `invoice_hmo_details` and
  `hmo_billing_employers`. Until then everything keeps working and the screens
  say which script to run; the company simply cannot be saved yet.

## 0.8.0 — 2026-11-12

Overview: four "Right now" cards for the front desk, the Branch manager and Headquarters.

### Added

- **Waiting times:** who is waiting at Arrived, On-going and For Payment right now,
  with the longest wait in each step; the average time in each step for today and
  the last 30 days (the same figures as the Queue page); open visits left over from
  an earlier day are counted apart so they don't distort "longest". Links to the Queue.
- **Outstanding balances:** what patients still owe on visits at For Payment or
  Cleared, with the number of visits, the age of the oldest unpaid visit and a split
  by age (up to 7 days, 8 to 30 days, over 30 days). The HMO's share is not counted.
  Never more than the visit's own balance on the Transactions page.
- **Approval progress** (only for people with the Branch manager or Headquarters
  check): finished visits to check, waiting for Headquarters, and approved, for the
  period picked in "Viewing by", with the count waiting more than 2 days. Each
  number opens the Transactions list already filtered. Explains itself when the
  check SQL scripts have not been run.
- **HMO receivables:** what the HMOs still owe for the period, as "not billed yet"
  and "billed, waiting for payment", per HMO, plus the open visits waiting for an
  LOA number. Explains itself when the HMO billing SQL script has not been run.
- Everything is limited to the person's own clinics, like the rest of the Overview.
- Help explains the four cards.

### Notes

- Waiting times and balances are always "right now". Approval progress and HMO
  receivables follow the "Viewing by" picker (month, quarter, half-year, year).
- Visits from before checking was introduced count as "To check" until ticked.
- No new SQL to run; the cards use the tables from earlier updates and say so when
  one is missing.

## 0.7.0 — 2026-11-12

Patients can have several HMOs, shown as a list on the profile.

### Added

- **HMO details on the patient profile:** a section listing every HMO the patient
  has, with the company name and the HMO account number. It is always shown; a
  patient with none reads "No HMO on file".
- **A list of HMOs per patient** (up to 10, each with its own account number).
  Edit patient has an HMO list with + Add HMO and Remove. The same company
  cannot be listed twice, and an account number needs its company.
- Search finds a patient by any of their HMOs' company or account number.
- Merging patients keeps the kept patient's HMOs and adds the ones they didn't have.

### Changed

- **HMO billing and Day end use the account number of the HMO on the visit**, not
  just the patient's first HMO. If the patient has no entry for that company the
  number is left blank rather than showing another HMO's number.
- The first HMO of the list is also kept in the patient's older single HMO fields,
  so everything that read them keeps working.

### Needs one step

- Run `scripts/sql/2026-11-patient-hmos.sql` once in the Neon SQL Editor (new table
  `patient_hmos`; current HMOs are copied into it). Until then each patient keeps
  one HMO and the edit form says so.

## 0.6.1 — 2026-11-12

Users: peers can edit peers, and only admins and above manage users.

### Changed

- **An owner can now manage other owners, and an admin can manage other admins**
  (Users -> Manage: details, role, clinics and privileges), as well as everyone
  below them. An admin still cannot manage an owner; the superuser manages
  everyone. Nobody manages their own access, and the privilege rule stays: you
  can only give a privilege you hold yourself.
- **Removing an account and resetting a password stay stricter:** a person at your
  own level can be edited but not removed, and their password is not reset from
  here (an owner cannot remove or reset another owner, an admin cannot remove or
  reset another admin). The Remove button is hidden in those cases.
- **Only an admin, an owner or the superuser can manage users.** Before, a
  dentist or staff member who had "Manage users" ticked was treated as an admin on
  the Users and Manage screens. Now the Users menu entry is hidden for them, the
  pages send them away, and every user action refuses them.
- Help and the Users page text describe the new rules.

## 0.6.0 — 2026-11-12

Two approvers for the daily check: Branch manager, then Headquarters.

### Added

- **Two checks per visit, always in this order.** First the **Branch manager**
  ticks a Cleared visit (as in 0.5.0: it is locked from that moment). Then
  **Headquarters** ticks it, and that is the last check. Headquarters cannot tick
  a visit the Branch manager has not checked, and cannot be the person who gave
  the Branch check on that visit (the superuser is exempt). Both are enforced on
  the server, not only on screen.
- **Two columns in Transactions: Branch and HQ.** Branch shows the tick box or
  the lock; HQ shows a dash (waiting for the branch), "Waiting" (checked by the
  branch), a tick box (for people who may give the HQ check) or a blue tick
  (approved). Each has its own select-all and its own confirm bar, and the
  tooltip says who checked and when.
- **Two privileges, plain tick boxes** under Users -> Manage -> Access &
  Permissions: **Check transactions: Branch manager (first check)** (the old
  "Check transactions", same key, so nobody's ticks change; owners and admins by
  default) and **Check transactions: Headquarters (second check)** (owners by
  default; give it to anyone, or take it from an owner). Both are marked
  sensitive in the access review.
- **Filters:** To check (Branch), Waiting for HQ, Approved by HQ.
- **Visit page banner** shows both approvals with who and when, and an
  **Approve as Headquarters** button for people who may.
- Audit trail entry "Visit approved by Headquarters"; "Visit checked and locked"
  is now labelled (Branch manager).
- Run `scripts/sql/2026-11-transaction-hq-checks.sql` in Neon (one new table,
  nothing existing changes; safe to run twice). Until it is run the Branch manager
  check works as before and the HQ column says it isn't set up.

### Changed

- **Unlocking (superuser only) removes both checks.**
- Existing checks from 0.5.0 stay as Branch manager checks and now wait for
  Headquarters.
- The owner role is no longer exactly the admin's defaults: it also has the
  Headquarters check.
- The role is still called Admin on screen (no rename).

## 0.5.2 — 2026-11-12

Queue: quick filters next to the search bar.

### Added

- **Quick filters on the Queue**, under the search box: a **Dentist** list
  (everyone on the board, plus "No dentist yet"), and three buttons with a count
  each: **Has balance due**, **LOA pending** and **Earlier visits** (unpaid visits
  carried over from a previous day). They combine with each other and with the
  search; **Clear search and filters** puts everything back. Like the search, they
  stay when the board refreshes itself, and they look through the whole Cleared
  column, not only its first 20 cards.

### Notes

- No database change and no SQL to run.

## 0.5.1 — 2026-11-12

Queue: easier to find a visit on a busy day.

### Added

- **Search bar on the Queue.** Type a patient, a procedure, a dentist or a clinic
  and the cards that do not match hide at once, with no reload. Several words
  work together in any order ("maria filling"); capitals and accents do not
  matter. Each column shows how many matched ("3 of 48"). **Clear** or the Esc key
  empties the search. What you typed stays when the board refreshes itself.
- **Scrolling columns.** Each column has a fixed height and scrolls on its own,
  so a day with 100 to 200 visits no longer makes one endless page.
- **Cleared column starts with 20 cards** and a **Show more** button for the
  rest. A search always looks through all of them.

### Notes

- No database change and no SQL to run.

## 0.5.0 — 2026-11-11

Daily check of transactions, with a lock.

### Added

- **Daily check (tick box).** In Transactions, an owner or admin (or anyone given
  the new privilege **Check transactions**) ticks the visits that are done and
  correct, then presses **Check and lock**. Only a Cleared visit can be ticked,
  and only in the person's own clinics. Select-all on the page is there for a
  busy day; one confirmation covers the whole selection.
- **A checked visit is locked.** Nobody except the superuser can edit it, remove
  it or its lines, record or remove a payment, attach or remove a file, or move
  its status. The superuser can still do all of that, and can **unlock** a visit
  (lock icon in the list, or Unlock on the visit page). Unlocking is the only way
  back; admins and owners cannot. Enforced on the server, not only on screen.
- **Each procedure line has its own check** (stored per line), the list shows a
  visit as one row, so ticking a row checks all of its lines. Any checked line
  locks the whole visit, because its header, payments and files are shared.
- **To check / Checked buttons** above the list, a lock icon with who checked and
  when (hover), a banner on the visit page, and audit-trail entries "Visit
  checked and locked" and "Visit unlocked".
- New privilege **Check transactions** (Visits & Queue). Owners, admins and the
  superuser have it; give it to another person (for example a branch manager)
  under Users -> Manage. It is marked as sensitive in the access review.
- Run `scripts/sql/2026-11-transaction-checks.sql` in Neon (one new table, nothing
  existing changes). Until it is run the app works as before and the list says
  checking isn't set up.

### Changed

- **Queue:** the Cleared column's note says Cleared visits are gone at the end of
  the day (Manila time). Open visits stay until Cleared. The rule is now one
  tested function.
- Renaming a patient no longer changes the name on checked visits; merging a patient
  that has checked visits needs the superuser. The old backfill and merchant-fee
  scripts skip checked visits.

## 0.4.3 — 2026-11-11

Day end report: the HMO amount now has a value.

### Fixed

- **The HMO amount was blank (0.00) on the Day end report.** An HMO pays the
  clinic later, so an HMO visit has no payment on its day and the report only
  counted payments. Now an HMO visit with no payment shows the HMO as its
  payment type with the amount billed to the HMO (and the note "Billed to the
  HMO"), instead of "No payment recorded". That amount is counted in the HMO's
  own column of the breakdown (Maxicare, Intellicare, Asiancare, an added HMO,
  ...), in the **HMO** figure at the top, in Total collected and in Net
  collection. "Cash in hand" (collected without HMO) is unchanged.
- A visit paid partly in cash and partly through an HMO shows both: the cash in
  the cash column and the HMO share in the HMO column. A visit with two HMOs is
  split by company. When an HMO pays later (an HMO payment recorded on another
  day), that day's report shows the amount received. The same money is never
  counted twice on one report.
- Applies to the screen, the Excel file and the CSV. No database change.

## 0.4.2 — 2026-11-11

Payment methods can now be added by owners and admins.

### Added

- **Asiancare** is now a built-in HMO payment method. It can be chosen on visits
  and payments, has a price column for every procedure (set the prices under
  Procedures), appears in HMO billing and the filters, and already had its Day
  end column.
- **Payment methods** tab (Transactions → Payment methods) for people with the new
  privilege "Add and hide payment methods" (owners, admins and the superuser by
  default; it can be given to anyone under Manage). Add an HMO / insurance or an
  "other" method (card machine, e-wallet, bank). A new HMO gets its price column,
  HMO billing entry, Day end column and the dentist's HMO commission rate; an
  "other" method behaves like Cash. A method can be hidden from new visits (old
  visits keep it) and removed only while it has never been used. Names can't be
  changed once added, and the same name can't be added twice (capitals ignored).
  Every change is written to the audit trail.
- Run `scripts/sql/2026-11-payment-methods.sql` in Neon to turn adding on (one new
  table, nothing existing is changed). Until then the built-in methods work as before.

### Changed

- The list of payment methods is no longer fixed in the code: forms, filters,
  price lists, Day end and HMO billing all read the built-in list plus the added
  methods.
- Day end: a name that merely starts with "pos" (for example a new HMO called
  "Posh Dental") is no longer mistaken for a POS card machine.

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
