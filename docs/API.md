# API and calculation notes

The UI and REST API are same-origin. Except for configuration, login and the optional provider endpoints, every request requires `Authorization: Bearer <workspace-session>`. Tokens expire after eight hours. A record outside the user's scope is not returned. Session IDs and provider secrets must not be put into URLs.

## Primary resources

- `GET /api/config`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/bootstrap`. The demo login endpoint exists only in a database explicitly initialized for demonstration.
- `GET /api/dashboard`, `GET /api/reports/export`, `GET /api/pipeline`, `GET /api/team`.
- `GET|POST /api/leads`; `GET|PATCH /api/leads/:id`; `POST /api/leads/:id/notes`, `/api/leads/bulk`; `GET /api/leads/export`. `GET /api/activities?lead=…` loads a page of the timeline. A note is additive; critical events are immutable through the API.
- `GET|POST /api/tasks`, `/api/calls`, `/api/messages`, `/api/visits`, `/api/meetings`, `/api/opportunities`, `/api/quotations`, `/api/bookings`. Structured workflow changes use `PATCH /api/<resource>/:id`. Call/message history is append-only. `GET /api/calendar/:type?month=YYYY-MM` groups activities without loading all rows.
- `POST /api/visits/:id/pass` rotates a six-digit pass. Only its digest is retained. Check in with `PATCH /api/visits/:id` and `{ "status": "Checked in", "code": "…" }`. Failed attempts are limited and a successful code is consumed. Feedback is required at check-out.
- `GET|POST /api/projects`, `PATCH /api/projects/:id`, `GET|POST /api/units`, `PATCH /api/units/:id` (hold, release or authorized price update). A unit can be quoted only if available or held by the same lead in the same project.
- `GET|POST /api/partners`, `/api/campaigns`; `GET /api/partner-reviews`, `POST /api/partner-reviews/:id/resolve`.
- `POST /api/imports/preview`, `POST /api/imports`, `GET /api/imports`, `GET /api/imports/:id`, `POST /api/imports/:id/rollback`. Larger file-backed imports return **202 Processing**; poll the batch resource. Raw input is not a production migration mapping.
- `GET|POST /api/leads/:id/documents`, `GET /api/documents/:id/download`. Authorization is checked before reading the blob. Upload limit 4 MB, PDF/JPEG/PNG signatures checked. No public attachment URLs.
- `GET /api/notifications`, `POST /api/notifications/read`, `POST|PATCH /api/users[/id]`, `PATCH /api/settings`, `PATCH /api/routing-rules`.

Lists use `page` and `size` (max 100); responses include `items`, `total`, `page`, and `size`. Filtering and search are performed server-side. Lead search uses trigram FTS5 for substrings of at least three characters and direct indexed lookup for a lead ID. UI exports require an authorized role; lead exports are capped at 50,000 rows per filtered request and are audited.

## Trusted adapter contract

The normalized webhook is **not** a provider's raw payload format. Your server-side adapter must validate provider signatures/handshakes, fetch any required details from the official provider API, resolve project aliases, and map the event. Never distribute the adapter bearer secret to a public landing page.

`POST /api/integrations/leads` requires a stable `event_id`, `name`, valid Indian `phone`, authorized `project_id`, and source/campaign attribution. Supply `attribution` for platform IDs, lead-form ID, UTM or landing-page fields; `requirements` and `contact_details` are optional. Set `consent: true` only with actual consent evidence. Unknown source text is retained alongside its normalized category.

`POST /api/integrations/calls` requires `event_id`, `provider_id`, `lead_id`, `direction`, `outcome`, and `notes`. Supply duration in seconds and an HTTPS recording reference if available. Provider recordings must themselves be access-controlled. An identical event returns its existing record; multiple completion events with the same provider call ID cannot duplicate the call.

When a configured, authenticated integration submits invalid data, the error/payload is stored in a restricted review queue. An administrator can correct and retry an event under **Settings → Event review**. Authentication headers are not persisted. A provider adapter should queue transient delivery failures and back off before retrying. No provider subscription is created by the application.

## Dashboard semantics

- Lead count: live, non-archived project enquiries created in the selected UTC date range. Contacts are distinct from enquiries. Repeated enquiries to the same active project preserve their source without inflating the lead count.
- Site visits: visits scheduled for the selected range (all statuses). Bookings/value: confirmed bookings **by confirmation date**. KPI drill-downs carry the same date and project filters into the corresponding directory.
- Monthly comparisons use the same elapsed days of the prior month, capped at its final day. Other periods compare to the preceding equal-length period. Empty denominators do not generate infinite growth rates.
- Trend and sparklines aggregate underlying dated records. Chart hover shows the current and comparison count. Weekly buckets start at the selected range's first day.
- Lead-to-booking conversion uses distinct leads created in the selected range with a confirmed booking by its end, divided by enquiries in the same cohort. Closed/lost enquiries never enter actionable hot queues solely through their historical score.
- Forecast pipeline value comes from estimated enquiry budgets. **It is not booked revenue.** The booking value is a snapshot of an approved cost sheet, not a payment or collection.
- `base = round(saleable area × approved per-square-foot rate)`; `taxable = base + charges − discount`; `tax = round(taxable × tax rate / 100)`; `total = taxable + tax`. The API recalculates these values instead of trusting client totals. Discounts require approval. Revisions retain earlier rates; a quotation tied to a pending or confirmed booking cannot be revised.
- Ad spend is never inferred from lead count. CPL only appears where both cost data and generated leads exist. Call duration is a provider/manual observation, not inferred talk time.
