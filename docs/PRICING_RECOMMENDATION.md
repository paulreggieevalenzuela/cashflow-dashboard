# Pricing Recommendation — Financial & Cashflow Management System

**For:** ADT Dental Clinic (client contact: Kim)
**Prepared by:** Paul Reggie Valenzuela
**Date:** October 1, 2026
**Covers:** Everything currently built and working in the app — not the full original proposal scope (see the note at the end on what's still outstanding).

---

## What's actually being priced here

Before the number, it's worth being precise about what "everything built so far" means, since 3 of the original proposal's 6 feature areas still have real gaps (documented in `ARCHITECTURE_GAP_ANALYSIS.md` and the earlier proposal gap-analysis): Reports/export doesn't exist yet, Accounts Payable and AR aging don't exist yet, and the discount/HMO-vs-cash distinction isn't in the data model yet. If you want the number below to represent "the whole proposal," either fold those into the price now or treat them as a second milestone/invoice once they're done — I'd lean toward the second, so you're not pricing work that isn't delivered yet.

**What's live and working today:**
- Authentication, role-based access (admin/dentist/staff), protected routes
- Transactions: manual entry, CSV import with validation, filtering, sorting, pagination
- Payments: partial-payment tracking, balance-due status (Paid/Partial/Not paid), read-only view / edit-only modal split
- Commission tracking: per-dentist/per-procedure rates, admin management UI, leaderboard
- Multi-branch support: branch management, branch-scoped data across the app
- User management (admin-only)
- Expense tracking: categories, recording, dashboard reporting
- Dashboard: net-collection trend, payment-method breakdown, popular procedures, patient stats, target-vs-actual, income vs. expense, expense-by-category — all genuinely interactive (hover/keyboard-accessible tooltips, not just static charts)
- Printable invoice view

This is a real, working system a clinic is actively using — not a prototype.

---

## Three ways to anchor the number

### 1. Cost-based (your time, at a fair rate)

Estimating the actual engineering effort behind what's listed above — database design, the transaction/payment/commission engine, CSV import with error handling, four chart types built from scratch with full accessibility (not a charting library), multi-branch plumbing, and the UI polish — lands at roughly **260–320 hours** of focused development.

Philippines-based full-stack developer rates in 2026 run from about $22–27/hr (mid-level) to $30–45/hr for senior Next.js/React/TypeScript work, per current market data (sources below). For a direct, ongoing local-client relationship rather than an international agency placement, a fair blended rate is usually somewhat below the top of that band.

```
280 hrs (midpoint) × ₱600–₱1,800/hr   ≈   ₱168,000 – ₱504,000
                                            (~US$3,000 – US$9,000)
```

That's a wide range on purpose — it's the floor-to-ceiling of "what this work is worth by the hour," not a recommendation on its own.

### 2. Market comparison (what they'd pay for an off-the-shelf alternative)

Established cloud dental-practice-management platforms (Dentrix, Curve Dental, tab32, Archy, etc.) run **$250–$600/month** for a single-location practice — roughly **$16,300–$27,400 over 3 years** once you total it up (sources below). And that's for *generic* billing/scheduling software that doesn't have per-dentist commission tracking, multi-branch support, or reporting tailored to this specific clinic's workflow.

```
3-year off-the-shelf TCO:  ≈ ₱920,000 – ₱1,550,000
```

A custom system the clinic owns outright, with no recurring subscription, priced at even a fraction of that 3-year figure is a strong value story — but it's also a ceiling you probably don't want to anchor a *first* invoice to with an existing relationship; it's better held in reserve as context if Kim asks "why does this cost what it does," not as the number you lead with.

### 3. What I'd actually recommend leading with

Blending both of the above, and weighting toward "this is an ongoing relationship, not a one-off international contract":

```
Recommended range:  ₱180,000 – ₱280,000   (~US$3,200 – US$5,000)
```

This sits above the pure hourly floor (so you're not underpricing real, accessible, production-grade work), stays well under the 3-year-alternative ceiling (so it reads as a clearly good deal to Kim), and is a realistic number for a single dental clinic's budget based on what similar software costs them monthly already.

---

## How to present it

Three structures, same as the original proposal's "Engagement Options" — now with real numbers to plug in:

| Structure | How it could look | Best when |
|---|---|---|
| **Fixed project price** | A single number from the range above, paid 50% up front / 50% on delivery (or in 2–3 milestones if you're also finishing Reports/AR/Payables as part of this) | Kim wants budget certainty and the remaining gaps are scoped as a follow-on |
| **Monthly retainer** | ₱15,000–₱25,000/month covering ongoing fixes, small feature requests, and hosting/DB support | If the relationship is shifting from "build a system" to "maintain and grow it" |
| **Hourly, time-and-materials** | ₱800–₱1,500/hr, billed for new work only | If Kim prefers to control scope incrementally rather than commit to a project total |

Given there's no budget number from Kim on record yet (your last message to her asked for her range but she hasn't answered in what I can see), I'd still suggest leading with a question rather than a cold number if you haven't heard back — but if you need to propose first, the ₱180,000–₱280,000 fixed-price range above is a defensible, confident number to open with, and you have the hourly/market comparisons in your back pocket if she asks you to justify it.

---

## One honest caveat

I'm not a business consultant and this isn't a guarantee of what the market will bear — it's a reasoned estimate from current PH developer-rate data and comparable software pricing, which you should adjust based on things I don't have visibility into: how much you need this income right now, how the relationship with Kim has gone so far, and what she's hinted at budget-wise in conversations I haven't seen. Treat the range as a well-grounded starting point, not a fixed answer.

---

**Sources:**
- [Software Developer Hourly Rate In The Philippines (2026) — lemon.io](https://lemon.io/rate-calculator/philippines/)
- [Cost to Hire Developers in the Philippines — SecondTalent](https://www.secondtalent.com/cost-to-hire/philippines/)
- [Average Cost of Dental Software in 2026 — DentalStack](https://www.dentalstack.io/blog/average-cost-of-dental-software)
