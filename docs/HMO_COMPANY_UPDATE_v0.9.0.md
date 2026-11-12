# HMO details: patient's company, HMO name, account number — v0.9.0 (2026-11-12)

Each HMO a patient has now carries three details: **HMO name**, **Patient's company** (where the patient works — not the HMO) and **HMO account number**. The same three are typed on a visit and shown in the reports.

## Where they appear
| Place | What |
|---|---|
| Edit patient / profile | Three fields per HMO (up to 10). Search also matches the company. |
| New / edit visit | "HMO details" box under the payment method when an HMO is picked. Prefilled from the patient (debounced); once you type, auto-fill stops. Saved with the visit. |
| Day end (screen, Excel, CSV) | New "Patient's Company" column between HMO and HMO Account #. |
| HMO billing (screen, print, Excel, CSV) | New "Patient's company" column before HMO account #. Saved billings keep their own copy. |

## Rules
- Visit-typed details win for that visit when they are for the same HMO and not empty; otherwise the patient's entry for that HMO; otherwise (patient has no list yet) the older single account number; blank if the patient has a list with no entry for that HMO.
- Saving a visit never fails because of these details. A non-HMO payment removes the visit's details. Both company and number blank on an HMO visit leaves whatever was saved.
- If the patient has no entry for the HMO, it is added to the profile; blanks are filled; existing values are never overwritten.
- Soft-deleting and restoring a visit loses nothing, but the typed details are only stored on the visit row; the profile is the fallback.

## SQL (safe to repeat)
`scripts/sql/2026-11-patient-hmos.sql`: adds `patient_hmos.employer`, creates `invoice_hmo_details` and `hmo_billing_employers` (only if `hmo_billings` exists; otherwise run `2026-11-hmo-billings.sql` first, then this script again). Until run, the app keeps working: the company field is disabled with a note, visits are saved without the extra details, and billing shows the company blank.

## Not changed
The old visit page and the Transactions list do not show these details.

## Files
`src/lib/cashflow/patient-hmo.ts`, `src/lib/db/{patient-hmos,visit-hmo,patient-admin,day-end,hmo-billing,schema}.ts`, `src/lib/cashflow/{day-end,hmo-billing,invoice-schema}.ts`, `src/app/cashflow/{actions,patient-actions}.ts`, `src/components/cashflow/{patient-form-modal,transaction-form,hmo-billing-table}.tsx`, `src/app/cashflow/{patients/[id],day-end,hmo/[id]/print}/page.tsx`, help page, `scripts/test-patient-hmos.ts`, `scripts/test-hmo-billing.ts`.

## Tests
`scripts/test-patient-hmos.ts` (73 checks: pure rules, round-trips, visit details, billing snapshot, Day end, merge, missing-table and missing-column fallbacks) and all earlier suites pass. Checked in a browser.
