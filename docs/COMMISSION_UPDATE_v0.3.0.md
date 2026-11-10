# Commission Update — v0.3.0

**ADT Dental Clinic Cashflow · released 2026-11-10**

This note lists what was built for the "Commission update" request, point by
point, how the transfer split is worked out, where to find each change in the
app, what you need to run, and how it was tested.

## What was updated, by requested point

| # | Requested point | What was done | Where |
|---|---|---|---|
| 1 | Commission can be updated manually per procedure, per dentist, per tier, like changing the percentage per procedure | **Rates per procedure and tier** is now one editable grid: every procedure down, Tier 3 / Tier 2 / Tier 1 across. Click a percentage, type the new one, press **Save** (Enter also saves, Esc cancels). Click a dash to set a rate that is missing. **More** opens the flat peso value (X-rays) and the HMO rate; **Also set** applies the same rate to other tiers in one save. A search box finds a procedure. | Commissions → Rates per procedure and tier |
| 1b | …per dentist | **One person's own rates** is a second grid. Choose a dentist (or a staff member for a bonus): their tier rate is shown beside their **own rate** for each procedure. Click to set or change it, **×** to remove it and go back to the tier rate. A tick box shows only their own rates. | Commissions → One person's own rates |
| 2 | 50% for the main dentist, 50% for the transferred dentist of the patient — the percentage is on the main dentist | New optional field **Transferred to dentist** on the visit form. The commission of every procedure on that visit is worked out **once, at the main dentist's rate**, then split **50% main dentist / 50% transferred dentist**. | Add / Edit transaction |

## How the split is worked out

1. The commission of each procedure line is worked out exactly as before, using
   the **main dentist's** rate: their own rate for that procedure if they have
   one, otherwise their tier's rate (cash or HMO as on the visit).
2. If the visit has a **Transferred to dentist**, that commission is divided
   50 / 50. The main dentist keeps half; the other half belongs to the
   transferred dentist. The two halves always add up to the exact commission
   (an odd centavo goes to the transferred dentist, so nothing is created or
   lost).
3. The transferred dentist's own tier is **not** used. The rate follows the main
   dentist.
4. Sales (net collection) stay with the main dentist. Only the commission is
   shared.

**Worked example.** Build Up, ₱1,000, paid in cash. Main dentist in Tier 3
(20%), transferred to a Tier 1 dentist (15%):

| Step | Amount |
|---|---|
| Net collection without VAT (₱1,000 ÷ 1.12) | ₱892.86 |
| Commission at the **main** dentist's 20% | ₱178.57 |
| Main dentist's half | ₱89.29 |
| Transferred dentist's half | ₱89.28 |

(The transferred dentist's own 15% would have given ₱133.93; it is not used.)

## Rules and safeguards

- The transferred-to dentist must be a real dentist account and **different**
  from the main dentist. The form removes the main dentist from the list, and
  the server refuses a bad choice with a message on the field.
- The field needs a main dentist first; picking the transferred dentist as the
  main dentist clears the transfer.
- Editing a visit works both ways: removing the transfer gives the whole
  commission back to the main dentist; adding it back splits again; changing the
  main dentist re-works the commission at the new main dentist's rate.
- Adding or removing a payment (which re-works fees) keeps the transfer and
  the split.
- `yarn db:backfill-links` keeps transfers and re-works the split with the
  current rates.
- Old visits are untouched: their transfer columns are blank and their
  commission stays as it is.
- The edit history records changes to **Transferred to dentist**.

## Where the split shows

| Place | What you see |
|---|---|
| **Commission report** (screen, Excel, CSV) | A transferred line appears **twice**, once per dentist, each with their half of the commission and half of the net collection (so totals are never counted twice), and a new **Note** column: "50% — shared with …" or "50% — transferred from …". The Rate column shows the main dentist's rate on both. A report filtered to one dentist includes the lines they were transferred. |
| **Performance** | A dentist's commission = their own commission as main dentist + their half of transferred patients (leaderboard, monthly / quarterly / annual, procedure breakdown). A dentist who only received transferred patients is listed too, with no sales of their own. The transferred patient appears in their patient list. Clinic-wide commission counts both halves. |
| **Visit edit history** | "Transferred to dentist: (blank) → name". |

## Loading states

Saving a rate in either grid shows a spinner with "Saving…" and the button
cannot be pressed twice; removing a rate shows a small spinner in place of the
×. (The Excel and CSV commission downloads already show "Preparing…".)

## What you need to run

1. In the Neon SQL Editor, run **`scripts/sql/2026-11-commission-transfer-split.sql`**
   **before** starting this version. It only adds three columns and an index to
   `transactions` (transfer dentist, transfer dentist account, transfer
   commission); it is safe to run more than once and changes nothing that exists.
2. Still pending from earlier updates (run in this order if you have not yet):
   `scripts/sql/2026-11-hmo-billings.sql`, `scripts/sql/2026-11-line-loa.sql`,
   `scripts/sql/2026-11-commission-tier-sheet-sync.sql`.
3. Optional, after rate changes: `yarn db:backfill-links` to re-price saved
   visits.

## How it was tested

On a copy of the database (never your live data):

- **47 automated checks** (`scripts/test-commission-transfer.ts`): the split
  arithmetic (50/50, odd centavo, zero commission, not transferred); the rule
  that the rate is the **main** dentist's tier rate; a single-line and a
  multi-line visit; refusal of the same dentist, an unknown name and a transfer
  with no main dentist; edit (remove, re-add, swap main and transferred);
  payments keeping the split; the commission report (both dentists, totals add
  up to the commission, net collection not double counted, notes, one-dentist
  filter, Excel/CSV Note column); Performance (leaderboard, by period,
  procedure breakdown, patients); and a re-save keeping the split.
- **Browser walk-through** as an admin: change a tier rate in place (saved in
  the database), reject over-100% and keep the old value, "Also set Tier 2",
  set and remove one dentist's own rate; on the edit screen, pick a transferred
  dentist (hint text names both), save (₱89.29 / ₱89.28), reload the saved
  value, and see both dentists with notes on the commission report.
- The 67 HMO billing checks from v0.2.0 still pass.
- Type check and lint are clean.

## Files changed

- Database: `scripts/sql/2026-11-commission-transfer-split.sql`,
  `src/lib/db/schema.ts` (three columns and an index on `transactions`).
- Rules: `src/lib/cashflow/commission-split.ts` (new), `schema.ts`,
  `invoice-schema.ts`, `audit-diff.ts`, `commission-report.ts`.
- Save path: `src/lib/db/transactions.ts` (split at save time, upsert, Performance
  queries), `src/lib/db/invoices.ts` (field, validation, audit),
  `src/lib/db/commission-report.ts`.
- Screens: `src/components/cashflow/transaction-form.tsx` (new field),
  `commission-rate-grids.tsx` (new), `commission-tiers-manager.tsx`,
  `src/app/cashflow/commissions/page.tsx`, `commissions/report/page.tsx`,
  `src/app/help/page.tsx`. Removed: `commission-rates-manager.tsx` (replaced by
  the per-person grid).
- Release: `src/lib/cashflow/version.ts`, `package.json` (0.3.0), `CHANGELOG.md`.

## Not changed

- The 50 / 50 share is fixed (not editable per visit).
- One transferred dentist per visit (not per procedure).
- Sales and net collection stay with the main dentist; staff bonuses are
  unchanged.
