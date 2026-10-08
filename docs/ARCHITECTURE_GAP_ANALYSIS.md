# Financial & Cashflow Management System — Architecture Gap Analysis

**Compared against:** `financial_cashflow_management_architecture.md` (Product & Technical Architecture Specification)
**Prepared by:** Paul Reggie Valenzuela
**Date:** September 28, 2026

## How to read this

The architecture spec you shared describes the target end-state of a full **multi-tenant, multi-industry SaaS financial platform** — organizations, granular RBAC, a double-entry ledger, audit logs, and a "financial core" that dental, retail, and restaurant modules all plug into. The current app is a real, working **single-clinic implementation** for ADT Dental Clinic that already covers a meaningful slice of that vision in spirit (authentication, role-based nav, a genuine financial data model, a live dashboard) — but it's built single-tenant, with a flatter schema and fewer of the security/data-integrity primitives the spec calls out as MVP requirements.

This isn't a defect list against a bad implementation — it's a gap between "a good single-clinic app" and "the reusable platform the spec describes," and closing that gap is a sequencing decision, not a rewrite. Everything below is checked directly against the current codebase, not assumed from the spec.

---

## 1. Authentication & Session Expiration

**What's already solid:** Passwords are hashed with bcrypt at cost 12 (`src/lib/auth/password.ts`) — a genuinely good default. Server Actions independently check `auth()` before mutating anything, not just relying on middleware (defense in depth, matching the spec's own guidance in section 9).

**What's missing, concretely:**

- **No session expiration policy at all.** `src/auth.ts` sets `session: { strategy: "jwt" }` with no `maxAge` or `updateAge` — this silently falls back to NextAuth's defaults (30-day session, 24-hour JWT refresh window). For a financial app, that's a long time for a stolen or shared-device session to stay valid.
- **Password reset is not real.** The spec lists "Forgot password / Password reset" as an MVP requirement. The current `ForgotPasswordForm` (`src/components/auth/forgot-password-form.tsx`) has a literal `// TODO: replace with a real password-reset request.` comment above a `setTimeout` that fakes a success message. There's no `/reset-password` page, no reset-token table, and no email provider in the project at all (checked `package.json` — no Resend/Nodemailer/SendGrid).
- **No email verification** — `users` has no `emailVerified` column, and registration doesn't send or check one.
- **Only Credentials auth** — no Google OAuth, despite it being in the spec's own MVP list and a one-provider addition with NextAuth.
- **No login rate limiting** — nothing throttles repeated failed login attempts per email/IP, so the credentials form is brute-forceable today.
- **No re-authentication for sensitive actions** — the spec calls for re-entering a password before things like deleting records or changing a role; none of that exists (there isn't much to gate yet, but it's worth building the pattern in as delete/role-change actions grow).
- **"Sign out all devices" isn't structurally possible yet** — with a pure JWT strategy and no server-side session table, there's nothing to revoke. This is fine to defer (spec lists it as "Recommended," not MVP) but worth knowing it needs a session-table strategy change later, not just a UI toggle.

**Recommended next steps, roughly in order of effort-to-value:**
1. Set an explicit `maxAge`/`updateAge` in `src/auth.ts` matched to your risk tolerance (e.g. `maxAge: 60 * 60 * 12` for a 12-hour session) — a one-line change with real security value today.
2. Build the actual password-reset flow: a `password_reset_tokens` table (`user_id`, `token_hash`, `expires_at`, `used_at`), a real "send reset email" step (Resend is a natural fit for a Next.js app), and a working `/reset-password` page + Server Action.
3. Add basic login rate limiting — even a simple per-email attempt counter with a cooldown is a big improvement over none.
4. Add Google OAuth as a second provider.
5. Email verification and re-authentication-for-sensitive-actions can follow once there's more to protect (role changes, deletes becoming void/reversal — see §3).
6. MFA, passkeys, SSO — the spec correctly scopes these as "Future," agreed, not a near-term priority.

---

## 2. Database Architecture

**Current schema** (`src/lib/db/schema.ts`): `branches`, `transactions`, `users`, `user_preferences`, `procedures`, `dentist_commission_rates`, `payments`, `sales_targets`, `expenses`. That's it.

**What the spec calls for that doesn't exist yet:**

- **No `organizations` / `organization_members` tables at all.** The app is implicitly single-tenant — there's no `organizationId` on any table because there's no concept of an organization. "Which clinic does this belong to" is enforced by nothing in the database; it works today purely because only one clinic uses the app.
- **No `accounts` table.** The spec's model tracks named accounts (Cash, BDO Checking, GCash) each with their own balance. Today, "how much cash do we have" is derived on the fly from transaction sums, not tracked as a real, named, reconcilable balance per account.
- **No `ledger_entries` / double-entry ledger.** Every transaction is a single row with an amount, not a debit/credit pair against accounts. This means there's no way to enforce the spec's core invariant "total debits = total credits," and no audit-grade trail of exactly how money moved between accounts.
- **No `audit_logs` table** (see §3 for what this costs you specifically).
- **No generic `customers`/`vendors` abstraction.** `patientName` is a bare string on `transactions` — not even a `patients` table, let alone a `customers` table the dental module could sit on top of. This is the single biggest reason the current schema is dental-clinic-specific rather than industry-agnostic: "patient" and "transaction" live at the same layer instead of being two separate concepts.
- **No `role_permissions` / granular permission table** — role is a flat Postgres enum (`admin`/`dentist`/`staff`) baked directly onto `users`, not a many-to-many permission system.

**What's already right:** money columns use Postgres `numeric(12,2)`, matching the spec's own "decimal-safe storage" recommendation exactly — this part was built correctly from the start.

**The real decision here isn't technical, it's a product question:** if ADT Dental Clinic is genuinely going to stay the only customer for the foreseeable future, none of this is urgent — the current flat schema is simpler and perfectly adequate for one tenant. But if the multi-industry SaaS vision in the spec is a real near-term goal, the organizations/organization_members/organizationId layer is the one piece worth adding *now*, before there's more production data and more clinics to retrofit — adding a required `organizationId` foreign key to every table is a straightforward migration with one tenant to backfill, and a much riskier one once there are several real customers depending on the app staying up. I'd get an explicit answer on that question before investing in the ledger/accounts rework, since that part is a bigger lift and only pays off once there's a second business type actually being onboarded.

---

## 3. Data Management

**Hard deletes everywhere.** `deleteTransaction`, `deleteExpense`, `deleteBranch`, `deleteUser`, and `deletePayment` (in `src/lib/db/*.ts`) all issue a real `DELETE FROM` — there is no soft-delete, void, or reversal mechanism anywhere. This directly conflicts with the spec's own invariant #4 ("Posted financial transactions are not hard-deleted. Use void/reversal/cancellation mechanisms.") and section 27's guidance. Concretely, today: an admin deletes a transaction by mistake, and it's gone — no record it ever existed, no way to see who deleted it or when, no way to undo it short of a database restore.

**No audit trail.** `createdByUserId` on transactions/expenses tells you who *created* a row, but nothing records who *changed* or *deleted* one, or what the old values were before an edit. The spec's invariant #7 ("important financial mutations are audited") isn't met — there's no `audit_logs` table at all.

**Categories are hardcoded constants**, not a configurable-per-organization table — `TRANSACTION_TYPES`, `PAYMENT_TYPES`, `EXPENSE_CATEGORIES` all live as fixed arrays in `src/lib/cashflow/constants.ts`. Reasonable for one clinic today (the spec's category-config-per-org idea only matters once a second business type with a different chart of categories shows up — a restaurant has no use for "HMO providers").

**Recommended next steps, in priority order:**
1. **Add an `audit_logs` table and start writing to it for deletes first.** This is the highest-value, lowest-effort entry point — deletes are the one class of mutation you genuinely can't undo today, so they're the ones worth logging before anything else.
2. **Convert `deleteTransaction` (and `deleteExpense`) to a soft-delete/void pattern** — add a `status: "active" | "voided"` column, stop physically deleting the row, and filter voided rows out of the normal views/reports. This is a schema addition plus filtering the existing list/aggregate queries, not a rewrite.
3. Categories-to-table only becomes worth doing once/if a second business type is actually being onboarded — don't build it ahead of that need.

---

## 4. Validation

**What's genuinely solid:** every entity (transactions, expenses, users, payments) has a real Zod schema, and every Server Action calls `safeParse` on it *before* touching the database — this is exactly the spec's validation layer done correctly, not just decorative client-side checks. Confirmed directly in `src/app/cashflow/actions.ts`, `expense-actions.ts`, and `payment-actions.ts`.

**What's missing:**

- **No cross-field / business-rule validation on payments.** `addPaymentAction` (`src/app/cashflow/transactions/payment-actions.ts`) fetches the transaction it's recording a payment against, but never actually checks the new payment amount against the transaction's remaining balance due. Right now, nothing server-side stops someone from recording a payment that overshoots what's actually owed — the field itself validates ("is this a positive number") but the business rule ("does this exceed the balance") isn't enforced anywhere. This is the one gap in this section I'd fix regardless of the bigger architectural questions above, since it's a real, present data-integrity hole, not a future-proofing concern.
- **No enforcement of the spec's ledger-related invariants** ("transfers don't create revenue/expense," "ledger debits equal credits") — but these are moot until there's an actual ledger/transfers concept, so nothing to fix here yet, just noting they don't apply.
- **Dashboard totals are correctly computed server-side** (`page.tsx` fetches and computes before handing data to the client) — matching the spec's "reports use authoritative backend calculations" principle. Good, no gap here.

**Money math is float-based, with a rounding guard, not truly decimal-safe.** `parseAmount`/`computeNetCollection` in `src/lib/cashflow/normalize.ts` do arithmetic on native JS `number`, with a `Math.round(value * 100) / 100` guard to control 2-decimal drift. Storage is decimal-safe (Postgres `numeric`), but computation isn't — this is a deliberate shortcut that works fine at today's data volumes and PHP amounts, but is worth knowing about explicitly if these numbers ever need to hold up under an accountant's or auditor's scrutiny, per the spec's section 39. Not urgent to fix now; worth revisiting alongside the ledger work in §2 if that ever happens, since a ledger-based model would need real decimal-safe math anyway.

---

## 5. Product Vision

The spec's central principle — "build the financial engine once, build industry-specific modules around it" — depends on a generic `Customer` abstraction that dental, retail, and every other module sits on top of. Today, there's no such layer: `patientName` is a plain string field directly on `transactions`. That's the concrete, structural reason the current app is a dental-clinic app rather than an industry-agnostic financial engine with a dental module bolted on — "patient" and "transaction" are currently the same conceptual layer, and separating them (into a real `patients`/`customers` table with `transactions` referencing it) is the actual prerequisite work before a second industry module could realistically reuse this codebase.

On roles: the spec recommends OWNER/ADMIN/FINANCE/STAFF/VIEWER with granular `resource:action` permissions (section 11). The app has `admin`/`dentist`/`staff`, and dentist and staff currently get identical navigation and permissions (`cashflow-nav.tsx` — `DENTIST_LINKS` and `STAFF_LINKS` are the same array). That's a reasonable simplification for how ADT Dental Clinic actually operates today — there's no indication dentists and staff need different permissions right now — but it's worth not over-building the granular permission system ahead of an actual second role requirement showing up.

**Bottom line:** the current app is a genuinely good, real single-tenant MVP — most of the spec's Phase 1–4 boxes (auth, a working form of RBAC, real financial data, a live dashboard) are checked in spirit, even though the underlying schema doesn't yet have the organization/ledger scaffolding the spec ultimately calls for. The gap is between "a single clinic's app" and "a reusable multi-tenant platform," and I'd treat closing it as a deliberate, sequenced decision — starting with organizations + audit logging + soft-delete, not a ledger rewrite — rather than something to build reflexively. The single most consequential thing to nail down before investing further is whether ADT Dental Clinic is the permanent, only customer or genuinely the first of several — that answer changes what's actually worth building next far more than any individual item above does.
