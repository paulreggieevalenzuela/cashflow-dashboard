# Transaction Workflow & Price List — Implementation Plan

**Project:** Cashflow application — ADT Dental Clinic
**Date:** October 9, 2026
**Status:** Phases 0, 1, 2, 3 (HMO prices, without a separate payers table: the price table is keyed by the HMO's payment-type name), 4 and 4b are **built** (October 9, 2026; see `IMPLEMENTATION_UPDATES.md` — database file `2026-10-procedures-settings-and-line-fields.sql` must be run first). Phases 5 (status and roles), 6 (clinical notes) and 7 are still plan only.
**Based on:** the meeting notes for Add Transaction (internal tracking status, front desk / cashier roles, PWD / Senior ID, discount list, field order, procedure list tab, price changes) and the code as it stands today (price list of 66 procedures, fixed 12% VAT, merchant fee included in the payment).
**Reference screen reviewed:** the screenshot of the other system's "New Progress Note" (visit date, patient, recall date and reason, service lines with teeth / unit price / sub total / discount / net total, remarks, billing summary, patient signature, transcribe, save draft; the clinic has since said the signature is not needed — only the ID number). Every field is checked against our form in section 3.7 and the plan is updated for it.

---

## 1. Summary

| # | Request | Recommended solution | Size |
|---|---|---|---|
| 1 | Quantity and **Teeth** on a procedure line | Add a **Teeth** field (tooth numbers) and a **quantity** to each line. For per-tooth procedures the quantity follows the number of teeth entered; line total = unit price × quantity − discount; VAT on the total. | M |
| 2 | Internal tracking status (On-going, Arrived, For Payment, Cleared) | One status per **visit (invoice)**, with a history log (who, when). Natural order Arrived → On-going → For Payment → Cleared. "Cleared" only when the balance is zero. | M |
| 3 | Front desk enters, cashier takes payment and closes | Two new roles (`front_desk`, `cashier`) with a permission table enforced **on the server**, not only by hiding buttons. | M–L |
| 4 | PWD / Senior: ID number mandatory | ID number (and ID type) required on the visit whenever a PWD or Senior discount is used; printed on the invoice; optional ID photo. | S |
| 5 | Discount dropdown: PWD, Senior, Promo | A small managed list of discount types (starting with those three). Each type says whether it is statutory (VAT removed first, ID required) — replacing today's matching on the typed reason text. | S–M |
| 6 | Field order: patient, type → **payment** → procedures; different HMO, different price | A **payer** choice (cash-paying or a named HMO) comes before the procedures and decides which price column fills the lines. Needs prices per payer. | M–L |
| 7 | Procedures as a new tab on the Transactions page | "Transactions \| Procedures" tabs. The Procedures tab is the price list: search, add, edit, switch on/off. Admin edits; everyone else reads. | M |
| 8 | Price changes without touching past transactions | Past lines already keep their own saved price. Add price history, an "effective from" rule for new transactions only, and fix **two places where an old transaction could still change** (section 6.3). | S–M |
| 9 | **Fields in the reference screen** that we do not have: recall date and reason, remarks, bill discount, voice transcription (decided: no patient signature, no drafts for now) | Recall date + reason on the visit (with a "recalls due" list); plain multi-line remarks on the cash-flow form; "apply to all lines" instead of a separate bill discount; **clinical progress notes with rich text and voice transcription as a separate feature (3.9)**. Details in 3.7–3.9. | M (+ L for notes) |

Eleven decisions are listed in section 8; three are already settled (3, 9, 10) and one has a small point left. Numbers 1, 2, 4 and 6 change the design if answered differently.

---

## 2. Where we are today (so the plan fits the code)

- **Price list:** the `procedures` table holds the 66 procedures with one cash price and a VAT setting each. Picking one on the form fills the price (editable). There is no screen to maintain it — it is changed through SQL files.
- **Saved lines already keep their own price.** Each transaction line stores the price it was sold at (`list_price`), its discount, its VAT type and its amounts. Changing a procedure's price in the list does not rewrite them. Two exceptions are fixed in phase 0 (6.3).
- **HMO prices are not in the app.** The sheet has a price per HMO for Consultation, OP, PF, TF and extraction, but only the cash column was loaded.
- **Discounts:** presets are PWD 20%, Senior citizen 20%, Dental Network Member 5%, Promo, Other. PWD / Senior are recognised by matching the reason text. There is no ID number anywhere.
- **Roles:** `admin`, `dentist`, `staff`. Almost every action is allowed to any signed-in role; deleting and a few settings are admin-only.
- **No visit status.** A visit only reads Paid / Part-paid / Not paid, worked out from payments.
- **Form order today:** invoice number, date, patient, transaction type, dentist, branch → procedures → total → payment.
- **No quantity, no teeth.** One line is one procedure at one price, with no tooth numbers.
- **No recall date and no drafts.** A visit is either saved or not saved.

---

## 3. Add Transaction — each change in detail

### 3.1 Quantity and Teeth

**Why:** per-surface fillings (₱1,200 per surface), per-tooth veneers and crowns, extra anesthesia (₱100 each), additional pontics (₱1,000 each), additional whitening cycles. Today staff retype the price by hand. The reference screen has a **Teeth** column ("Enter tooth #") on every line, so the clinic is used to entering teeth per procedure.

- **Teeth** (new, optional text per line): the tooth numbers worked on, for example `11, 12, 21`, or `upper arch`, `lower arch`, `full mouth`. Validated against the **FDI** numbering system (decided): permanent teeth 11–48, and primary teeth 51–85 for pediatric work. It is stored on the line and printed on the invoice; reports and commission ignore it.
- **Quantity** (new, whole number, 1 or more, default 1).
- **Price basis per procedure** (new column on the price list): each procedure says what its price is *per* — `flat` (one price for the whole procedure), `tooth`, `surface`, `arch`, `unit` (pontic, post, cycle, anesthesia). Suggested values for the 66 procedures are in the table below and are editable in the Procedures tab.
- **How quantity is filled:**
  - `tooth` basis: quantity follows the **number of teeth entered** (three tooth numbers = quantity 3). It can be overridden.
  - `arch` basis: quantity 1 or 2 (a Teeth entry of `upper arch` = 1, `upper arch, lower arch` = 2).
  - `surface` and `unit` basis: the number of surfaces / units is typed (the tooth number alone does not say how many surfaces).
  - `flat`: quantity stays 1.
- **Price** stays the **unit price**; the line shows `unit price × quantity = sub total`, then the discount, then VAT on the result — the same column layout as the reference screen (Unit price, Sub total, Discount, Net total).
- `list_price` keeps its meaning ("price before discount") and becomes unit price × quantity, so discounts, VAT, the official-receipt breakdown, dashboards and commission need no change. A new `unit_price` column keeps the unit figure for reporting.
- Existing lines: quantity 1, unit price = list price, no teeth (backfilled).
- Percentage discounts apply to the line after quantity; a peso discount cannot exceed the line price.

| Price basis | Procedures (from the 66) |
|---|---|
| per surface | Permanent Filling (Posterior / Anterior / Voco), Temporary Filling, Calcimol |
| per tooth | Veneers (Emax / Zirconia / Direct composite), Jacket Crowns (all), Onlay Ceramage, Post & Build Up, Wisdom Tooth Removal, Complicated Tooth Extraction, Simple Tooth Extraction, Root Canal Treatment (Anterior / Posterior), Bone Reduction |
| per arch | Dentures (plastic, flexible, IVOCAP, porcelain, immediate), Retainers (Hawley / Invisible), Splint, Bite Raiser |
| per unit | Post & Core (per post), Retainers (additional pontic), Additional Whitening Cycle, Extra Anesthesia, Temporary Crown, Ceramage Removal, Suture |
| flat | Consultation, Oral Prophylaxis, X-rays, Dental Certificate, Rush Fee, packages, diagnostic fees, Mouth Guard, Whitening, TMJ items, Mock up wax |

This table has been **confirmed by the clinic**; it can still be edited per procedure in the Procedures tab.

### 3.2 Internal tracking status

Reading the list as the clinic's flow: **Arrived → On-going → For Payment → Cleared** (your notes list On-going first; I have put it in the order a patient goes through — please confirm, decision 1).

| Status | Meaning | Who moves it |
|---|---|---|
| Arrived | Patient checked in; the visit is created by the front desk | Front desk (set automatically on create) |
| On-going | Patient is with the dentist | Front desk or dentist |
| For Payment | Treatment done; waiting at the cashier | Dentist or front desk |
| Cleared | Paid in full and closed | Cashier (or admin) |

- Stored **on the visit (invoice)**, not on each procedure line.
- **History table** `invoice_status_history`: status, who, when. This gives waiting times for free (arrived → on-going, for payment → cleared) and an answer to "who closed this?".
- Rules: moves forward one step at a time; going back needs admin and a reason. **Cleared requires balance due = 0** (an admin can clear with a written reason, for example a write-off). A cleared visit is read-only (3.3).
- Does a status change anything in the numbers? **No.** Sales, net collection and commission keep following payments exactly as today. Status is a work-flow label, not an accounting event — unless you decide otherwise (decision 1 asks).
- Existing visits are backfilled: paid in full → Cleared, otherwise For Payment.
- Visible as a coloured pill in the transactions list, a filter ("Show: For Payment"), and on the visit page.

### 3.3 Front desk and cashier

**Roles.** Add `front_desk` and `cashier` to the user roles (a PostgreSQL enum, so one `ALTER TYPE … ADD VALUE IF NOT EXISTS` file you run in Neon). Existing `staff` accounts stay as they are and can be switched to the new roles on the Users page.

| Action | Front desk | Cashier | Dentist | Admin |
|---|:--:|:--:|:--:|:--:|
| Create a visit and its procedure lines | ✔ | – | – | ✔ |
| Edit the visit details and lines (before Cleared) | ✔ | – | – | ✔ |
| Apply PWD / Senior / Promo discount | ✔ (ID required) | ✔ | – | ✔ |
| Set status Arrived → On-going → For Payment | ✔ | – | ✔ (own patients) | ✔ |
| Record a payment, attach proof | – | ✔ | – | ✔ |
| Set Cleared | – | ✔ | – | ✔ |
| Edit a Cleared visit / reopen it | – | – | – | ✔ (reason + logged) |
| Edit the price list | – | – | – | ✔ |
| Delete a visit or payment | – | – | – | ✔ |

This table is a starting point for the clinic to correct — in particular whether the cashier may adjust a line at the till, and whether dentists change status (decision 2).

**How it is enforced.** A small `permissions.ts` (role → allowed actions) used by every server action and by the page, so a hidden button is not the only protection. Each action checks the role first, then the visit's status. Today any role can already do most things, so this tightens rather than adds.

**Two-person flow.** Front desk saves the visit (status Arrived, no payment). The cashier finds it under **For Payment**, records the payment and clears it. The transactions list gets a quick filter for each role's queue.

### 3.4 PWD / Senior citizen — ID number mandatory

- When the discount type is PWD or Senior citizen, the form shows **ID number** (required) and **ID type** (PWD ID, OSCA / Senior ID).
- Stored **on the visit**, with the type of discount: `discount_id_type`, `discount_id_number`. One ID per visit is enough; if a visit has several statutory lines they share it.
- Validated in the form and again on the server (Zod `superRefine`), so a request that skips the form is also refused.
- Printed on the invoice next to the discount, because the official receipt needs the name and ID number for SC / PWD sales. **No signature is collected** (decided by the clinic).
- **Optional (suggested):** keep the last ID on the patient so it is pre-filled next time, and allow a photo of the ID using the existing file uploader (kind "ID").
- **Privacy:** IDs are personal data. Show them to cashier and admin, mask them for others (`•••• 1234`), and never log them.
- Old PWD / Senior visits without an ID are not changed or blocked; the rule applies to new and edited visits.

### 3.5 Discount dropdown: PWD, Senior, Promo

Today the list has five choices and the PWD / Senior rule is triggered by matching the words "pwd", "senior" in the reason text, which is fragile (a typo silently skips the VAT rule). Proposed:

- A **discount types** list with: name, rate and mode, **statutory?** (yes for PWD and Senior), **needs ID?** (yes for the same two), active on/off. Starts with exactly **PWD (20%)**, **Senior citizen (20%)**, **Promo**.
- The statutory flag — not the name — decides the VAT-removed-first rule and the ID requirement.
- **Promo** asks for a promo name / reason and a rate or peso amount (as today, with a reason required).
- "Dental Network Member" and "Other" are no longer offered. Past visits keep their saved reason text. If you still need either, they are one row each in the list (decision 5).
- The list lives in the database (settings page, admin only) rather than in code, so adding "Promo – Summer" later needs no deployment. A line stores the discount type id **and** the name as it was, so renaming a type does not rewrite history.

### 3.6 Order of the form

New order: **Patient & visit → Payment / payer → Procedures → Totals → Payment received**.

```
Visit
  Date · Invoice no. (optional) · Branch
  Patient name [typeahead]      Transaction type [Visit ▾]      Dentist [ ▾ ]

Payment (set this first — it decides the prices)
  Paying by [ Cash-paying ▾ ]   (or Maxicare / Medicard / Intellicare / Avega / Valucare / Elite Dental Network)
  Payment type [ Cash / GCash / GoTyme / POS … ▾ ]   (fee shown for cards)

Procedures                                              [ + Add procedure ]
  Procedure [ Veneers (Emax) ▾ ]  Teeth [ 11, 12 ]  Unit price [ 35,000 ]  Qty [ 2 ]  Sub total 70,000
                                  Discount [ PWD ▾ ] [Apply to all lines]            Net total 56,000.00
  …
Total due · VAT (12%) included · OR breakdown
PWD / Senior only: ID type · ID number (required)

Amount received now · Reference no. · Proof of payment
Recall date · Recall reason · Remarks
[ Cancel ]  [ Save ]
```

- The **payer** is a visit-level field (stored on the invoice). Cash, GCash, GoTyme, bank transfer and cards are all "cash-paying" — they use the cash price. An HMO uses that HMO's price. The existing payment-type list already contains the six HMOs, so the payer can be taken from the first payment type; I would still show it as its own clear field because it decides the price (decision 4).
- The amount received stays **after** the procedures, because it depends on the total due. Only the choice of payer / payment type moves up.
- If the payer is changed after lines exist, the form asks: **"Update prices to the Maxicare rates?"** Lines whose price was typed by hand are not overwritten unless the user says yes.

### 3.7 The reference screen, field by field

The screenshot is a **clinical progress note with a billing summary**. Ours is a **cash-flow entry** (it also needs the invoice number, branch, dentist, payer, payments and VAT, which the reference screen does not show). The table says what each reference field becomes for us.

| Reference field | In our app today | Plan |
|---|---|---|
| Visit date | Date ✔ | No change |
| Patient (searchable) | Patient typeahead ✔ | No change |
| **Recall date** | – | **New** on the visit: the date the patient should come back (3.8) |
| **Recall reason** | – | **New** on the visit: free text with a few suggestions (Check-up, Ortho adjustment, Next phase, Prophylaxis) |
| Service / Procedure (search) | Procedure combobox ✔, price fills in ✔ | No change |
| **Teeth** ("Enter tooth #") | – | **New** per line (3.1) |
| Unit price | Price (editable) ✔ | Relabel "Unit price" once quantity exists |
| Sub total | – | Shown per line once quantity exists (unit price × quantity) |
| Discount (%) per line | Per-line discount, % **or** ₱, with a reason ✔ | Keep ours (a superset); add the discount type and, for PWD / Senior, the ID number (3.4, 3.5) |
| Net total per line | "Line total" ✔ | Show in the same row of columns on a wide screen |
| + Add Service / delete line | "+ Add another procedure" / Remove ✔ | No change |
| Remarks / Notes (rich text editor) | Plain one-line Remarks | Plain multi-line remarks on the cash-flow form; the rich-text editor belongs to clinical progress notes (3.9) |
| Billing summary: Subtotal, **Bill Discount (%)**, Net Total | Total due, VAT (12%), OR breakdown ✔ | No separate bill-level discount — see below |
| **Create bill** switch | – | Not needed: a visit with no charge is already a ₱0 visit; optional "No charge" checkbox |
| Patient signature | – | **Not needed** (decided): the ID number is recorded instead |
| **Transcribe** (voice to text) | – | Part of the clinical progress notes feature (3.9) |
| Save draft | – | **Not for now** (decided) — recorded in section 13 to check afterwards |
| Cancel / Save note | Cancel / Add transaction ✔ | No change |

**Bill discount (%).** The reference screen takes a second, whole-bill discount. In our app a discount is per line because the PWD / Senior rule (VAT removed first, then 20%) and the official-receipt breakdown are worked out per line, and a visit can mix a PWD line with a regular one. Instead of a second discount I would add an **"Apply to all lines"** button next to the discount type, which fills the same discount on every line in one click. Same result for staff, no change to the VAT rules.

**Remarks.** The cash-flow form keeps a **plain multi-line** remarks box: rich text complicates search, exports and printing and carries a security cost (stored HTML must be cleaned). The clinic has confirmed that **clinical progress notes are in scope**, so the rich-text editor and voice transcription from the reference screen are planned as their own feature (3.9) rather than squeezed into this field.

**Patient signature.** Not needed — the clinic only needs the PWD / Senior **ID number** on the visit (3.4). Nothing for a signature pad, signature image or signature on the invoice will be built.

**Save draft.** **Decided: no drafts for now.** A visit is either saved or not saved. The design that was considered (an unfinished visit kept out of sales, the dashboard, balances and the duplicate invoice-number check, then turned into a real visit when saved) is written down in section 13 so it can be revisited after the clinic has used the new form for a while.

**Transcribe.** Voice-to-text for notes is part of the progress-notes feature (3.9).

### 3.8 Recall date and reason

- Two optional fields on the visit: `recall_date` and `recall_reason`.
- **Recalls due list:** a filter / small page "Recalls due" listing patients whose recall date is in the next 7 / 30 days or past due and who have no later visit — the front desk's call list. A recall is cleared automatically when the patient has a later visit.
- Defaults to suggest: Oral Prophylaxis → 6 months; Ortho Adjustment → 4 weeks (editable, from the price list's category later).
- Optional later: send the reminder by SMS or message (needs a provider and consent; out of scope for now).
- Contact number comes from the patient record, which already has the field.

### 3.9 Clinical progress notes (in scope — a separate feature)

The clinic has confirmed that clinical progress notes belong in this app. That is a different kind of record from a cash-flow entry, so it gets its own plan before any building; this section sets the direction so the cash-flow changes above do not block it.

**Shape.** One visit, two parts: the **financial part** (front desk and cashier — everything in sections 3.1–3.8) and the **clinical note** (the dentist). The note is attached to the visit and shows the visit's procedure lines and teeth, so the dentist does not retype them.

| Part | Details |
|---|---|
| Record | `progress_notes`: visit, patient, dentist, note text, created / edited by and when |
| History | `progress_note_versions`: every edit keeps the earlier text, who changed it and when. A clinical record should not be silently overwritten. |
| Editor | Rich text (bold, italic, lists, headings) using a maintained editor library (for example Tiptap or Lexical — a new dependency you would install). The saved text is cleaned before it is stored and shown, and a plain-text copy is kept for search. |
| Voice transcription | Pilot with the browser's built-in speech recognition (free, works in Chrome and on Android; the browser vendor's service may process the audio). If accuracy with Taglish is poor, evaluate a paid speech-to-text service later. The dentist always reviews the text before saving. |
| Who can see it | Dentists (their own patients) and admin. Front desk and cashier do not see clinical text (they see that a note exists). Enforced on the server with the roles from 3.3. |
| Where it shows | A "Progress note" section on the visit page, plus a patient history view (all notes for a patient, newest first). |

**Privacy.** Patient health information is likely **sensitive personal information** under the Philippine Data Privacy Act, so the clinic should confirm its obligations (consent, retention, who may access, breach handling). The app side: role-based access, an access / edit log, no clinical text in URLs, logs or exports, and backups covered by the hosting plan.

**Not decided yet (for the notes plan):** the note layout (free text, or sections such as chief complaint, findings, treatment done, next visit, or SOAP); whether a tooth chart is wanted; whether x-ray images should be attached (storage cost); how long notes are kept.

**Order.** After phase 5 (roles and permissions), because "dentists and admin only" needs them. Size L.

---

## 4. Prices per HMO

The sheet gives HMO prices for a handful of services only (full table in the appendix):

| HMO | Consultation | OP | PF | TF | Extraction |
|---|---:|---:|---:|---:|---:|
| Maxicare | 150 | 250 | 350 | 120 | 235 (anterior) / 270 (posterior) |
| Intellicare | 200 | 300 | 250 | 100 | 200 |
| Avega | 200 | 300 | 250 | 100 | 200 |
| Valucare | 150 | 275 | 350 | 150 | 350 |
| Medicard | 150 | 250 | 250 | 250 | 200 |
| Elite Dental Network | 100 | 400 | 400 | 100 | 400 |

**Design.** Replace the single `procedures.default_price` with a price per payer:

- `payers`: `CASH` plus the six HMOs (name, active). Seeded from the existing payment types.
- `procedure_prices`: `procedure_id`, `payer_id`, `price`, `updated_at`. One row per procedure × payer that has a price.
- Cash prices move over from `default_price` (that column stays for now so nothing breaks, and is dropped later).
- On the form, a line looks up (procedure, payer). **If there is no HMO price for that procedure**, the line is left blank with a note, "No Maxicare price — enter the price" (decision 4 asks whether to fall back to the cash price instead; blank is the safer default because silently charging a cash price to an HMO is wrong).

**Matching the sheet to our 66 procedures is a decision, not a detail.** The HMO sheet says "OP", "PF", "TF", "Simple EXO" — our list has four Oral Prophylaxis levels, three Permanent Filling types, one Temporary Filling and one Simple Tooth Extraction. Proposal:

| HMO item | Applies to |
|---|---|
| Consultation | Consultation |
| OP | all four Oral Prophylaxis (MILD, MODERATE, SEVERE, PEDIA) |
| PF | all three Permanent Filling items |
| TF | Temporary Filling |
| Simple EXO / Extraction / EXO | Simple Tooth Extraction (Maxicare's anterior / posterior split needs a rule — decision 4) |

The Procedures tab gets a **"fill HMO prices"** helper so one price can be applied to a group in one step, and every price is editable afterwards.

**Interactions already in the code:** commission uses a separate HMO rate (percent or fixed peso value) based on the payment type — unchanged. Merchant fee follows the payment type, not the payer — unchanged. An HMO visit with a patient co-pay (HMO covers one amount, the patient pays the rest) is not modelled; it works today as two payments (decision 4).

---

## 5. The Procedures tab (price list)

A new tab next to the transactions table: **Transactions | Procedures**.

- **Table:** name, VAT (12% / Non-VAT), cash price, one column per HMO, status (active / hidden), last changed. Search box and filters (VAT / non-VAT, has no price, hidden).
- **Admin actions:** add a procedure, edit name / VAT / prices, hide (switch off) a procedure. Everyone else sees the list read-only (they use it to quote prices).
- **Hide, never delete,** once a procedure has been used: a hidden procedure disappears from the form's picker but stays on past visits and in reports. Delete is only offered for a procedure with no transactions.
- **This is the only way procedures are created** — consistent with the rule already in place (nothing creates a procedure from a transaction's text).
- **Category (suggested):** the sheet has natural groups (Consultation, Preventive, Restorative, Extraction / Surgery, Endodontics, Dentures, Crowns & veneers, Retainers, Whitening, Appliances, Orthodontics / TMJ). A `category` column lets the picker group procedures and gives the dashboard a better "popular procedures" view. Cheap to add now, awkward later.
- **Bulk update (suggested):** export the list to CSV and import an edited copy with a preview ("12 prices will change") before anything is saved. The clinic already maintains this list in a spreadsheet, so this is how Kim will want to change prices.
- **Commission link:** each row shows whether commission rates exist for it, since a new procedure with no rates earns no commission.

---

## 6. Price changes without touching past transactions

### 6.1 What already protects old transactions

Every line stores its own price, discount, VAT type and amounts when saved. Editing the list price does not touch those rows, and an old visit opens with its saved price.

### 6.2 What we add

- **Price history:** `procedure_price_history` — procedure, payer, old price, new price, changed by, changed at, optional note. Written automatically on every edit; shown as a small "History" drawer in the Procedures tab.
- **Edit setting:** a price is edited in the Procedures tab by an admin; the screen shows **"This changes prices for new transactions only. Past transactions are not affected."** and, for a large change (for example more than 25%), asks for confirmation.
- **Effective date (optional, later):** a new price can be given a start date ("from Jan 1"), stored as an additional row with `effective_from`. The form uses the row in force on the **visit date** (so a backdated visit also gets the old price). I would build the simple version first and add this when the clinic actually schedules price changes.
- **"Reprice to current list"** on a visit is an explicit button on a not-yet-cleared visit — never automatic.

### 6.3 Two places an old transaction could still change today (fix first)

1. **VAT setting.** When a visit is opened and saved again, the server reads the procedure's **current** VAT setting for each line. If the clinic later flips a procedure from VAT to non-VAT, an old visit would be recomputed with the new setting the next time anyone edits it. Fix: a saved line keeps **its own** VAT type; the procedure's setting is used only for new lines or when the user changes the procedure on that line.
2. **Commission re-linking by name.** `yarn db:backfill-links` links by procedure **name**. Renaming a procedure in the list would unlink every old transaction that has the old name, so those lines would lose their commission rate on the next run. Fix: link by the saved `procedure_id` first, and fall back to the name only when there is no id.

Both are small and need no new tables, so they are phase 0.

---

## 7. Improvements and suggestions

Ordered by how much value I think they add for the effort.

1. **Today's patients board (queue view).** Once status exists, a simple board with four columns (Arrived, On-going, For Payment, Cleared) for today, per branch. Front desk and cashier see their queue at a glance; no more asking "is she done?". Small once status is in.
2. **Waiting-time and throughput numbers.** Because the status history stores times: average wait to see the dentist, time from "For Payment" to paid, patients per hour. Useful for staffing; free by-product of 3.2.
3. **Cashier end-of-day close.** A "Close the day" screen for the cashier: payments received by method, count vs the Day End report, differences highlighted. The Day End CSV importer already exists, so the comparison is mostly joining two lists.
4. **Locked once Cleared, with an audit trail.** Edits to a cleared visit by an admin require a reason and are logged (who, when, before / after for price, discount and amount). Discounts are where money leaks; this is also what an accountant will ask for.
5. **Discount report.** Discounts given by type, by dentist, by front-desk user; PWD / Senior list with ID numbers for the BIR "sales book" requirements (restricted to admin / cashier).
6. **Package and contract items** (Ortho Package ₱70,000 / ₱85,000, TMJ Package ₱55,000). The payments table already allows many payments per visit; add a "package" flag and a simple instalment schedule (due dates and amounts) so an ortho patient's balance and next payment are visible.
7. **HMO receivables.** When the payer is an HMO, the HMO owes the clinic. A small "HMO claims" list (visit, HMO, amount, billed on, paid on) would turn the payer field into real receivables tracking.
8. **Price-list CSV import / export** (see section 5) and **procedure categories**.
9. **Quick-add favourites.** Frequent combinations (Consultation + Periapical Xray; OP + Fluoride) as one-click bundles on the form.
10. **Tablet-friendly front desk form.** The front desk probably works on a tablet or a small screen; larger touch targets and a single-column layout for the visit and procedures sections.
11. **Recall reminders.** Once recall dates are captured, a monthly "patients to call" export and, if wanted, SMS reminders (needs a provider and patient consent). Brings returning patients back, which is revenue.
12. **Notifications.** A badge on the Transactions tab for the cashier: "3 visits waiting for payment".
13. **Data privacy.** PWD / Senior IDs, patient contact numbers and attached receipts are personal data. Role-based visibility, no personal data in URLs or logs, and a note in the privacy notice that the clinic keeps them.

---

## 8. Decisions I need from you

**Already decided:** **clinical progress notes are in scope** (rich text and voice transcription inside that feature, plain remarks on the cash-flow form); **no drafts for now** (noted in section 13); tooth numbering is **FDI (11–48)**, so the Teeth field accepts permanent teeth 11–18, 21–28, 31–38, 41–48, and also primary (baby) teeth 51–55, 61–65, 71–75, 81–85 for pediatric procedures such as Oral Prophylaxis (PEDIA). The **price-basis table** in 3.1 is correct. The **patient signature is not needed** — only the PWD / Senior ID number.

**Still open:** the numbered list below. Decision 3 is reduced to one small point.

1. **Status order and effect.** Is **Arrived → On-going → For Payment → Cleared** the right order? Does a status change anything in the reports (my recommendation: no — sales stay based on payments received)? Should the dentist be able to move a patient to For Payment?
2. **Roles.** Add `front_desk` and `cashier` as new roles and move the current `staff` users into them? Can the cashier edit procedure lines at the till, or only record payments? Can a dentist see only their own patients?
3. ~~Quantity and Teeth~~ — **decided:** tooth numbering is **FDI (11–48)**; the price-basis table in 3.1 (per surface / tooth / arch / unit / flat) is **correct**. Still to confirm: should quantity follow the number of teeth entered for per-tooth procedures (my recommendation: yes, editable)?
4. **HMO pricing.** (a) Which procedures does each HMO price apply to (my proposal is in section 4)? (b) Maxicare has separate anterior / posterior extraction prices — which one is "Simple Tooth Extraction"? (c) If an HMO has no price for a procedure: leave blank (recommended) or use the cash price? (d) Does an HMO visit sometimes have a patient co-pay, and should that be tracked?
5. **Discount list.** Exactly PWD, Senior, Promo — so "Dental Network Member" (5%) and "Other" are removed? Should Promo have a fixed list of named promos or a typed reason?
6. **PWD / Senior ID.** One ID per visit, or per patient? Is the ID type needed? Should a photo of the ID be required or optional?
7. **Price changes.** Immediate for new transactions (recommended first version), or do you need start dates from day one? Who may edit prices: admin only?
8. **Recall.** Is a recall date and reason wanted on every visit? Should the "Recalls due" list exist, and should reminders (SMS) be considered later?
9. ~~Remarks and transcription~~ — **decided:** plain multi-line remarks on the cash-flow form; **clinical progress notes are in scope**, so rich text and voice transcription are planned inside that feature (3.9). Open: the questions at the end of 3.9 (note layout, tooth chart, x-ray images, retention).
10. ~~Drafts~~ — **decided: no drafts for now**, kept as a note to check afterwards (section 13).
11. **Order of work.** Phase 0 can start right away (it is a bug fix). After that, which matters most to the clinic first: the Procedures tab and price changes, or the front desk / cashier flow with status?

---

## 9. Order of work

| Phase | Work | Needs | Size |
|---|---|---|---|
| 0 | **Done.** Fixes: a saved line keeps its own VAT type; commission linking prefers `procedure_id` (6.3) | Nothing | S |
| 1 | **Done.** Procedures tab: list, add / edit / hide, VAT and cash price, price history, admin-only | Phase 0 | M |
| 2 | **Done.** Discount types list; PWD / Senior ID field (required, validated, printed); "Apply to all lines" | Decision 5, 6 | S–M |
| 3 | **Done (prices; reprice on method change).** Payers and HMO prices: `payers`, `procedure_prices`, payer on the visit, field order, reprice prompt | Phase 1, decision 4 | M–L |
| 4 | **Done.** Teeth, quantity and price basis (per tooth / surface / arch / unit) | Decision 3 | M |
| 4b | **Done.** Recall date and reason, "Recalls due" list | Decision 8 | S |
| 5 | Status, history and roles: `front_desk` / `cashier`, permission table, locked when Cleared, queue filters | Decisions 1, 2 | L |
| 6 | Clinical progress notes (3.9): own plan first, then rich-text editor, versions, role-restricted access, voice transcription pilot | Phase 5, notes plan | L |
| 7 | Improvements from section 7, chosen by priority (board, end-of-day close, audit trail, import / export) | Phases 1–5 | S–M each |

Phases 1, 2, 4 and 4b are independent of each other . Phase 3 needs phase 1. Phase 5 is the largest and changes who can do what, so it is best done once the form changes are settled.

---

## 10. Data model changes (consolidated)

| Table | Change |
|---|---|
| `procedures` | Add `category`, `active` (hide), `price_basis` (flat / tooth / surface / arch / unit), `updated_at`; later drop `default_price` once `procedure_prices` is in use |
| `payers` | **New** — `CASH` + the six HMOs |
| `procedure_prices` | **New** — procedure × payer price (later with `effective_from`) |
| `procedure_price_history` | **New** — old / new price, who, when, note |
| `discount_types` | **New** — name, rate, mode, statutory, needs ID, active |
| `invoices` | Add `status`, `payer_id`, `discount_type_id`, `discount_id_type`, `discount_id_number`, `recall_date`, `recall_reason` |
| `invoice_status_history` | **New** — status, user, time |
| `transactions` | Add `quantity`, `unit_price`, `teeth` (text), `discount_type_id` |
| `users` | Role enum gains `front_desk`, `cashier` |
| `progress_notes`, `progress_note_versions` | **New** (phase 6) — see 3.9 |
| `patients` | Optional: `last_discount_id_type`, `last_discount_id_number` for pre-fill |

How it ships, following the project's own rules:

- One idempotent SQL file per phase in `scripts/sql/` (`IF NOT EXISTS`, safe to run twice), which you run in the Neon SQL Editor. The role enum change is its own file: PostgreSQL does not allow a newly added enum value to be used in the same transaction that adds it.
- A backfill for status (paid → Cleared, otherwise For Payment), for quantity 1 and unit price, and to copy cash prices into `procedure_prices`. All are re-runnable and print counts.
- Everything is additive; nothing is dropped in the same release it is replaced.
- I do not run installs, `yarn dev` or any database command; I check with the type checker, the linter, pure-function checks and the browser (without saving).

---

## 11. Risks

- **Permissions change behaviour.** Today any role can do almost everything; a cashier or front-desk user will find actions removed. Mitigation: agree the table in 3.3 first and keep admin able to do everything.
- **Cleared = read-only** can frustrate staff who spot a typo. Mitigation: a clear "Reopen (admin)" path with a reason, so corrections are possible and visible.
- **HMO price mapping is a judgement call** (section 4) and a wrong mapping charges HMO patients the wrong price. Mitigation: blank rather than guess, the mapping shown in the Procedures tab, and a preview before a bulk fill.
- **Required PWD ID** may slow the front desk when a patient has no ID with them. Decide whether an admin override with a reason is allowed.
- **Quantity with discounts and VAT** interacts with the PWD rule (VAT removed first, then 20%). The rule works on the line price after quantity, and will be checked with the sheet's own figures.
- **Status backfill is a guess for old data.** Old visits get Cleared or For Payment from their payments; any that are neither (cancelled, no-show) need a manual status.
- **Clinical notes hold health information.** The notes feature (3.9) raises the privacy bar: restricted access, an edit log and the clinic's own consent and retention rules must be settled before notes go live.
- **Data volume is still small** — this is the cheapest time to change the structure.

---

## 12. How each phase will be checked

- Type check and lint clean after every phase.
- Pure functions in `src/lib/cashflow/` with these as acceptance cases:

| Case | Input | Expected |
|---|---|---|
| Quantity | Permanent Filling ₱1,200 × 3 surfaces, non-VAT | Line price ₱3,600.00 |
| Teeth fill quantity | Veneers (Emax) ₱35,000, Teeth `11, 12` | Quantity 2, sub total ₱70,000.00 |
| Teeth validation (FDI) | Teeth `99` or `19` | Refused (not an FDI tooth number); `11, 36, 85` accepted |
| Arch basis | Retainers (Hawley) ₱6,000, `upper arch, lower arch` | Quantity 2, ₱12,000.00 |
| Recall | Visit with recall date in 6 months, no later visit | Appears in "Recalls due" when within the window; disappears after a later visit |
| Quantity with VAT | Post & Core ₱5,000 × 2, VAT | Price ₱10,000; VAT ₱1,071.43; base ₱8,928.57 |
| Quantity with PWD | OP ₱1,200 × 1, PWD 20%, non-VAT | ₱960.00 |
| PWD on a VAT line | ₱1,120, VAT, PWD | Net ₱1,000, discount ₱200, due ₱800 |
| PWD without ID | PWD discount, empty ID | Form and server both refuse |
| Apply to all lines | PWD on line 1, then "Apply to all lines" | Same discount and ID rule on every line |
| HMO price | Consultation, payer Maxicare | ₱150 (cash ₱600) |
| HMO without a price | Rush Fee, payer Medicard | Blank with the note, not the cash price |
| Price change | Change Consultation 600 → 700 | New visits ₱700; a visit saved at ₱600 still reads ₱600, also after editing its remarks |
| VAT flag change | Flip a procedure to non-VAT | An old VAT visit keeps its VAT when edited |
| Rename | Rename a procedure | Old lines keep their commission link after `db:backfill-links` |
| Status | Visit with balance ₱500 | "Cleared" refused; allowed when balance is 0 |
| Role | Front desk records a payment | Refused on the server |
| Role | Cashier edits a cleared visit | Refused; admin allowed with a reason |

- Each SQL file is run twice on a copy first to confirm it is idempotent; each backfill prints counts before and after.
- In the browser (without saving): the new field order, the payer switch with the reprice prompt, the Procedures tab as admin and as another role, and the PWD ID requirement.

---

## 13. Notes to check afterwards

Things decided "not now" that should be looked at again once the new form has been in use.

| Item | Decision (October 9, 2026) | Check again when | What to look at |
|---|---|---|---|
| **Drafts** | Not allowed for now. | After about four weeks of the new form in daily use (or sooner if staff ask) | Do front-desk staff lose entries (form closed, session ended, interruptions at the counter)? How many visits are saved late or incomplete? If yes, build drafts as designed below. |
| **Voice transcription** | Part of the progress-notes feature, as a pilot. | After the first month of dentists using notes | How accurate is it with Taglish? Do dentists use it, or type? Move to a paid service only if the free option falls short. |
| **Recall reminders by SMS** | Not planned yet; recall dates and the list come first. | After a month of recall dates being entered | Are recalls actually being called? Is the contact number filled in on patients? |

**Drafts — the design to use if it comes back.** A visit saved as a draft is an unfinished form. It is left out of sales, the dashboard, commission, balances and the duplicate invoice-number check, and shows in a "Drafts" filter; saving it normally makes it a real visit (status Arrived). A draft is "not entered yet", a status is "where the patient is". It would be one `is_draft` column on the visit, with old drafts flagged for cleanup. **Cheaper steps to take first:** warn before closing a form that has typed data, and keep the form's content for a few minutes if it is closed by accident — these remove most of the need for drafts without a new status.

---

## Appendix — HMO prices from the sheet

| HMO | Consultation | OP | PF | TF | Extraction |
|---|---:|---:|---:|---:|---:|
| Maxicare | 150.00 | 250.00 | 350.00 | 120.00 | SIMPLE EXO (A) 235.00 · SIMPLE EXO (P) 270.00 |
| Intellicare | 200.00 | 300.00 | 250.00 | 100.00 | SIMPLE EXO 200.00 |
| Avega | 200.00 | 300.00 | 250.00 | 100.00 | SIMPLE EXO 200.00 |
| Valucare | 150.00 | 275.00 | 350.00 | 150.00 | Extraction 350.00 |
| Medicard | 150.00 | 250.00 | 250.00 | 250.00 | EXO 200.00 |
| Elite Dental Network | 100.00 | 400.00 | 400.00 | 100.00 | EXO 400.00 |

Cash-paying prices for the 66 procedures are listed in `IMPLEMENTATION_UPDATES.md` (section "Procedure list and price list").
