# Cashflow runbook

Operational procedures for the ADT Dental Clinic Cashflow system: backups and restores, monitoring, errors, incidents and releases. Keep this file current; print the "Emergency" section for each branch.

## 1. Emergency: the system is down

1. Open `/api/health` in a browser (for example `https://<your-site>/api/health`). `{"status":"ok"}` means the site and database are up; `503` means the database is not answering; no answer at all means the site or the hosting is down.
2. Check the hosting provider's status page and the Neon status page (status.neon.tech).
3. Tell staff to use the **paper fallback**: write down patient, procedures, dentist, amount and payment method for each visit, with the time. Enter them after the system returns, marking each as a late entry.
4. If it stays down for more than 30 minutes, call the developer (name / number: **to be filled in**).
5. After recovery, check the Queue and Day end numbers against the paper sheets.

## 2. Backups

Two layers, because each covers something the other does not.

**Layer 1 — provider history (Neon).** Neon keeps a restore window of the database's history (point-in-time restore). The length of the window depends on the plan: check the project's settings in the Neon console and set it to at least 7 days (30 if the plan allows). Restoring means creating a *branch* from an earlier moment, checking it, then pointing the app at it or copying the data back. Use this for "someone deleted the wrong thing an hour ago".

**Layer 2 — your own copy.** `scripts/backup-db.sh` writes a compressed dump of the whole database.

```bash
# from the project folder, with pg_dump installed
./scripts/backup-db.sh ~/Backups/cashflow
```

- Run it at least weekly; daily is better. Put it on a schedule (cron / macOS launchd / GitHub Actions with the connection string stored as a secret).
- Store copies **off** the machine that runs the system, in an encrypted folder or drive, because the files contain patient data.
- Keep: daily for 14 days, weekly for 3 months, monthly for the retention period the clinic decides.

### Restore test (do this once now, then every quarter)

An untested backup is only a hope.

1. In Neon, create a **new, empty branch or project** for the test. Never restore onto the live database.
2. Restore: `gunzip -c backups/cashflow-YYYY-MM-DD-HHMM.sql.gz | psql "<test connection string>"`
3. Point a local copy of the app at the test database (`DATABASE_URL` in `.env.local`) and sign in.
4. Check: patient count, today's Queue, last Day end totals and one attachment all look right.
5. Delete the test branch/project and write the date and result in the log below.

| Date | Backup file | Restored OK? | By |
|---|---|---|---|
| | | | |

## 3. Monitoring

- **Uptime:** create a free monitor (UptimeRobot, Better Stack, or similar) on `https://<your-site>/api/health` every 5 minutes, alert by e-mail or SMS to the admin and the developer. It fails when the database is unreachable as well as when the site is down.
- **Server errors:** every server-side error is written as one JSON line (`"event":"request_error"`) with a `digest`. The error screen shows the same code as "Reference", so a user can quote it and you can search the host's logs for it. Logs are kept for a limited time on most hosts: set up a log drain if longer is needed.
- **Error monitoring service (recommended):** Sentry's free tier is enough. Steps on your machine: `npx @sentry/wizard@latest -i nextjs`, follow the prompts, then commit the generated files. Set the Sentry option to hide personal data ("send default PII" off), and never send patient names or amounts as error context.
- **Sign-in attacks:** the `login_attempts` table holds recent sign-ins; many `wrong_password` or `locked` rows for one e-mail or address in a short time is worth a look.
- **Database size and slow queries:** Neon console → Monitoring. Attachments are stored inside the database, so size grows with every uploaded file; plan to move them to object storage before the database reaches a few GB.

## 4. Suspected data breach

Examples: a lost laptop or phone with a signed-in session, a password shared or seen, a wrong person given an account, a backup file lost.

1. Contain: change the affected person's password / remove the account, sign everything out by rotating `AUTH_SECRET` if unsure, recover or wipe the device.
2. Tell the Data Protection Officer immediately.
3. Write down what happened, when it was found, which records, and what was done.
4. If sensitive personal information of patients may have been exposed and serious harm is possible, the National Privacy Commission and the affected people must be told **within 72 hours** of knowledge. The DPO decides and files.
5. After: fix the cause, update this runbook.

## 5. Releasing a change

1. `yarn build` locally; fix any error.
2. Run any new SQL file from `scripts/sql/` in the Neon SQL editor **before** deploying the code that needs it (files are written so the app keeps working until they run, but features depend on them).
3. Deploy. Open `/api/health`, sign in, open Transactions, Queue, Day end and Patients.
4. If it is wrong, redeploy the previous version from the host's dashboard (instant rollback); SQL files are additive and safe to leave in place.

## 6. Routine calendar

| When | What |
|---|---|
| Weekly | Run `backup-db.sh`; copy it off-site |
| Monthly | `yarn audit`, update dependencies, check Neon storage and restore window |
| Quarterly | Restore test (section 2); review who has accounts and remove leavers |
| Yearly | Review the Privacy Policy, retention, and NPC registration status with the DPO |

## 7. Secrets

`DATABASE_URL` and `AUTH_SECRET` live only in the host's environment settings and in the developer's local `.env.local`. If either was ever shared in chat, e-mail or a screenshot, rotate it: Neon → reset the role password, then update `DATABASE_URL`; generate a new `AUTH_SECRET` (`openssl rand -base64 32`) and update it. Rotating `AUTH_SECRET` signs everyone out, which is expected.
