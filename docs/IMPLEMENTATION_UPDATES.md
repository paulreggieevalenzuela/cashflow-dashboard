# Implementation Updates — Transactions, Patients, Invoices & Expenses

**Project:** Cashflow application — ADT Dental Clinic
**Date:** October 11, 2026 (updated October 26)
**Follows:** `TRANSACTION_EXPENSE_UPDATES_PLAN.md` (the plan written before implementation)
**Status (October 26, HMO summary and patient HMO details):** the **Day end** report has a new **HMO summary**: for the day's visits billed to an HMO it shows, per HMO (Intellicare, Maxicare...), the patients, visits, **billed** amount, amount **received** and **still to collect**, then one line per patient with their **HMO account number** and **LOA number**. It is also in the Excel and CSV downloads. The **patient profile** now holds **HMO company**, **HMO account number** and **birthday** (Add / Edit patient, shown under the patient's name). **Run `scripts/sql/2026-10-patient-hmo-details.sql` first** (step 17): the patient pages read the new columns. Type check and lint are clean; the totals and birthday rules were run through automated checks. In the browser: the Day end HMO summary (Oct 22: ₱4,325.00 over 8 visits, matching the Transactions list) and its CSV were checked and the Add patient form was opened; **saving a patient with the new fields and the account numbers on Day end could not be tried until the SQL is run.**
**Status (October 22, default branch from the user's profile):** the **Transactions** list now opens on the signed-in user's own branch, so each person sees their branch's visits right away. The **Branch** filter is filled in automatically from the user (chip: "Branch: Marikina (your branch)"), and **All branches** is a real choice that shows everything. Every user can change their own branch on **My profile → Branch** (saves by itself); an admin can still change anyone's branch on the Users page. A user with no branch sees all branches, as before. No SQL is needed. Type check and lint are clean. Checked in the browser with the test account: the profile select saved and stayed after a reload, the list opened on "Branch: Marikina (your branch)" with 35 visits, `?branch=all` showed all visits with no branch chip, and the test account was put back to "No branch".
**Status (October 22, transaction filters and edit form):** the Transactions **Filters** pop-up has a **Branch** filter (all branches, each branch, or "No branch"), shown as a removable chip like the others. In **Edit transaction**, **Payment method** is now at the top, in the same "Payment method & invoice" section as Add transaction, and saving it changes the method on the whole visit. The **Edit pop-up opened from a row's Actions menu now has the same Payments section** as the one opened from the visit page (it was missing there). Type check and lint are clean. Checked in the browser (signed in with the test account, nothing saved): the Branch filter (Marikina 33 visits, Cainta 0, chip and address update) and the row Edit pop-up (payment method selected at the top, Payments section present). Saving a changed payment method was **not** tried.
**Status (October 21, transaction numbers and form errors):** transaction numbers are now **MMDDYYHHMM-BRANCH-RANDOM**, for example `1021261430-MAR-K7M3Q` (date, 24-hour clinic time, branch code, random 5-character code), checked against the table before use, so deleting visits or saving two at once cannot repeat one. A failed save now shows its error in red **right above the submit button** (and scrolls it into view). Earlier today: the "Couldn't save the transaction" error was a repeated transaction number (see the fix below). Type check and lint are clean and the number rules were run through automated checks; **the new number format has not been saved in the browser yet.**
**Status (October 21 fix, saving a transaction):** saving a visit failed with "Couldn't save the transaction. Nothing was recorded". The real cause (from the app's log) was a **duplicate transaction number**: numbers were handed out by counting the day's rows, which repeats a number once a visit has been deleted. Numbers and Visit IDs now continue after the highest one used. A test visit ("Gozun, Daniel Leon Petronio", Consultation) was saved in the browser after the fix and appears in Transactions. Type check and lint are clean.
**Status (October 20 batch, remove from Queue):** a **Remove** link now shows on Queue cards that are **Arrived** or **On-going**. It asks for confirmation, then deletes the visit and records it in the audit trail. It is refused for For Payment and Cleared visits, and for any visit that already has a payment. No SQL is needed. Type check and lint are clean; **not yet tried in the browser**, and the small rule check could not be run because the connection to the Mac dropped (see "What to test").
**Status (October 19 batch, login expiry):** the login now ends after **30 minutes without activity**. In the last **5 minutes** a pop-up with a live countdown and a **Stay signed in** button appears; if the screen is being used it is extended quietly instead. A login can never be extended past **12 hours**. No SQL is needed. Type check and lint are clean and the timing rules were run through 25 automated checks; **not yet tried in the browser** (see "What to test" for the quick way using a 3-minute timeout).
**Status (October 19 batch, queue pop-up):** the Queue's button is now **Add to Queue** and opens a pop-up titled **Add to Queuing** that shows only date, patient, visit type and branch so the button is in view at once. Dentist, transaction type (defaults to Visit), payment, procedures, discounts, LOA / LOE, recall and remarks are folded under a link and open on demand (or by themselves if one of them has an error). Other **Add transaction** forms (Transactions, patient page) are unchanged. Type check and lint are clean; **not yet opened in the browser**.
**Status (October 19 batch):** **Tier-based dentist commission** is written (dentist tiers, tier rates per procedure, editor on the Commissions page); type check and lint are clean and the commission rules were run through 11 automated checks. **Run `scripts/sql/2026-10-commission-tiers.sql`** (step 15): it also **deletes the old one-by-one commission rates of dentist accounts**. **Not yet opened in the browser.**
**Status (October 17 batch):** LOA / LOE on HMO visits (with an "LOA pending" flag), the **end-of-day report** with Excel / CSV download, the **dentist commission report** with Excel / CSV download, and **check-in without procedures** are written; type check and lint are clean and the rules and both exports were run through automated checks. **Run `scripts/sql/2026-10-hmo-loa-loe.sql` first** (step 14). **Not yet opened in the browser** — see section 2, "October 17 batch".
**Status (October 11 batch):** Expenses moved into Transactions, Patients page, visit status tracking, Queue board (own menu item), waiting times, audit trail and the ID extras are written; type check and lint are clean, the status / audit rules were run through 19 automated checks, and the Expenses tab, the redirect and the new menu were opened in the browser (nothing saved). **The Patients page, status, Today board and audit need `2026-10-patients-and-visit-status.sql` run first** (step 13). Earlier status: Code written and checked (type check and lint both clean; the Day End file was run through the new importer; the Procedures tab and form changes were checked with number tests). **Not yet run against the database or tried in the browser** — see "Before you start the app" and "What to test".

---

## 1. Before you start the app (run order)

1. **Run the SQL file in the Neon SQL Editor:** `scripts/sql/2026-10-invoices-patients-suppliers.sql`. It is safe to run more than once. The updated app reads the new columns on every transaction query, so it must be run **before** the app is started.
2. **Also run `scripts/sql/2026-10-commission-rates-unique.sql`** (same place, also safe to repeat). It adds a missing database rule that stops one dentist + procedure from having two commission rates. Without it, setting a commission rate failed with "there is no unique or exclusion constraint matching the ON CONFLICT specification"; the app no longer needs it to save a rate, but the rule should be there.
3. **Start the app** as usual.
4. **Optional — old visits that show "Not paid":** `yarn db:backfill-payments` records one payment equal to the total due for every visit that has no payment at all. Only run it if those old visits really were paid in full.
5. **Run `scripts/sql/2026-10-commission-rates-from-sheet.sql`** (same place, safe to repeat) **before opening the Commissions page.** It adds two HMO columns to the commission rates table and loads the rates from the clinic's "LIST - COMMISSION" sheet (see "Commission rates per dentist and procedure" below). It also **adds the 7 dentists on the sheet** as dentist accounts (Dawn Rufino Rey Teope, Rearosa Ayapana, Beatrice Kiara Bandayrel, Kyla Denise Ahmad, Katherine Roldan, James Russel Banawa, Anna Beatrice Perez) when they don't exist yet, so they appear in the Dentist dropdown and on the Commissions page. These are **profile-only accounts: nobody can sign in as them** (placeholder e-mail ending in `@adt-dental.invalid`, and a password that can't be typed). The bottom of the file shows two checks: any sheet dentist still without a matching dentist account (their rates were not loaded — e.g. an existing account with the same name but a different role), and how many rates each dentist now has.
6. **Run `scripts/sql/2026-10-attachments.sql`** (same place, safe to repeat) before using the new invoice / receipt upload buttons (see "Invoice and receipt uploads" below). Until it is run the transaction page still opens, just without files, and an upload says the SQL file must be run first.
7. **Run `scripts/sql/2026-10-procedure-pricelist.sql`** (same place, safe to repeat) **after the commission SQL**. It replaces the whole procedure list with the 66 procedures of the new price list (see "Procedure list and price list" below). Commission rates are carried over to the new names where the procedure still exists.
8. **Then run `yarn db:backfill-links` once**, so visits that are already saved pick up the new rates. Commission is worked out when a visit is saved, so without this only visits saved from now on use the new rates. Run the procedure SQL **again** if you already ran it once and the list still shows old names.
9. **Card visits:** run `yarn db:recompute-fees` once so fee, net collection and commission follow the merchant-fee-included rule (and optionally `scripts/sql/2026-10-card-payments-fee-included.sql` first, see "Things to know").

10. **Run `scripts/sql/2026-10-procedures-settings-and-line-fields.sql`** (same place, safe to repeat) **after the procedure price list SQL and BEFORE starting the app.** It adds the Procedures-tab columns (price basis, hide, last changed), the price history table, the discount types (PWD, Senior citizen, Promo), quantity / unit price / teeth on every line, the PWD-Senior ID and recall columns on the visit, and sets the price basis of each procedure (per tooth / surface / arch / unit / flat). Existing lines keep their amounts: quantity 1 and unit price = the price they were sold at. The app reads these columns on every page, so **until the file is run the Transactions page shows "This page couldn't load".** The bottom of the file shows three checks (procedures per price basis, the three discount types, and lines still without a unit price — should be 0).
12. **Run `scripts/sql/2026-10-hmo-prices.sql`** (same place, safe to repeat) **after step 10 and BEFORE starting the app.** It creates the HMO price table, adds a "price for" column to the price history, and loads the clinic's HMO prices for the six accepted HMOs (Maxicare, Intellicare, Avega, Valucare, Medicard, Elite Dental Network): Consultation, OP, PF, TF and Simple Extraction. A price already on file is never overwritten, so repeating it does not undo edits made on the Procedures tab. Until it is run the Transactions page shows "This page couldn't load".
13. **Run `scripts/sql/2026-10-patients-and-visit-status.sql`** (same place, safe to repeat) **BEFORE using the app again.** It adds the visit **status** (Arrived / On-going / For Payment / Cleared) and **status history**, the **audit trail** table, and two indexes so a patient's invoices load fast. Existing visits get a status **once**: paid in full becomes **Cleared**, money still owed becomes **For Payment** (running the file again never changes a status). The app reads the status on every Transactions query, so **until it is run the Transactions, Patients and Overview pages show "This page couldn't load".** The bottom of the file shows how many visits are in each status.
14. **Run `scripts/sql/2026-10-hmo-loa-loe.sql`** (same place, safe to repeat) **BEFORE starting the app.** It adds two text columns to the visit (`loa_number`, `loe_number`, blank by default). The app reads them on every page that lists visits, so **until it is run the Transactions, Queue and Patients pages show "This page couldn't load".** Nothing else is needed for the two reports or for check-in without procedures.
11. **Run `yarn db:backfill-links` again afterwards** (optional). Saved visits keep their own procedure link; the backfill now uses that link first and the name only for lines that have none.
15. **Run `scripts/sql/2026-10-commission-tiers.sql`** (same place, safe to repeat; run after the price-list file in step 10) **before opening the Commissions page**, then run `yarn db:backfill-links` once so saved visits are re-priced. It creates two tables, **deletes every old individual commission rate that belongs to a dentist account** (staff bonus rates are kept) as you asked for a clean start, puts the 7 dentists in their tier and loads the tier rates. The bottom shows three checks: each dentist's tier, how many procedures each tier got, and the sheet procedures that are not on the price list (nothing was loaded for those).

16. **Login expiry needs no SQL.** Restart the app once after pulling the change (`NEXT_PUBLIC_` settings are read at start). Everyone who is already signed in gets a fresh 30 minutes at their next page load instead of being signed out. **Security, please do now:** the example settings file (`.env.example`) contained what looked like a real database address with its password and the real login-signing secret. I replaced both with placeholders in the file, but anything that was in it should be treated as exposed — **rotate the Neon database password and generate a new `AUTH_SECRET` in `.env.local`** (this signs everyone out once). `.env.example` was not under version control here, so check your repository history if it was ever pushed.

17. **Run `scripts/sql/2026-10-patient-hmo-details.sql`** (same place, safe to repeat) **before starting the updated app.** It adds three text columns to the patients table (`birth_date`, `hmo_company`, `hmo_account_number`, blank by default). Until it is run the Patients pages show "This page couldn't load"; the Day end page still opens but shows "Not on file" for every account number.

---

## 2. What the system does now

#### October 26: HMO summary on Day end, and HMO details on the patient profile

**HMO summary (Day end).** A new section just under the figures, above the payment rows. It is built from the **day's visits whose payment method is an HMO**, because an HMO visit is billed on the day and the HMO pays later (so it often has no payment on that day, and the existing "Paid through HMO" figure, which counts payments only, showed 0).

- **Per HMO:** patients, visits, **Billed** (what the visits come to), **Received** (payments recorded so far) and **To collect** (billed less received), with a **Total** row. HMOs follow the order of the HMO list.
- **Patients billed to HMOs:** one line per visit: HMO, patient, **account no.** (from the patient profile, "Not on file" if blank), **LOA no.** ("LOA pending" if blank), procedures, billed, received.
- **Branch and date** follow the page's filters. A visit counts on its own visit date.
- **Downloads:** the same two tables are added to the Excel and CSV files under the totals.
- Existing figures are unchanged: the payment rows, the breakdown by method and "Paid through HMO" still count payments received that day.

**Patient profile.** Add patient and Edit patient have three new fields: **Birthday** (date picker, not in the future), **HMO company** (typed freely; the six HMOs are suggested) and **HMO account number**. The patient page shows them under the name (birthday with the age, HMO, account no.). A bad birthday is refused with a message. Patients can also be **searched by account number** on the Patients page. When two patient records are merged, the kept one fills any blank birthday, HMO company or account number from the removed one. The audit trail line for an edit includes the HMO company (not the account number).

**Notes.** The Day end shows the HMO the visit was **billed** to (its payment method), which can differ from the company written on the profile. Patients with an HMO company on file are not yet filled into the transaction form automatically.

**Files.** New `scripts/sql/2026-10-patient-hmo-details.sql`, `src/lib/cashflow/patient-hmo.ts` (birthday and text rules, pure). Changed `src/lib/db/schema.ts`, `src/lib/db/patient-admin.ts`, `src/app/cashflow/patients/actions.ts`, `src/components/cashflow/patient-form-modal.tsx`, `src/app/cashflow/patients/[id]/page.tsx`, `src/lib/cashflow/day-end.ts` (`summarizeHmo`, sheet), `src/lib/db/day-end.ts` (`getHmoVisits`), `src/app/cashflow/day-end/page.tsx`.

**Checks.** Type check and lint clean. Automated checks: totals per HMO and overall (case-insensitive HMO names, a patient with two visits counted once, a cash payment ignored, cents added without drift), the sheet rows, birthday validity (real dates, no future dates, nothing before 1900) and age on the birthday itself. Browser (test account, nothing saved): Day end for October 22 shows Intellicare ₱1,050, Maxicare ₱750, Medicard ₱2,250, Valucare ₱275, total ₱4,325 over 8 visits, each with its LOA number or "LOA pending"; the CSV carries the same; the Add patient form shows the three new fields. **Not tried:** saving a patient with the new fields, and the account numbers on Day end (both need the SQL).

#### October 22: Transactions open on the user's branch; branch on My profile

**What changed.**

- **Default branch.** When the Transactions page is opened without a branch in the address, the user's own branch (from their account) is used as the Branch filter. The list shows only that branch's visits, the count and paging follow it, and the chip reads **Branch: <name> (your branch)**.
- **Looking at other branches.** In Filters → Branch choose another branch, **No branch**, or **All branches**. All branches is stored in the address as `?branch=all`, so it is not replaced by the default again. Removing the chip, **Clear all** and **Reset** go back to *All branches* when the user has no branch, and back to *their branch* when they have one.
- **My profile → Branch.** A new card with a **My branch** select (*No branch (show all branches)* or any branch). It saves the moment it is changed ("Saved.") and applies from the next time the Transactions page is opened. Any signed-in user can set their **own** branch; the branch must exist. The Users page (admin) still sets anyone's branch.
- **No branch on the account.** The list behaves exactly as before: all branches, no chip.

**Files.** `src/app/cashflow/transactions/page.tsx` (reads the user's branch and applies it), `src/lib/cashflow/transactions-query.ts` (`ALL_BRANCHES`), `src/components/cashflow/transactions-toolbar.tsx` and `transactions-list.tsx` (chip, select, reset), `src/app/cashflow/profile/actions.ts` (`updateMyBranchAction`), `src/components/cashflow/branch-select.tsx` (new), `src/app/cashflow/profile/page.tsx`.

**Checks.** Type check and lint clean. Browser (test account): My profile → Branch → Marikina showed "Saved." and was still selected after a reload; Transactions opened with "Branch: Marikina (your branch)" and 35 matching; `?branch=all` listed 35 recorded with no branch chip; the account was then set back to *No branch* and the list showed no chip. **Not tried:** another user's account, and Filters → *No branch* with a default branch set.

#### October 22: Branch filter and payment method in Edit transaction

**Branch filter (Transactions page).** Filters pop-up → **Branch**: *All branches*, one of the branches, or *No branch* (visits saved without a branch). The choice shows as a chip ("Branch: Marikina") that can be removed on its own, is cleared by **Clear all** and **Reset**, counts in the filter badge, and is part of the page address (`?branch=…`), so a filtered list can be bookmarked or shared. A malformed branch in the address is ignored instead of causing an error. Files: `transactions-query.ts`, `transactions-toolbar.tsx`, `transactions-list.tsx`, `transactions/page.tsx`, `src/lib/db/transactions.ts` (`listTransactionsPage`).

**Payment method in Edit transaction.** Before, the edit form showed only "Invoice" at the top and had no payment method (it could only be set when adding). It now shows the same **Payment method & invoice** section as Add transaction, with the method the visit already has selected.

- Saving applies the chosen method to **every procedure line of the visit**. It does not change or move any money: payments are still added and removed on the visit page.
- Choosing a different method works like in Add transaction: choosing an HMO (Maxicare, Intellicare...) re-prices procedures that still have the list price to that HMO's price, and choosing Cash or another non-HMO method goes back to the cash price list; a notice says what changed. Prices you typed by hand are left alone.
- Because HMO and cash visits earn commission differently, **commission is re-worked for the visit when the method changes**.
- The change is written to the **audit trail** as "Payment method: A → B". Older audit entries have no payment method and show nothing for it.
- Edit calls that send no payment method (none today) keep each line's method as before.

Files: `transaction-form.tsx`, `src/lib/db/invoices.ts` (`updateInvoice`, audit snapshot), `src/lib/cashflow/audit-diff.ts`.

**Row Edit pop-up now matches the visit page.** The pop-up opened from a row's **Actions → Edit** showed only the form; the one opened from the visit page's **Edit transaction** button also showed the **Payments** section (what was paid and how, record / remove a payment). Both now show both: payment method at the top, Payments below. After recording or removing a payment in the row pop-up its list reloads by itself. Files: `transactions-table.tsx`, `payments-manager.tsx` (an `onChanged` hook), `src/app/cashflow/actions.ts` (`getInvoiceForEditAction` also returns the payments).

**Checks.** Type check and lint clean. In the browser (test account, nothing saved): Filters → Branch → Marikina listed 33 visits with a "Branch: Marikina" chip and `?branch=…` in the address; Cainta listed 0; the row Edit pop-up showed Payment method (for Garcia, Annaly: Intellicare) in the top section and the Payments section below. **Not tried:** saving a changed payment method, and recording or removing a payment from the row pop-up.

#### Transaction number: date, time, branch and random code; form error above the button (October 21)

**New number format.** `MMDDYYHHMM-BRANCH-XXXXX`, e.g. `1021261430-MAR-K7M3Q` = 21 Oct 2026, 14:30, Marikina, random code.

- **Date and time** are when the transaction is recorded, in **clinic time (Manila), 24-hour clock, to the minute** (midnight is `0000`). The server's own clock is no longer used, which could roll to the next day at 8 AM Manila time on a UTC server.
- **Branch code** is worked out from the branch name: the first three letters of a one-word name (Marikina → **MAR**, Antipolo → **ANT**, Cainta → **CAI**) or the initials of a longer one (Head Office → **HO**). A visit with no branch uses **NB**. It is not stored anywhere, so renaming a branch changes the code of *future* numbers only; old numbers keep what they had.
- **Random code**: 5 characters from 30 (no 0, O, 1, I, L or U, so it is easy to read out and copy), about 24 million codes per branch per minute. A visit with several procedures gets the same date, time and branch with a different code on each line.
- **Safeguards:** no two numbers in one batch are equal; each candidate is looked up in the table first and re-rolled if taken; if ten rounds fail, the save stops with an error instead of issuing a repeat. Two branches can never clash, nor two saves in different minutes.
- **Old numbers** (`091726-0001`, and the short-lived `102126-K7M3Q` shape) are untouched and still display. Visit IDs (`YYYYMMDD-###`) are unchanged.

**Files.** New `src/lib/cashflow/transaction-number.ts` (date/time prefix, branch code, random code and format rules, pure); changed `src/lib/db/transactions.ts` (`generateTransactionNumbers` now takes the branch) and `src/lib/db/invoices.ts` (passes the visit's branch when adding a visit and when adding procedures to a visit).

**Checks.** Type check and lint clean. Automated checks: Manila date and time (including midnight and the roll-over to the next day), branch codes for the four current branches and odd names (accents, extra spaces, no letters, no name), format test, and (earlier) 20,000 draws gave 19,993 distinct codes, about what chance predicts, which is why the table check exists. Not yet saved from the browser with the new format.

**Decision for you.** Branch codes are derived from names. If the clinic wants its own codes (for example **MKN** for Marikina), a code field on the Branches page is a small addition (one SQL line).

**Form error.** In the Add / Edit transaction form (and the Add to Queue pop-up), a failed save now shows its red message directly above the submit button, in bolder text, and scrolls it into view. It used to sit at the very top of the long form, out of sight. `src/components/cashflow/transaction-form.tsx`.

#### Fix: "Couldn't save the transaction" — duplicate transaction number (October 21)

**Cause.** The app log showed `duplicate key value violates unique constraint "transactions_transaction_number_unique"`. A new transaction number was worked out as *the number of rows already recorded that day + 1*. After a visit is deleted (for example removed from the Queue, or test visits cleared), the count is lower than the highest number in use, so the next number was one that already existed and the database refused the save. Visit IDs (`YYYYMMDD-###`) had the same weakness (they were not blocked by the database, but could repeat).

**Fix.** `generateTransactionNumbers` and `generateVisitId` in `src/lib/db/transactions.ts` now take the **highest** sequence used that day and add one, so deletions no longer cause a repeat. Two saves in the very same instant could still race for one number (unchanged, very unlikely at one front desk).

**Checked.** Type check and lint clean. In the browser: Add transaction → patient Gozun, Daniel Leon Petronio, dentist James Russel Banawa, type Visit, visit type NEW, procedure Consultation → saved (the list went from 14 to 15). That test visit is still in Transactions and can be removed.

**Also changed the same day (kept).** Reading the commission tier tables no longer breaks a save if the tier SQL has not been run (they return "no tiers" and print one warning). This was my first guess at the cause and was **not** the cause here, but it is a harmless safeguard.

### October 20 batch — remove a visit from the Queue

**What changed.** The Queue had no way to take a patient off the board, so a check-in made by mistake (or a patient who left) stayed there. Each card in the **Arrived** and **On-going** columns now has a red **Remove** link next to the status button. It opens a confirmation ("Remove from queue?") with **Keep in queue** and **Remove visit**. Confirming deletes the visit (its placeholder or procedure lines and any payments) and the board and the menu's Queue number update at once.

**Rules (checked by the server, not only by the screen).**

- Only visits that are **Arrived** or **On-going** can be removed here. **For Payment** and **Cleared** cards show no Remove link, as asked; those can still be removed by an **admin** from Transactions.
- A visit that **already has a payment** cannot be removed here, even if it is still Arrived or On-going; the message says to remove the payment first or ask an admin.
- **Any signed-in role** (admin, dentist, staff) may use it, because the front desk is the one who checks patients in. Removing from Transactions is still admin-only. If you would rather make this admin-only too, it is a one-line change.
- If the visit was already removed on another screen, pressing Remove just refreshes the board.
- Every removal is written to the **audit trail** (who, which patient, date, number of procedures).

**Files.** New: `src/components/cashflow/remove-from-queue-button.tsx`. Changed: `src/lib/cashflow/visit-status.ts` (the rule `canRemoveFromQueue`), `src/lib/db/visit-status.ts` (reads the status and the amount already paid; the board's visits now carry `collected`), `src/app/cashflow/transactions/status-actions.ts` (`removeFromQueueAction`), `src/components/cashflow/today-board.tsx`.

**Checks done:** type check and lint clean. **Not run:** the automated check of the rule (the connection to the computer dropped before it ran) and the screen itself.

### October 19 batch — login expiry (30 minutes, 5-minute warning)

**What changed.** Before, a login lasted about 30 days and the screens had no idea when it would end. Now:

- **30 minutes without activity ends the login**, the same for admin, dentist and staff. Activity means a click, key press, touch or scroll. The Queue's automatic 30-second refresh and the menu's Queue counter do **not** count, otherwise a screen left open would never expire.
- **In the last 5 minutes** (from minute 25), if the screen was used in the last minute, the login is **extended quietly** by another 30 minutes and nothing is shown. If nobody has touched the screen, a pop-up appears: **"Still there?"** with a live countdown (for example 4:07) and a **Stay signed in** button. It stays until a button is pressed (a stray click elsewhere does not dismiss it); there is also a **Sign out** button. Pressing **Stay signed in** adds another 30 minutes.
- **If the countdown reaches zero** the person is signed out and lands on the login page with the message **"You were signed out after 30 minutes of inactivity. Please sign in again."** After signing in they return to the page they were on (only pages inside the app are accepted).
- **Absolute limit of 12 hours:** even someone who is always active must enter the password again after 12 hours. When the limit is what ends the login, the pop-up says so and offers **Sign in again** instead of Stay signed in.
- **Several tabs:** an extension in one tab updates the others, and signing out in one tab sends the others to the login page.
- **Account check on every extension:** when a login is extended the server checks the account again. A deleted user is signed out and a changed role takes effect right away; before, a role stayed as it was at sign-in until the cookie expired.
- **Time left is counted from the server's figure**, not from the computer's clock, so a wrong clock on the front-desk PC cannot make the warning early or late. A computer that wakes from sleep checks straight away.
- If the server cannot be reached when extending, the pop-up stays with "Couldn't reach the server. Check your connection and try again."
- A person who comes back after the time ran out with no page open is sent to the login page with the same inactivity message.

**How it works (for the developer).** The timing lives in the signed login token (`signedInAt`, `activeUntil`), not in the cookie, because the cookie slides forward on every page load. `src/auth.ts` sets both at sign-in, returns *no session* once `activeUntil` has passed, and moves `activeUntil` forward **only** when the browser sends an explicit refresh (the Auth.js "update" call). A bare `update()` in this library version is sent as a plain read and extends nothing, so the guard sends `update({ extend: true })`. All numbers and decisions are in one pure file, `src/lib/auth/session-policy.ts`. A client component, `SessionGuard`, is mounted in the Cashflow layout and runs the 1-second clock, the activity listeners and the pop-up.

**Files.** New: `src/lib/auth/session-policy.ts`, `src/components/auth/session-guard.tsx`. Changed: `src/auth.ts`, `src/types/next-auth.d.ts`, `src/middleware.ts` (adds the inactivity message when an old cookie is present), `src/app/cashflow/layout.tsx`, `src/app/login/page.tsx`, `src/components/auth/login-form.tsx`, `.env.example` (placeholders, and an optional test setting).

**Testing setting.** In a development build only, `NEXT_PUBLIC_SESSION_IDLE_MINUTES=3` in `.env.local` shortens the timeout to 3 minutes (the warning then opens at 1 minute left). It is ignored in production builds.

**Checks done:** type check and lint clean; 25 automated checks of the timing rules (30-minute window; warning window of 5 minutes; quiet extension only when the screen was used in the last minute; the pop-up is not dismissed by other activity and closes when time is added from another tab; the 12-hour cap and the "cannot extend" case; countdown format; test setting ignored in production). **Not checked:** the pop-up in a browser and the real sign-out (the app was not started).

**Left for later.** Signing in again *inside* the pop-up without leaving a half-filled form (today the person is warned before it happens, and the page they were on is reopened after sign-in); one common message when a save is refused with "You must be signed in"; limiting failed password attempts; recording sign-in and sign-out in the audit trail.

### October 19 batch — tier-based dentist commission

**What changed.** Dentist commission is no longer set one dentist and one procedure at a time. Each dentist belongs to a **tier** and each procedure earns the **tier's** rate. Source: the clinic's **LIST - TIER** sheet. The sheet's cells are merged, so each percentage covers a whole group of procedures, and Tier 1 shares Tier 2's rates on every row.

| Procedure group | Tier 3 (Teope, Ayapana) | Tier 2 (Bandayrel, Ahmad) | Tier 1 (Roldan, Banawa, Perez) |
|---|---|---|---|
| Consultation, OP, PF, TF, simple extraction, fluoride, calcimol | 10% | 10% | 10% |
| Ortho and TMJ (install, retainers, removal w/ OP, TMJ consultation, myofunctional appliance, splint, diagnostic fee) | 25% | 20% | 20% |
| Complicated extraction, bone reduction, teeth whitening, gingivectomy | 15% | 15% | 15% |
| Cosmetic / esthetic filling, direct composite veneers | 25% | 15% | 15% |
| Build up, root canal, post & core, post & build up | 20% | 15% | 15% |
| Dentures, crowns, veneers, onlay, temporary crown, ceramage removal, clasp, mouth guard, denture repair | 20% | 20% | 20% |
| Surgery, coronectomy | 25% | 15% | 15% |
| Panoramic X-ray / periapical X-ray | ₱70 / ₱30 flat | ₱70 / ₱30 flat | ₱70 / ₱30 flat |

**How commission is worked out.** When a visit is saved, each line looks up the dentist's tier and then that tier's rate for the procedure. If the dentist has an **individual rate** for that procedure (the old one-by-one setting), it wins; otherwise the tier rate is used. No rate means no commission. A new procedure only has to be added to a tier once and every dentist in the tier earns it. A tier rate has four settings: percent, flat peso (any payment), HMO percent and HMO flat peso. Staff bonuses are unchanged (they have no tier and still use individual rates).

**Commissions page.** Top: *Dentist tiers* (a dropdown per dentist: No tier / Tier 1 / 2 / 3), a notice with a **Remove them** button if individual rates still sit on tiered dentists, a form to **add or change a procedure's tier rate** (tick Tier 2 and Tier 1 together when they share a rate) and the tier table (procedure by tier, each cell removable). Below: *Individual rates and staff bonuses*, the previous screen, for staff and for one-off exceptions. A rate applies to visits saved afterwards; run `yarn db:backfill-links` to re-price saved ones.

**Clean-up you asked for.** The SQL file deletes every individual rate that belongs to a dentist account before loading the tiers. Staff bonus rates are not touched. The old per-dentist seed (`2026-10-commission-rates-from-sheet.sql`) must **not** be run again, or those rates come back and override the tiers.

**Decisions I made that you can change on the page.**

- X-rays pay a flat ₱70 / ₱30 on every payment type, HMO included (the old sheet had ₱50 / ₱30 for HMO only).
- OP keeps its 10% HMO rate. Any other procedure billed to an HMO earns nothing, as before.
- Sheet names matched to the price list: OP = the four Oral Prophylaxis items, PF = the three Permanent Fillings, TF = Temporary Filling, Ortho Install = the two Ortho Packages, Bite plane = Bite Raiser per arch, Surgery = Wisdom Tooth Removal, Retainers = Hawley and Invisible, RCT = Anterior and Posterior.
- Sheet items that are not on the price list (Ortho Adj, RCM, Loss Bracket, Expander, Twin block, TMJ Down payment, TMJ Adjust, Gingivectomy, Cosmetic / Esthetics Filling, Build Up, Thermosens and High Impact Dentures, Coronectomy) got no rate. Add the procedure, then add it to the tier on the page.
- The sheet spells one dentist "Banawe"; the account is "James Russel Banawa". The SQL matches on "banaw".

**Checks done:** type check and lint clean; 11 automated checks of the commission rules (Tier 3 ₱10,000 ortho = ₱2,500, Tier 2 = ₱2,000, HMO ortho = 0, OP HMO 10%, X-ray ₱70 cash and HMO, periapical ₱30, individual rate wins over tier, no rate = 0). **Not run against the database or opened in the browser.**

#### Queue number in the menu (fix)

The number beside **Queue** in the menu counted every visit that was not Cleared, but the Queue board is drawn from each visit's procedure lines and cannot show a visit that has none (no patient, no procedures). A leftover visit header with no lines therefore made the menu say 9 above an empty board. The number now counts only not-Cleared visits that still have at least one line, so it always matches what the board can show. The number is **always shown, including 0**, so the menu stays an indicator: amber when visits are waiting, a quiet grey 0 when the queue is empty. If the number drops but the Patients page still shows "open" invoices for someone, that visit has no lines either; it can be found with a read-only query (see the chat note) and removed by an admin.

#### Queue: Add to Queue pop-up

The Queue's **New visit** button is now **Add to Queue**, and its pop-up is titled **Add to Queuing** (it was "Add transaction"). It shows only Date, Patient, Visit type and Branch, with the button right under them. **Branch stays visible on purpose:** a visit with no branch would be missing from that branch's end-of-day report. The rest (dentist, transaction type, which is already set to Visit, payment method and invoice, procedures, discount ID, HMO authorization, recall, remarks) is hidden behind **Add dentist, payment, procedures or other details (optional)**; open it to set the dentist or add a payment or procedures at check-in. The dentist is only needed before the visit moves to For Payment, so it can be set later with Edit transaction. If the save finds a problem in a hidden field, the details open by themselves. With nothing filled in below, the button reads **Add to queue** and the visit goes in as Arrived with the "No procedures yet" placeholder, as before. The Transactions page and the patient page keep the full **Add transaction** form.

### October 17 batch — LOA / LOE, end-of-day report, commission report, check-in without procedures

#### HMO: LOA and LOE

| What | How it works |
|---|---|
| **Fields** | Two text fields on the visit: **LOA number** and **LOE number**. Both are optional when saving. They sit in a new **HMO authorization** box on the Add / Edit transaction form (open by default for an HMO payment, folded away otherwise). |
| **What counts as an HMO visit** | Any payment on the visit, or any line, whose payment method is Maxicare, Intellicare, Avega, Valucare, Medicard or Elite Dental Network. |
| **LOA arrives the next day** | Save the visit without it. An HMO visit with no LOA number shows an orange **LOA pending** chip on the Queue card, the Transactions list, the patient page and the visit page. The visit page shows "LOA number: Pending — not received yet". |
| **When the LOA is mandatory** | Before the visit can be **Cleared**. Check-in, treatment, **For Payment** and recording the HMO payment all work without it. *Cleared* is refused (for staff and admin alike) with "This HMO visit has no LOA number yet. Enter it (Edit transaction → HMO authorization) before clearing the visit." |
| **Automatic clearing** | A visit paid in full by the HMO but still missing the LOA stays **For Payment**; saving the LOA number clears it by itself. A new HMO visit saved already paid, with no LOA, starts as **For Payment** instead of Cleared. |
| **Old visits** | A visit that is already Cleared never shows "LOA pending", so imported history is not chased. Only if an admin reopens one (or a payment is removed) is the LOA asked for. |
| **LOE** | Optional free text, shown on the visit page when filled in. Its exact meaning still has to be confirmed with the clinic. |
| **Audit** | Entering or changing the LOA / LOE appears in the visit's audit trail (who, when, from, to). |

#### End-of-day report (per branch)

- **Where:** Transactions → **Day end** tab (`/cashflow/day-end`). Pick a **date** and a **branch** (admins also get *All branches*; someone who belongs to a branch sees only their own). Shows today by default.
- **Layout:** the clinic's own "Day End" sheet — Visit ID, Patient, Dentist, Procedure, Payment Type, Amount Paid, VAT Exclusive, VAT Amount, Invoice Number, Remarks, Merchant Fee, Withholding Tax, Net Collection — then the **breakdown by payment method** (Cash, GCash, GoTyme, POS - Debit, POS - Credit, BDO and the HMOs) and the totals. Tested on the clinic's October 3 file: **total ₱3,965.00 and the same breakdown** as their sheet.
- **Rows:** one row per **payment received that day** (clinic time, UTC+8). A visit of that day with **no payment** is listed with 0.00 and "No payment recorded", like "Follow up Check Up - no payment" on their sheet. Reservation fees are included and counted separately.
- **Totals shown:** total collected (like their sheet — HMO included), **of which HMO** (billed to the HMO, not cash in hand), **of which reservation fees**, merchant fees, withholding tax and **net collection**. Expenses recorded that day for the branch are listed below.
- **Download:** **Excel (.xlsx)** and **CSV**, named `ADT_EOD_<branch>_<date>`. The Excel file is built without any new package.
- **How a payment's VAT and tax are worked out:** VAT and withholding tax are kept on the visit's procedure lines, so a payment carries the share that matches its share of the bill; the merchant fee comes from the payment's own amount and method.
- **Not included yet:** *Close day* (locking the day's payments), the cash count with variance, and a PDF. Close day needs the lock checked in every place that saves a payment; it is waiting for the clinic to say they want it.

#### Dentist commission report

- **Where:** Commissions page → **Commission report** button (admin only; `/cashflow/commissions/report`).
- **Filters:** from / to date (this month so far by default), dentist, branch. Shows a **summary per dentist** (procedures, net collection, commission, and how many lines had money collected but no commission because no rate is set) and the **line-by-line detail**.
- **Download:** Excel (a Summary sheet and a Detail sheet) and CSV, named `ADT_Commission_<from>_to_<to>`.
- **How it counts:** the commission on each line is the amount saved when the line was recorded (the existing rule: % of net collection, or the HMO % / fixed peso value), so a later rate change does not rewrite past periods. The report groups by **visit date**. Staff bonuses are computed live and stay on the Performance page.
- **Not included yet:** payout batches ("mark as paid") and a dentist-only view of their own rows (dentists already see their own commission on the Performance page).

#### Check-in without procedures (Queue)

- The **procedures are always on the form now**; payment method is optional ("can be added later"). The old "Not paid yet — continue to the procedures" step is gone. Choosing an HMO after picking procedures re-prices the lines you haven't priced by hand.
- Leave the procedures empty and the button reads **Check in (add procedures later)**. The visit is saved with one placeholder line named **"No procedures yet"** (price 0). It is hidden from the form, left out of the procedure statistics, and **replaced automatically** when procedures are saved with *Edit transaction*. A payment can't be recorded until there are procedures.
- A check-in starts as **Arrived** (even if dated earlier). Arrived → On-going works as before. **For Payment and Cleared need at least one real procedure and a dentist**; otherwise the move is refused with a message saying what is missing (this also stops an admin jumping ahead).
- Procedures stay editable while the visit is Arrived or On-going; a Cleared visit is still locked for everyone except an admin.

#### Decisions still open

LOE meaning · whether HMO payments belong in the day's collection total (they are today, with a separate "of which HMO" line) · whether commission should be owed when cash is collected rather than when the line is saved (today: when saved) · Close day · payout batches.


### The two problems from the plan

| Problem | What was wrong | What happens now |
|---|---|---|
| **Day End CSV import** | The importer took the "Breakdown" and "Total" lines at the bottom of the report as if they were patients, and rejected the whole report because it has no Transaction Type, Visit Type, Month or Year columns. | The table now stops at the Breakdown line. Transaction type is worked out (a Visit ID starting with `RES`, or a "Reservation Fee" procedure, is a Reservation; everything else is a Visit). Month and Year come from the date. A blank Net Collection is worked out from amount paid less fees. The branch is read from the report title ("MARIKINA DAY END REPORT"). Tested on your real file: **9 lines read, 0 errors, total ₱3,965.00 — matches the file's own total.** |
| **Saved transactions showed "Not paid"** | A new transaction saved no payment record, so it always looked unpaid. | The Add Transaction form has a **Payment received now** section (amount, payment type, reference no.). Saving creates the first payment. The CSV import also records the money in the file as payments, so imported visits show as paid. |

### Requested features

| Feature | How it works |
|---|---|
| **Multiple procedures per transaction** | One visit = one **invoice** with one or more procedure lines. The **dentist is chosen once per transaction** (every line is saved under that dentist); each line has its own price, discount and VAT setting. "+ Add another procedure" adds a line. |
| **Discount (percentage or peso amount)** | Per line. Choose No discount, PWD (20%), Senior citizen (20%), Dental Network Member (5%), Promo or Other, then adjust the value and switch between % and ₱. A reason is required whenever there is a discount. **PWD and Senior citizen follow the official-receipt rule** (VAT taken out first, 20% off the VAT-free price — see "PWD / Senior discount and VAT" below); the other discounts are plain price reductions. The rates are starting presets — **please confirm them with the accountant.** |
| **VAT / Non-VAT** | **VAT is fixed at 12% and there is no VAT input.** Each procedure on the price list is either VATable or non-VAT. A VATable procedure's price is VAT-inclusive, so the VAT is worked out automatically (price − price ÷ 1.12, e.g. ₱9,000 → VATable sales ₱8,035.71 + VAT ₱964.29). **There is no VAT field on the procedure line** — VAT shows only in the totals: the "VAT (12%), included in the total" row under **Total due** on the form, the transaction page, and the invoice's official-receipt breakdown. The server decides from the procedure list too, so what is saved never depends on the browser. The form, the transaction page and the printed invoice also show the full **official-receipt breakdown** (Vatable sales, VAT-exempt sales, VAT, Less: VAT, Net of VAT, Less: Discount (SC, PWD), Add: VAT, Total amount due), following the "Auto compute OR" sheet. |
| **Procedure price list** | Picking a procedure fills in its list price (and its VAT setting). **The price can still be edited** on the line. Changing to another procedure fills that procedure's price; re-selecting the same name never overwrites an edited price. A price typed on a transaction does **not** change the price list. |
| **Patients table + typeahead** | New `patients` table. The Patient field searches as you type (names starting with the text first, then names containing it), shows each patient's last visit date, and offers "+ New patient" when the name isn't on file. Existing patients were created from your current data by the SQL file. |
| **New / Returning** | Worked out automatically: *Returning* if the patient has an earlier visit on file. A reservation fee alone does not count as a visit; a zero-amount follow-up does. A badge next to the patient field shows the result, and the Visit type dropdown can override it. |
| **Invoice number (manual)** | Typed in from the paper booklet. **Not required — leaving it blank means there is no invoice for that transaction** (the transaction page then shows "No invoice"). When a number is typed it is checked for duplicates (capitals are ignored): if it is already used at the same branch, the form warns in red when you leave the field (or change the branch), **disables the Add / Save button, and refuses to submit** until the number is changed or cleared. The server checks again when saving. |
| **Payments belong to the invoice** | One payment can cover several procedures. Payments carry a **reference number** (card slip / GCash / bank transfer) as proof of payment. Recording more than the balance due is refused. |
| **Merchant fee (automatic) / withholding tax (removed)** | The **Merchant fee and Withholding tax fields are gone from the form.** The merchant fee is worked out automatically from the payment type (see "Merchant fee" below), **included in the payment** (not added on top), and shared across the procedure lines in proportion to their totals, to the centavo. |
| **Add Expenses (new layout)** | Follows the clinic's Operating Expenses sheet: Date, Particulars, Source of fund, Supplier (searchable, remembers address and TIN), Reference no., Services or Goods, VAT type with VAT computed, Description, Remarks, Branch. A VAT expense requires the supplier name and TIN. A likely duplicate (same date, amount and supplier — or same supplier and reference no.) shows a warning with "Add it anyway". |
| **CSV upload screen** | New "Branch for this file" dropdown (default: auto-detect from the file title). The result shows how many lines, visits and payments were imported and which branch they went to. |

### Procedures tab, quantity, teeth and discount types (latest batch)

**Procedures tab.** The Transactions page now has three tabs: **Transactions | Procedures | Recalls due**. The **Procedures** tab is the price list: procedure, VAT (12% / Non-VAT), cash price, what the price is for (price basis), status (Active / Hidden) and last changed. Search by name and filter by All, VAT 12%, Non-VAT, No price or Hidden. **Admins** can add a procedure, edit its name / VAT / price / price basis, hide it (or show it again), and delete it only if it was never used. Everyone signed in can open a procedure's **History**: old price, new price, who changed it, when and an optional note. The screen says: *This changes prices for new transactions only. Past transactions are not affected.* A price change of more than 25% asks for a second confirmation before it is saved. Hiding a procedure keeps its old transactions and commission rates and only removes it from the dropdown on new transactions. **Procedures are created only here** (nothing creates them from transaction text any more). Staff and dentists see the list read-only.

**Past transactions never move when a price changes.** Every saved line stores its own unit price, quantity, VAT setting and discount, so changing the list changes new transactions only. Two safeguards were added: (1) a saved line keeps the VAT setting it was saved with for as long as it stays on the same procedure (before, editing an old visit re-read the procedure's *current* VAT setting); (2) a saved line keeps its link to the procedure, so renaming a procedure later does not break its commission, and `yarn db:backfill-links` now uses the saved link first and the name only for lines that have none.

**Transaction form, per procedure line:**

| Field | How it works |
|---|---|
| **Teeth** | FDI numbering: permanent 11–18, 21–28, 31–38, 41–48; primary 51–55, 61–65, 71–75, 81–85. Also `upper arch`, `lower arch`, `full mouth`. Numbers can be separated by commas, spaces or "and". An invalid number (for example 19 or 56) shows an error and blocks saving. Optional. |
| **Price each / Qty / Sub total / Discount / Net total** | The price field is the price of **one** unit; Sub total = price × quantity; Net total = Sub total − discount (VAT inside as before). |
| **Quantity** | Follows the teeth for procedures priced **per tooth** (3 teeth → quantity 3) and **per arch** (upper + lower → 2, full mouth → 2); for per-surface and per-unit procedures staff type it. It can always be changed, and once changed by hand it is no longer rewritten when the teeth change. |
| **Price basis table** (confirmed) | Per surface: Permanent Filling (3), Temporary Filling, Calcimol. Per tooth: Veneers, Jacket Crowns, Onlay Ceramage, Post & Build Up, Wisdom Tooth Removal, Complicated and Simple Tooth Extraction, Root Canal Treatment, Bone Reduction. Per arch: the dentures, Retainers (Hawley, Invisible), Splint, Bite Raiser. Per unit: Post & Core, additional pontic, Additional Whitening Cycle, Extra Anesthesia, Temporary Crown, Ceramage Removal, Suture. Everything else is flat. An admin can change a procedure's basis on the Procedures tab. |
| **Discount** | A dropdown of **PWD, Senior citizen and Promo** (kept in the database, not in the code). PWD and Senior citizen are fixed at 20%. Promo is typed as % or ₱. Old visits that used a different wording (for example "Dental Network Member") keep it and show it as "(old)". An **Apply to all lines** button copies one line's discount to every line of the visit. |
| **PWD / Senior ID** | When a line uses PWD or Senior citizen, an **ID type** (PWD ID, Senior Citizen ID (OSCA), Other government ID) and **ID number** are required, once per visit; the form and the server both refuse to save without them. The ID is printed on the invoice. On the transaction page it is shown in full to admins and masked (last four digits) to everyone else. **No signature is collected.** |
| **Which discount gets the "VAT removed first" rule** | The discount type's own **statutory** flag decides it (and its **needs ID** flag decides the ID rule), not the wording of the reason. |
| **Recall (optional)** | A recall date and reason on the visit. The **Recalls due** tab lists patients who were asked to come back and have no later visit, soonest first, with "Overdue by n days / Due today / In n days". |
| **Remarks** | Now a plain multi-line box. |

**Order of the Add transaction form.** The form now follows the clinic's order: (1) **Date, Patient name, Visit type**; (2) **Dentist, Transaction type, Branch**; (3) **Payment method & invoice** — the payment method, the **invoice number and the invoice photo are inside this section**; (4) **Procedures**, which only appear once a payment method is chosen (prices can differ by payment method, e.g. HMO) — or after pressing "Not paid yet — continue to the procedures" so an unpaid visit can still be entered; (5) **Total due** with the VAT line and OR breakdown; (6) **Payment received now** (amount, reference no., proof of payment; the method is the one chosen in step 3), then the PWD / Senior ID when needed, the optional recall, and the multi-line remarks. **When a procedure line has a procedure and a price, a new empty procedure line is added automatically**; "+ Add another procedure" still adds one at any time, even if the first is unfinished, and empty lines are ignored when saving. When editing an existing visit the procedures are always shown and the section is just "Invoice". **HMO prices are still not loaded** (cash prices are used; the form says so when an HMO is chosen) — the payment-method-first order is the groundwork for the payer prices in the plan.

**HMO prices (latest batch).** Every procedure can now have a price per HMO. When the **payment method** on the Add transaction form is an HMO, picking a procedure fills in **that HMO's price**; for Cash, GCash, cards and everything else it fills the cash price. The accepted HMOs are exactly: **Maxicare, Intellicare, Avega, Valucare, Medicard, Elite Dental Network.**

| HMO | Consultation | OP | PF | TF | Simple extraction |
|---|---:|---:|---:|---:|---:|
| Maxicare | 150 | 250 | 350 | 120 | 235 (anterior) / 270 (posterior) |
| Intellicare | 200 | 300 | 250 | 100 | 200 |
| Avega | 200 | 300 | 250 | 100 | 200 |
| Valucare | 150 | 275 | 350 | 150 | 350 |
| Medicard | 150 | 250 | 250 | 250 | 200 |
| Elite Dental Network | 100 | 400 | 400 | 100 | 400 |

- **How the sheet maps to our procedures:** OP applies to all four Oral Prophylaxis levels (Mild, Moderate, Severe, Pedia); PF to all three Permanent Filling items (Posterior, Anterior, Per Surface (Voco)); TF to Temporary Filling; EXO to Simple Tooth Extraction. Only these procedures have HMO prices; **a procedure with no price for the chosen HMO is left blank with the note "No Maxicare price for this procedure — enter the price"** (it is never silently charged at the cash price).
- **Maxicare extraction:** our list has one "Simple Tooth Extraction", so it was loaded at Maxicare's **anterior** price (235). For a posterior tooth enter 270 on the line, or change the stored price on the Procedures tab.
- **Changing the payment method** on the form re-prices the lines whose price is still the old method's list price (e.g. Cash → Maxicare); a price typed by hand is left alone, and a short note says prices were updated.
- **Procedures tab:** the edit window has a box per HMO (blank = no price), the table shows how many of the six HMOs have a price, and the price history now says which price changed (Cash or an HMO). A change of more than 25% to any price asks for confirmation. A price typed on a line for an HMO visit never becomes the cash price.
- **The payment method is now saved on the visit even when nothing has been received yet**, so an HMO visit entered before the HMO pays still earns the HMO commission (before, the method was only kept once a payment was entered). The Transactions table therefore shows the method with "Not paid" for such visits.
- Commission rules and merchant fees are unchanged. **A patient co-pay** (HMO covers part, the patient pays the rest) is still not modelled: record it as two payments.

**Left for later phases (still in the plan only):** visit status (Arrived → On-going → For Payment → Cleared), front desk and cashier roles, clinical progress notes with voice transcription, putting payment before procedures, and drafts (decided: not for now; recorded in the plan to check afterwards).

**Defaults used for the open points:** discount list is exactly PWD / Senior citizen / Promo (history keeps old wording); the ID is stored once per visit with its type; price edits are admin-only and apply to new transactions only; quantity follows the number of teeth and stays editable.

### Expenses inside Transactions, Patients page, visit status, Today board, waiting times and audit (October 11)

**Menu and tabs.** Patients replaces Expenses in the top menu. Expenses is now a tab inside **Transactions** (tabs: Transactions · Expenses · Procedures · Recalls due · Audit, the last one for admins only). The old `/cashflow/expenses` address redirects to the tab, and the header "Add Expenses" button is gone: **Add Expenses** now sits in the Expenses tab, which also has a search, a date range, a total of what is shown and paging at 200 rows.

**Patients page** (`/cashflow/patients`). A searchable list with last visit, number of invoices (and how many are still open), balance due, the status of any open visit, and the recall date. Filters: has a balance, recall due, seen in the last 30 days, not seen in 6 months. **View invoices** opens the **patient page** (`/cashflow/patients/[id]`): summary cards (visits, total billed, total paid, balance due, last visit, next recall), the PWD / Senior ID on file (masked for non-admins), and **every invoice** of that patient with date, invoice number, procedures, dentist, branch, payment method, total, paid, balance and status, with filters by status and "with balance", and an **Open** link to the visit. Buttons: **New transaction for this patient** (the Add form opens with the name filled in) and **Edit patient** (name, contact number, notes). Admins also get the patient's **audit trail** and **Merge duplicate** (search the patient to keep; all invoices move across and the duplicate record is removed).

**Visit status.** Every visit has one of **Arrived → On-going → For Payment → Cleared**, shown as a coloured label on the Queue page, the visit page and the patient page (the Transactions list has neither a Status column nor a Status filter).
- **Move forward** with the arrow button (any signed-in user), one step at a time. **Cleared needs a zero balance, for everyone** — an admin cannot clear a visit that still owes money either; record the payment first (the visit then clears itself).
- **Back, skip ahead or reopen** a Cleared visit: admin only ("Change…"), with a reason.
- **Automatic:** a visit created today and unpaid starts as **Arrived**; paid in full → **Cleared**; a reservation → **Cleared**; a visit with a past date (typed from the booklet) is **Cleared** if paid, otherwise **For Payment**. A payment that brings a For Payment visit to zero **clears it**; removing a payment from a Cleared visit puts it back to For Payment. CSV imports set Cleared / For Payment from the payments imported.
- **Cleared visits are locked** for everyone but admins (the Edit button is disabled and the server refuses the edit).
- Status never changes sales, collection or commission, which still follow payments received.
- The visit page shows the **status history** (who moved it and when, with the reason).

**Queue board** (its own **Queue** item in the top menu, with the number of visits not yet Cleared shown beside it; the Overview page no longer has a queue section). The old Transactions → Today address now redirects to the Queue page. The page refreshes itself every 30 seconds while it is open, the menu number re-checks every 45 seconds on every page (through a plain request to `/api/cashflow/open-visits`, not a server action, because server actions run one at a time and a page click waits behind them), and an **Add to Queue** button on the page opens a short pop-up titled **Add to Queuing** (see the October 19 batch), so the front desk can register an arrival without leaving it. The menu switches to the phone-style dropdown below 1024 px wide so the eight admin items still fit. Four columns, one per status, with each patient's procedures, dentist, branch, how long they have been in that status, and the balance due. Visits from earlier days that are still not Cleared stay on the board so an unpaid visit is not forgotten. The **Cleared** column lists everything cleared today, including an older visit that was just settled (it is matched on the day it was cleared, not the visit date).

**Waiting times.** Average minutes **waiting to see the dentist** (Arrived → On-going), **in treatment** (On-going → For Payment) and **waiting to pay** (For Payment → Cleared), worked out from the status history: for today and for the last 30 days on the Queue page. A stage left open for more than 24 hours is left out of the averages. Visits entered after the fact skip the waiting steps, so only visits actually moved through the queue count.

**Audit trail.** Every visit created, edited (with what changed: date, patient, branch, invoice number, procedures added / removed / re-priced, discounts, ID added or changed, total due), removed, every payment added or removed, every status change, every CSV import (one line per file) and every patient added / edited / merged is logged with who and when. Admins see it on the visit page, on the patient page and on the **Audit** tab (filter: everything, visits, payments, status, patients). The PWD / Senior ID number itself is never written to the log, only that it was added, changed or removed. On October 12 the Audit tab was opened in the browser: status changes are being recorded with time, user, from → to and reason; the Visits, Payments and Patients entries could not be seen yet because none had been made since the tables were created.

**PWD / Senior ID extras.** The ID number was already mandatory. New: when the patient already has an ID on file the form offers **Use ID on file** (it shows only the last 4 characters until pressed), and typing an ID number that is **already on file for a different patient** shows a red warning (it does not block saving).

### One visit = one transaction

A visit with several procedures is **one transaction**. The transactions list shows it as a **single row** (the procedures joined, e.g. "Articaine(2) + Back job Resto", with the visit's total, net collection and balance) instead of one row per procedure, and the "recorded" count counts visits. Searching, filtering and sorting work on whole visits (searching for one procedure's name finds the visit). The dashboard's **Transactions** number and the **Transactions** column on the Performance tables (per dentist, per staff, per period) also count visits; the Popular procedures card still counts each procedure performed (its subtitle now says "By number of times performed"). Behind the scenes each procedure is still saved on its own line, so commissions and totals are unchanged.

### Merchant fee (automatic, by payment type)

From the clinic's **"LIST - MERCHANT FEE COMPUTATION"** sheet:

| Payment type | Merchant fee |
|---|---|
| POS (GHL) – Credit / Debit | **2.8%** |
| POS (BDO) – Credit / Debit | **5%** |
| POS (MAYA) – Credit / Debit | **3.4%** |
| Cash, GCash, GoTyme, HMOs (Maxicare, Medicard, Intellicare, Avega, Valucare, Elite Dental Network), bank "BDO" | no merchant fee |

**The fee is included in the payment, not added on top** *(changed on October 9, 2026 — this replaces the earlier "fee on top" rule)*. The fee is the percentage of the amount paid by card and it comes out of that payment. Example: a ₱3,500 bill paid by POS BDO (5%) → fee ₱175 → the clinic receives **₱3,325**; a **₱3,500 payment pays the ₱3,500 bill in full** (no extra ₱175 is asked from the patient). The amount typed on a card payment is what counts towards the bill; the fee is shown beside it. Cash, GCash and HMO payments have no fee. A visit paid part in cash and part by card is charged the fee only on the card part. **Net collection is the amount less the fee** (₱3,325 in the example), and commission is worked out on net collection.

Where you see it: the form's **"Paid in full"** shortcut fills the bill amount, and the note under it says "Of the ₱3,500 paid, ₱175 is the merchant fee, so the clinic receives ₱3,325". The Payments box has the same note and a **"Pay balance in full"** shortcut, and its list shows "incl. ₱175 fee" on card payments. The transaction page shows **Merchant fee (included in payment)** and the printed invoice shows the card merchant fee. The fee is recalculated whenever a payment is added or removed, when a visit is edited and on CSV import. Adding a payment that is more than the balance is refused with the most that can be entered.

The sheet lists "MAYA" but the app had no Maya payment type, so **POS (MAYA) – Credit** and **– Debit** were added to the payment types. The percentages are kept in one place in the code (`MERCHANT_FEE_RATES` in `src/lib/cashflow/pricing.ts`); if a rate changes, it is a one-line change. **Withholding tax** is no longer asked for; visits that already have some keep it and it still comes off net collection.

### Commission rule

Commission = **(total − discount − fees) × commission rate**. "Total − discount" is the line's price after any discount, and "fees" are any withholding tax already on older visits (and, on older imported files, a merchant fee that was deducted). The automatic card fee comes out of the payment, so it **does** reduce net collection and therefore commission (₱3,500 by BDO card → net ₱3,325). Discounts also reduce commission automatically. Applies to dentist commission and to staff bonus. 

### Invoice and receipt uploads

Photos and PDFs can now be attached to a transaction in two places, and they are kept in the database (so no extra storage service or keys are needed):

- **The paper invoice**, attached to the visit. **Proof of payment** (card slip, GCash or bank-transfer screenshot), attached to a specific payment.
- **When adding a transaction:** the form has *Invoice photo / PDF (optional)* under the invoice number and *Proof of payment (optional)* next to the payment's reference no. The files are chosen first and uploaded as soon as the transaction is saved; the proof is attached to that visit's payment. If a file fails to upload, the transaction is still saved and the form says which file to attach again.
- **On an existing transaction:** the transaction page has an *Invoice / receipt files* box with an *Attach invoice photo / PDF* button, and each payment has an *Attach proof of payment* button. Files open in a new tab; **only admins can remove a file**.
- **Rules:** JPG, PNG, WebP or PDF, up to **4 MB** each. Phone photos are shrunk in the browser (longest side 1,800 px, saved as JPEG) so they are normally a few hundred KB; a PDF over 4 MB is refused. Opening a file requires being signed in. Removing a visit or a payment removes its files with it.
- **Limits of keeping files in the database:** fine for photos and slips at the clinic's volume (roughly a few thousand files); if the number of files grows very large, they can be moved to cloud storage later without changing these screens.
- **Expenses can have receipts too.** The Add Expenses form has *Receipt / proof (optional)* (same rules and photo shrinking). A new **Expenses** page (in the top menu) lists recorded expenses, newest first (up to 200), each with its receipt files, an *Attach receipt / proof* button, and — for admins — Remove. Expenses had no list before, so this page is also the way to open an expense's file. The attachments SQL file covers expenses as well; if you ran an earlier copy of it, run it again (safe) so it picks up the change.
- Editing a transaction does not show the file boxes — use the transaction page for that. Imported (CSV) visits have no files until one is attached.

### Commission rates per dentist and procedure

Source: the clinic's **LIST - COMMISSION** sheet (one block per dentist: a cash-paying percentage per procedure, plus an HMO column).

**Cash-paying visits** — commission = net collection × the dentist's percentage for that procedure (the rule above, unchanged). Loaded from the sheet:

| Procedure | Dawn Rufino Rey Teope | Rearosa Ayapana | Beatrice Kiara Bandayrel | Kyla Denise Ahmad | Katherine Roldan | James Russel Banawa | Anna Beatrice Perez |
|---|---|---|---|---|---|---|---|
| Consultation | 10% | 10% | 10% | 10% | 10% | 10% | 10% |
| Ortho Install | 25% | 20% | 20% | 20% | 20% | 15% | 15% |
| Complicated extraction | 15% | 15% | 15% | 15% | 15% | — | — |
| Cosmetic Filling | 20% | 20% | 20% | — | — | — | — |
| Root Canal Treatment (Anterior/Posterior) | — | — | — | 20% | 20% | 20% | 20% |

A procedure left blank on the sheet earns **no commission** (no rate is stored).

**HMO visits** — a visit whose payment type is an HMO (**Maxicare, Medicard, Intellicare, Avega, Valucare, Elite Dental Network**) uses the HMO column instead of the cash percentage:

- **OP: 10%** of net collection, for every dentist.
- **X-rays are a fixed peso amount, not a percentage:** Panoramic xray ₱50, Periapical Xray ₱30 for every dentist, and Transcranial Xray ₱50 for Dawn only (the sheet lists it only under her block).
- PF, TF and Simple extraction appear in the HMO list with no value on the sheet, and Consultation has no HMO rate — so an HMO visit for any procedure without an HMO rate earns **no commission**. (A consultation paid cash earns 10%; the same consultation billed to Maxicare earns nothing.)

**How it is set up in the app:** each dentist + procedure rate now has up to three values — the cash-paying %, an optional HMO %, and an optional HMO peso value. The **Commissions** page (admin) shows a Cash-paying column and an HMO column and has the three inputs when adding or changing a rate. The HMO peso value is per procedure line (not per tooth or per film). All of these can still be edited there at any time.

**Things to know about the sheet's data:**

- Rates are matched by **procedure name**, ignoring capitals (e.g. "Consultation"). A procedure typed differently — "Panoramic Xray w/ Hard Copy", or a package name such as "Ortho Install(Package5) …" — does not match the sheet's "Panoramic xray" / "Ortho Install" and earns nothing until a rate is set for that exact name on the Commissions page. Using the same procedure names on the form (the procedure list fills from what has been typed) avoids this.
- Rates are matched to the dentist by **account name**, spelled as on the sheet (e.g. "Dawn Rufino Rey Teope"); the SQL file adds any of the 7 that are missing. If a dentist already has an account under a different spelling, the file adds a second one — remove the duplicate on the Users page. A visit is linked to a dentist by the name on the transaction, so pick the dentist from the Dentist dropdown (the full names above). Older imported visits that only say "TEOPE" or "AHMAD" are not linked to an account, as before, and so earn no commission.
- **To let a dentist sign in**, create their real account on the Users page and remove the placeholder one (rates are per account, so set them again or ask for them to be copied).
- Wherever the sheet repeats a procedure name with a typo or double spaces ("Simple  extraction", "Post & Core (per post"), only rows that actually have a rate were loaded, so those do not matter.
- Staff bonus is unchanged (still the cash percentage).

### PWD / Senior discount and VAT — how the receipt is worked out

This follows the clinic's **"Auto compute OR"** sheet (the block marked "ITO PO ANG GAGAMITIN") and the usual BIR rule for PWD and Senior Citizens. The price typed in is the price the patient is quoted (VAT included for a VAT item).

| Case | What the system does |
|---|---|
| **No discount, non-VAT item** | Total due = price. The whole amount is a **VAT-exempt sale**. |
| **No discount, VAT item** | VATable sales = price ÷ 1.12; VAT = the 12% in the price. Total due = price (VAT is *added back* on the receipt, so the total does not change). |
| **Promo / Dental Network Member / Other discount** | A plain reduction of the price. A VAT item keeps its VAT, now worked out on the lower amount. |
| **PWD or Senior citizen, non-VAT item** | 20% of the price is taken off. Total due = price − 20%. Example from the sheet: ₱1,250 − ₱250 = **₱1,000**. |
| **PWD or Senior citizen, VAT item** | VAT is removed first (the 12% in the price, i.e. price ÷ 1.12), the **20% is taken off that VAT-free price**, and no VAT is added back — the sale becomes VAT-exempt. Example: ₱1,120 → net ₱1,000 → less ₱200 → **₱800** (Less: VAT ₱120). |

The receipt breakdown adds the lines up as: **Total sales (VAT inclusive)** − **Less: VAT** = **Amount: net of VAT**; then − **Less: Discount (SC, PWD)** + **Add: VAT** = **Total amount due**. *Vatable sales* are VAT items without a PWD/Senior discount; *VAT-exempt sales* are non-VAT items plus PWD/Senior items (shown before their discount, as on the sheet).

**Checked against the sheet:** the second block reproduces exactly — regular ₱2,000 non-VAT → due ₱2,000; PWD ₱1,250 → discount ₱250 → due ₱1,000. In the first block the PWD column's numbers also reproduce (Less: VAT ₱26.79, net ₱3,723.21, discount ₱744.64) **but its Total Amount Due (₱3,005.36) does not add up** — ₱3,723.21 − ₱744.64 is ₱2,978.57 (the sheet takes ₱3,750 − ₱744.64, which puts the ₱26.79 VAT back in). The system follows the arithmetic, so it gives ₱2,978.57 when both lines are PWD, or ₱3,050.00 when only the ₱3,500 item is PWD and the ₱250 VAT item is regular. That first block's regular column also shows VAT of ₱375 on ₱3,500 (that is 10.7%, not 12%; 12% would be ₱415.18 on ₱3,875). **Please confirm with the accountant which way the first block should read.**

How it is applied: the discount is per procedure line, so a visit can mix a PWD procedure with regular ones. PWD/Senior is recognised by the discount reason (the "PWD" and "Senior citizen" choices). Commission, as before, is taken on what the line was actually charged less fees, so a PWD/Senior line produces a lower commission because the VAT and the 20% are both gone from its price.

### Procedure list and price list

The old procedure list is **deleted** and replaced by the **Cash Paying** column of the clinic's "Procedure and pricelist w/ HMO" sheet — 66 procedures. Picking one on the Add / Edit transaction form fills in its price (editable). The SQL file is `scripts/sql/2026-10-procedure-pricelist.sql`.

**VAT setting** (from the clinic's list): **OP** (all Oral Prophylaxis), **PF** (all Permanent Filling), **TF** (Temporary Filling) and **SIMPLE EXO** (Simple Tooth Extraction) are non-VAT. The **NO OR** procedures are also non-VAT: Consultation, Dental Certificate, X-rays (Panoramic, Periapical) and Anesthesia (Extra Anesthesia). **Everything else is VATable at 12%.**

**Judgement calls — please confirm:** *Calcimol* is treated as non-VAT like Temporary Filling (same price basis). *TMJ Consultation* is VATable (it is a package-type service, not the plain Consultation). *Ortho Removal w/ OP* is VATable. The sheet's *Complete / per arch / partial 1-3* rows are named under their parent (Plastic Denture, Porcelain Denture), "Flouride" is spelled "Fluoride", and "Post & Core (per post" got its closing bracket. Prices that the filling rows describe as "per surface" are the price of one surface — change the price on the line for more surfaces.

**Commission rates:** carried over to the new names — OP → the four Oral Prophylaxis procedures, Complicated extraction → Complicated Tooth Extraction w/ suture (silk), Panoramic xray → Panoramic Xray w/ hard copy, Root Canal Treatment → both Anterior and Posterior; Consultation and Periapical Xray keep their rates. **Ortho Install, Cosmetic Filling and Transcranial Xray are not on the new list, so their rates are removed** (the mapping is at the top of step 2 of the SQL file and can be edited before running it). The commission SQL file was updated to use the new names, so re-running it does not bring the old procedures back.

**Past transactions** are not deleted or changed: they keep their procedure text. Their link to the procedure is cleared where the old name is gone, so an old visit worth commission under a removed name (for example "OP") will no longer earn it when `yarn db:backfill-links` is run; visits saved from now on use the new names.

**HMO prices** from the sheet (Maxicare, Intellicare, Avega, Valucare, Medicard, Elite Dental Network — Consultation, OP, PF, TF, extraction) are **not** loaded yet; only the cash price list is used.

**The procedure list is only the price list.** A name typed on the form that is not on the list is kept on that transaction as a one-off (treated as VATable) but is **not added to the list**; nothing creates procedures automatically any more. (Before this fix, `yarn db:backfill-links` and CSV imports created a procedure for every name found in old transactions — that is where leftovers such as "Articaine(2)", "Calcimol(2)" and "Back job Resto + Periapical Xray" came from.) **Re-running `2026-10-procedure-pricelist.sql` deletes every procedure that is not on the new list**, so run it again (it is safe to repeat), then `yarn db:backfill-links`. Clearing the Procedure field on a line also clears its price (and the VAT figure follows, because it comes from the procedure).

| Procedure | Cash price | VAT |
|---|---|---|
| Consultation | ₱600.00 | Non-VAT |
| Oral Prophylaxis (MILD) | ₱1,200.00 | Non-VAT |
| Oral Prophylaxis (MODERATE) | ₱1,700.00 | Non-VAT |
| Oral Prophylaxis (SEVERE) | ₱3,200.00 | Non-VAT |
| Oral Prophylaxis (PEDIA) | ₱650.00 | Non-VAT |
| Permanent Filling (Posterior) | ₱1,200.00 | Non-VAT |
| Permanent Filling (Anterior) | ₱2,000.00 | Non-VAT |
| Permanent Filling - Per Surface (Voco) | ₱2,700.00 | Non-VAT |
| Simple Tooth Extraction | ₱1,200.00 | Non-VAT |
| Complicated Tooth Extraction w/ suture (silk) | ₱3,000.00 | VAT 12% |
| Suture (Silk USP 3/0)-Reverse Cutting | ₱500.00 | VAT 12% |
| Extra Anesthesia | ₱100.00 | Non-VAT |
| Bone Reduction | ₱2,000.00 | VAT 12% |
| Wisdom Tooth Removal | ₱15,000.00 | VAT 12% |
| Fluoride (Pedia Only) | ₱1,500.00 | VAT 12% |
| Temporary Filling | ₱750.00 | Non-VAT |
| Calcimol | ₱750.00 | Non-VAT |
| Ortho Removal w/ OP | ₱5,000.00 | VAT 12% |
| Root Canal Treatment (Anterior) | ₱9,000.00 | VAT 12% |
| Root Canal Treatment (Posterior) | ₱9,500.00 | VAT 12% |
| Post & Core (per post) | ₱5,000.00 | VAT 12% |
| Post & Build Up (Per tooth) | ₱6,000.00 | VAT 12% |
| Panoramic Xray w/ hard copy | ₱1,250.00 | Non-VAT |
| Periapical Xray | ₱650.00 | Non-VAT |
| Flexible Denture - Partial (Per Arch) 1-8 pontics | ₱22,000.00 | VAT 12% |
| Plastic Denture - Partial (Per Arch) 1-3 pontics | ₱6,000.00 | VAT 12% |
| Plastic Denture - Partial 4 pontics up to full | ₱9,500.00 | VAT 12% |
| Plastic Denture - Complete | ₱19,000.00 | VAT 12% |
| Immediate Dentures (Per Arch) | ₱15,000.00 | VAT 12% |
| Rush Fee | ₱2,000.00 | VAT 12% |
| Denture (IVOCAP) - Per Arch | ₱22,000.00 | VAT 12% |
| Denture Repair | ₱3,500.00 | VAT 12% |
| Retainer Repair | ₱2,000.00 | VAT 12% |
| Porcelain Denture - Complete | ₱46,000.00 | VAT 12% |
| Porcelain Denture - Per Arch | ₱23,000.00 | VAT 12% |
| Porcelain Denture - Partial 1-3 pontics | ₱18,000.00 | VAT 12% |
| Jacket Crown (Plastic) | ₱5,000.00 | VAT 12% |
| Jacket Crown (PFM)- Samurai Europe made | ₱13,000.00 | VAT 12% |
| Jacket Crown (PFM)-Tilite (Samurai) (Europe made) | ₱17,000.00 | VAT 12% |
| Jacket Crown (Emax)- Samurai (Europe made) | ₱35,000.00 | VAT 12% |
| Jacket Crown (Zirconia)- Samurai | ₱40,000.00 | VAT 12% |
| Veneers (Emax)-Samurai Europe made | ₱35,000.00 | VAT 12% |
| Veneers (Zirconia)-Samurai Europe made | ₱40,000.00 | VAT 12% |
| Onlay Ceramage (Samurai) | ₱18,000.00 | VAT 12% |
| Veneers (Direct composite) per tooth (warranty of 1 visit) | ₱10,000.00 | VAT 12% |
| Temporary Crown | ₱2,000.00 | VAT 12% |
| Ceramage Removal | ₱2,500.00 | VAT 12% |
| Jacket Crown (PFM)-Tilite (Swiss or JR) | ₱12,000.00 | VAT 12% |
| Clasp for Maryland | ₱2,500.00 | VAT 12% |
| Retainers (Hawley)-per arch | ₱6,000.00 | VAT 12% |
| Retainers (Invisible)-per arch | ₱7,000.00 | VAT 12% |
| Mouth Guard | ₱12,000.00 | VAT 12% |
| Retainers (additional pontic) | ₱1,000.00 | VAT 12% |
| Dental Certificate | ₱250.00 | Non-VAT |
| Teeth Whitening (3 cycles) | ₱15,000.00 | VAT 12% |
| Additional Whitening Cycle | ₱3,500.00 | VAT 12% |
| TMJ Consultation | ₱2,500.00 | VAT 12% |
| Myofunctional Appliance | ₱20,000.00 | VAT 12% |
| Splint per arch | ₱10,000.00 | VAT 12% |
| Bite Raiser per arch | ₱10,000.00 | VAT 12% |
| Mock up wax | ₱2,500.00 | VAT 12% |
| Ortho Package (Simple Case) | ₱70,000.00 | VAT 12% |
| Ortho Package (Complex Case) | ₱85,000.00 | VAT 12% |
| TMJ Package | ₱55,000.00 | VAT 12% |
| Ortho Diagnostic Fee Simple case | ₱3,000.00 | VAT 12% |
| Ortho Diagnostic Fee Complex case | ₱5,000.00 | VAT 12% |

### Left out on purpose

- **Head Office branch** — not added, as agreed.

---

## 3. Files created (22 earlier + 12 + 7 in the latest batches)

| File | Purpose |
|---|---|
| `scripts/sql/2026-10-patient-hmo-details.sql`, `src/lib/cashflow/patient-hmo.ts` | October 26: the SQL that adds the patient's birthday, HMO company and HMO account number, and the pure rules for them (birthday check, age, formatting, text cleaning). |
| `src/components/cashflow/branch-select.tsx` | October 22: the "My branch" select on My profile that saves by itself. |
| `src/components/cashflow/remove-from-queue-button.tsx` | October 20: the red **Remove** link and confirmation pop-up on Arrived / On-going Queue cards. |
| `src/lib/auth/session-policy.ts`, `src/components/auth/session-guard.tsx` | October 19: the login-expiry timing rules (pure, testable) and the browser component that runs the clock, the quiet extension and the "Stay signed in" pop-up. |
| `scripts/sql/2026-10-commission-tiers.sql`, `src/lib/cashflow/commission-tiers.ts`, `src/lib/db/commission-tiers.ts`, `src/components/cashflow/commission-tiers-manager.tsx` | October 19: the tier tables, cleanup and tier rates; tier rules (resolve, labels); tier queries; the tier editor on the Commissions page. |
| `scripts/sql/2026-10-invoices-patients-suppliers.sql` | Creates the new tables and columns, and fills them from existing data (see section 5). |
| `scripts/sql/2026-10-commission-rates-unique.sql` | Adds the missing unique (dentist, procedure) rule on commission rates; if the same pair somehow has two rates, keeps the latest. |
| `scripts/sql/2026-10-attachments.sql` | Creates the `attachments` table that holds uploaded invoice photos / receipts and expense receipts. |
| `scripts/sql/2026-10-card-payments-fee-included.sql` | Optional: sets single card payments that were entered as bill + fee back to the bill amount. |
| `scripts/sql/2026-10-procedure-pricelist.sql` | Replaces the procedure list with the 66 procedures of the new price list (price + VAT setting each), carries commission rates over to the new names, deletes the old procedures. |
| `src/lib/db/attachments.ts`, `src/lib/cashflow/attachment-rules.ts`, `src/lib/cashflow/attachment-client.ts` | Saving / listing / removing files; the shared file rules (types, 4 MB); the browser-side photo shrinking and upload. |
| `src/app/api/cashflow/attachments/route.ts`, `[id]/route.ts` | Upload endpoint; open (sign-in required) and remove (admin only) a file. |
| `src/app/cashflow/expenses/page.tsx` | New Expenses page: the list of recorded expenses with their receipt files. |
| `src/components/cashflow/attachments-panel.tsx`, `file-picker.tsx` | The upload / list box on the transaction page and the file chooser on the Add transaction form. |
| `scripts/sql/2026-10-commission-rates-from-sheet.sql` | Adds the HMO columns to commission rates, adds the 7 dentists on the sheet as profile-only dentist accounts, and loads every dentist's rates from the "LIST - COMMISSION" sheet (adds missing procedures, safe to repeat). |
| `src/lib/cashflow/pricing.ts` | One shared set of money rules (discount, line total, VAT split, **PWD/Senior rule, official-receipt breakdown**, fee sharing) used by both the form and the server, so what staff see is what gets saved. |
| `src/lib/cashflow/invoice-schema.ts` | Validation for the new transaction form (lines, discount rules, optional invoice number (duplicate-checked), first payment). |
| `src/lib/db/invoices.ts` | Create / edit / delete a visit; invoice totals; invoice-number duplicate check; the new CSV import that groups lines into invoices and records payments. |
| `src/lib/db/patients.ts` | Patient search, find-or-create, and the New/Returning rule. |
| `src/lib/db/suppliers.ts` | Supplier list and find-or-create (existing details are never overwritten; blanks are filled in). |
| `src/app/cashflow/patient-actions.ts` | Server actions for the patient search and the New/Returning badge. |
| `src/components/cashflow/patient-combobox.tsx` | The patient typeahead field. |
| `scripts/sql/2026-10-hmo-prices.sql` | HMO prices: creates `procedure_prices` (procedure × HMO), adds the payer column to the price history, loads the six HMOs' prices (Consultation, OP, PF, TF, Simple extraction) without overwriting existing ones. |
| `scripts/sql/2026-10-procedures-settings-and-line-fields.sql` | Latest batch: procedure columns (price basis, active, updated), `procedure_price_history`, `discount_types` (PWD, Senior citizen, Promo), quantity / unit price / teeth / discount type on lines, ID and recall columns on visits, price basis per procedure. |
| `src/lib/cashflow/teeth.ts`, `src/lib/cashflow/price-basis.ts`, `src/lib/cashflow/mask.ts` | FDI teeth reading and checking; price bases and the suggested quantity; masking of ID numbers. |
| `src/lib/db/procedure-admin.ts`, `src/lib/db/discount-types.ts`, `src/lib/db/recalls.ts` | Procedures tab data (list, add, edit, hide, delete-if-unused, price history, >25% guard); discount types; pending recalls. |
| `src/app/cashflow/transactions/procedure-actions.ts` | Server actions for the Procedures tab (admin only to change; any signed-in user can read history). |
| `src/components/cashflow/procedures-manager.tsx`, `transactions-tabs.tsx`, `recalls-list.tsx` | The Procedures tab, the tab row, and the Recalls due list. |
| `src/components/cashflow/or-breakdown.tsx` | The official-receipt breakdown block shown on the form, the transaction page and the printed invoice. |

**October 17 batch (new files):**

| File | Purpose |
|---|---|
| `scripts/sql/2026-10-hmo-loa-loe.sql` | Adds `loa_number` and `loe_number` to the visit. |
| `src/lib/cashflow/hmo.ts`, `src/lib/db/hmo.ts` | The LOA rules (what is an HMO visit, "LOA pending", the message) and the lookup of HMO / LOA state for a batch of visits. |
| `src/components/cashflow/loa-pending-badge.tsx` | The orange "LOA pending" chip. |
| `src/lib/cashflow/day-end.ts`, `src/lib/db/day-end.ts` | End-of-day report: layout, breakdown, totals, file name (pure); the day's payments, unpaid visits and expenses, and which branch a person may see. |
| `src/app/cashflow/day-end/page.tsx`, `src/app/api/cashflow/day-end/route.ts` | The Day end screen and its Excel / CSV download. |
| `src/lib/cashflow/xlsx.ts` | A small writer for .xlsx and CSV (no package needed). |
| `src/lib/cashflow/commission-report.ts`, `src/lib/db/commission-report.ts` | Commission report: grouping, subtotals, sheets and filters (pure); the query. |
| `src/app/cashflow/commissions/report/page.tsx`, `src/app/api/cashflow/commissions/report/route.ts` | The Commission report screen and its Excel / CSV download (admin only). |
| `src/lib/db/visit-readiness.ts` | Why a visit can't go on to payment yet (no real procedure / no dentist). |

**October 11 batch (new files):**

| File | Purpose |
|---|---|
| `scripts/sql/2026-10-patients-and-visit-status.sql` | Visit status + status history + audit table + indexes; one-time status for existing visits. |
| `src/lib/cashflow/visit-status.ts`, `audit-diff.ts` | The status rules (allowed moves, automatic status, waiting-time averages) and the "what changed" comparison for the audit trail. Pure, shared by screen and server. |
| `src/lib/db/visit-status.ts`, `audit.ts`, `patient-admin.ts` | Status changes, history, Queue board, open-visit count for the menu and waiting times; the audit log; patient list, patient page data, add / edit / merge. |
| `src/app/cashflow/transactions/status-actions.ts`, `src/app/cashflow/patients/actions.ts`, `patients/page.tsx`, `patients/[id]/page.tsx` | Status action; patient actions (add, edit, merge); the Patients list and patient pages. |
| `src/components/cashflow/` `expenses-tab`, `status-pill`, `visit-status-control`, `status-history`, `today-board`, `auto-refresh`, `wait-stats`, `audit-trail`, `patient-form-modal`, `merge-patient` | The Expenses tab, status label and controls, history, Queue board, waiting-time card, audit list, patient add / edit dialog, merge tool. |

## 4. Files updated (63 earlier + latest batch)

| File | What changed |
|---|---|
| *October 26 (HMO summary, patient HMO details):* `src/lib/db/schema.ts`, `src/lib/db/patient-admin.ts`, `src/app/cashflow/patients/actions.ts`, `src/components/cashflow/patient-form-modal.tsx`, `src/app/cashflow/patients/[id]/page.tsx`, `src/lib/cashflow/day-end.ts`, `src/lib/db/day-end.ts`, `src/app/cashflow/day-end/page.tsx` | Three patient columns (birthday, HMO company, account number) in the form, profile, search and merge; the Day end HMO summary, its lines and its place in the Excel / CSV. |
| *October 22 (branch from the profile):* `src/app/cashflow/transactions/page.tsx`, `src/lib/cashflow/transactions-query.ts`, `src/components/cashflow/transactions-toolbar.tsx`, `transactions-list.tsx`, `src/app/cashflow/profile/actions.ts`, `src/app/cashflow/profile/page.tsx` | The list defaults to the user's branch, "All branches" is an explicit `all` value, chip says "(your branch)", and My profile has a Branch card with `updateMyBranchAction`. |
| *October 20 (remove from Queue):* `src/lib/cashflow/visit-status.ts`, `src/lib/db/visit-status.ts`, `src/app/cashflow/transactions/status-actions.ts`, `src/components/cashflow/today-board.tsx` | The removal rule, the database read it needs, the server action (with audit), and the Remove link on Arrived / On-going cards. |
| *October 19 (login expiry):* `src/auth.ts`, `src/types/next-auth.d.ts`, `src/middleware.ts`, `src/app/cashflow/layout.tsx`, `src/app/login/page.tsx`, `src/components/auth/login-form.tsx`, `.env.example` | 30-minute idle clock in the login token, extension only on an explicit refresh, account re-check on extension; session carries time left; guard mounted in the layout; login page shows the inactivity message and returns to the page the person was on; example settings file has placeholders instead of real values. |
| *October 19:* `src/lib/db/schema.ts`, `src/lib/cashflow/pricing.ts`, `src/lib/db/transactions.ts`, `src/app/cashflow/commissions/page.tsx`, `actions.ts` | Two tier tables; `computeCommission` supports a flat peso on any payment; the save-time lookup uses the individual rate, else the tier rate; the Commissions page shows tiers first; tier actions. |
| *October 17:* `src/lib/db/schema.ts`, `invoice-schema.ts`, `audit-diff.ts`, `src/lib/db/invoices.ts` | LOA / LOE columns, validation and saving; both appear in the audit comparison; a new HMO visit saved paid with no LOA starts For Payment; a check-in with no procedures starts Arrived and can't take a payment. |
| *October 17:* `src/lib/cashflow/visit-status.ts`, `src/lib/db/visit-status.ts` | New rules: no Cleared (and no automatic clearing) without the LOA of an HMO visit; no For Payment / Cleared without a real procedure and a dentist; the check-in placeholder; the Queue cards carry the LOA flag and the readiness message. |
| *October 17:* `transaction-form.tsx`, `transaction-detail.tsx`, `today-board.tsx`, `transactions-table.tsx`, `visit-status-control.tsx`, `patients/[id]/page.tsx`, `patient-admin.ts` | HMO authorization box; procedures always visible, payment optional, "Check in (add procedures later)"; LOA fields and chip; the status buttons refuse a move the server would refuse. |
| *October 17:* `transactions-tabs.tsx`, `commissions/page.tsx`, `src/lib/db/transactions.ts`, `dashboard-metrics.ts` | The Day end tab; the Commission report button; the placeholder is left out of procedure statistics. |
| *Latest batch:* `src/lib/db/schema.ts`, `src/lib/cashflow/schema.ts`, `invoice-schema.ts`, `pricing.ts`, `constants.ts` | New columns and tables; line input is now unit price + quantity + teeth + discount type (visit input adds ID type / number and recall date / reason, with a check that PWD/Senior needs an ID); `priceLine` takes the discount type's statutory flag and `computeListPrice` was added; the discount presets were replaced by the ID types list. |
| *Latest batch:* `src/lib/db/invoices.ts`, `transactions.ts`, `procedures.ts` | Server prices each line from unit price × quantity, keeps a saved line's own VAT and procedure link, applies the discount type rules, checks the ID, saves the ID and recall on the visit; the commission link uses the saved procedure first; procedures carry price basis and hidden status. |
| *Latest batch:* `transaction-form.tsx`, `add-/edit-transaction-modal.tsx`, `transactions-list.tsx`, `transactions-table.tsx`, `transaction-detail.tsx`, `invoice-view.tsx`, `transactions/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx` | New line layout, ID and recall sections, multi-line remarks, tabs on the Transactions page, teeth / quantity / ID shown on the transaction page and printed invoice. |
| `src/lib/db/schema.ts` | New `patients`, `suppliers`, `invoices` tables. New columns on `transactions` (invoice, patient, line number, list price, discount mode/value/amount/reason, VAT type), `payments` (invoice, reference no.; transaction link now optional), `procedures` (default price, default VAT type), `expenses` (supplier, reference no., remarks, nature, VAT type, vatable amount, VAT amount). |
| `src/lib/cashflow/schema.ts` | Transaction shape gains the optional new fields. |
| `src/lib/cashflow/parse-csv.ts` | Day End layout support (stops at Breakdown/Total, infers type, derives month/year, reads branch from title). Row ids are now the Visit ID itself (see section 6). |
| `src/lib/cashflow/constants.ts` | Discount presets; expense categories now use the clinic's own "Particulars" wording; Source-of-fund list; Services/Goods. |
| `src/lib/cashflow/expense-schema.ts` | Supplier, reference no., remarks, nature, VAT type; VAT requires supplier name and TIN. |
| `src/lib/cashflow/payment-schema.ts` | Reference number added. |
| `src/lib/db/transactions.ts` | Handles the new columns; visit IDs count distinct visits; deleting a visit's last line removes the empty invoice; several distinct transaction numbers can be issued for one visit. |
| `src/lib/db/payments.ts` | Rewritten around invoices; reference no.; imported payments can be replaced on re-import without touching typed-in ones. |
| `src/lib/db/procedures.ts` | Procedures carry their list price and VAT setting; `loadProcedureVatMap` gives the server each procedure's VAT setting; a procedure's price is only ever filled when it has none. |
| `src/lib/db/expenses.ts` | New columns; likely-duplicate check. |
| `src/app/cashflow/actions.ts` | Create / edit / remove a visit, invoice-number check, load a visit for editing, CSV import with branch auto-detect. |
| `src/app/cashflow/expense-actions.ts` | Supplier handling, VAT worked out on the server, duplicate warning. |
| `src/app/cashflow/transactions/payment-actions.ts` | Payments recorded against the invoice; overpayment refused; reference no. |
| `src/app/cashflow/transactions/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`, `[id]/invoice/page.tsx` | Work with whole visits (any line of a visit opens the whole visit). |
| `src/app/cashflow/page.tsx`, `layout.tsx` | Pass branches to the CSV upload and suppliers to Add Expenses. |
| `src/components/cashflow/transaction-form.tsx` | Rebuilt: invoice number, patient typeahead and badge, procedure lines, discount, VAT, live totals with the OR breakdown, fees, payment section. Price and Discount share one row (no VAT field); Dentist, Visit type and Branch share one row. |
| `src/lib/db/transactions.ts`, `src/lib/cashflow/dashboard-metrics.ts`, `src/components/cashflow/cashflow-overview.tsx`, `dashboard/dashboard-cards.tsx` | Transactions list shows one row per visit; transaction counts on the dashboard and Performance tables count visits. |
| `scripts/recompute-merchant-fees.ts`, `scripts/backfill-payments.ts`, `package.json` | New `yarn db:recompute-fees` one-time refresh of merchant fee / net collection on visits with a card payment; the payment backfill now includes the fee on card visits. |
| `src/lib/cashflow/constants.ts`, `src/lib/cashflow/invoice-schema.ts`, `src/lib/db/payments.ts`, `src/app/cashflow/transactions/payment-actions.ts`, `src/components/cashflow/payments-manager.tsx`, `invoice-view.tsx` | Merchant-fee rates and Maya payment types; Merchant fee / Withholding tax removed from the transaction input; fee added on top of the amount paid and recalculated when payments change; fee and total paid shown on the form, payments list and printed invoice. |
| `src/components/cashflow/expense-form.tsx`, `cashflow-nav.tsx`, `src/app/cashflow/expense-actions.ts` | Receipt / proof picker on Add Expenses; "Expenses" link in the top menu; adding an expense returns its id so files can be attached. |
| `src/lib/db/schema.ts`, `src/lib/cashflow/invoice-schema.ts`, `src/components/cashflow/transaction-form.tsx`, `transaction-detail.tsx`, `payments-manager.tsx`, `src/app/cashflow/transactions/[id]/page.tsx` | New `attachments` table; upload pickers on the form; files box and per-payment proof buttons on the transaction page. |
| `src/lib/db/commission-rates.ts` | Saving a commission rate no longer depends on a database rule that was missing on the live database (fixes the "no unique or exclusion constraint" error). Rates now carry an optional HMO % and HMO peso value. |
| `src/lib/db/schema.ts`, `src/lib/cashflow/pricing.ts`, `src/lib/db/transactions.ts` | Commission rate table gains `hmo_rate_percent` and `hmo_peso_value`; new HMO payment-type list and `computeCommission` rule (cash % for cash visits; HMO peso value or HMO % for HMO visits; none otherwise); used when a visit is saved. |
| `src/app/cashflow/commissions/actions.ts`, `page.tsx`, `src/components/cashflow/commission-rates-manager.tsx` | Commissions page: cash-paying and HMO columns, HMO % and HMO peso inputs, explanatory text. |
| `src/components/ui/modal.tsx` | Tall forms are no longer cut off at the top (the top of the Add transaction form could not be scrolled to). |
| `src/components/cashflow/expense-form.tsx`, `add-expense-modal.tsx`, `cashflow-nav.tsx` | New expense layout with supplier search. |
| `src/components/cashflow/transaction-detail.tsx`, `invoice-view.tsx` | Show all procedures, discounts, VAT, totals, payments with reference no.; the OR breakdown; the printed invoice shows the manual invoice number first. |
| `src/components/cashflow/payments-manager.tsx`, `edit-transaction-modal.tsx`, `add-transaction-modal.tsx` | Work per invoice; reference no. field. |
| `src/components/cashflow/transactions-table.tsx`, `transactions-list.tsx` | Invoice number and "N procedures" under the patient name; Paid/Due badge is per visit; Edit loads the whole visit; Remove removes the whole visit. |
| `src/components/cashflow/procedure-combobox.tsx` | Can be reused for other lists (used for suppliers). |
| `src/components/cashflow/csv-upload.tsx`, `cashflow-overview.tsx` | Branch dropdown and fuller import summary. |
| `scripts/backfill-payments.ts`, `scripts/seed-db.ts` | Updated to the invoice model. |

**October 11 batch (changed):** `cashflow-nav.tsx` (Patients link, no header Add Expenses; Queue link with open-visit count; desktop menu from 1024 px), new `app/cashflow/queue/page.tsx` and `auto-refresh.tsx`, `status-actions.ts` (layout revalidated), `actions.ts` (CSV imports are written to the audit trail), `payment-actions.ts` (payment entries carry the patient), new `app/api/cashflow/open-visits/route.ts` (menu count), `layout.tsx` (no longer loads suppliers / branches for the header), `expenses/page.tsx` (redirect), `expense-actions.ts`, `transactions-tabs.tsx` (tab row scrolls sideways on phones without showing a scrollbar), `transactions/page.tsx` (Expenses, Audit tabs; Today tab redirects; status filter removed; `transactions-toolbar.tsx` rebuilt: the search box stays and a funnel button beside it opens a **Filters** pop-up (type, payment method, dentist, date range; Apply / Reset / Cancel) with the applied filters shown as removable chips under the search box, `transactions-query.ts` and `db/transactions.ts`), `transactions-table.tsx` (no Status column; Edit locked for Cleared visits), `ui/modal.tsx` (new `wide` size, about 1000 px instead of 670 px) used by the Add and Edit transaction pop-ups, `transactions-toolbar.tsx`, `transactions-query.ts`, `transaction-detail.tsx` and `[id]/page.tsx` and `[id]/edit/page.tsx` (status, history, audit, lock), `transaction-form.tsx` and `add-transaction-modal.tsx` (patient prefill, ID on file, duplicate-ID warning), `cashflow-overview.tsx` and `app/cashflow/page.tsx` (queue section removed again; `queue-summary.tsx` deleted), `schema.ts`, `invoices.ts` (status on create / edit / import, audit), `transactions.ts`, `patients.ts`, `payments.ts`, `payment-actions.ts`, `actions.ts`, `patient-actions.ts`.

## 5. What the SQL file changes in your data

**Patients / status SQL (`2026-10-patients-and-visit-status.sql`):** adds `status` and `status_changed_at` to every visit (existing visits: paid in full → Cleared, otherwise For Payment, set once), a check so only the four status names can be saved, the `invoice_status_history` and `audit_log` tables, and indexes on status and on (patient, visit date). Nothing is dropped.


- Creates `patients`, `suppliers`, `invoices`; adds the new columns (nothing is dropped).
- **Patients:** one per distinct name, matched ignoring capitals and extra spaces.
- **Invoices:** every existing transaction becomes its own one-procedure invoice, so nothing changes in how existing records look.
- **Old payments** move onto their invoice.
- **Prices:** each existing line's price (before discount) is set equal to its current amount; lines that already had VAT recorded are marked VAT.
- **Expense labels** are renamed to the clinic's wording: Dental supplies → Dental Supplies, Maintenance & repairs → Repairs, Equipment → Office Supplies & equipment, Other → Miscellaneous.

## 6. Removed or replaced

| Removed / replaced | Why |
|---|---|
| Automatic invoice number (the `YYYYMMDD-####-HHMMSS` generator and the greyed-out field) | Invoice numbers now come from the paper booklet. **The SQL file blanks the old auto-generated numbers** on existing records, because they were not booklet numbers. Numbers typed in or imported are kept. |
| `ManualTransactionInputSchema`, `addTransactionAction`, `updateTransactionAction` | Replaced by the invoice versions (`InvoiceInputSchema`, `createInvoiceAction`, `updateInvoiceAction`). |
| One-payment-per-transaction functions in `payments.ts` (`listPaymentsForTransaction`, `getCollectedTotals`, `deletePaymentsForTransaction`, `listTransactionIdsWithPayments`) | Payments belong to invoices now. |
| Single "Amount paid" box on the form | Replaced by Price per line, discount, and a separate "Amount received" in the payment section. (The stored `amountPaid` keeps its old meaning: the line's total due after discount.) |
| Old expense categories "Dental supplies", "Equipment", "Maintenance & repairs", "Other" | Replaced by the clinic's Particulars list (data re-labelled by the SQL file). |
| Payment methods list on expenses | Replaced by Source of fund: Cash, GCash, Credit Card, BDO Check, Bank Transfer. |

## 7. Things to know

- **Login expiry:** the 30-minute rule is the same for every role and for the Queue screen. A front-desk screen that is only watched (not touched) will show the pop-up at minute 25 and sign out at minute 30; if that is too strict for the Queue screen, tell me after a week of real use and we can lengthen it for that page. The 12-hour limit means a login started at 8:00 always ends by 20:00. A cookie older than this change is given a fresh 30 minutes at its first request.
- **CSV re-imports and old data:** imported rows now use the Visit ID as their id. Data imported *before* this update used a different id, so importing the same old file again would add duplicates next to the existing rows rather than update them. New imports of the Day End report can be repeated safely (same file twice = same result).
- **Editing a visit** cannot lower its total below what has already been paid; the form says to remove a payment first.
- **Saving is not one atomic step** (the database service used does not support that). If saving fails part-way, a new visit is removed again so no half-saved visit is left behind; an edit that fails part-way shows an error and should be re-checked.
- **Removing a transaction from the table removes the whole visit** (all its procedures and payments), and the confirmation says how many procedures.
- **Patients are matched by name only.** Two different people with exactly the same name are treated as one patient.
- **Discount rates** (PWD 20%, Senior 20%, Dental Network Member 5%) are presets to confirm with the accountant; staff can always type a different value.
- **VAT:** fixed at 12% for VATable procedures; there is no VAT field on the transaction form any more (this replaces the earlier "VAT is typed from the receipt" rule). VAT-exempt and non-VAT are the same. A procedure that is not on the list (for example one typed in on the form) is treated as VATable. An old visit whose procedure is no longer on the list keeps the VAT setting it was saved with, but if it is opened and saved again its VAT is recalculated at 12% (a VAT amount typed on it before is replaced). The Add Expenses form still uses the three-option VAT type.
- **Merchant fees on visits saved before this update** were typed by hand, deducted from net collection, or (for a few days) added on top. For visits with a **card payment**, run `yarn db:recompute-fees` once (it only re-works visits that have a card payment; cash / GCash / HMO visits are left alone, and it is safe to repeat) so their fee, net collection and commission follow the included-in-payment rule. **If a card visit was entered under the "fee on top" rule** (for example a ₱1,000 bill saved with a ₱1,050 card payment) it now shows as overpaid; the optional file `scripts/sql/2026-10-card-payments-fee-included.sql` sets those single card payments back to the bill amount (it has a preview query first).
- **PWD / Senior visits saved before this update** were worked out as 20% of the full price. They are not changed automatically; if one is opened and saved again it is recalculated with the new rule (VAT removed first for VAT items).
- **The sample sheet's first block has numbers that do not add up** (see "PWD / Senior discount and VAT"). The system follows the arithmetic and the second block; please confirm with the accountant.

## 8. What was checked, and what to test

**Test (HMO summary and patient HMO details, October 26):** (1) Run the SQL. (2) Patients → Add patient (or Edit patient): fill Birthday, HMO company (pick Maxicare) and HMO account number, Save: the patient page shows them under the name, with the age. (3) Try a birthday in the future: refused. (4) Add a transaction for that patient with payment method **Maxicare**, then open **Day end** for that date: the HMO summary lists the patient under Maxicare with the account number you typed and "LOA pending" (or the LOA number), billed = the visit total, received 0, to collect = billed. (5) Record a payment on the visit: Received and To collect update. (6) Download Excel and CSV: both contain the HMO summary and patient lines. (7) Patients search: type the account number: the patient is found.

**Test (branch from the profile, October 22):** (1) My profile → Branch → pick your branch: "Saved." appears. (2) Open Transactions: the chip reads "Branch: <your branch> (your branch)" and only that branch's visits show. (3) Filters → Branch → *All branches*: every visit shows and the chip goes; the address has `?branch=all`. (4) Clear all / Reset: back to your branch. (5) Set the profile to *No branch (show all branches)*: Transactions shows everything with no chip. (6) As admin, change another user's branch on the Users page and sign in as that user: the list opens on that branch.

**Test (remove from Queue):** (1) Add to Queue a test patient: it appears under **Arrived** with a **Remove** link. (2) Press Remove, then **Keep in queue**: nothing changes. (3) Press Remove, then **Remove visit**: the card disappears, the Queue number in the menu drops by one, and the audit trail shows the removal. (4) Move a card to **On-going**: Remove is still there. (5) Move a card to **For Payment**: no Remove link. (6) Record a payment on an Arrived visit: Remove is hidden on the next refresh, and if shown by an old screen the message says the visit already has a payment. (7) Sign in as a non-admin: Remove still works on Arrived / On-going.

**Checked (October 19, login expiry):** type check and lint — no errors; 25 automated checks of the timing rules pass (details in the login expiry section).

**Test (login expiry):** (1) put `NEXT_PUBLIC_SESSION_IDLE_MINUTES=3` in `.env.local`, restart, sign in. (2) Keep clicking for 3 minutes: no pop-up, still signed in. (3) Stop touching the screen: after 2 idle minutes (1 minute left) the pop-up "Still there?" appears with a countdown; press **Stay signed in** — it closes and you have 3 more minutes. (4) Let the countdown reach 0:00: you land on the login page with the inactivity message, and signing in returns you to the page you were on. (5) Open the Queue and leave it untouched: it must still expire (auto-refresh does not extend). (6) Two tabs: extend in one, the other's pop-up closes; sign out in one, the other goes to login. (7) Remove the setting, restart, confirm a normal login shows no pop-up for the first 25 minutes.

**Checked (October 17 batch):** type check and lint — no errors. Automated checks pass for: HMO detection from payment methods; "LOA pending" never shown on a Cleared visit; Cleared refused without the LOA even for an admin, other moves unaffected; no automatic clearing without the LOA and clearing once it is entered; a paid HMO visit without LOA starts For Payment, an unpaid one today starts Arrived; a check-in with no procedures starts Arrived (also when dated earlier); For Payment / Cleared refused without a procedure or a dentist (an admin can still reopen an old Cleared visit); the form's validation accepts a placeholder-only check-in, trims the LOA and rejects one over 60 characters. The end-of-day figures were run on the clinic's October 3 sheet: **total ₱3,965.00; Cash 300, GCash 600, GoTyme 1,300, POS credit 1,615, Maxicare 150; HMO 150; reservation fees 600; card fee 45.22 and tax 8.08**. The Excel files were opened with a spreadsheet reader (sheet names, bold headings, two-decimal numbers, commas and quotes in text). The commission grouping, totals, rate percentage and the filter fallbacks (swapped dates, unknown branch, default month) were checked. **Not done:** opening the new screens in the browser or against the database — the new columns must be added first — so the layout of the Day end and Commission report pages, the form and the Queue chip have not been seen.

**Test after running the LOA SQL:** (1) Add transaction → payment method **Maxicare**: the HMO authorization box opens. Save with no LOA → the visit shows **LOA pending** on Queue, Transactions and its own page. Move it forward to For Payment; try **Cleared** → refused with the LOA message. Edit transaction, type an LOA number, save → the chip goes and (if paid in full) the visit clears. (2) A **Cash** visit never shows the chip. (3) **Queue → Add to Queue**: fill in the patient and press **Add to queue** → card in Arrived showing no procedures; try to move it to For Payment (after On-going) → refused, asking for a procedure; Edit transaction, add procedures and a dentist → the placeholder disappears; move on normally. (4) **Transactions → Day end**: pick a day with payments, check the total and the method breakdown against the clinic's sheet, download Excel and CSV and open them. (5) **Commissions → Commission report**: a month, then one dentist; the total matches the Performance page; download the Excel (Summary and Detail sheets).

**Checked (October 11 batch):** type check and lint — no errors. 19 automated checks on the status rules pass: today unpaid → Arrived; today paid → Cleared; past unpaid → For Payment; reservation → Cleared; staff can move forward one step but not clear with a balance, back or skip; admin can go back or skip with a reason but also cannot clear with a balance; payment to zero auto-clears and a removed payment reopens; the waiting-time averages (Arrived 15 min, On-going 45 min, For Payment 10 min on a test set, a visit left open 50 hours ignored); the audit comparison names an added ID, a discount change, an added procedure and the total change. The patients list query was printed (not run) to check its SQL. In the browser (nothing saved): the old Expenses address lands on the Expenses tab with the list, search, dates, total and Add Expenses; the menu shows Patients in the old Expenses position with no Add Expenses button; the tab row scrolls on a phone. **October 12, in the browser (nothing saved):** the new Queue page (first called Today) loads with the live visits (1 On-going, 12 For Payment), the menu shows the queue link with the open-visit count (13) and all eight admin items fit at 1024 px. **Not confirmed:** that the old Transactions → Today address redirects (the browser pane was hidden during the check; the code is a plain redirect), the 30-second refresh and the phone layout of the new menu.

**Test after running the status SQL:** (1) Transactions list has no Status column; there is no Status filter either; every old visit is Cleared or For Payment, and status is moved and seen on the Queue page or the visit page. (2) Add a transaction for today with no payment → Arrived; move it → On-going → For Payment; try *Cleared* as staff → refused with the balance; record the payment on the visit → it clears itself; staff cannot edit it; as admin edit it and see the **Audit trail** list the change. (3) **Queue** (top menu) shows the visit in the right column, the number beside it matches the open visits, **Add to Queue** adds one that lands in Arrived, and a status change on another screen appears within 30 seconds; the old Transactions → Today link lands on Queue; the Overview page has no queue section; after a couple of moves the average waits appear on Queue. (4) **Patients**: search a name, open **View invoices** for a patient with several visits and check the totals match the Transactions list; **New transaction for this patient** opens with the name filled in. (5) Pick PWD for a patient who had one before: **Use ID on file** appears; type another patient's ID number → red warning. (6) Admin: merge a test duplicate patient and see the audit line.


**Checked (HMO prices):** type check and lint — no errors. **Not yet opened in the browser**: the page reads the new HMO price table, so it shows "This page couldn't load" until `2026-10-hmo-prices.sql` is run. Suggested test: Add transaction → payment method **Maxicare** → procedure *Oral Prophylaxis (MILD)* fills ₱250 (cash price is ₱1,200); *Root Canal Treatment (Anterior)* stays blank with "No Maxicare price…"; change the method to **Cash** → the OP price becomes ₱1,200 again; type a price by hand and change the method → your price stays. On the Procedures tab open *Consultation* → six HMO boxes show 150 / 200 / 200 / 150 / 150 / 100; change one and see it in History with the HMO name.

**Checked (Procedures tab and form changes):** type check and lint — no errors; number checks give 3 × ₱6,000 = ₱18,000 (VAT ₱1,928.57 inside), quantity 0 treated as 1, ₱800 for a ₱1,120 VAT item with PWD, the discount type's flag winning over the reason's wording, a Promo 10% on 2 × ₱1,200 = ₱2,160, and the OR total equal to the sum of the lines; the teeth reader accepts 11, 12 and "11 and 12", rejects 19 and 56, and suggests quantity 3 for three teeth per tooth and 2 for upper + lower arch. **The screens could not be opened in the browser** — the database does not have the new columns until `2026-10-procedures-settings-and-line-fields.sql` is run, so the page shows "This page couldn't load" until then. Nothing was saved anywhere.

**Checked (leftover procedures, clearing, merchant fee in the payment, VAT only in totals):** type check and lint — no errors; the money rules give fee ₱175 and net ₱3,325 for a ₱3,500 POS BDO payment (paid in full, nothing on top), ₱34 on ₱1,000 by Maya and ₱0 by cash; in the browser the VAT field is gone from the line, picking *Bite Raiser per arch* fills ₱10,000 and the Total due shows "VAT (12%), included in the total ₱1,071.43", and clearing the procedure puts the Total due back to ₱0.00 (nothing was saved). The browser list still showed the leftover procedures (Articaine(2), Back job Resto + Periapical Xray, …) because the SQL had not been re-run yet.

**Checked (procedure list and fixed 12% VAT):** type check and lint — no errors; the money rules give VAT ₱964.29 on a ₱9,000 VATable line, no VAT on a ₱1,200 non-VAT line, ₱800 for a ₱1,120 VAT item with PWD, and ₱9,000 / VAT ₱964.29 for a ₱10,000 VAT item with a 10% promo; the Add transaction form was opened in the browser: the VAT input is gone and shows a read-only "12% VAT" tag (nothing was saved). The new procedure list is **not** visible yet — it appears after `2026-10-procedure-pricelist.sql` is run.

**Checked (uploads, invoice number):** type check and lint — no errors; the Add transaction form was opened in the browser and shows the Invoice number field and the two file choosers (nothing was saved or uploaded). Not yet tried with a real file, because the attachments SQL has to be run first.

**Checked (commission rates):** type check and lint — no errors; the commission rule gives ₱100 for a ₱1,000 cash consultation at 10%, ₱0 for the same consultation billed to Maxicare, ₱150 for a ₱1,500 OP billed to Maxicare, ₱0 for OP paid cash, ₱50 for a Medicard Panoramic xray (and ₱0 if paid by GCash), and ₱0 with no rate set. The Commissions page itself was **not** opened, because it needs the new SQL file run first.

**Checked (earlier work):** type check — no errors; lint — no errors; money rules — 30 automated checks passed (including the rounding case 8.075 → 8.08); the PWD/Senior and VAT rules were run against the figures in the "Auto compute OR" sheet and give the sheet's results (see the PWD / Senior section); the Add transaction form was opened in the browser and a ₱1,120 item with VAT 120 shows vatable sales ₱1,000 / VAT ₱120, and with PWD correctly shows ₱800 (nothing was saved); the Day End file — 9 lines, 0 errors, total matches.

**Not yet done:** running the SQL, and trying it in the browser. Suggested walk-through after the SQL is run:

000. **Procedures tab (latest batch):** open Transactions → Procedures; 66 procedures with prices and the right basis (Veneers per tooth, Dentures per arch, Consultation flat). As admin edit a price (say Consultation ₱600 → ₱650): it saves, **History** shows 600 → 650 with your name; change it by more than 25% and you are asked to confirm; add a test procedure and hide it (it disappears from the dropdown on Add transaction); a procedure with transactions cannot be deleted. Open an **old** transaction, Edit it and save without changes: its amounts and VAT do not move even though you changed the price list. Sign in as staff: the tab is read-only.
000a. **Add transaction:** pick *Jacket Crown (Plastic)*, type teeth `11, 12` → quantity 2 and Sub total ₱10,000; change quantity to 3 by hand, then change the teeth — quantity stays 3. Type `19` → error. Pick *PWD* → ID type and ID number appear and are required; the 20% rule shows "VAT is removed first…". Add a second procedure and use **Apply to all lines**. Set a recall date, save, and see the patient on **Recalls due**; add another visit for that patient and it disappears from the list.

00. After running the attachments SQL: add a transaction with an invoice photo and a proof of payment, open it and check both files open; try a PDF over 4 MB (refused).
00a. After running the procedure SQL: open Add transaction, pick *Root Canal Treatment (Anterior)* — the price fills in ₱9,000 and the Total due shows "VAT (12%), included in the total ₱964.29"; edit the price to ₱8,500 and it recalculates; pick *Consultation* — ₱600 and no VAT row. The procedure dropdown should list only the new 66.
0. After running the commission SQL: open **Commissions** and confirm each dentist has their rates (Dawn: Consultation 10%, Ortho Install 25%, OP HMO 10%, Panoramic xray HMO ₱50 …). Then add a cash **Consultation** for a dentist (commission = 10% of the net collection) and the same consultation paid by **Maxicare** (commission ₱0).
1. Add a transaction with **two procedures**, one with a 20% PWD discount and one VAT. Check the totals, then save and open it — it should show two lines, a payment and the OR breakdown. Also try a ₱1,250 non-VAT item with PWD (expect ₱1,000) and a ₱1,120 VAT item with PWD (expect ₱800).
2. Type the start of an existing patient's name — they should appear with their last visit date; a new name should show "New patient".
3. Enter an invoice number that is already used at the same branch — it should warn in red and the Add button should be disabled; change the branch or the number and it should enable again.
4. Import the Day End file with "Auto-detect" — it should say Marikina and show the visits as paid.
5. Add an expense with VAT and no TIN — it should refuse; add the same expense twice — it should warn.
6. Print an invoice with a discount and a VAT line.

## 9. Not done yet (deferred)

**From October 19, login expiry:** sign in again inside the pop-up without losing a half-filled form · one shared message for saves refused with "You must be signed in" · limit on failed password attempts · sign-in / sign-out in the audit trail · a longer limit for the Queue screen if the clinic asks.

**From October 19:** screenshot-based mapping of the sheet to the price list should be confirmed by Kim (see the assumptions above) · commission is still saved per line at save time, so a tier change needs `yarn db:backfill-links` for older visits.

**From the October 17 spec, waiting for the clinic:** *Close day* with a lock, the cash count with variance, a PDF of the day-end report, commission **payout batches** and a dentist-only commission view, an LOA **worklist** (a filter for visits still waiting, oldest first) and a daily reminder, the **LOE** meaning and any rule for it.

**From the October 11 plan, waiting for your decision:** `front_desk` / `cashier` roles (today any signed-in user moves a visit forward; admin goes back) · ID **photo** and an **admin override with a reason** for a patient with no ID · HMO member / approval number and co-pay · birth date on the patient · a printable patient statement · month-end close · notifications. The audit trail does not record CSV imports line by line, only the visits and payments they create through the normal screens.


Showing the last invoice number used as a hint · a "missing invoice no." filter · changing the Visit ID format · Head Office branch · switching the dashboard's patient card to use the patients table · importing the expenses spreadsheet.
