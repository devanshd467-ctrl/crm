# Bull Realty Global · Sales & Marketing CRM

A working, responsive multi-project real estate CRM, from enquiry capture through approved booking. The React interface and REST API use a persistent relational database; the dashboard is calculated from records, not hard-coded counters.

**Scope ends at booking confirmation.** No HR, payroll, collections, customer ledger, possession, or post-sales servicing modules are included.

## Run the demo

Requires **Node.js 22.16+** with built-in SQLite/FTS5 and npm.

```sh
npm ci
npm run dev
```

Open port **5173**. The server binds to `0.0.0.0`. The UI, assets, fonts, and `/api` requests share one origin; no external web services or credentials are needed for the demo.

Development defaults to a **clearly labelled demonstration workspace**. Sample projects, customers, calls, tasks, and bookings are synthetic. No existing CRM export was supplied or migrated. Opportunities are not populated with invented historical deals. Use the account menu to try different demo roles. **Do not upload real customer data to a shared demo.** Role switching is deliberately available in demo mode only.

## Try a complete workflow

1. **Add lead**. Choose a project and a source. Under additional qualification, record requirements and actual communication consent.
2. Open **Lead management** and search for the customer. Check the assigned owner, first-contact task, and timeline. Re-enquiring with the same normalized phone links the customer instead of duplicating the contact.
3. Log a call, add a note, or schedule a follow-up. Complete tasks with a meaningful outcome. Use the board to move an enquiry to a new stage.
4. Schedule a **site visit**. Issue a visitor pass, share it through an authorized channel, and enter the visitor’s code at reception. Check out with feedback. Field meetings are recorded separately.
5. Select a unit from the project’s **inventory matrix**. Hold it for the lead, or generate a quotation for an available unit. A discounted quotation must be approved by a manager. Revisions preserve earlier financial snapshots.
6. Request a **booking** against a valid approved quotation. An authorized approver confirms it in one database transaction; the unit becomes booked, the lead becomes won, and the audit trail and dashboards update.

## Implemented workspaces

| Area                         | Working features                                                                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard                    | Role-scoped totals, period comparisons, actual daily sparklines, interactive daily/weekly trend, today's work, recent enquiries, project portfolio. Project/date/source/campaign/employee/team/branch/stage filters; refresh after writes and once per visible minute.       |
| Leads                        | Indian phone normalization, unique contacts, separate project enquiries, original/repeat source attribution, customer/requirement/UTM details, indexed search, pagination, saved filters, configurable columns, bulk assignment/stage/follow-up, authorized CSV/XLSX export. |
| Assignment                   | Active project-eligible owners, rotation, lowest workload, manual assignment, workload caps, ordered project/source/location-to-team rules, unassigned queue, notification, task, and assignment history.                                                                    |
| Pipeline                     | Eleven progressive stages, separate loss outcomes, drag-and-drop board and table, independent scoring/temperature/priority, loss reasons and reopening. Multiple opportunities with value, probability, expected close and next action.                                      |
| Activity                     | Lead timelines, internal notes, protected PDF/JPEG/PNG attachments, call outcomes/duration/recording references, consent checks, WhatsApp draft-to-chat, scheduled follow-ups, calendar/list views, overdue reminders and manager escalation.                                |
| Projects, visits & inventory | Project master, floor/tower/unit matrix, approved rates, lead-linked timed holds, validated release, OTP visitor check-in, visit feedback and next task, linked outside business meetings.                                                                                   |
| Commercial                   | Server-calculated cost sheets, discount approval, printable quotation/PDF, version history, validity, pre-sales booking requests, approval/rejection, atomic inventory lock and a database uniqueness constraint against duplicate confirmed bookings.                       |
| Marketing                    | Campaign/source attribution, recorded spend, qualified leads and CPL when cost data exists. Partner directory, attributed leads, conflicting registrations and audited manager resolution.                                                                                   |
| Management                   | Filtered reports, daily briefing, sources/stages/call/visit/meeting/task summaries, management scorecard, cohort conversion, team metrics, notification center and read-only audit log.                                                                                      |
| Administration               | Password-based private login, ten CRM roles, project/team/record restrictions, user activation/revocation, routing/workflow/scoring thresholds, integration failure review and retry.                                                                                        |

## Data, imports and migration

- `npm run migration:inspect -- /path/to/export.xlsx` performs a **read-only** worksheet/header/count inventory. It summarizes invalid and duplicate mobile values where a mobile column is identifiable. No CRM tables are written, and row-level personal data is not printed.
- The application imports a **lead worksheet or CSV**, up to 5,000 rows / 8 MB per batch. Use a lead-only workbook or place the leads on the first worksheet. Map name, mobile, project, source, owner and optional customer fields. Preview and validation happen before confirmation.
- New, linked, and failed counts reconcile to input rows. Validation failures retain the original mapped data and row number. The original source and phone are preserved in enquiry attribution.
- Imports over 200 rows on disk use a **durable background worker**. Input and cursor are persisted; each chunk commits atomically. Interrupted jobs resume when the application restarts. Smaller batches complete in the request. Review results under **Settings → Import history**.
- Rollback is restricted to administrators and archives untouched newly imported leads. A post-import activity watermark prevents rollback over later sales work. Existing contacts, linked enquiries and historical audit records are not deleted.
- **Full legacy migration has not been performed.** Historical calls, notes, assignments, bookings, prices, and ambiguous cross-sheet relationships need explicit mapping, dry runs and reconciliation against the actual approved workbook. Do not treat historical inventory/booking conflicts as new sales.

## Private deployment

```sh
cp .env.example .env
# Set CRM_DEMO_MODE=false, a private CRM_DB path, and initial admin details.
# Provide credentials privately through the environment / secret manager.
npm ci
npm run build
npm start
```

A fresh private database requires `CRM_ADMIN_EMAIL` and a `CRM_ADMIN_PASSWORD` of at least 12 characters. The initial private workspace contains one administrator and **no demo business data**. Remove the bootstrap password from the environment after initialization. Passwords are salted and hashed using scrypt. Only digests of expiring, opaque session tokens are stored on the server. Sign-out and account deactivation revoke sessions. Database mode markers prevent opening a private database as a demo.

| Variable                                | Meaning                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `PORT`                                  | HTTP port (default 5173). Terminate HTTPS at the deployment proxy.                                          |
| `CRM_DEMO_MODE`                         | Defaults to true in development, false in production. Explicitly false for any real workspace.              |
| `CRM_DB`                                | Persistent SQLite file, otherwise separate `.crm-data/demo.sqlite` / `.crm-data/production.sqlite`.         |
| `CRM_ADMIN_EMAIL`, `CRM_ADMIN_PASSWORD` | Initial private admin only. No built-in production password.                                                |
| `CRM_WEBHOOK_SECRET`                    | Optional 32+ character random bearer secret for a **trusted integration adapter**, never a browser setting. |

For a production-build demonstration: `npm run build && CRM_DEMO_MODE=true npm start` with a separate demo database and no real customer data.

### Provider integration boundary

`POST /api/integrations/leads` and `POST /api/integrations/calls` accept normalized events from a trusted adapter. See **Settings → Integrations** and [the API guide](docs/API.md). Event IDs and provider call IDs are idempotent. Authorized invalid payloads enter an administrative review queue, with correction, retry, and in-app alerts.

**No live provider account is connected.** Meta/Google/99acres/Housing/Exotel/MCube/Knowlarity must be connected with approved credentials, provider-specific signature verification, field mapping, subscriptions and delivery testing. WhatsApp currently supports consent-gated draft/click-to-chat, **not** automatic template delivery, reply sync or read receipts. A chat-open event is not labelled as a sent or delivered message. Visitor pass issuance does not imply SMS delivery.

### Operations and remaining production work

This implementation uses **React/Vite + Node/Express + SQLite (WAL, foreign keys, indexes and FTS5)** rather than requiring a .NET/PostgreSQL deployment for the preview. Protected files are database blobs, not public static files. Financial values are INR, rounded to whole rupees. The application consistently uses UTC dates and times.

- Persist the data volume; keep it separate for development, staging and production. Never commit `.env`, database files, customer exports, or backups.
- `npm run db:backup -- /path/to/workspace.sqlite /secure/backup/directory` produces a transaction-consistent SQLite backup and verifies integrity and foreign keys. Schedule this command in your deployment, encrypt and retain off-site copies, and rehearse restoring a **separate offline copy** before switching a database path. No external backup service is configured here.
- API-level permission checks are independent of menu visibility. Audit rows reject changes/deletion by triggers. Production operators still need access controls for the database, encrypted storage, external tamper-resistant audit retention, TLS, monitored secrets and a recovery policy.
- Before production rollout: complete the real workbook reconciliation and provider adapters, verify commercial/tax rules, perform privacy/security and load reviews, and finalize retention, time zone, document scanning, MFA/password recovery and infrastructure. PostgreSQL/object storage, SSO, custom permission editing, enterprise BI/scheduled email, advanced advertising analytics, bulk inventory migration, location verification and optional AI/mobile functions are **not claimed as deployed**.

## Verification

```sh
npm test
npm run build
```

Automated tests use isolated in-memory and temporary on-disk databases. They exercise API permissions, report reconciliation, duplicate/contact linking, assignment, required outcomes, provider idempotency/retry, visitor passes, protected documents, background imports, rollback safety, hold expiry, quotation versions, partner conflict resolution and concurrent booking approval. The browser workflow has also been exercised end-to-end: lead → follow-up → quotation → approval → locked unit, as well as spreadsheet import, search, filters, demo roles and mobile navigation.

Generated architecture photos and the custom bull brand mark are served locally in `public/`. No customer or external CRM data is embedded in the repository.
