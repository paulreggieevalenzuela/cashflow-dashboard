# Update v0.4.2: Asiancare and adding payment methods

## What changed

1. **Asiancare** is now a built-in HMO. It is offered on visits and payments,
   has a price column for every procedure, is in the HMO billing list and the
   transaction filters, and keeps its Day end column. Nothing to run for this
   part.
2. **Owners and admins can add payment methods** (an HMO, card machine, e-wallet
   or bank) without a new release: Transactions → **Payment methods**.

## How adding a method works

| Step | What happens |
|---|---|
| Add | Type the name, choose **HMO / insurance** or **Other**, press Add. The name must be 2 to 40 characters, plain letters, numbers and `. , & ' ( ) / -`, and new (capitals ignored, built-in names included). |
| HMO | Gets a price column for each procedure (set under Transactions → Procedures; blank until typed), an entry in HMO billing, its own Day end column, the LOA / LOE fields on the visit, and the dentist's HMO commission rate. |
| Other | Behaves like Cash: the list price, its own Day end column. |
| Hide | Takes the method off new visits and payments. Past visits keep it, and a hidden HMO still counts as an HMO for them (prices, billing, commission). Hide again with "Show again". |
| Remove | Only while the method has never been used on a visit, a payment or an HMO billing. Otherwise hide it. |
| Rename | Not possible: past visits store the name as text. Check the spelling before adding. |

Built-in methods (Cash, GCash, Maxicare, Asiancare, ...) are listed for reference
and can't be hidden or removed, because past visits and the commission rules
depend on them.

## Who can do it

A new privilege, **Add and hide payment methods**, under Rates & Targets.
Owners, admins and the superuser have it by default. It can be ticked for anyone
else (or taken from an admin) under Users → Manage → Access & Permissions, and
appears in the Access review like every other privilege. The server checks it on
every add, hide and remove; the tab is hidden and the page refuses everyone
without it. Every change is written to the audit trail ("Payment method added /
changed").

## What you need to do

1. Run `scripts/sql/2026-11-payment-methods.sql` in Neon (one new table, safe to
   repeat). Until it is run, Asiancare and the other built-in methods work, and
   the Payment methods screen shows a notice instead of adding.
2. After adding a new HMO, set its prices under Transactions → Procedures.

## How it was built

- One list of payment methods (`src/lib/cashflow/payment-methods.ts`) replaces
  the fixed lists that were repeated in the forms, the price rules, Day end and
  HMO billing. It holds the built-in methods and the added ones.
- Added methods live in the new `payment_methods` table. Every signed-in request
  refreshes them from the database (at most once every 10 seconds per server, and
  immediately after a change), and the layout hands them to the browser, so a new
  method shows on every screen after the next page load.
- Visits and payments are unchanged: they keep storing the method's name.
- 46 automated checks (`scripts/test-payment-methods.ts`) cover the built-in
  list, the name rules, add / hide / show / remove, the HMO rules for hidden and
  added methods, the Day end column and the privilege defaults; the roles test
  now expects 25 privileges. Checked in a browser: an owner adds an HMO and it
  appears in the visit form, HMO billing and the Procedures price columns; staff
  see no Payment methods tab and are bounced from its address.

## Suggestions

- **Prices for a new HMO in bulk.** Copy another HMO's prices into the new column
  in one click, then adjust.
- **Per-method fees.** Card machines carry merchant fees; a fee percentage per
  method (instead of the current fixed rules) would let a new card machine be set
  up fully from this screen.
- **Hide built-in methods that are never used** (for example one POS machine the
  clinic does not own) with a per-clinic switch.
