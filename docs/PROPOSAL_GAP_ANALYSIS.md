# Financial & Cashflow Management System — Gap Analysis & Implementation Plan

**Prepared for:** ADT Dental Clinic
**Prepared by:** Paul Reggie Valenzuela
**Date:** September 21, 2026

This document reviews the proposal's **Proposed Initial Features** against what is actually built in the application today, identifies the concrete gaps, and lays out how each gap would be closed. It then does the same for each of the **Future Enhancements**, since those weren't scoped to any implementation detail in the proposal itself.

Everything below is grounded in the current codebase — not a guess at what "probably" exists.

---

## Part 1 — Gaps in the Proposed Initial Features

### 1. Cashflow Dashboard

**What's already built:** An Overview page with a net-collection trend chart (monthly/quarterly/semi-annual/annual granularity), a payment-methods donut, a top-procedures breakdown, patient stats, and a target-vs-actual card — all now interactive with hover/focus tooltips.

**What's missing:**
- The **Income & Expense** and **Expense Breakdown** cards on the dashboard currently render **sample/illustrative data**, not real numbers — they're explicitly labeled "Expenses are sample data" / "Not tracked yet" in the UI. There is no `expenses` table in the database at all today.
- No saved/custom date-range comparisons beyond the built-in granularity presets (e.g., "this month vs. last month," "this quarter vs. same quarter last year").

**Implementation plan:**
- Add an `expenses` table (Drizzle schema: `id`, `branchId`, `category`, `description`, `amount`, `date`, `paymentMethod`, `createdByUserId`, timestamps) plus a matching Zod schema and CRUD actions, mirroring the pattern already used for `transactions`.
- Build an Expenses entry UI (list + add/edit modal, same component shape as `TransactionsTable`/`TransactionForm`) so staff can log real expenses instead of relying on CSV import.
- Swap `SAMPLE_MONTHLY_EXPENSES` and `SAMPLE_EXPENSE_CATEGORIES` in `dashboard-cards.tsx` for real aggregation functions (extend `dashboard-metrics.ts` with an `expensesByCategory`/`monthlyExpenseSeries` pair, same shape as the existing `netCollectionSeriesByGranularity`).
- Add a period-over-period comparison control to the Overview page reusing the existing `GRANULARITY_OPTIONS`/`currentPeriodKeys` logic, just diffed against the prior period.

---

### 2. Patient & Payment Tracking

**What's already built:** Transactions carry patient name, visit type, dentist, procedure, payment type, and amount; a per-transaction Payments panel tracks partial payments against a balance due (now correctly read-only on the View page and edit-only in the Edit modal, per your last request); a Balance status (Paid/Partial/Not paid) shows on the transactions table and detail page.

**What's missing:**
- **No `discount` field anywhere in the data model.** The transaction schema (`CashflowTransactionSchema`) has `amountPaid`, `vatExclusive`, `vatAmount`, `merchantFee`, `withholdingTax`, `netCollection` — but nothing for a line-item or invoice-level discount. Today a discount can only be reflected implicitly by entering a lower `amountPaid`, which loses the "list price vs. what was actually charged" information.
- **HMO/insurance payments aren't structurally distinct from cash payments.** `PAYMENT_TYPES` in `constants.ts` is one flat array mixing real payment methods (Cash, GCash, GoTyme, BDO, POS variants) with HMO/insurer names (Avega, Elite Dental Network, Intellicare, Maxicare, Medicard, Valucare). You can record that a transaction was paid via "Maxicare," but there's no `paymentCategory` (cash vs. HMO) to filter or report on HMO collections separately, and no HMO-specific fields (claim number, claim status, expected reimbursement date, amount actually reimbursed vs. billed).

**Implementation plan:**
- Add a `discountAmount` (and optionally `discountReason`) field to the `transactions` table and `CashflowTransactionSchema`; surface it in `TransactionForm` and in the invoice/detail view's amount breakdown, and fold it into the existing net-collection calculation.
- Split `PAYMENT_TYPES` into two constants — `PAYMENT_METHODS` (Cash, GCash, GoTyme, BDO, POS…) and `HMO_PROVIDERS` (Avega, Elite Dental Network, Intellicare, Maxicare, Medicard, Valucare) — and add a `paymentCategory: "cash" | "hmo"` column derived from which list the selection came from.
- Add HMO-specific optional fields (`claimStatus`: submitted/approved/rejected/reimbursed, `claimReferenceNo`, `reimbursedAmount`) shown conditionally in the form only when `paymentCategory === "hmo"`.
- Add an HMO collections view/filter to the Reports area (see item 6) so HMO-vs-cash can be reported on separately, which is what the proposal's "HMO/company payments where applicable" line implies but doesn't yet have a home.

---

### 3. Income Management

**What's already built:** Every transaction is income; the dashboard's net-collection trend, payment-method breakdown, and top-procedures views are effectively income reporting broken down by time, payment method, and procedure. Multi-branch data (see item 5) already lets income be sliced by branch.

**What's missing:**
- No income breakdown **by dentist** on the main Overview dashboard (dentist-level performance currently lives only on the separate Performance page, not alongside the general income view).
- No "income by visit type" (new vs. returning patient) view, despite `VISIT_TYPES` already existing in the data model.

**Implementation plan:**
- Extend `dashboard-metrics.ts` with an `incomeByDentist` and `incomeByVisitType` aggregation (same shape as the existing `paymentMethodBreakdown`), and add corresponding cards/charts to the Overview page using the chart primitives already built (`GroupedBarChart` or `DonutChart`).
- This is largely a data-aggregation and card-composition task — no new schema is needed since dentist and visit type are already captured per transaction.

---

### 4. Expense Management

**What's already built:** Nothing real — this is the least-built of the six areas today. As noted under item 1, the dashboard's expense cards are explicitly sample data with a visible "not tracked yet" label, and there is no `expenses` table, no expense entry form, and no expense CRUD actions anywhere in the codebase.

**Implementation plan:**
- This is a from-scratch build: the `expenses` table and schema described in item 1, an Expense Management page (`/cashflow/expenses`) with list/filter/add/edit/delete — mirroring the existing Transactions page's structure (table + toolbar + modal form + pagination, all of which already exist as reusable patterns in `transactions-table.tsx`, `transactions-toolbar.tsx`, `transaction-form.tsx`).
- Expense categories (rent, supplies, salaries, utilities, equipment, marketing, etc.) as a constants array, same pattern as `TRANSACTION_TYPES`.
- Attach expenses to a branch (`branchId`, reusing the existing `branches` table) so expense reporting is also multi-branch-aware from day one.
- Once this exists, replace the dashboard's sample expense cards (item 1) with real aggregations, and expenses become a first-class input to net profit/cashflow calculations, not just income.

---

### 5. Accounts Receivable / Payables

**What's already built (Receivable side only):** Each transaction tracks `amountPaid` against payments recorded in the `payments` table, with a computed balance due and a Paid/Partial/Not paid status badge. This is real, working accounts-receivable tracking at the transaction level.

**What's missing:**
- **No aging view.** There's no "30/60/90+ days overdue" breakdown — balances are visible per-transaction, but there's no roll-up view showing, e.g., total outstanding receivables grouped by how overdue they are.
- **No due-date field at all.** Transactions don't currently carry an expected payment due date, so "overdue" can't even be computed yet — only "has an outstanding balance" can.
- **No Accounts Payable side exists.** There's no concept of a vendor/supplier obligation anywhere in the schema — no `vendors` or `payables` table. This only becomes meaningful once Expense Management (item 4) exists, since payables are essentially "expenses not yet paid."

**Implementation plan:**
- Add a `dueDate` field to `transactions` (nullable, defaults to date + N days per clinic policy) so aging can be computed.
- Build an AR Aging report: a query bucketing outstanding balances into 0–30 / 31–60 / 61–90 / 90+ day buckets by `dueDate`, surfaced as a new card on the Overview page or a dedicated `/cashflow/receivables` view.
- For Payables: extend the `expenses` table (item 4) with a `status: "paid" | "unpaid"` and `dueDate`, so an unpaid expense is by definition a payable — this avoids building a whole parallel vendor-invoice system for a dental clinic's relatively simple payables needs, while still giving a real "what do we owe and when" view.

---

### 6. Reports

**What's already built:** The Overview dashboard and the Performance page together cover a lot of what "reports" usually means informally — trends, breakdowns, leaderboards — but there is no dedicated reporting/export feature.

**What's missing:**
- **No export at all.** There's no PDF or CSV export functionality anywhere in the codebase — `parse-csv.ts` only handles CSV *import*. No `jspdf`, `xlsx`, `exceljs`, or similar library is installed.
- **No report builder / saved report** — everything is a live dashboard view; there's no way to generate a static report for a given period and send/print it.
- **No scheduled or automated report generation** (this overlaps with Future Enhancement #8 below, so full implementation detail is covered there).

**Implementation plan:**
- Add a "Reports" section (`/cashflow/reports`) that lets a user pick a date range + report type (Income Summary, Expense Summary, AR Aging, Commission Summary, Branch Comparison) and generates a formatted view on screen.
- Add CSV export using a lightweight approach (build the CSV string directly from the already-fetched data, no extra dependency needed) and a "Download as PDF" option using a print-optimized CSS view (`window.print()` with a dedicated print stylesheet) or a small server-side PDF library if a polished, branded PDF is required.
- This report screen becomes the natural home for the HMO-vs-cash breakdown (item 2) and AR aging (item 5), so those two gaps and this one close together as one connected piece of work.

---

## Part 2 — Future Enhancements: Implementation Details

### 1. Automated payment reminders

Requires the `dueDate` field from Part 1, item 5. Add a scheduled job (a Next.js Route Handler triggered by a cron service — Vercel Cron if hosted on Vercel, or a simple external cron hitting an authenticated endpoint) that runs daily, queries transactions with `balanceDue > 0` and `dueDate` within N days or already past, and sends a reminder. Delivery channel: start with email (Resend or similar transactional email API — clinic already has patient contact info in the CSV data, assuming email/phone is captured) or SMS via a provider like Semaphore (popular for PH-based SMS) if the clinic wants text reminders. A `reminders` log table tracks what was sent and when, to avoid double-sending.

### 2. Inventory and supply tracking

New `inventoryItems` table (`id`, `branchId`, `name`, `sku`, `unit`, `quantityOnHand`, `reorderThreshold`, `unitCost`) and an `inventoryTransactions` table (stock in/out, linked to a reason: restock, usage, waste/expiry, adjustment). A dedicated Inventory page with a list/search/filter view and a stock-adjustment form, following the same table+modal pattern already used throughout the app. Usage could optionally link to procedures (e.g., a filling procedure consumes specific supplies) for automatic deduction, though a simpler manual-adjustment version is a reasonable first pass.

### 3. Low-stock notifications

Depends directly on #2. Once `reorderThreshold` exists per item, a scheduled check (same cron mechanism as payment reminders) flags any item where `quantityOnHand <= reorderThreshold` and sends a digest to admins/branch managers via email, plus an in-app banner/badge on the Inventory page. No new infrastructure beyond what #1 already introduces (the cron job pattern) is needed — this reuses it.

### 4. Appointment-to-payment tracking

Currently there's no appointment/scheduling concept in the app at all — transactions are created after the fact from visit records. This enhancement means introducing an `appointments` table (`id`, `patientName`, `dentist`, `branchId`, `scheduledAt`, `status`: scheduled/completed/no-show/cancelled) and linking a completed appointment to the transaction it generates (`transactions.appointmentId`). This gives a funnel view: appointments booked → completed → paid, and surfaces no-show/no-payment gaps. This is one of the larger future items since it's a new domain concept, not an extension of an existing one — worth scoping as its own phase.

### 5. Staff/doctor commission tracking

**Already substantially built today** — not a from-scratch item. The `dentistCommissionRates` table, `commissionAmount` on transactions, a `commission-rates-manager.tsx` admin UI, a `/cashflow/commissions` page, and commission figures already feeding the Performance page's leaderboard and breakdown tables all exist now. Remaining work here is refinement rather than new architecture: commission payout tracking (has this commission actually been paid out to the dentist yet — a `commissionPayouts` table logging payout date/amount, reusing the payables pattern from Part 1 item 5), and commission reporting by period for payroll purposes (an extension of the Reports section in Part 1 item 6).

### 6. Multi-branch support

**Already substantially built today** — not a from-scratch item. A `branches` table, `branchId` on transactions and users, a Branches management page (admin-only), and branch selectors already exist across transaction forms and filters. Remaining work is depth rather than foundation: branch-level dashboards (the Overview page filtered to a single branch, or a branch-comparison view side by side), branch-scoped user permissions (a branch manager role that only sees their own branch's data, vs. today's simpler admin/staff role split), and folding branch into the Expense/Payables work from Part 1 so branch P&L becomes possible.

### 7. Financial forecasting

New capability building on the existing `netCollectionSeriesByGranularity` historical data. A simple, defensible first version: a moving-average or linear-trend projection over the trailing 6–12 periods, rendered as a dashed continuation of the existing trend line chart (the `TrendLineChart` component already supports this shape of data). This avoids overselling "AI forecasting" for what is, for a single dental clinic's cashflow, usually well served by trend extrapolation. A more advanced version (seasonality-aware, accounting for known upcoming expenses) can follow once Expense Management (Part 1, item 4) supplies real expense data to forecast against.

### 8. Automated financial summaries

Reuses the cron infrastructure from #1 and #3. A scheduled job (weekly/monthly, configurable) runs the same aggregation functions already powering the dashboard (`netCollectionSeriesByGranularity`, `paymentMethodBreakdown`, `topProcedures`, plus the new expense aggregations from Part 1) for the just-completed period, formats them into an email (HTML email template, or a generated PDF attachment reusing the Reports export work from Part 1 item 6), and sends it to configured recipients (clinic owner, branch managers). A `reportSubscriptions` table lets each recipient configure frequency and which branches/metrics they want.

### 9. AI-assisted insights and reporting

Integration point: an LLM API call (Claude via the Anthropic API is a natural fit given the rest of this stack) fed a structured summary of the period's metrics (not raw transaction-level patient data, to keep the payload small and avoid sending unnecessary PII) — net collection, trend direction, top/bottom procedures, expense categories, AR aging buckets. The model returns a short narrative ("Collections were up 12% this quarter, driven mainly by X procedure; AR aging shows a growing 90+ day bucket worth following up on") to append to the automated summary from #8, or to surface as a card on the Overview dashboard. This is best scoped as one of the last items to build, since it depends on the data from several of the other enhancements (expenses, AR aging, forecasting) actually existing first to have something substantive to summarize.

---

## Suggested Sequencing

A reasonable build order, since several items depend on earlier ones:

1. **Expenses table + Expense Management** (Part 1, item 4) — nothing downstream works without this.
2. **Discount field + HMO/cash split** (Part 1, item 2) and **due date + AR aging** (Part 1, item 5) — both are schema-level additions that unlock reporting.
3. **Reports section** (Part 1, item 6) — ties together income, expense, HMO, and AR aging into exportable views.
4. **Payables** (extension of expenses) and **commission payout tracking** — close out Part 1 fully.
5. Future Enhancements in roughly the order listed, since #1/#3/#8 share the same cron infrastructure and #9 depends on the data #2, #5, and #7 produce.

Multi-branch (#6) and commission tracking (#5) don't need to wait — they're already live and can be deepened at any point alongside the above.
