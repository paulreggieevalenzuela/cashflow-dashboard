# Changelog

All notable changes to the ADT Dental Clinic Cashflow app. The version is in
`package.json` and `src/lib/cashflow/version.ts` (shown at the foot of the Help
page). Newest first.

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

- **Day end:** the HMO section now lists every HMO procedure with company,
  patient, HMO account #, LOA #, LOE #, procedure, tooth # and amount (same
  rows the billing uses). The Excel and CSV downloads carry the same columns.

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
