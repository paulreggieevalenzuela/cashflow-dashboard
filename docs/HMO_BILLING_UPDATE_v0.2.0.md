# HMO Billing — Update v0.2.0

**ADT Dental Clinic Cashflow · released 2026-11-09**

This note lists what was built for item 3 of the requested updates ("Add HMO
tab in Transactions and generating reports"), point by point, where to find it
in the app, and how it was tested.

## What was updated, by requested point

| # | Requested point | What was done | Where |
|---|---|---|---|
| 1 | Add HMO tab in Transactions and generating reports | New **HMO billing** tab next to Day end and Audit. Preview the rows, then **Generate billing** to save a numbered billing. A list of saved billings sits under the preview. | Transactions → HMO billing |
| 2 | Filter the date by range | **From** and **To** dates (both days included; defaults to the 1st of the month through today; at most one year). Also filters by HMO and branch. | HMO billing filters |
| 3 | Fields: company, HMO acct #, LOE, LOA, Amount, Tooth # (also in Day end if missing) | Every row shows **HMO company, patient, HMO account #, LOA #, LOE #, procedure, tooth # and amount**. Day end now shows the same details (HMO, account #, LOA, LOE, tooth #, amount billed) on the same row as each payment or visit, in one table — there is no separate HMO section any more. | HMO billing, saved billing, Day end page, Day end Excel/CSV |
| 4 | Total amount of billing | Shown on the preview, the saved billing, the print page, and the Excel/CSV header and footer. Also shows lines, patients and how many lines are still "LOA pending" (these are counted in the total). | All HMO billing views |
| 5 | Auto-generate billing number | `HMO-<branch code>-<YY>-<running number>`, e.g. `HMO-MAR-26-0001`. The running number counts per branch per year and is issued by one atomic database step, so two people can never get the same number. | Generate billing |
| 6 | Cut-off date (date range of that billing) | The From–To range is saved on the billing and printed as "November 1 – 9, 2026" on the screen, PDF, Excel and CSV. | Saved billing and downloads |
| 7 | Branch | A billing is for one branch and carries its code in the number. Staff and dentists who belong to a branch can only bill that branch; admins choose. | Filters, billing header |
| 8 | Remove the expenses in the Day end report | Removed from the Day end page, its totals, the database query, and the Excel/CSV downloads. Expenses are still recorded and listed on the Expenses tab. | Day end |
| 9 | Generate PDF, Excel, CSV | **Print / Save as PDF** (print-ready A4 landscape page; choose "Save as PDF" in the print dialog — no extra software), **Excel** and **CSV**. Files are named `<billing number>_<HMO>`. | Saved billing page |

## Decisions made with you

- **PDF:** a print-ready page saved as PDF from the browser (no new package).
- **Which visits:** every visit dated in the range. A line with no LOA is
  marked "LOA pending" and still counted in the total.
- **Cut-off:** free From/To dates.
- **Number:** per branch per year, as above.
- **Amount:** what is billed to the HMO for that procedure line.
- **Who can do what:** anyone can generate a billing for their own branch;
  only an admin can void one.

## Safeguards added

- **No double billing.** A procedure line can be on only one active billing.
  Later billings leave it out; the screen says how many lines were skipped.
  The database enforces this, so it also holds if two people press Generate at
  the same moment (one succeeds, the other is told there is nothing left).
- **Saved billings are frozen.** The rows are copied when generated, so later
  edits to a transaction do not silently change a billing already sent to an
  HMO.
- **Void (admin only)** marks the billing VOID in every view and download and
  releases its lines so they can be billed again on a new billing.
- **Audit trail:** `hmo_billing.created` and `hmo_billing.voided`.
- **Branch policy** is checked on the page, the print page and the download
  route, not only in the filters.
- The tab works before the SQL is run (it shows a notice) instead of failing.

## Also in this release

- **Version 0.2.0** (`package.json`, `src/lib/cashflow/version.ts`), shown at
  the foot of the Help page, with `CHANGELOG.md` started.
- **Help page:** new "HMO billing" section; Day end answer updated.
- **Loading states on every document action** (new standing rule): a spinner
  and a working label while something is being generated. Generate billing
  and Void ("Generating billing…", "Voiding…", button locked so it cannot be
  pressed twice); Excel and CSV on HMO billing, Day end and the Commission
  report ("Preparing…", with an error message beside the button if the file
  cannot be made); the print page ("Preparing the billing for print…" and
  "Preparing PDF…"). Reusable parts: `Spinner`, `SubmitButton`,
  `DownloadButton` in `src/components/ui/`. Use them for any future
  document or report button.

## Run this once

Run `scripts/sql/2026-11-hmo-billings.sql` in the Neon SQL Editor (safe to run
twice). Still pending from earlier work: `scripts/sql/2026-11-line-loa.sql`,
`scripts/sql/2026-11-commission-tier-sheet-sync.sql`, and then
`yarn db:backfill-links`.

## Notes

- A billing number can be skipped in one rare case: two people generate for
  the same branch at the same second and one is turned away. Numbers are
  never reused or duplicated.
- The HMO account # comes from the patient's profile. Lines for patients with
  no account # on file show "Not on file".
- Day end lists every HMO visit of the day, even if already on a saved billing
  (it reports the day); the HMO billing tab leaves those out.
- Day end has one row per payment or visit, so a visit with several HMO
  procedures is one row with its LOA and tooth numbers joined by commas. For a
  per-procedure list use the HMO billing tab.

## How it was tested

- 59 automated checks on a test database: number format, inclusive range
  edges (Oct 31 and Nov 10 excluded for a Nov 1–9 billing), other branch / other
  HMO / cash excluded, "No procedures yet" placeholder dropped, LOA fallback,
  totals, no double billing (also two at once), overlapping ranges, numbering
  per branch, frozen copy, void and re-bill, CSV/Excel content, Day end with no
  expenses.
- Browser walkthrough with an admin and a branch staff account: filters,
  disabled Generate when it should be, generate, Excel/CSV download, PDF
  print output (one A4 page, app header hidden), void, staff locked to their
  branch, Day end page and downloads.
- TypeScript and ESLint clean.

## Files

New: `scripts/sql/2026-11-hmo-billings.sql`, `src/lib/cashflow/hmo-billing.ts`,
`src/lib/cashflow/version.ts`, `src/lib/db/hmo-billing.ts`,
`src/app/cashflow/hmo/` (tab, saved billing, print page, actions),
`src/app/api/cashflow/hmo-billing/[id]/route.ts`,
`src/components/cashflow/hmo-billing-table.tsx`, `CHANGELOG.md`.

Changed: `src/lib/db/schema.ts`, `src/lib/cashflow/day-end.ts`,
`src/lib/db/day-end.ts`, `src/app/cashflow/day-end/page.tsx`,
`src/components/cashflow/transactions-tabs.tsx`,
`src/lib/cashflow/audit-types.ts`, `src/lib/db/audit.ts`,
`src/app/help/page.tsx`, `package.json`.
