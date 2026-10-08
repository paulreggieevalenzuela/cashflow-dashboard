# Implementation Updates — Transactions, Patients, Invoices & Expenses

**Project:** Cashflow application — ADT Dental Clinic
**Date:** October 8, 2026
**Follows:** `TRANSACTION_EXPENSE_UPDATES_PLAN.md` (the plan written before implementation)
**Status:** Code written and checked (type check and lint both clean; the Day End file was run through the new importer). **Not yet run against the database or tried in the browser** — see "Before you start the app" and "What to test".

---

## 1. Before you start the app (run order)

1. **Run the SQL file in the Neon SQL Editor:** `scripts/sql/2026-10-invoices-patients-suppliers.sql`. It is safe to run more than once. The updated app reads the new columns on every transaction query, so it must be run **before** the app is started.
2. **Also run `scripts/sql/2026-10-commission-rates-unique.sql`** (same place, also safe to repeat). It adds a missing database rule that stops one dentist + procedure from having two commission rates. Without it, setting a commission rate failed with "there is no unique or exclusion constraint matching the ON CONFLICT specification"; the app no longer needs it to save a rate, but the rule should be there.
3. **Start the app** as usual.
4. **Optional — old visits that show "Not paid":** `yarn db:backfill-payments` records one payment equal to the total due for every visit that has no payment at all. Only run it if those old visits really were paid in full.
5. **Run `scripts/sql/2026-10-commission-rates-from-sheet.sql`** (same place, safe to repeat) **before opening the Commissions page.** It adds two HMO columns to the commission rates table and loads the rates from the clinic's "LIST - COMMISSION" sheet (see "Commission rates per dentist and procedure" below). It also **adds the 7 dentists on the sheet** as dentist accounts (Dawn Rufino Rey Teope, Rearosa Ayapana, Beatrice Kiara Bandayrel, Kyla Denise Ahmad, Katherine Roldan, James Russel Banawa, Anna Beatrice Perez) when they don't exist yet, so they appear in the Dentist dropdown and on the Commissions page. These are **profile-only accounts: nobody can sign in as them** (placeholder e-mail ending in `@adt-dental.invalid`, and a password that can't be typed). The bottom of the file shows two checks: any sheet dentist still without a matching dentist account (their rates were not loaded — e.g. an existing account with the same name but a different role), and how many rates each dentist now has.
6. **Run `scripts/sql/2026-10-attachments.sql`** (same place, safe to repeat) before using the new invoice / receipt upload buttons (see "Invoice and receipt uploads" below). Until it is run the transaction page still opens, just without files, and an upload says the SQL file must be run first.
7. **Then run `yarn db:backfill-links` once**, so visits that are already saved pick up the new rates. Commission is worked out when a visit is saved, so without this only visits saved from now on use the new rates.

---

## 2. What the system does now

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
| **VAT / Non-VAT** | Per line, one **VAT number field**: **leave it empty for non-VAT / VAT-exempt** (they are treated the same); **type the VAT amount in pesos** (as shown on the receipt, e.g. 120.00) and the line automatically becomes a VATable transaction. The VATable amount is the price minus that VAT. The VAT is **not fixed at any percentage** — it is whatever is typed (nothing is suggested or pre-filled, and no 12% note is shown). VAT can't be more than the price. The form, the transaction page and the printed invoice also show the full **official-receipt breakdown** (Vatable sales, VAT-exempt sales, VAT, Less: VAT, Net of VAT, Less: Discount (SC, PWD), Add: VAT, Total amount due), following the "Auto compute OR" sheet. |
| **Procedures remember price and VAT** | Each procedure remembers the price and whether it was VAT when it was last sold, and pre-fills the price the next time it is picked (only into an empty price field). VAT is never pre-filled; it is typed each time. |
| **Patients table + typeahead** | New `patients` table. The Patient field searches as you type (names starting with the text first, then names containing it), shows each patient's last visit date, and offers "+ New patient" when the name isn't on file. Existing patients were created from your current data by the SQL file. |
| **New / Returning** | Worked out automatically: *Returning* if the patient has an earlier visit on file. A reservation fee alone does not count as a visit; a zero-amount follow-up does. A badge next to the patient field shows the result, and the Visit type dropdown can override it. |
| **Invoice number (manual)** | Typed in from the paper booklet. **Not required — leaving it blank means there is no invoice for that transaction** (the transaction page then shows "No invoice"). When a number is typed it is checked for duplicates (capitals are ignored): if it is already used at the same branch, the form warns when you leave the field and refuses to save. |
| **Payments belong to the invoice** | One payment can cover several procedures. Payments carry a **reference number** (card slip / GCash / bank transfer) as proof of payment. Recording more than the balance due is refused. |
| **Merchant fee (automatic) / withholding tax (removed)** | The **Merchant fee and Withholding tax fields are gone from the form.** The merchant fee is worked out automatically from the payment type (see "Merchant fee" below), added on top of the bill for the patient to pay, and shared across the procedure lines in proportion to their totals, to the centavo. |
| **Add Expenses (new layout)** | Follows the clinic's Operating Expenses sheet: Date, Particulars, Source of fund, Supplier (searchable, remembers address and TIN), Reference no., Services or Goods, VAT type with VAT computed, Description, Remarks, Branch. A VAT expense requires the supplier name and TIN. A likely duplicate (same date, amount and supplier — or same supplier and reference no.) shows a warning with "Add it anyway". |
| **CSV upload screen** | New "Branch for this file" dropdown (default: auto-detect from the file title). The result shows how many lines, visits and payments were imported and which branch they went to. |

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

**The fee is added on top of the bill, and the patient must pay it.** The fee is the percentage of the bill paid by card, and the card total is the bill plus the fee. Example: a ₱1,000 bill at 5% (POS BDO) → fee ₱50 → the patient pays **₱1,050**. Paying only ₱1,000 by card is **not fully paid** — ₱47.62 of the bill is still due (the system treats ₱1,000 as ₱952.38 for the bill + ₱47.62 fee, so the remaining ₱47.62 would need ₱50.00 by card). So the **amount typed on a card payment is the full amount charged to the card, fee included**; the part that pays the bill is that amount ÷ (1 + rate). Cash, GCash and HMO payments have no fee and apply in full. A visit paid part in cash and part by card is charged the fee only on the card part. Sales, net collection and commission stay on the bill (₱1,000 in the example), because the patient — not the clinic — pays the fee.

Where you see it: the form's **"Paid in full"** shortcut fills the right amount for the chosen payment type (₱1,050 for a ₱1,000 bill by BDO card) and the note under it spells out "to pay the ₱1,000 in full the patient pays ₱1,050 — of the amount entered, X pays the bill and Y is the merchant fee". The Payments box has the same note and a **"Pay balance in full"** shortcut, and its list shows "incl. ₱50 fee" on card payments. "Collected" and "Balance due" count only the part that pays the bill. The transaction page shows **Merchant fee** and **Total paid by patient**, and the printed invoice shows the merchant fee and the total paid. The fee is recalculated whenever a payment is added or removed, when a visit is edited and on CSV import; imported card payments are recorded as the file's amount plus the fee, so imported visits still read as fully paid. Adding a payment that is more than the balance (counting the fee) is refused with the most that can be entered.

The sheet lists "MAYA" but the app had no Maya payment type, so **POS (MAYA) – Credit** and **– Debit** were added to the payment types. The percentages are kept in one place in the code (`MERCHANT_FEE_RATES` in `src/lib/cashflow/pricing.ts`); if a rate changes, it is a one-line change. **Withholding tax** is no longer asked for; visits that already have some keep it and it still comes off net collection.

### Commission rule

Commission = **(total − discount − fees) × commission rate**. "Total − discount" is the line's price after any discount, and "fees" are any withholding tax already on older visits (and, on older imported files, a merchant fee that was deducted). The automatic card fee is added on top for the patient, so it does not reduce net collection or commission — the same figure the system already calls net collection. Discounts therefore reduce commission automatically. Applies to dentist commission and to staff bonus. This is the rule the app already used, kept as is.

### Invoice and receipt uploads

Photos and PDFs can now be attached to a transaction in two places, and they are kept in the database (so no extra storage service or keys are needed):

- **The paper invoice**, attached to the visit. **Proof of payment** (card slip, GCash or bank-transfer screenshot), attached to a specific payment.
- **When adding a transaction:** the form has *Invoice photo / PDF (optional)* under the invoice number and *Proof of payment (optional)* next to the payment's reference no. The files are chosen first and uploaded as soon as the transaction is saved; the proof is attached to that visit's payment. If a file fails to upload, the transaction is still saved and the form says which file to attach again.
- **On an existing transaction:** the transaction page has an *Invoice / receipt files* box with an *Attach invoice photo / PDF* button, and each payment has an *Attach proof of payment* button. Files open in a new tab; **only admins can remove a file**.
- **Rules:** JPG, PNG, WebP or PDF, up to **4 MB** each. Phone photos are shrunk in the browser (longest side 1,800 px, saved as JPEG) so they are normally a few hundred KB; a PDF over 4 MB is refused. Opening a file requires being signed in. Removing a visit or a payment removes its files with it.
- **Limits of keeping files in the database:** fine for photos and slips at the clinic's volume (roughly a few thousand files); if the number of files grows very large, they can be moved to cloud storage later without changing these screens.
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
| **No discount, VAT item** | VATable sales = price − the VAT typed; VAT = the amount typed. Total due = price (VAT is *added back* on the receipt, so the total does not change). |
| **Promo / Dental Network Member / Other discount** | A plain reduction of the price. A VAT item keeps its VAT, now worked out on the lower amount. |
| **PWD or Senior citizen, non-VAT item** | 20% of the price is taken off. Total due = price − 20%. Example from the sheet: ₱1,250 − ₱250 = **₱1,000**. |
| **PWD or Senior citizen, VAT item** | VAT is removed first (the VAT amount typed on the line; only for older visits saved as VAT without an amount is the standard price ÷ 1.12 used), the **20% is taken off that VAT-free price**, and no VAT is added back — the sale becomes VAT-exempt. Example: ₱1,120 → net ₱1,000 → less ₱200 → **₱800** (Less: VAT ₱120). |

The receipt breakdown adds the lines up as: **Total sales (VAT inclusive)** − **Less: VAT** = **Amount: net of VAT**; then − **Less: Discount (SC, PWD)** + **Add: VAT** = **Total amount due**. *Vatable sales* are VAT items without a PWD/Senior discount; *VAT-exempt sales* are non-VAT items plus PWD/Senior items (shown before their discount, as on the sheet).

**Checked against the sheet:** the second block reproduces exactly — regular ₱2,000 non-VAT → due ₱2,000; PWD ₱1,250 → discount ₱250 → due ₱1,000. In the first block the PWD column's numbers also reproduce (Less: VAT ₱26.79, net ₱3,723.21, discount ₱744.64) **but its Total Amount Due (₱3,005.36) does not add up** — ₱3,723.21 − ₱744.64 is ₱2,978.57 (the sheet takes ₱3,750 − ₱744.64, which puts the ₱26.79 VAT back in). The system follows the arithmetic, so it gives ₱2,978.57 when both lines are PWD, or ₱3,050.00 when only the ₱3,500 item is PWD and the ₱250 VAT item is regular. That first block's regular column also shows VAT of ₱375 on ₱3,500 (that is 10.7%, not 12%; 12% would be ₱415.18 on ₱3,875). **Please confirm with the accountant which way the first block should read.**

How it is applied: the discount is per procedure line, so a visit can mix a PWD procedure with regular ones. PWD/Senior is recognised by the discount reason (the "PWD" and "Senior citizen" choices). Commission, as before, is taken on what the line was actually charged less fees, so a PWD/Senior line produces a lower commission because the VAT and the 20% are both gone from its price.

### Left out on purpose

- **Head Office branch** — not added, as agreed.

---

## 3. Files created (19)

| File | Purpose |
|---|---|
| `scripts/sql/2026-10-invoices-patients-suppliers.sql` | Creates the new tables and columns, and fills them from existing data (see section 5). |
| `scripts/sql/2026-10-commission-rates-unique.sql` | Adds the missing unique (dentist, procedure) rule on commission rates; if the same pair somehow has two rates, keeps the latest. |
| `scripts/sql/2026-10-attachments.sql` | Creates the `attachments` table that holds uploaded invoice photos / receipts. |
| `src/lib/db/attachments.ts`, `src/lib/cashflow/attachment-rules.ts`, `src/lib/cashflow/attachment-client.ts` | Saving / listing / removing files; the shared file rules (types, 4 MB); the browser-side photo shrinking and upload. |
| `src/app/api/cashflow/attachments/route.ts`, `[id]/route.ts` | Upload endpoint; open (sign-in required) and remove (admin only) a file. |
| `src/components/cashflow/attachments-panel.tsx`, `file-picker.tsx` | The upload / list box on the transaction page and the file chooser on the Add transaction form. |
| `scripts/sql/2026-10-commission-rates-from-sheet.sql` | Adds the HMO columns to commission rates, adds the 7 dentists on the sheet as profile-only dentist accounts, and loads every dentist's rates from the "LIST - COMMISSION" sheet (adds missing procedures, safe to repeat). |
| `src/lib/cashflow/pricing.ts` | One shared set of money rules (discount, line total, VAT split, **PWD/Senior rule, official-receipt breakdown**, fee sharing) used by both the form and the server, so what staff see is what gets saved. |
| `src/lib/cashflow/invoice-schema.ts` | Validation for the new transaction form (lines, discount rules, optional invoice number (duplicate-checked), first payment). |
| `src/lib/db/invoices.ts` | Create / edit / delete a visit; invoice totals; invoice-number duplicate check; the new CSV import that groups lines into invoices and records payments. |
| `src/lib/db/patients.ts` | Patient search, find-or-create, and the New/Returning rule. |
| `src/lib/db/suppliers.ts` | Supplier list and find-or-create (existing details are never overwritten; blanks are filled in). |
| `src/app/cashflow/patient-actions.ts` | Server actions for the patient search and the New/Returning badge. |
| `src/components/cashflow/patient-combobox.tsx` | The patient typeahead field. |
| `src/components/cashflow/or-breakdown.tsx` | The official-receipt breakdown block shown on the form, the transaction page and the printed invoice. |

## 4. Files updated (58)

| File | What changed |
|---|---|
| `src/lib/db/schema.ts` | New `patients`, `suppliers`, `invoices` tables. New columns on `transactions` (invoice, patient, line number, list price, discount mode/value/amount/reason, VAT type), `payments` (invoice, reference no.; transaction link now optional), `procedures` (default price, default VAT type), `expenses` (supplier, reference no., remarks, nature, VAT type, vatable amount, VAT amount). |
| `src/lib/cashflow/schema.ts` | Transaction shape gains the optional new fields. |
| `src/lib/cashflow/parse-csv.ts` | Day End layout support (stops at Breakdown/Total, infers type, derives month/year, reads branch from title). Row ids are now the Visit ID itself (see section 6). |
| `src/lib/cashflow/constants.ts` | Discount presets; expense categories now use the clinic's own "Particulars" wording; Source-of-fund list; Services/Goods. |
| `src/lib/cashflow/expense-schema.ts` | Supplier, reference no., remarks, nature, VAT type; VAT requires supplier name and TIN. |
| `src/lib/cashflow/payment-schema.ts` | Reference number added. |
| `src/lib/db/transactions.ts` | Handles the new columns; visit IDs count distinct visits; deleting a visit's last line removes the empty invoice; several distinct transaction numbers can be issued for one visit. |
| `src/lib/db/payments.ts` | Rewritten around invoices; reference no.; imported payments can be replaced on re-import without touching typed-in ones. |
| `src/lib/db/procedures.ts` | Procedures carry their default price and VAT type. |
| `src/lib/db/expenses.ts` | New columns; likely-duplicate check. |
| `src/app/cashflow/actions.ts` | Create / edit / remove a visit, invoice-number check, load a visit for editing, CSV import with branch auto-detect. |
| `src/app/cashflow/expense-actions.ts` | Supplier handling, VAT worked out on the server, duplicate warning. |
| `src/app/cashflow/transactions/payment-actions.ts` | Payments recorded against the invoice; overpayment refused; reference no. |
| `src/app/cashflow/transactions/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`, `[id]/invoice/page.tsx` | Work with whole visits (any line of a visit opens the whole visit). |
| `src/app/cashflow/page.tsx`, `layout.tsx` | Pass branches to the CSV upload and suppliers to Add Expenses. |
| `src/components/cashflow/transaction-form.tsx` | Rebuilt: invoice number, patient typeahead and badge, procedure lines, discount, VAT, live totals with the OR breakdown, fees, payment section. Price, VAT (number) and Discount share one row; Dentist, Visit type and Branch share one row. |
| `src/lib/db/transactions.ts`, `src/lib/cashflow/dashboard-metrics.ts`, `src/components/cashflow/cashflow-overview.tsx`, `dashboard/dashboard-cards.tsx` | Transactions list shows one row per visit; transaction counts on the dashboard and Performance tables count visits. |
| `scripts/recompute-merchant-fees.ts`, `scripts/backfill-payments.ts`, `package.json` | New `yarn db:recompute-fees` one-time refresh of merchant fee / net collection on visits with a card payment; the payment backfill now includes the fee on card visits. |
| `src/lib/cashflow/constants.ts`, `src/lib/cashflow/invoice-schema.ts`, `src/lib/db/payments.ts`, `src/app/cashflow/transactions/payment-actions.ts`, `src/components/cashflow/payments-manager.tsx`, `invoice-view.tsx` | Merchant-fee rates and Maya payment types; Merchant fee / Withholding tax removed from the transaction input; fee added on top of the amount paid and recalculated when payments change; fee and total paid shown on the form, payments list and printed invoice. |
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

## 5. What the SQL file changes in your data

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

- **CSV re-imports and old data:** imported rows now use the Visit ID as their id. Data imported *before* this update used a different id, so importing the same old file again would add duplicates next to the existing rows rather than update them. New imports of the Day End report can be repeated safely (same file twice = same result).
- **Editing a visit** cannot lower its total below what has already been paid; the form says to remove a payment first.
- **Saving is not one atomic step** (the database service used does not support that). If saving fails part-way, a new visit is removed again so no half-saved visit is left behind; an edit that fails part-way shows an error and should be re-checked.
- **Removing a transaction from the table removes the whole visit** (all its procedures and payments), and the confirmation says how many procedures.
- **Patients are matched by name only.** Two different people with exactly the same name are treated as one patient.
- **Discount rates** (PWD 20%, Senior 20%, Dental Network Member 5%) are presets to confirm with the accountant; staff can always type a different value.
- **VAT field:** the typed VAT is the VAT contained in what the patient pays for that line (after any promo discount). VAT is never pre-filled or suggested. The Add Expenses form still uses the three-option VAT type.
- **Merchant fees on visits saved before this update** were typed by hand or deducted from net collection. For visits with a **card payment**, run `yarn db:recompute-fees` once (it only re-works visits that have a card payment; cash / GCash / HMO visits are left alone, and it is safe to repeat) so their fee, net collection and commission follow the add-on rule. **Existing card payments will now read as part-paid**: a card payment of exactly the bill (e.g. ₱1,000 on a ₱1,000 bill by BDO) leaves the fee unpaid, so the visit shows a small balance until the fee is paid (or the payment is corrected to include it). Otherwise a visit is refreshed when it is edited or a payment on it is added or removed.
- **PWD / Senior visits saved before this update** were worked out as 20% of the full price. They are not changed automatically; if one is opened and saved again it is recalculated with the new rule (VAT removed first for VAT items).
- **The sample sheet's first block has numbers that do not add up** (see "PWD / Senior discount and VAT"). The system follows the arithmetic and the second block; please confirm with the accountant.

## 8. What was checked, and what to test

**Checked (uploads, invoice number):** type check and lint — no errors; the Add transaction form was opened in the browser and shows the Invoice number field and the two file choosers (nothing was saved or uploaded). Not yet tried with a real file, because the attachments SQL has to be run first.

**Checked (commission rates):** type check and lint — no errors; the commission rule gives ₱100 for a ₱1,000 cash consultation at 10%, ₱0 for the same consultation billed to Maxicare, ₱150 for a ₱1,500 OP billed to Maxicare, ₱0 for OP paid cash, ₱50 for a Medicard Panoramic xray (and ₱0 if paid by GCash), and ₱0 with no rate set. The Commissions page itself was **not** opened, because it needs the new SQL file run first.

**Checked (earlier work):** type check — no errors; lint — no errors; money rules — 30 automated checks passed (including the rounding case 8.075 → 8.08); the PWD/Senior and VAT rules were run against the figures in the "Auto compute OR" sheet and give the sheet's results (see the PWD / Senior section); the Add transaction form was opened in the browser and a ₱1,120 item with VAT 120 shows vatable sales ₱1,000 / VAT ₱120, and with PWD correctly shows ₱800 (nothing was saved); the Day End file — 9 lines, 0 errors, total matches.

**Not yet done:** running the SQL, and trying it in the browser. Suggested walk-through after the SQL is run:

00. After running the attachments SQL: add a transaction with an invoice photo and a proof of payment, open it and check both files open; try a PDF over 4 MB (refused).
0. After running the commission SQL: open **Commissions** and confirm each dentist has their rates (Dawn: Consultation 10%, Ortho Install 25%, OP HMO 10%, Panoramic xray HMO ₱50 …). Then add a cash **Consultation** for a dentist (commission = 10% of the net collection) and the same consultation paid by **Maxicare** (commission ₱0).
1. Add a transaction with **two procedures**, one with a 20% PWD discount and one VAT. Check the totals, then save and open it — it should show two lines, a payment and the OR breakdown. Also try a ₱1,250 non-VAT item with PWD (expect ₱1,000) and a ₱1,120 VAT item with PWD (expect ₱800).
2. Type the start of an existing patient's name — they should appear with their last visit date; a new name should show "New patient".
3. Enter an invoice number that is already used at the same branch — it should warn, then refuse to save.
4. Import the Day End file with "Auto-detect" — it should say Marikina and show the visits as paid.
5. Add an expense with VAT and no TIN — it should refuse; add the same expense twice — it should warn.
6. Print an invoice with a discount and a VAT line.

## 9. Not done yet (deferred)

Showing the last invoice number used as a hint · a "missing invoice no." filter · changing the Visit ID format · Head Office branch · switching the dashboard's patient card to use the patients table · importing the expenses spreadsheet.
