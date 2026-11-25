# Commission fixes — v0.10.0 (2026-11-24)

Built from the clinic's review document *COMMISSION_DentiFi.docx* (Doc Anna Perez, Doc Beatrice Bandayrel, Doc James Banawa, Doc Kyla Ahmad, Doc Rea Ayapana) and Paul's notes.

## What each reported case was

| # | Case in the document | Cause | Fixed by |
|---|---|---|---|
| A1 | Apdian, Cherell: "112%" instead of a normal rate | Doc Anna has her **own rate** for Temporary Filling: 0% cash + **₱250 flat on HMO**. A ₱250 line therefore paid the whole ₱250, and the report turned ₱250 back into a % (250 ÷ (250 ÷ 1.12) = 112%). | Rate column now shows **"₱250 (HMO)"**. The override itself is data: remove it (see *Clinic to-do*). |
| A2, B2, K1, R2 | "No computation" on Permanent Filling, Simple Tooth Extraction, Consultation on HMO visits | Those procedures have a cash % but **no HMO %**; an HMO line with no HMO rate earned ₱0. | An HMO line with no HMO rate now uses the procedure's regular tier (or own) rate. An HMO rate, when set, still wins (0% set on purpose stays 0). |
| A4, B1, K1 | "Second procedure has no commission" | Same cause as above: in every example the 2nd procedure was the HMO Permanent Filling. Each procedure is rated on its own; tests confirm the 2nd and 3rd procedures (and one added later by Edit) earn like the 1st. | Same fix. |
| A3, J1, R1 | Rate changed to 15% / 20% but visits still show 20% / 25% | Commission was stored when the visit was saved and never recalculated. | **Every rate change recalculates all saved visits at once, checked and approved ones included** (clinic decision), plus a *Recalculate all commissions* button. |
| A5, B4 | GHL card payments: commission on net collection | Commission was on the amount after the card's merchant fee (₱972 of ₱1,000). | Commission is now on the **price after discount, less withholding tax; the merchant fee is not taken off** (Ortho Adj ₱1,000 by card at 20%: (1,000 − VAT) × 20% = ₱178.57, was ₱194.40). Net collection itself is unchanged. |
| B3, K2 | Loss Bracket and RCM should match Ortho Adj | (a) The price list says **"Lost Bracket"** but visits say **"Loss Bracket"**, so those lines never linked to a procedure and earned nothing. (b) RCM was worked out ÷ 1.12 while Ortho Adj used the full amount. | RCM, Ortho Adj and Loss/Lost Bracket are all VAT procedures now (VAT taken out the same way), so they match. The rates must still be set equal in each tier, and the name mismatch is data (see *Clinic to-do*). |
| B2, K3, R2 | Loss Bracket (cash), Denture Trial w/balance, Complicated Tooth Extraction: ₱0 | No tier rate for those procedure names (Denture Trial is not on the tier sheet; "Complicated Tooth Extraction" ≠ "… w/ suture (silk)"). | Data: set their rates on the Commissions page. The report now says **"No rate set"** on such lines so they are easy to find. |
| A4 note | Day end shows two procedures as one row with no commission | By design Day end is one row per visit and has no commission column; commission is in the Commission report per procedure. | No change needed. |
| B5 | Shared commission (TEOPE/BANDAYREL) on Ortho Adj | The app already supports this: pick the second dentist in **Transferred to dentist** on the visit (50% / 50% at the main dentist's rate). | No change; staff need to use the field. |

## The formula (Paul, 24 Nov 2026)

**Commission = (collected amount − VAT) × rate**

- *Collected amount* = the procedure's price after discount, less withholding tax. The card's merchant fee is not taken off.
- *VAT* = 12% (amount ÷ 1.12), taken out for **every procedure except the five Non-VAT ones**: Consultation, Oral Prophylaxis (all kinds), Temporary Filling, Permanent Filling (all kinds), Simple Tooth Extraction. Those use the full amount.
- **The app enforces the VAT rule everywhere** (`procedureVatType`): the price list shows VAT / Non-VAT from the name (no longer editable), and every new procedure line is saved as Non-VAT only for the five basic procedures and VAT 12% for everything else — so the receipt's VAT and the commission always agree. On the test copy of the price list, 17 procedures were marked Non-VAT by mistake (Ortho Adj, RCM, Lost Bracket, Calcimol, Fluoride Varnish, X-rays, Reservation Fee, …); they are now VAT on new visits.
- Commission on old lines is decided by procedure name too, so lines saved as Non-VAT by mistake are still worked out correctly. Their receipt VAT figures are not rewritten.
- PWD / Senior Citizen lines are already charged without VAT, so the amount charged is used.
- `scripts/sql/2026-11-procedure-vat-types.sql` is now only tidying: it makes the stored price-list values match the rule (the app ignores them).

## Previous transactions

Every saved line is recalculated with the new rule, checked and approved visits included:

- **Commissions → Recalculate all commissions** (button), or
- `yarn db:recalc-commissions --dry-run` (shows the count, the total change and the first 20 lines) then `yarn db:recalc-commissions` (saves, and writes one audit-trail line). Run on staging first.

After that, every rate change on the Commissions page recalculates the affected saved lines by itself.

## Check: every case in the document, with the new computation

Worked out with the app's own code. *Price* is the procedure's price after discount; for card payments it is the net shown in the document ÷ 0.972 (GHL fee 2.8%). Rates are the ones in the document (Ortho Adj Tier 1 = 15% and Tier 3 = 20% after the clinic's change).

| Doc | Img | Procedure | Payment | Price | Before | Now | Rate | Note |
|---|---|---|---|---|---|---|---|---|
| Anna | 1 | Temporary Filling | Medicard | ₱250.00 | ₱250.00 | **₱250.00** | ₱250 (HMO) | her own ₱250 HMO rate |
| Anna | 1 | Temporary Filling | Medicard | ₱250.00 | ₱250.00 | **₱25.00** | 10% (HMO) | if her own rate is removed (tier 10%) |
| Anna | 1 | Oral Prophylaxis (MILD) | Medicard | ₱250.00 | ₱22.32 | **₱25.00** | 10% (HMO) |  |
| Anna | 1 | Permanent Filling (Posterior) | Medicard | ₱500.00 | ₱0.00 | **₱50.00** | 10% (HMO) |  |
| Anna | 3 | Simple Tooth Extraction | Maxicare | ₱540.00 | ₱0.00 | **₱54.00** | 10% (HMO) |  |
| Anna | 3 | Permanent Filling (Posterior) | Maxicare | ₱700.00 | ₱0.00 | **₱70.00** | 10% (HMO) |  |
| Anna | 4 | Permanent Filling (Posterior) | Intellicare | ₱500.00 | ₱0.00 | **₱50.00** | 10% (HMO) |  |
| Anna | 5 | Ortho Adj | — | ₱1,000.00 | ₱200.00 | **₱133.93** | 15% | tier 1 now 15% |
| Anna | 6 | Ortho Removal w/ OP | — | ₱10,000.00 | ₱2,000.00 | **₱1,785.71** | 20% |  |
| Anna | 6 | Ortho Adj | — | ₱1,458.00 | ₱291.60 | **₱195.27** | 15% | tier 1 now 15% |
| Anna | 9 | Ortho Adj | POS (GHL) - CREDIT | ₱1,000.00 | ₱194.40 | **₱133.93** | 15% | net shown ₱972 |
| Anna | 9 | RCM | POS (GHL) - CREDIT | ₱500.00 | ₱86.79 | **₱89.29** | 20% | net shown ₱486; ₱66.96 if set to 15% like Ortho Adj |
| Beatrice | 10 | Permanent Filling (Posterior) | Maxicare | ₱700.00 | ₱0.00 | **₱70.00** | 10% (HMO) |  |
| Beatrice | 11 | Permanent Filling (Posterior) | Intellicare | ₱1,000.00 | ₱0.00 | **₱100.00** | 10% (HMO) |  |
| Beatrice | 12 | Consultation | Maxicare | ₱150.00 | ₱0.00 | **₱15.00** | 10% (HMO) |  |
| Beatrice | 13 | Loss Bracket | Cash | ₱1,000.00 | ₱0.00 | **₱178.57** | 20% | after the Lost/Loss name fix |
| Beatrice | 14 | Ortho Adj | POS (GHL) - DEBIT | ₱2,000.00 | ₱388.80 | **₱357.14** | 20% | her own 20%; net shown ₱1,944 |
| Beatrice | 14 | Permanent Filling (Posterior) | POS (GHL) - DEBIT | ₱2,400.00 | ₱208.29 | **₱240.00** | 10% | net shown ₱2,332.80 |
| Beatrice | 14 | Bite Raiser per arch | POS (GHL) - DEBIT | ₱10,000.00 | ₱1,735.71 | **₱1,785.71** | 20% | net shown ₱9,720 |
| Beatrice | 14 | Ortho Package (Complex Case) | POS (GHL) - DEBIT | ₱25,000.00 | ₱4,860.00 | **₱4,464.29** | 20% | net shown ₱24,300 |
| James | 17 | Ortho Adj | GCash | ₱1,000.00 | ₱200.00 | **₱133.93** | 15% | tier 1 now 15% |
| Kyla | 18 | Oral Prophylaxis (MILD) | Intellicare | ₱300.00 | ₱26.79 | **₱30.00** | 10% (HMO) |  |
| Kyla | 18 | Permanent Filling (Posterior) | Intellicare | ₱750.00 | ₱0.00 | **₱75.00** | 10% (HMO) |  |
| Kyla | 19 | Loss Bracket | GCash | ₱500.00 | ₱0.00 | **₱89.29** | 20% | after the Lost/Loss name fix |
| Kyla | 20 | Denture Trial w/balance | GCash | ₱5,000.00 | ₱0.00 | **₱892.86** | 20% | once a 20% rate is set |
| Rea | 21 | Ortho Adj | — | ₱1,000.00 | ₱250.00 | **₱178.57** | 20% | tier 3 changed to 20% |
| Rea | 22 | Complicated Tooth Extraction | — | ₱5,000.00 | ₱0.00 | **₱669.64** | 15% | once a rate is set (15% shown) |

## Also in this version (Paul's list)

- **Editing Cleared transactions** is admin and higher by default (owner, admin, superuser). It is the privilege **Edit Cleared transactions** under Users → Manage → Access & Permissions, so it can be ticked for anyone else. Staff lose it unless it is ticked for them.
- **Audit trail for commissions:** every own-rate set/removed, tier change, tier rate set/removed, "Remove them" (with the list of removed rates) and "Recalculate all" is logged with who, when, the old and the new value, and how many saved lines changed.
- **Audit trail page:** search (person, patient, procedure, dentist; several words narrow it down; also looks inside the changed fields), pages with 10/25/50/100 rows, and a new **Commissions** filter.
- The Commission report's **Rate column** shows the rate actually used (e.g. "10% (HMO)", "₱70", "₱250 (HMO)"), or **No rate set**.

## Clinic to-do (data, not code)

1. After installing, recalculate the previous transactions once (see *Previous transactions*). Old lines still carry the old base (after card fee, old VAT rule) and the ₱0 HMO lines until then.
2. Doc Anna's own rate **Temporary Filling 0% + ₱250 HMO**: confirm it is wanted. If not, remove it (One person's own rates, or *Remove them* for all tiered dentists). Doc Bandayrel's own **Ortho Adj 20%** likewise overrides her tier.
3. Rename the price-list procedure **"Lost Bracket" → "Loss Bracket"** (or the other way round, but one name) on the Procedures page, then press *Recalculate all* — old lines are linked by name.
4. Set tier rates for **Denture Trial w/balance** (the document says 20%), **Complicated Tooth Extraction** (plain), and any line the report shows as *No rate set*.
5. Check that RCM and Loss Bracket rates equal Ortho Adj in every tier after the Ortho Adj change (15% for Tier 1?).
6. Decide whether staff who used to edit Cleared visits should keep it, and tick it for them.
7. Confirm with the accountant that **Reservation Fee, Dental Certificate, X-rays, Rush Fee** and the other non-treatment items are really VAT: the app now saves every procedure except the five basic ones as VAT 12% on new visits. If any must be Non-VAT, it is one line to add in `NON_VAT_PROCEDURES` (pricing.ts).
8. Optional tidying: `scripts/sql/2026-11-procedure-vat-types.sql` makes the stored price-list values match.

## Notes and limits

- Recalculating includes checked and approved visits (clinic decision), so a past period's commission total moves when a rate changes. Each change is in the audit trail with the amount it moved.
- `DEFAULT_COMMISSION_PERCENT` is still off: a procedure with no rate at all earns ₱0 and shows *No rate set*.
- Withholding tax is still taken off the commission base (only the merchant fee is added back).
- No SQL to run for this version.

## Files

`src/lib/cashflow/pricing.ts` (base, full-amount rule, HMO fallback, rate text), `src/lib/cashflow/commission-calc.ts` (new: one line's commission), `src/lib/db/commission-recalc.ts` (new: recalculation), `src/lib/db/transactions.ts`, `src/lib/db/commission-report.ts`, `src/lib/cashflow/commission-report.ts`, `src/lib/db/commission-rates.ts`, `src/lib/db/commission-tiers.ts`, `src/lib/db/procedures.ts`, `src/app/cashflow/commissions/actions.ts`, `src/app/cashflow/commissions/page.tsx`, `src/app/cashflow/commissions/report/page.tsx`, `src/components/cashflow/commission-rate-grids.tsx`, `src/components/cashflow/commission-tiers-manager.tsx`, `src/lib/db/audit.ts`, `src/lib/cashflow/audit-types.ts`, `src/app/cashflow/audit/page.tsx`, `src/lib/auth/permissions.ts`, `src/lib/cashflow/visit-status.ts`, `src/lib/db/invoices.ts`, `src/components/cashflow/transactions-table.tsx`, `src/components/cashflow/transaction-detail.tsx`, help page, `scripts/test-commission-rules.ts` (new), `scripts/test-roles-permissions.ts`.

## Tests

`scripts/test-commission-rules.ts` (60+ checks: base, full-amount rule, HMO fallback, 2nd/3rd/added-later procedures, GHL card, ₱250 override text, recalculation incl. a checked visit, linking by name, audit paging/search, privilege default) and every earlier suite pass. Checked in a browser: Commissions page (save notice, Recalculate all), Audit trail (Commissions filter, search, pages).
