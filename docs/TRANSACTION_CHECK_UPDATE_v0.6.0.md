# Daily check, version 0.6.0: Branch manager, then Headquarters

Every visit is checked twice, always in this order.

1. **Branch manager** ticks a Cleared visit. From this moment the visit is locked:
   only the superuser can edit it, remove it, change its payments or files, move
   its status, or unlock it.
2. **Headquarters** ticks it afterwards. This is the last check.

## Rules (enforced on the server)

- Headquarters cannot tick a visit the Branch manager has not checked.
- Headquarters cannot be the person who gave the Branch check on that visit.
  The superuser is exempt.
- Each check covers every procedure line of the visit; a visit is one row.
- A visit stays locked after both checks. Only the superuser unlocks, and that
  removes both checks.
- Every check, approval and unlock is in the audit trail.

## Who may check (two tick boxes, Users -> Manage -> Access & Permissions)

| Privilege | Default | Gives |
|---|---|---|
| Check transactions: Branch manager (first check) | owner, admin | the Branch tick box |
| Check transactions: Headquarters (second check) | owner | the HQ tick box |

Any person can be given either, or have it taken away. Owners keep both by
default, but cannot approve a visit they gave the Branch check on.

## Screens

- Transactions list: **Branch** and **HQ** columns (tick box, lock, "Waiting",
  blue tick), filters **To check (Branch)**, **Waiting for HQ**, **Approved by HQ**.
- Visit page: banner with both approvals and an **Approve as Headquarters** button.

## Database

Run `scripts/sql/2026-11-transaction-hq-checks.sql` once in Neon (after
`2026-11-transaction-checks.sql`). One new table `transaction_hq_checks`; nothing
existing is changed. Until it is run, the Branch check works as before and the HQ
column says it isn't set up. Checks from 0.5.0 simply become Branch checks.

## Tests

`npx tsx scripts/test-transaction-checks.ts` and
`npx tsx scripts/test-roles-permissions.ts` (27 privileges).
