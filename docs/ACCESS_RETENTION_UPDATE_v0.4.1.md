# Update v0.4.1: Deleted items housekeeping, access review, and a 2FA proposal

Built on top of v0.4.0 (roles, per-user access, soft delete). **No SQL to run for
this update.** It uses the tables that `2026-11-roles-permissions-trash.sql`
already creates.

## What you asked for, and where it ended up

| # | Request | Status | Where |
|---|---|---|---|
| 1 | A count badge on Deleted items | Built | Avatar (red number) and the "Deleted items" line in the profile menu, desktop and mobile. Superuser only. |
| 2 | Keep deleted items about 30 days, then purge | Built | Automatic clean-up, days-left on the page, red warning when something goes within 7 days. |
| 3 | Two-step sign-in for the superuser and owners | **Not built, proposal below** | See "Two-step sign-in: proposal". |
| 4 | "Who has extra privileges" page | Built | Users → **Access review: who has extra privileges** |

## The process we followed

1. **Read what already exists.** The Deleted items table already empties the
   copy of an item when it is restored, so only items still waiting can hold
   photos. That decided what the clean-up has to remove.
2. **Decide the rules before coding.** Retention is 30 days from the day of
   deletion. Restored records (empty, kept only as history) also go after 30 days,
   because the audit trail already records every delete and restore. Who may see
   what is unchanged: Deleted items and its badge are superuser only; the access
   review follows the existing "who may manage whom" rule.
3. **Build the pure parts first**, so they can be tested without the database:
   the retention rules (`deleted-retention.ts`: 30 days, 7-day warning, days left)
   and the list of sensitive privileges.
4. **Build the database parts**: the clean-up function, the count of items about
   to expire, the list of every person's overrides, and "when was this person's
   access last changed, and by whom" (read from the audit trail, so nothing new
   is stored).
5. **Build the screens**: badge, days-left and warning on Deleted items, and the
   review page.
6. **Test**: 13 new automated checks (all 106 checks in the roles test pass)
   covering the 30-day edge (31 days removed, 29 days kept), restored records,
   the once-an-hour limit, the audit line, extra/removed privileges and the
   "last changed" lookup. Type check and lint are clean.
7. **Look at it in a browser** as the superuser (badge shows 2, days-left text,
   red warning for the item with 3 days left, review page) and as an owner (no
   Deleted items link, page bounces, review page works).
8. **Deliver** the changed files to your Mac with checksums, and save the
   changelog and this document to the Project.

## 1. Count badge

The superuser sees a red number on the avatar and next to **Deleted items** in
the menu. It counts items waiting (not restored). It shows 0 as a grey number
inside the menu so the line is still clear, and only the superuser's page loads
pay for the count. It refreshes on each page load, not live.

## 2. 30-day retention

**What is removed.** Items deleted more than 30 days ago that were not restored,
and restored records more than 30 days after the restore.

**When it runs** (no scheduler needed):

- Whenever an owner or admin deletes something. That is the moment the archive
  grows, so that is when it is tidied. Limited to once an hour per server.
- When the superuser opens Deleted items.
- Optionally from a daily route, `/api/cron/purge-deleted`, as a safety net for
  quiet periods. It is **switched off** until you set a `CRON_SECRET`
  environment variable, and it only answers a request that carries that secret
  as a Bearer token. If you host on Vercel, add this `vercel.json` and set
  `CRON_SECRET` in the project settings:

  ```json
  { "crons": [{ "path": "/api/cron/purge-deleted", "schedule": "0 19 * * *" }] }
  ```

  (19:00 UTC is 03:00 in Manila.) This is optional; the app works without it.

**What you see.** Each waiting item shows "Removed for good in N days". When any
item has 7 days or fewer left, a red note at the top says how many. Each clean-up
that removes something adds one line to the audit trail, "Deleted items cleaned
up", by "System (30-day clean-up)".

**Why not keep it longer or shorter.** 30 days is one monthly close. If a
deletion is noticed at the end of the month-end review, the item is still there.
The number lives in one place (`DELETED_ITEMS_RETENTION_DAYS`) if you change your
mind.

**One thing to know.** After the 30 days an item cannot be restored. The audit
trail still says what was deleted, when and by whom, but not the photo itself.

## 3. What "extra privileges" means

Every role starts with a standard set of privileges. For example, owners and
admins can delete visits and staff cannot.

- An **extra privilege** is one a person has on top of their role, because
  somebody ticked it for them under **Manage → Access & Permissions**. Example: a
  staff member who was also given "Delete visits and transaction lines".
- A **removed privilege** is the opposite: their role would give it, but it was
  unticked. Example: a staff member who was stopped from attaching files.
- Together they are that person's **exceptions** to the role.

Exceptions are normal and useful, but they are easy to forget. A favour given for
a busy week stays in place for a year. That is why the page exists: a periodic
check (once a quarter is a good rhythm) that every exception is still wanted.

## 4. The access review page

**Users → Access review: who has extra privileges.**

- Four counts at the top: people reviewed, people with exceptions, people with
  extra privileges, and people with extra **sensitive** privileges.
- One row per person: role, clinics, extra privileges (green), sensitive extras
  (red), removed privileges (struck through), and when and by whom their access
  was last changed. People with sensitive extras come first, then people with the
  most exceptions.
- **Manage** on each row jumps to that person's access screen. Use
  **Reset to role defaults** there to drop every exception at once.
- **Print / Save as PDF** gives a clean copy for your records.
- Sensitive privileges are: manage users, manage clinics, delete visits,
  payments, expenses and files, move a visit back or skip a step, edit Cleared
  visits, import CSV, merge patients, reveal patient IDs, void HMO billing,
  manage commission rates and view the audit trail. The list is in
  `SENSITIVE_PERMISSIONS` in `permissions.ts` if you want to change it.
- Who sees whom follows the existing rule: the superuser sees everyone except the
  superuser account, an owner sees admins, dentists and staff, an admin sees
  dentists and staff, and everyone also sees their own line. The superuser
  account is never listed.

A "default" person (no exceptions) shows "None" in both columns, so an empty page
of Nones is a healthy result.

## Two-step sign-in (2FA): proposal, not built

**Goal.** Protect the accounts that can do the most damage: the superuser and the
owners (who can reach every clinic, delete, and hand out access). A stolen
password alone should no longer be enough.

### Recommended: an authenticator app (TOTP)

The person scans a QR code once with Google Authenticator, Microsoft
Authenticator, Authy or 1Password, and from then on types the 6-digit code that
changes every 30 seconds. It needs no SMS or e-mail service, costs nothing, works
offline, and fits the current Auth.js sign-in.

**How it would work**

1. **Enrolment.** After the next sign-in, an owner or the superuser is sent to a
   "Set up two-step sign-in" page (like the existing "Change your password" step):
   scan the QR code, type one code to prove it works, then save 10 one-time
   **recovery codes**. Nothing else in the app opens until this is done.
2. **Signing in.** Email and password first; if the account has 2FA, a second step
   asks for the 6-digit code (or a recovery code). The session is created only
   after both are correct, so there is no half-signed-in state.
3. **Storage.** The secret is stored **encrypted** (AES-GCM, with a key kept in an
   environment variable such as `TWO_FACTOR_KEY`), never in plain text. Recovery
   codes are stored hashed, like passwords, and each works once.
4. **Abuse limits.** Reuse the existing login-attempt limiter for wrong codes, and
   refuse a code that was already used (a code can't be replayed within its 30
   seconds).
5. **Who is required.** The superuser and owners must have it (the app forces
   enrolment). Admins can have it optionally, and the rule is one setting if you
   later want everyone.

**What is added**

- A table `user_two_factor` (user, encrypted secret, enabled-at, last-used step)
  and a table of hashed recovery codes: one SQL script, no change to existing
  tables.
- A second step on the login page, an enrolment page, and a small security
  section on **Profile** (see status, regenerate recovery codes).
- Library: `otplib` for the codes, `qrcode` for the QR image. Both are small and
  well known.
- Auth.js change: the credentials sign-in accepts the code and checks it with the
  password in the same server step. The login page asks for the code only after
  the server confirms the password is right and 2FA applies.
- Audit lines: enrolled, disabled, reset by superuser, recovery code used.

**Recovery (the part that decides whether this is safe to roll out)**

- **An owner loses their phone:** they use a recovery code; if that is gone too,
  the **superuser resets their 2FA** from Manage, and the owner enrols again.
- **The superuser loses their phone:** nobody inside the app can reset the
  superuser (that is deliberate). So the superuser keeps the recovery codes
  somewhere safe (for example a password manager), and there is a short developer
  script that clears the superuser's 2FA directly in Neon as the last resort.
  This must be agreed before turning it on.
- Show the "save these recovery codes" step clearly and require a tick to
  continue.

**Alternatives considered**

| Option | Verdict |
|---|---|
| E-mail one-time code | Simplest to explain, but needs a mail service and is only as safe as the e-mail account. Reasonable fallback, weaker. |
| SMS code | Not recommended: costs money, depends on a SIM, and can be hijacked. |
| Passkeys / security keys (WebAuthn) | Strongest and phishing-resistant, and the nicest to use on phones and laptops. More work and trickier recovery. A good second phase after TOTP. |
| Trusted device for 30 days | A later option so the code is not asked on every sign-in on the clinic computer. Reduces the protection somewhat, so decide separately. |

**Effort and order**

1. Decide the rules: who must have it, the recovery plan for the superuser, and
   whether a trusted-device option is wanted.
2. SQL script and encryption key, then the enrolment page and recovery codes.
3. The second step at sign-in, wrong-code limits and replay protection.
4. Superuser reset of an owner's 2FA, profile section, audit lines.
5. Tests, then roll out: the superuser enrols first (on the live site, with the
   recovery codes saved), then the owners.

Roughly one focused piece of work, the same size as the roles update. Please
answer these three before I build it:

1. Required for the superuser and owners only, or also for admins?
2. How would you recover the superuser if the phone is lost (recovery codes in a
   password manager, plus the developer reset)?
3. Do you want a "trust this device for 30 days" option?

## Steps for you

1. Copy the changed files (delivered to your Mac) and commit. Nothing to run in
   Neon for this update.
2. Make sure `2026-11-roles-permissions-trash.sql` (step 1, then step 2) has been
   run, as before; Deleted items and its badge need it.
3. Optional: add `CRON_SECRET` and `vercel.json` (see section 2).
4. Put "Access review" in the calendar, once a quarter.

## Suggestions

- **Mark as reviewed.** A "Reviewed on 12 Jan by Paul" stamp per person, so you
  can see who has not been looked at in 90 days.
- **Expiring privileges.** An "extra until 30 Nov" date on a privilege, so a
  temporary favour ends by itself. This removes the main reason the review is
  needed.
- **Digest.** A short weekly e-mail to the superuser: items deleted, items about
  to expire, and new exceptions.
- **Export the review** as Excel for the clinic's records.
