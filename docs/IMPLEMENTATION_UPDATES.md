# Implementation Updates — Transactions, Patients, Invoices & Expenses

**Project:** Cashflow application — ADT Dental Clinic
**Date:** October 9, 2026
**Follows:** `TRANSACTION_EXPENSE_UPDATES_PLAN.md` (the plan written before implementation)
**Status:** Code written and checked (type check and lint both clean; the Day End file was run through the new importer; the Procedures tab and form changes were checked with number tests). **Not yet run against the database or tried in the browser** — see "Before you start the app" and "What to test".

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
11. **Run `yarn db:backfill-links` again afterwards** (optional). Saved visits keep their own procedure link; the backfill now uses that link first and the name only for lines that have none.

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

## 3. Files created (22 earlier + 12 in the latest batch)

| File | Purpose |
|---|---|
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

## 4. Files updated (63 earlier + latest batch)

| File | What changed |
|---|---|
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
- **VAT:** fixed at 12% for VATable procedures; there is no VAT field on the transaction form any more (this replaces the earlier "VAT is typed from the receipt" rule). VAT-exempt and non-VAT are the same. A procedure that is not on the list (for example one typed in on the form) is treated as VATable. An old visit whose procedure is no longer on the list keeps the VAT setting it was saved with, but if it is opened and saved again its VAT is recalculated at 12% (a VAT amount typed on it before is replaced). The Add Expenses form still uses the three-option VAT type.
- **Merchant fees on visits saved before this update** were typed by hand, deducted from net collection, or (for a few days) added on top. For visits with a **card payment**, run `yarn db:recompute-fees` once (it only re-works visits that have a card payment; cash / GCash / HMO visits are left alone, and it is safe to repeat) so their fee, net collection and commission follow the included-in-payment rule. **If a card visit was entered under the "fee on top" rule** (for example a ₱1,000 bill saved with a ₱1,050 card payment) it now shows as overpaid; the optional file `scripts/sql/2026-10-card-payments-fee-included.sql` sets those single card payments back to the bill amount (it has a preview query first).
- **PWD / Senior visits saved before this update** were worked out as 20% of the full price. They are not changed automatically; if one is opened and saved again it is recalculated with the new rule (VAT removed first for VAT items).
- **The sample sheet's first block has numbers that do not add up** (see "PWD / Senior discount and VAT"). The system follows the arithmetic and the second block; please confirm with the accountant.

## 8. What was checked, and what to test

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

Showing the last invoice number used as a hint · a "missing invoice no." filter · changing the Visit ID format · Head Office branch · switching the dashboard's patient card to use the patients table · importing the expenses spreadsheet.
