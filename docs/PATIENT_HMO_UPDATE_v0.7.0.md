# Patient HMO list — v0.7.0 (2026-11-12)

## What changed
- Patient profile always shows an **HMO details** section: company name + HMO account number for every HMO the patient has ("No HMO on file" when none).
- **Edit patient** has an HMO list: `+ Add HMO`, `Remove`, up to 10 per patient. Same company twice is refused (capitals ignored); an account number needs a company.
- Patient search matches any HMO's company or account number.
- Merge duplicate: kept patient's HMOs stay, missing ones from the removed record are added.
- **HMO billing / Day end** use the account number of the HMO on the visit. No entry for that company = blank (never another HMO's number). Patients without a list keep using the older single fields.

## Design
- New table `patient_hmos` (patient_id, company, company_key, account_number, position). Unique on (patient_id, company_key).
- `patients.hmo_company` / `hmo_account_number` still hold the FIRST list entry, so older code paths keep working.
- Tolerates the table missing: one HMO per patient through the older fields; more than one asks for the SQL step.

## One step to run
`scripts/sql/2026-11-patient-hmos.sql` in Neon (safe to repeat; copies existing HMOs into the list).

## Tests
`scripts/test-patient-hmos.ts` (pure + database), plus existing HMO billing, Day end, roles, checks and queue tests all pass.
