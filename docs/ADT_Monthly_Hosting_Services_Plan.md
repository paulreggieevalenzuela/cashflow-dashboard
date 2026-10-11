# Monthly Hosting & Services Plan

**Prepared for:** ADT Dental Clinic
**Prepared by:** Paul Reggie Valenzuela — paulreggieevalenzuela@gmail.com
**Date:** October 8, 2026
**Relates to:** *Financial & Cashflow Management System — Project Proposal* (the running costs of the system; the monthly retainer for developer support is discussed separately)

---

## 1. Summary

For the Cashflow system to stay online every day, three paid services have to be kept running: the **hosting** (where the website runs), the **database** (where every record is stored) and the **domain name** (the web address). This plan covers those services for a fixed monthly fee of **PHP 2,000 to PHP 3,500**, depending on how heavily the system is used.

**Developer help is not part of this plan.** It covers only the services the system runs on. Fixing problems, making changes, giving support and adding features are agreed separately (see section 5).

| | **Essentials** | **Standard** | **Growth** |
|---|---|---|---|
| **Monthly fee** | **PHP 2,000** | **PHP 2,750** | **PHP 3,500** |
| Best for | One branch, daytime use | One or two branches, staff who expect instant loading | Several branches and heavy daily use |
| Hosting (Vercel Pro) | Included | Included | Included |
| Database (Neon Launch) | Sleeps when idle; the first page after a quiet spell can take a few seconds | **Always on**, loads instantly | **Always on**, with more processing power |
| Stored data and receipt photos | Up to about 1 GB | Up to about 5 GB | Up to about 10 GB |
| Domain name and yearly renewal | Included | Included | Included |
| Database history (restore to any point in the last 7 days) | Included | Included | Included |

*Recommended: **Standard** for a clinic that uses the system all day.*

---

## 2. Where the monthly fee goes

The services are charged by the vendors in US dollars to a card, so the peso amount moves slightly with the exchange rate. The figures below use about PHP 58 per US$1 and the vendors' published prices as of October 2026.

| | Essentials | Standard | Growth |
|---|---|---|---|
| **Hosting** — Vercel Pro, US$20 | PHP 1,160 | PHP 1,160 | PHP 1,160 |
| **Database** — Neon Launch (see below) | PHP 420 | PHP 1,224 | PHP 1,998 |
| **Domain name** — about US$1.50 a month | PHP 87 | PHP 87 | PHP 87 |
| **Services subtotal** | **PHP 1,667** | **PHP 2,471** | **PHP 3,245** |
| **Safety margin** (exchange rate, card fees, small overages) | PHP 333 | PHP 279 | PHP 255 |
| **Monthly fee** | **PHP 2,000** | **PHP 2,750** | **PHP 3,500** |

**How the database cost is worked out.** Neon charges for the processing time used (US$0.106 per compute-hour) and for the data stored (US$0.35 per GB a month).

- *Essentials:* the database switches off after 5 idle minutes, so it is billed only for clinic hours (about 260 hours a month at the smallest size), plus about 1 GB of storage.
- *Standard:* the database is on all day, every day (about 730 hours at the smallest size), plus about 5 GB of storage.
- *Growth:* always on, with about 60% more processing power on average (to serve more branches and users at once), plus about 10 GB of storage.

---

## 3. Why this price

1. **It is built from the real costs.** Each line is what the vendor charges. The only addition is a small safety margin (about PHP 250–350 a month) so that a weaker peso, card fees or a slightly busier month does not turn into a surprise bill.
2. **The paid plans are required.** The free hosting plan's terms do not allow business use. The free database plan stops accepting new records at 1 GB (invoice and receipt photos would fill it within weeks) and can restore only the last 6 hours. A clinic's financial records need the paid database with a 7-day history.
3. **The price matches how the clinic uses the system.** A database that sleeps between visits costs much less than one that is always ready, and the clinic chooses which it needs. If the system grows to more branches or more photos, the clinic can move up a plan; if it is lighter than expected, it can move down.
4. **It stays predictable.** One fixed monthly amount in pesos, reviewed once a year, instead of a US-dollar bill from each vendor.
5. **It does not mix in developer time.** The fee pays only for the services, so it can be compared line by line with what the vendors publish.

---

## 4. Terms

- **Start date:** from deployment (January 2027).
- **Billing:** monthly, in advance, in pesos (bank transfer or GCash).
- **Minimum term:** 6 months, then month to month. Either side can end the plan with 30 days' notice.
- **Moving between plans:** at the start of any month, on request.
- **The clinic owns its data.** On request, or when the plan ends, the clinic receives a full copy of its data, and the hosting, database and domain accounts are handed over to the clinic with a reasonable handover period.
- **Price review:** once a year, or sooner if the vendors' prices or the exchange rate change the cost of the services by more than 20%. Any change is given in writing at least 30 days ahead.
- **Vendor problems:** if a vendor has an outage, the system is affected until the vendor fixes it. This plan does not make the clinic's system more reliable than the vendors' own services.

---

## 5. What is not included

This plan does **not** include any developer help, including:

- Fixing faults or wrong figures
- Changes to the system, new features or enhancements
- Answering staff questions, training or support
- Security updates to the system's code, monitoring, and restoring data from the database history
- Re-importing or correcting data

These are discussed and agreed separately, as a monthly support retainer or as work quoted when it is needed. Nothing is done and nothing is charged without the clinic's agreement.

---

## 6. Next steps

1. Choose a plan (Essentials, Standard or Growth).
2. Confirm the start date and the minimum term.
3. Separately, agree how developer help will be handled (a monthly support retainer, or quoted when needed).

*Accepted by:*

Clinic representative: ______________________________ Date: ______________

Developer: ______________________________ Date: ______________
