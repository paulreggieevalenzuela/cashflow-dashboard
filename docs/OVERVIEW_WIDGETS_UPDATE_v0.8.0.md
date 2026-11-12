# Overview "Right now" cards — v0.8.0 (2026-11-12)

Four cards under the three number tiles on the Overview.

| Card | Shows | Scope |
|---|---|---|
| Waiting times | Now: count + longest wait per step (Arrived / On-going / For Payment). Average per step: today and last 30 days. Open visits from earlier days counted apart. | Right now |
| Outstanding balances | Patients' unpaid balance on visits at For Payment / Cleared, visits, oldest age, buckets 0-7 / 8-30 / 30+ days. HMO share excluded. | Right now (all dates) |
| Approval progress | Finished visits: to check (Branch manager), waiting for Headquarters, approved; "late" = waiting more than 2 days. Links to filtered Transactions. | Viewing-by period. Only for people with `transaction.verify` or `transaction.verify_hq` |
| HMO receivables | Per HMO: not billed yet, billed waiting for payment; open visits waiting for LOA. | Viewing-by period |

## Rules
- Per-visit patient balance = max(0, bill - received) less the HMO's outstanding part, so it never exceeds the balance shown on Transactions.
- HMO outstanding = HMO-typed lines minus HMO-typed payments; payments are taken to settle billed lines first, so "not billed" = unbilled lines capped at what is still owed.
- All figures are limited to the person's own clinics (null branch = all).
- Check / HQ / HMO-billing tables are optional: the card says which SQL script to run.

## Files
`src/lib/cashflow/overview-ops.ts` (pure), `src/lib/db/overview-ops.ts` (queries), `src/components/cashflow/dashboard/ops-cards.tsx`, `cashflow-overview.tsx`, `src/app/cashflow/page.tsx`, help page, `scripts/test-overview-ops.ts`.

## Tests
`scripts/test-overview-ops.ts` (pure + database fixtures in a throw-away branch, missing-table fallbacks) plus all earlier suites pass. Checked in a browser (desktop and phone width, period picker, links).
