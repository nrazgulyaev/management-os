# Arconique Management OS

**An AI-powered villa management, hospitality operations, investor reporting, and owner transparency platform for premium Bali villa assets.**

Domain: `management.arconique.com`

This repository implements the blueprint in [`/docs`](./docs/). It contains a Next.js 15 App Router application that surfaces five coordinated experiences on one data core:

- **Public website** — editorial marketing pages.
- **Admin dashboard** — internal operating plane for staff.
- **Owner / investor portal** — family-office-grade reporting.
- **Guest portal** — tokenised boutique-hotel-style stay pages.
- **Staff field PWA** — mobile-first task runner.

**Current build state:** Version 8A — Notification Delivery + In-App Inbox + Digest. Builds on v7 with: a four-provider abstraction (in-app / noop / Resend / Twilio) selected per-channel; durable `in_app_notifications` inbox with self-RLS; a delivery worker job that walks queued rows every 10 min, honours preferences and quiet hours, and writes a `notification_deliveries` row per attempt; a daily digest job (08:00) that snapshots conflicts/failed jobs/urgent tasks/low-stock/pending bridge into one in-app digest per internal role; admin UI at `/dashboard/notifications` (queue with retry/deliver-now/digest-now), `/inbox` (your unread/read/archived), `/deliveries` (per-attempt log), `/preferences` (self-edit form). Topbar bell shows unread count and links to the inbox. **Default behavior is dry-run safe:** `NOTIFICATIONS_DRY_RUN=1` (the default when env is missing) routes every external channel to the noop provider — no real email/SMS leaves the server until `NOTIFICATIONS_DRY_RUN=0` AND Resend/Twilio env are configured. Telegram, retry backoff, owner-portal inbox UI, and AI runtime remain deferred per ADR-0010.

---

## Requirements

- **Node.js** 20 LTS or newer
- **npm** 10+

## Quick start (no backend)

```bash
cd arconique.com/management
npm install
npm run dev          # → http://localhost:3000
```

Without environment variables the app runs entirely on typed mock data — every admin page renders, server actions return a "DB not configured" message, and `/login` offers demo quick-links into each surface.

## Quick start (with Supabase backend)

```bash
cp .env.example .env.local
# Paste your Supabase project values (see ADR-0002 §3 for where to find them)

npm install
npm run db:migrate    # applies 0000_initial.sql + 0001_admin_workflow_hardening.sql + 0002_finance_engine.sql + 0003_statement_pdfs_owner_linkage_finance_polish.sql
npm run db:seed       # idempotent demo data (incl. v3 finance demo if 0002 has been applied)
npm run dev
```

After migrations and seed, you can generate the first owner statement at
[`/dashboard/finance/statements/new`](http://localhost:3000/dashboard/finance/statements/new)
— pick *Emma Whitmore* + *March 2026*.

Admin CRUD pages now persist; the `SourceBadge` flips from **Demo data** to **Live data**.

## First super-admin (admin bootstrap)

After enabling Supabase Auth and running migrations:

1. Sign up an account in the Supabase dashboard or via `/login`.
2. Open `/setup/admin-bootstrap`.
3. While no super-admin exists yet, the form is open — enter your full name and submit.
4. Subsequent runs require `ADMIN_BOOTSTRAP_SECRET` (generate with `openssl rand -hex 32`) to be set in `.env.local` and pasted in the form.

CLI alternative:

```bash
node --env-file=.env.local --import tsx scripts/bootstrap-admin.ts
# with: AUTH_USER_ID=<uuid> EMAIL=<email> [FULL_NAME=...] [ADMIN_BOOTSTRAP_SECRET=...]
```

Both paths idempotently insert/link `app_users` and grant the `super_admin` role; the action is recorded in `audit_events`. See [`docs/ADR-0003-AUTH_ONBOARDING_AND_ADMIN_WORKFLOWS.md`](./docs/ADR-0003-AUTH_ONBOARDING_AND_ADMIN_WORKFLOWS.md) for the full design.

## Demo mode

Set `NEXT_PUBLIC_ENABLE_DEMO_MODE=1` to surface demo banners and quick-links across the admin surface even when the backend is wired. The flag is independent of mock fallback (`ARCONIQUE_FORCE_MOCK=1`).

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server. Pre-step kills any existing `next-server` / `next dev` processes so a fresh instance always owns port 3000 — prevents Supabase pool starvation from stale dev servers. |
| `npm run db:seed:dev-os` | Apply Dev OS demo data via slug-resolution (works against any project UUID scheme). |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint (next/core-web-vitals + next/typescript) |
| `npm run typecheck` | TypeScript project check |
| `npm run test` | Light `node:test` smoke tests (schema + zod) |
| `npm run db:migrate` | Apply `drizzle/0000_initial.sql` to `DIRECT_URL` |
| `npm run db:seed` | Apply `drizzle/seed.sql` (idempotent demo data) |
| `npm run db:generate` | drizzle-kit diff (used in v3+) |
| `npm run check:env` | Validate every env var against the registry |
| `npm run check:storage` | Buckets in code match `STORAGE-BUCKETS-CHECKLIST.md` |
| `npm run check:cron` | Every cron route maps to a known job key |
| `npm run check:cron-auth` | Cron routes are auth-gated; auth helper retains its production gate |
| `npm run check:migrations` | No duplicate prefixes / obvious secrets / missing RLS |
| `npm run smoke:routes` | Static route inventory (≥80 routes, every audience class non-empty) |
| `npm run staging:report` | Markdown readiness report at `tmp/staging-readiness-report.md` |
| `npm run preflight:deploy` | Run every static check + typecheck/lint/test/build |
| `npm run docs:route-map` | Regenerate `docs/MANAGEMENT_OS_ROUTE_MAP.md` from the route inventory |

---

## Environment

`.env.example` lists every variable. Copy it to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only — never expose
DATABASE_URL=                     # pooled (port 6543)
DIRECT_URL=                       # direct (port 5432, used for migrations)
ARCONIQUE_FORCE_MOCK=             # set to "1" to ignore configured DB
```

Helpers live in `src/lib/env.ts` (`isDbConfigured()`, `isSupabaseAuthConfigured()`, `isSupabaseAdminConfigured()`).

---

## Implemented routes

### Public marketing
`/`, `/villa-management`, `/owner-portal`, `/investor-reporting`, `/guest-experience`, `/operations`, `/portfolio`, `/case-studies`, `/contact`.

### Auth
`/login` — Supabase password sign-in (active when env is configured) plus demo quick-links.

### Admin dashboard
- `/dashboard` — command-center overview (mock briefing).
- `/dashboard/projects`, `/dashboard/projects/new`, `/dashboard/projects/[slug]`.
- `/dashboard/villas`, `/dashboard/villas/new`, `/dashboard/villas/[id]`.
- `/dashboard/owners`, `/dashboard/owners/new`, `/dashboard/owners/[id]`.
- `/dashboard/shares`.
- `/dashboard/bookings`, `/dashboard/bookings/new`, `/dashboard/bookings/[id]`.
- `/dashboard/channels`.
- `/dashboard/guests`.
- `/dashboard/finance` — sample owner statement (mock).
- `/dashboard/operations` — live command center (tasks, housekeeping, maintenance, preventive, checklists, service requests, damage reports).
- `/dashboard/inventory` — live stock command (items, stock by location, movements, locations, categories, suppliers, counts).
- `/dashboard/procurement` — live purchase requests + purchase orders with per-line receiving.
- `/dashboard/ai` — AI hub preview (mock).

### Owner portal
`/owner`, `/owner/statements`, `/owner/villas`.

### Guest portal
`/stay/demo`.

### Staff field
`/field` (live tasks for the signed-in app user with mock fallback), `/field/tasks/[id]` (live task detail + mobile-first checklist runner + attachment uploader + material usage form), `/field/inventory` (active items + live stock), `/field/tasks/demo` (UX walkthrough).

### Supabase Storage setup (for photo uploads)

The `/field/tasks/[id]` and `/dashboard/operations/*` upload buttons use Supabase Storage signed uploads. Once-per-project setup:

1. **Supabase Dashboard → Storage → New bucket** named `task-attachments`. Leave "public bucket" **off**.
2. In `.env.local` set `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL`.
3. Restart `next dev`. The uploader reports "Supabase Storage is not configured." when any of these are missing — the rest of the app keeps working.

Allowed mime types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Max 10 MB. File names are sanitised server-side; objects live at `tasks/{taskId}/yyyy-mm/{uuid}-{name}` (and equivalents for checklist items / maintenance tickets).

### Background jobs / Vercel Cron setup

V7 ships five cron-driven jobs. Configure once per deployment:

1. Set in `.env.local` (or your deployment's secret store):
   ```
   CRON_SECRET=$(openssl rand -hex 32)
   APP_BASE_URL=https://management.arconique.com
   ```
2. **Vercel**: add to `vercel.json`:
   ```json
   {
     "crons": [
       { "path": "/api/cron/calendar-sync",        "schedule": "*/30 * * * *" },
       { "path": "/api/cron/preventive-tasks",     "schedule": "0 5 * * *" },
       { "path": "/api/cron/material-usage-bridge","schedule": "0 */3 * * *" },
       { "path": "/api/cron/low-stock-scan",       "schedule": "0 7 * * *" }
     ]
   }
   ```
   Vercel automatically injects `Authorization: Bearer $CRON_SECRET` for cron jobs once the env is set in project settings.
3. **Manual smoke test from your laptop** (CRON_SECRET unset → localhost bypass):
   ```bash
   curl -i http://localhost:3000/api/cron/run-all
   ```
   With a secret configured:
   ```bash
   curl -i -H "Authorization: Bearer $CRON_SECRET" \
     https://management.arconique.com/api/cron/run-all
   ```
4. **From the dashboard** — every job exposes a "Run now" button at `/dashboard/jobs`. Each manual run is audit-logged with the operator's app_user id.

### Notification providers (v8A) setup

Default behaviour ships everything through the **noop** provider — the queue, deliveries log, and in-app inbox all populate, but no external email / SMS / WhatsApp leaves the server. To turn on real delivery:

```bash
# .env.local
NOTIFICATIONS_DRY_RUN=0
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=ops@arconique.com
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_SMS=+15551234567
TWILIO_FROM_WHATSAPP=+15551234567
```

`/dashboard/notifications` shows the active provider mode at the top — `dry-run (noop)` until you flip the env. `selectProvider(channel)` only chooses the real provider when both `isConfigured()` is true AND dry-run is off.

### v8A workflows

```bash
# fire the delivery worker manually
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/notifications-deliver

# build today's digest (one in-app row per internal role)
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/notifications-digest
```

Or use the **"Deliver pending"** / **"Queue digest now"** buttons on `/dashboard/notifications` (gated by `notifications.manage`). Topbar bell shows unread count and links to `/dashboard/notifications/inbox`.

### Testing v4–v9E workflows

1. `npm run db:migrate && npm run db:seed` — applies migrations through `0009_notification_delivery_inbox.sql` and seeds suppliers, items, stock, calendar feeds, automation rules, the partially-received PO, the default job catalog, three sample job runs, the v8A delivery job, and welcome inbox rows for super_admin/director.
2. Sign in via `/setup/admin-bootstrap`.
3. **Field photo workflow**: open a seeded task with a `photo_required` checklist item, mark it `done`, then click "Submit for review" — completion is rejected until you upload a photo via the gallery uploader.
4. **Inventory movement**: `/dashboard/inventory/movements/new` → pick `transfer`, two locations, a quantity. Confirm stock totals update at `/dashboard/inventory/stock`.
5. **Material usage**: open a live task at `/dashboard/operations/tasks/[id]` (or `/field/tasks/[id]`) → "Log material used" → pick item, location, quantity. Records a `consume` movement.
6. **Purchase order receiving**: open the seeded PO `PO-20260420-0001`. Receive the outstanding hand-towel line into Eternal Main Storage; the PO flips to `received`.
7. **Add a calendar feed**: `/dashboard/integrations/calendar-feeds/new` → paste an Airbnb iCal URL (any host that returns `text/calendar`). Click "Sync now" on the feed detail page; events appear and overlap conflicts get logged to `/dashboard/integrations/conflicts`.
8. **Materialise an event into a booking**: from `/dashboard/integrations/calendar-events`, click "Create booking" on any unbooked row. The booking page now shows the automation runs (checkout cleaning + arrival inspection were created automatically).
9. **Run booking automation manually**: open any booking detail page and click "Run automation". Idempotent — re-running surfaces "already executed" reasons rather than duplicate tasks.
10. **Bridge material usage to finance**: `/dashboard/finance/material-usage` → "Bridge pending usage". Owner-chargeable consumption rows become `expense_lines` against the booking's villa, respecting locked statement periods.
11. **Inventory counts**: `/dashboard/inventory/counts/new` → pick a location → fill in counted quantities → submit → approve. Approval auto-emits `count_correction` movements for every non-zero variance.
12. **Run a background job manually**: `/dashboard/jobs` → "Run now" on any job (e.g. `scan_low_stock`). Result summary appears inline; the full event log is at `/dashboard/jobs/runs/[id]`.
13. **Notifications**: a low-stock scan run queues `low_stock_alert` notifications for `operations_manager` + `procurement_manager`. Browse them at `/dashboard/notifications` and use "Mark sent" / "Cancel" controls. Re-running the scan the same day suppresses duplicates via dedupe key.
14. **In-app inbox (v8A)**: hit "Deliver pending" on `/dashboard/notifications`. The in-app provider materialises one `in_app_notifications` row per recipient. Open the bell in the topbar (or `/dashboard/notifications/inbox`) — your role-targeted alerts appear with priority pill + payload preview. Mark as read / archive from the row.
15. **Daily digest**: click "Queue digest now". The deterministic snapshot job inserts one in-app digest per role (`super_admin`, `director`, `operations_manager`) with dedupe key `internal_daily_digest:YYYY-MM-DD:<role>` so re-running the same day is a no-op.
16. **Quiet hours (v8A)**: set a window at `/dashboard/notifications/preferences` (e.g. `22:00 → 07:00`). The next delivery during the window goes to status `suppressed` with `next_attempt_at` set to the window end — the worker picks it up automatically when the window closes.
17. **Timezone-aware quiet hours (v8B)**: `app_users.timezone` (default `Asia/Makassar`) drives the evaluation. `UPDATE app_users SET timezone = 'Europe/Berlin' WHERE id = …` to test — windows now respect the recipient's local clock.
18. **Retry backoff (v8B)**: a transport failure no longer instantly marks `failed`. The worker schedules the next attempt at +30 s / +5 min / +30 min and only marks `failed` once `delivery_attempts >= max_attempts` (default 3, override per row).
19. **HTML email (v8B)**: rows in `notification_templates` carry an optional `html_template`. With `RESEND_API_KEY` set, Resend sends both `text` and `html`. Templates substitute `{{var}}` from `payload` (HTML-escaped).
20. **Owner inbox (v8B)**: sign in as an owner-grant'd app_user, hit `/owner/inbox` — visibility includes both rows targeted at the user directly and rows targeted at any owner they hold an active grant on.
21. **Front office boards (v9A)**: open `/dashboard/front-office`. Arrivals (`/dashboard/front-office/arrivals`), Departures (`/dashboard/front-office/departures`), In-house (`/dashboard/front-office/in-house`), and Check-in/out requests (`/dashboard/front-office/requests`) are wired to today's bookings + the v9A tables. Guest data is shown as a safe display name (e.g. "Emma W.") — never the email or phone.
22. **Availability board (v9A)**: `/dashboard/availability` lists active calendar blocks for the next 7 days (manual + booking-sourced). Create a manual block at `/dashboard/availability/blocks/new`; back-to-back stays do not conflict (half-open intervals). `/dashboard/availability/blocks` lists everything and lets you cancel manual blocks (booking blocks have to be cancelled via their booking).
23. **Readiness (v9A)**: `/dashboard/readiness` shows the current open readiness row per villa and exposes a Set form. Setting a status closes the previous row and inserts a new one in one transaction. Housekeeping task changes auto-bump readiness via `autoSetReadinessFromTask` when called from the operations action layer.
24. **Responsibility scopes (v9A)**: `/dashboard/settings/responsibility-scopes` lets you narrow a user's actionable surface to a project / villa / category. NULL fields = "any". The pure matcher (`matchesScope`) is exported for future task-routing.
25. **Security camera registry (v9A)**: `/dashboard/security/cameras` is a registry only — the platform never streams video. Operators click through to the vendor app. Owners + guests cannot see this surface.

### v9A migration & seed notes

- Migration: `drizzle/0011_villa_availability_front_office_readiness.sql` (idempotent). Adds 6 tables, RLS force-on with `is_internal_user()`-gated SELECT, a partial unique index for the open-readiness-row guarantee, and a partial unique index on `(source_type, source_id)` so booking↔block sync is idempotent. Inserts the new `booking_manager` role.
- Seed: appended to `drizzle/seed.sql`. Creates a guest-booking block synced from `ARC-A-00241`, plus maintenance / OOO / inspection / internal-hold blocks across Eternal + Enso; five readiness rows; four stay events; three check-in/out requests (one each of late_checkout / expected_checkout_time / early_checkin); two responsibility scopes for the seeded super_admin; three placeholder cameras with vendor URLs.
- Run `npm run db:migrate && npm run db:seed`.

### How to test availability conflicts (v9A)

Pure logic is exercised by `tests/v9a-availability.test.ts`. To verify against real data:

```sql
-- Sample query: villas free between 2026-05-05 and 2026-05-08 in Enso.
SELECT v.unit_code, v.id
  FROM villas v
 WHERE v.project_id = '1eda0001-0000-0000-0000-000000000002'
   AND v.status = 'active'
   AND NOT EXISTS (
     SELECT 1 FROM villa_calendar_blocks b
      WHERE b.villa_id = v.id
        AND b.status = 'active'
        AND b.starts_at < TIMESTAMPTZ '2026-05-08 00:00:00+00'
        AND b.ends_at   > TIMESTAMPTZ '2026-05-05 00:00:00+00'
   );
```

The seeded internal_hold on `ES-S2` will exclude that villa from the result.

### Owner stays + rate plans (v9B)

26. **Owner stay request (owner)**: sign in as an owner-grant'd app_user, hit `/owner/stays/new`. Pick a villa, dates, optional purpose. Owner stays are welcome — operational costs and rental-pool compensation may apply per policy. After submitting, see your request status and estimated charges at `/owner/stays/[id]`. No guest data, no relocation details.
27. **Owner stay admin review**: `/dashboard/owner-stays/requests`. Statuses: `pending_admin_approval`, `requires_relocation` (if it overlaps a guest booking), `approved`, `rejected`. Click into a request → `Discover relocations` to compute candidates → approve + apply each candidate → approve the owner stay. Approval materialises a `villa_calendar_blocks` row with `block_type='owner_stay'`.
28. **Owner stay policy (admin)**: `/dashboard/owner-stays/policies/new`. Villa-level policy beats project-level beats global. Configure `free_nights_per_year`, `peak_season_rules`, `blackout_dates`, `compensation_model`, `operational_cost_model`. Free nights apply to non-peak by default; toggle `free_nights_apply_to_peak` to include peak.
29. **Equivalence groups (admin)**: `/dashboard/owner-stays/equivalence-groups`. A booking can be relocated only to another villa in the same group with same-or-better `quality_rank` (lower = better) and a free target window. Add members on the list page after creating a group.
30. **Rate plans (admin)**: `/dashboard/bookings/rates`. Per-project (or per-villa) base rate + currency. Add seasons (multipliers, fixed nightly, MLOS, stop-sell) and per-night overrides. Used by the owner-stay estimator and (in v9C+) the direct-booking quote.
31. **Combined villa availability (admin)**: `/dashboard/villas/[id]/availability` shows the next 30 days of active blocks (bookings, owner stays, maintenance, OOO, internal holds), the current readiness, and the rate-card preview from `quoteForRange`.

### v9B migration & seed notes

- Migration: `drizzle/0012_owner_stays_relocation_basic_rates.sql` (idempotent). Adds 8 tables, force RLS, plus owner-self `SELECT/INSERT/UPDATE(cancel)` policies on `owner_stay_requests` via `current_owner_ids()`. All other v9B tables are internal-only.
- Seed: 2 owner-stay policies (Enso pooled, Eternal hybrid), 2 rate plans with peak + shoulder seasons + a few overrides, 1 equivalence group with 3 Enso villas, 3 sample owner-stay requests (available / requires-relocation / rejected), and 1 relocation candidate.
- Run `npm run db:migrate && npm run db:seed`.

### How to test `quoteForRange` (v9B)

Pure logic in `tests/v9b-owner-stays.test.ts` covers exclusive-checkout, override > season > base, stop-sell, min_los, determinism. Manual sanity check from a Node REPL:

```ts
import { quoteForRange } from "@/features/pricing/services";
await quoteForRange({
  villaId: "1eda0002-0000-0000-0000-000000000012", // ES-S5
  checkIn: "2026-04-26",
  checkOut: "2026-04-30",
});
// → { available: true, currency: "USD", nights: 4, grossAmountMinor: …, breakdown: […], ratePlanId: "5eda…" }
```

The seeded `2026-04-26` and `2026-04-27` overrides on Enso (`95000` minor each) plus the shoulder-April season (`× 1.1`) on `2026-04-28`/`2026-04-29` produce a deterministic total.

### v9C — owner stay finance bridge, notifications, public quote API

32. **Mark stay completed (admin)**: open `/dashboard/owner-stays/requests/[id]` for an approved stay → "Mark completed". This stamps `completed_at` and queues an `owner_stay.completed` notification to the owner inbox.
33. **Bridge to finance (admin, single)**: same page → "Bridge to finance". Permission: `owner_stay.finance_bridge`. Materialises `management_fee_lines` (compensation) + `expense_lines` (operational cost, `allocation_scope='owner_direct'`) dated the last night of the stay. Idempotent — re-running never duplicates rows.
34. **Bridge pending batch**: `/dashboard/owner-stays/finance-bridge` → "Bridge pending". Walks every approved/completed owner stay whose `finance_bridge_status` is `pending` / `failed` / `skipped_locked_period` and re-runs the bridge.
35. **Locked period skip**: if the effective date falls inside a `closed`/`locked` `statement_period`, the bridge persists the link with `bridge_status='skipped_locked_period'` and **does not** mutate finance rows. Re-run after the period reopens; the link row updates in place.
36. **Reverse bridge (admin)**: same request page when state is `bridged` → "Reverse bridge". Deletes the materialised finance rows (subject to the locked-period trigger) and flips the link to `reversed`. Audit-logged.
37. **Owner notifications**: a request's lifecycle queues these templates to the owner's inbox: `owner_stay.request_received` on submit; `owner_stay.relocation_pending` if dates overlap a booking; `owner_stay.approved` / `owner_stay.rejected` on admin decision; `owner_stay.cancelled` on cancel; `owner_stay.completed` on complete; `owner_stay.finance_bridged` after a successful bridge. All in-app by default; email variants for `approved` and `completed`.
38. **Owner stay timeline (owner)**: `/owner/stays/[id]` now shows a Timeline section (submitted → approved → completed → charges posted). `/owner/stays` shows a "Last updated" stamp per row.

### Public quote API (v9C)

Endpoint:

```
GET /api/v1/quote?villaId=<uuid>&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
```

Public read; rate-limited to 60 rpm per IP (in-memory token bucket, single-instance for v9C). Method guard rejects non-GET with 405. Validated with Zod. The response:

```jsonc
{
  "ok": true,
  "available": true,
  "currency": "USD",
  "nights": 4,
  "grossAmountMinor": "380000",
  "grossAmountFormatted": "3800.00",
  "nightlyBreakdown": [
    { "date": "2026-04-26", "amountMinor": "95000", "amountFormatted": "950.00", "source": "override" },
    { "date": "2026-04-27", "amountMinor": "95000", "amountFormatted": "950.00", "source": "override" },
    { "date": "2026-04-28", "amountMinor": "90200", "amountFormatted": "902.00", "source": "season" },
    { "date": "2026-04-29", "amountMinor": "90200", "amountFormatted": "902.00", "source": "season" }
  ],
  "minLosRequired": null,
  "warnings": [],
  "reason": "ok"
}
```

Reason values: `ok` · `stop_sell` · `min_los_violation` · `no_rate_plan` · `no_nights`. The response **never** exposes rate-plan IDs, season IDs, or any internal references. Same inputs always produce the same numbers (deterministic — verified by test).

Quick sanity check:

```bash
curl -s "http://localhost:3000/api/v1/quote?villaId=1eda0002-0000-0000-0000-000000000012&checkIn=2026-04-26&checkOut=2026-04-30" | jq .
```

Or the internal tester at `/dashboard/bookings/rates/quote`.

### v9C migration & seed notes

- Migration: `drizzle/0013_owner_stay_finance_notifications_quote_api.sql` (idempotent). Adds `owner_stay_finance_links` with a unique index on `owner_stay_request_id` (the idempotency anchor) + RLS internal-only. Adds `finance_bridge_status` / `finance_link_id` / `completed_at` columns on `owner_stay_requests`.
- Seed: 9 notification templates (7 in-app + 2 email variants). Promotes one v9B request into `completed + bridged` with matching `management_fee_lines` and `expense_lines` rows so the bridge dashboard renders. 3 sample owner-stay notifications queued.
- Run `npm run db:migrate && npm run db:seed`.

### AI Operations Co-pilot (v8B)

Default behaviour: AI is OFF. The dashboard renders a **deterministic
fallback** built from `OperationsSnapshot` until the operator sets
`ANTHROPIC_API_KEY` and `AI_DRY_RUN=0`. Hard rules:

- Read-only. The model is only given an 8-tool allowlist
  (`getOperationsMetrics`, `listOperationTasks`, `listBookingConflicts`,
  `listLowStockItems`, `listJobRuns`, `listCalendarFeeds`,
  `listServiceRequests`, `listMaintenanceTickets`). Anything else is
  rejected at the dispatcher and recorded as `status='blocked'`.
- No write tools, no notifications, no secrets, no owner finance data.
- Output JSON validated by Zod. Schema violation → fallback summary,
  run tagged `failed`.
- 20 s request timeout via `AbortController`, max 4 tool-use rounds,
  max 1500 output tokens.

```bash
# .env.local — opt in
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-latest   # optional override
AI_DRY_RUN=0
```

- **Dashboard card**: `/dashboard/operations` — "AI Operations Co-pilot"
  Section with risk badge, executive summary, top risks, suggested
  actions. Refresh button is permission-gated by `ai.run`.
- **Detail**: `/dashboard/ai/operations` — latest summary + history,
  links to the run detail.
- **Run inspector**: `/dashboard/ai/runs` and `/dashboard/ai/runs/[id]` —
  every run with status, model, latency, tokens, the tool calls it
  issued (including blocked ones), error message.
- **Daily refresh job**: `ai_operations_summary_refresh` is registered
  but **disabled by default**. Flip it on at `/dashboard/jobs` to enable
  the 06:00 cron, or POST `/api/cron/ai-operations-summary` with the
  `CRON_SECRET` to fire it directly.

---

## Architecture

```
src/
├── app/                                    # Next.js App Router (5 surfaces)
├── components/                             # UI primitives + layouts (unchanged from v1)
├── config/                                 # Navigation
├── features/                               # Backend-aware feature modules
│   ├── auth/        (current-user, signIn / signOut server actions)
│   ├── projects/    (services, schema, actions)
│   ├── villas/      (services, schema, actions)
│   ├── owners/      (services, schema, actions, includes ownership shares)
│   ├── bookings/    (services, schema, actions)
│   ├── channels/    (services)
│   ├── guests/      (services)
│   ├── documents/   (services)
│   └── audit/       (server-side append-only writer)
├── lib/
│   ├── db/
│   │   ├── client.ts                       # Drizzle client w/ graceful null
│   │   └── schema/                         # 6 schema files + barrel
│   ├── supabase/
│   │   ├── browser.ts | server.ts | admin.ts
│   ├── env.ts
│   ├── mock/                               # Demo data (still source for fallback)
│   └── utils.ts
└── styles/

drizzle/
├── 0000_initial.sql                        # DDL + RLS enable + baseline policy
└── seed.sql                                # idempotent demo data

scripts/
├── migrate.ts | seed.ts                    # tsx applier helpers

tests/
└── schema.test.ts                          # node:test smoke tests
```

See [`docs/ADR-0001-STACK_DECISIONS.md`](./docs/ADR-0001-STACK_DECISIONS.md) for the original stack and [`docs/ADR-0002-BACKEND_FOUNDATION.md`](./docs/ADR-0002-BACKEND_FOUNDATION.md) for the v2 backend decisions.

---

## What's mock / demo

When `DATABASE_URL` is not configured (or `ARCONIQUE_FORCE_MOCK=1`):

- All admin list pages read from `src/lib/mock/*` and show a **Demo data** badge.
- `/login` accepts no credentials; demo quick-links open each surface unrestricted.
- Server actions for create flows return a typed error explaining how to enable persistence.

When configured:

- Admin list pages read from Postgres (`projects`, `villas`, `owners`, `ownership_shares`, `booking_channels`, `guests`, `bookings`).
- `Create` server actions persist + log an `audit_events` row.
- `/login` performs Supabase password sign-in and redirects to `/dashboard`.
- Marketing pages and the AI hub remain hand-crafted demo content (intentionally).

The platform never silently mixes — every row carries `source: "db" | "mock"` and every page makes the source visible.

---

## Roadmap pointer

This is **Version 2 — Core Data Model**. Up next, per [`docs/IMPLEMENTATION_ROADMAP.md`](./docs/IMPLEMENTATION_ROADMAP.md): **v3 — Finance & Investor Reporting**, where revenue/fee/expense ledgers, allocation rules, statement generation, hash-signed PDFs, and the owner-scoped RLS policies arrive.

---

### v9D — Preventive maintenance + utilities

39. **Maintenance template catalog (admin)**: `/dashboard/maintenance-intelligence/templates` lists the seeded Bali catalog (AC service biweekly, pool service twice-weekly, pest monthly, garden weekly, pump monthly, Wi-Fi monthly, smart-lock battery monthly, electrical quarterly). Add custom ones at `/dashboard/maintenance-intelligence/templates/new`.
40. **Per-villa plans**: `/dashboard/maintenance-intelligence/plans/new` clones a template into a villa-specific instance with cadence + preferences. The first `next_due_at` is `now + interval`.
41. **Smart window suggestions**: open a plan, click **"Refresh suggestions"** to compute scored 14-day windows. The scorer rejects guest-stay overlaps (when the plan requires the villa empty), `out_of_order` / `internal_hold` / `maintenance_block` overlaps, and dates on `avoid_weekdays`. It penalises clustering — same project + same category + same date pushes the score down.
42. **Generate tasks**: per plan via "Generate task" / "Accept suggestion", or via the **"Generate due tasks"** batch button on the plans index. Plans whose `next_due_at` has elapsed materialise an `operation_tasks` row (`source='preventive'`, `category='maintenance'`) and — when the plan needs the villa empty or has medium/high disruption — a matching `maintenance_block` calendar block.
43. **Risk feed**: `/dashboard/maintenance-intelligence/risks` aggregates seven types into one inbox: overdue maintenance, low / critical utility balance, no recent reading, repeated tickets, upcoming guest-block conflict, arrival-not-ready. Click **"Scan risks"** to refresh; the scanner is idempotent.
44. **Utility accounts**: `/dashboard/utilities/accounts/new` — PLN token, PDAM water, ISP, gas, waste, security. Set `low_balance_threshold_minor` and `critical_balance_threshold_minor` so the risk scanner can classify automatically.
45. **Record a reading**: open the account detail page → "Record reading". Token-meter accounts capture `balance_minor`; meter accounts capture `reading_value`. A balance below threshold opens a `maintenance_risk_events` row instantly (idempotent — same source can't open twice while still open).
46. **Payment reminder**: same account page → "Add reminder". Mark paid from `/dashboard/utilities/payments` → "Mark paid". When the period is open + amount is set, an `expense_lines` row is created and linked. Locked period → marked paid with a clear note, no expense row.
47. **Operations dashboard**: `/dashboard/operations` now shows a **Risk feed** card with maintenance and utility buckets, plus a critical-severity counter.
48. **Readiness page**: `/dashboard/readiness` warns when today's arrivals point at villas that aren't `ready` / `occupied` / `cleaning` / `inspection`. The risk scanner queues `readiness.arrival_not_ready` notifications.

### v9D migration & seed notes

- Migration: `drizzle/0014_preventive_maintenance_utilities.sql` (idempotent). 7 tables + force RLS + a partial unique index `(risk_type, source_type, source_id) WHERE status='open'` on `maintenance_risk_events` for idempotent risk scans.
- Seed: 8 maintenance templates, 7 villa plans, 4 utility accounts (1 with critical PLN balance), 3 readings, 2 payment reminders (1 overdue), 2 risk events, 7 notification templates.
- Run `npm run db:migrate && npm run db:seed`.

### How to test the risk scanner

```sql
-- Confirm the seeded critical utility balance and overdue plan exist:
SELECT risk_type, severity, title FROM maintenance_risk_events WHERE status='open';

-- Generate a maintenance task from the seeded "AC service · EV-S5" plan:
-- (use the dashboard) /dashboard/maintenance-intelligence/plans → "Generate due tasks"

-- Watch operation_tasks pick up a new MNT-YYYYMMDD-NNN row.
SELECT task_code, title, source, scheduled_for FROM operation_tasks
 WHERE source = 'preventive' ORDER BY created_at DESC LIMIT 5;
```

### v9E — Guest stay production foundation

49. **Issue a guest stay token (admin)**: `/dashboard/bookings/[id]/guest-stay` → "Issue token". Optional email + phone fields stamp the recipient. The full URL is shown **exactly once** and copied to clipboard — we store only the SHA-256 hash. Default expiry is `checkOut + 7 days`.
50. **Open `/stay/[token]` (guest)**: the seeded demo token is `arconique-v9e-demo-stay-token-aaaaaaaaaaaaaaaaaaaaaaaa` — bound to booking `ARC-A-00238` (Enso S2). All eight subpages (`check-in`, `wifi`, `guide`, `house-rules`, `neighborhood`, `emergency`, `services`, `offline`) are token-gated.
51. **Revoke a token (admin)**: `/dashboard/guest-stays/tokens/[id]` → "Revoke" (with optional reason). Re-using the URL after revoke shows a friendly "no longer valid" page; the access event is logged with `revoked_token`.
52. **Edit villa guide content (admin)**: `/dashboard/villa-guides/sections` (and the three sibling pages — wifi, emergency-contacts, neighborhood). Villa-scoped rows beat project-scoped; set `guest_visible=false` to keep a row internal.
53. **Smart-lock stub (admin + guest)**: an active stub is created automatically when a token is issued; the same code is shown in the booking guest-stay panel. Validity = `[checkIn − 24 h, checkOut + 3 h]`. The seeded code for `ARC-A-00238` is `903754`. **Demo only — no real lock APIs are called.**
54. **Submit a guest service request**: `/stay/[token]/services` — token-gated, no admin auth required. Creates a `service_requests` row with `request_type='guest_portal'`, queues notifications to `concierge` + `property_manager`, audit-logs the create.
55. **Offline / printable view**: `/stay/[token]/offline` collects the must-haves (door code, Wi-Fi, house rules, concierge, emergency) on a single printable page. Click "Print or save as PDF" to use the browser's print dialog.

### v9E migration & seed notes

- Migration: `drizzle/0015_guest_stay_foundation.sql` (idempotent). Adds 7 tables — `guest_stay_tokens`, `guest_stay_access_events`, `villa_guide_sections`, `villa_wifi_credentials`, `villa_emergency_contacts`, `villa_neighborhood_places`, `smart_lock_access_codes` — with force RLS internal-only, partial unique indexes for guide-key resolution, and `(booking_id) WHERE status='active'` on smart-lock so re-issuing replaces the previous active code.
- Seed: project-level Enso guide content (check-in, house rules, amenities, transport) plus a villa-level Enso S5 override; one Wi-Fi entry per scope; four emergency contacts; five neighborhood places; one stay token + smart-lock stub for booking `ARC-A-00238`; one notification template (`guest_stay.service_request_created`).
- Run `npm run db:migrate && npm run db:seed`.

### Security model — guest tokens

- **At rest**: only the SHA-256 hash + 8-char prefix. Raw token never stored.
- **At issue**: shown to operator one time; copy-to-clipboard helper available.
- **At resolution**: server hashes the URL token, looks up by hash, validates status + expiry, increments access counters. Returns a **safe summary** that filters owner/finance/internal data.
- **Revoke**: status flip + reason captured. Subsequent access logs `revoked_token` and shows a friendly empty state.
- **IP logging**: `ip_hash = sha256(salt + ip).slice(0, 16)`. Operators can spot reuse, never see plaintext.

### v9F — Guest services catalog & upsell revenue

56. **Open the guest catalog**: `/stay/[token]/services` (token-gated). Tap any tile to open the order modal — pick options, date / time, quantity, guest count. Submit creates a `guest_service_orders` row with `requested` status and queues an in-app notification to concierge + property_manager. Quote-required services submit at price 0; the operator quotes a number on transition.
57. **Curate the catalog (admin)**: `/dashboard/guest-services/catalog` — search + filter by status / category, edit pricing, options, lead time, quantity bounds, scope (global / project / villa). Villa-scoped rows beat project-scoped, project beats global, all by `service_key`.
58. **Run the order lifecycle (admin)**: `/dashboard/guest-services/orders` — every inbound order with status filters. Open one to move it through `requested → reviewing → confirmed → scheduled → fulfilled` (or `cancelled` / `rejected`). On `fulfilled` the system auto-bridges to `revenue_lines`. The `Quote price` field on the transition form lets ops set a number for `quote_required` orders before bridging.
59. **Bridge to revenue (admin)**: `/dashboard/guest-services/finance-bridge` lists pending + locked-period rows. Locked periods hold the bridge — use a finance adjustment instead of forcing through. The bridge anchor is `guest_service_finance_links.order_id` UNIQUE — re-bridging is idempotent.
60. **Track margin (admin)**: each order row stores `guest_price_minor`, `internal_cost_minor`, and `margin_minor`. Internal cost / margin is admin-only and never reaches the guest.

### v9F migration & seed notes

- Migration: `drizzle/0016_guest_services_upsells.sql` (idempotent). Adds 6 tables — `guest_service_categories`, `guest_services`, `guest_service_options`, `guest_service_orders`, `guest_service_order_events`, `guest_service_finance_links` — with force RLS internal-only, a `COALESCE`-based partial unique index for `(project_id, villa_id, service_key)` scoping, and a UNIQUE on `guest_service_finance_links.order_id` as the bridge idempotency anchor.
- Seed: 7 categories (transport, wellness, food, experiences, housekeeping, stay extras, concierge), 12 catalog services (10 global, 1 Enso project-scoped breakfast, 1 Enso S2 villa-scoped chef override), 8 options, 4 sample orders bound to booking `ARC-A-00238` (one `requested` daily breakfast, one `confirmed` couple massage, one `fulfilled` IDR airport transfer already bridged into `revenue_lines`, one `requested` quote-required cruise), and 6 `guest_service_order.*` notification templates.
- Run `npm run db:migrate && npm run db:seed`.

### Money + permissions — v9F

- All amounts are `BIGINT` minor units paired with `currency`. Internal cost stays on the order (and on the catalog row) — never written to `expense_lines`, never exposed to guests.
- Seven new permission keys: `guest_services.{read,write,manage}`, `guest_service_orders.{read,write,fulfill,finance_bridge}`. Owners + agents excluded everywhere. `finance_bridge` is the narrowest (finance_manager + ops).
- ADR: [ADR-0017](./docs/ADR-0017_GUEST_SERVICES_UPSELLS.md).

### v9G — Guest stay security hardening

61. **Wi-Fi at rest** is encrypted with AES-256-GCM. Set `STAY_LINK_KMS_SECRET` (≥ 32 chars; recommend `openssl rand -hex 48`) and the platform derives a versioned data key via scrypt. Production fails closed when the secret is missing; dev falls back to a deterministic placeholder with a `console.warn`.
62. **Migrate legacy Wi-Fi**: `/dashboard/villa-guides/wifi/migrate` → "Run migration sweep." Sweeps every active row, encrypts `display_password` into `password_ciphertext`, clears the plaintext. Idempotent — rows already encrypted are skipped.
63. **First-visit verification**: opening `/stay/[token]` for the first time redirects to `/stay/[token]/verify`. The platform auto-issues a 6-digit code (10-min expiry, 5-attempt cap, 60s resend cooldown), delivers it via the existing notifications queue (email / sms / whatsapp), and unlocks the rest of the portal once correct.
64. **Reveal-on-tap**: `/stay/[token]/wifi` and `/stay/[token]/check-in` no longer render the password / door code in HTML. Each sensitive value sits behind a "Show password" / "Show door code" button. Each reveal logs a `wifi_viewed` / `lock_code_viewed` security event with the IP hash + UA.
65. **Rate limiting**: 60 requests / 10 minutes per (token-prefix, IP) on the guest portal; 5 attempts / 10 minutes on verification submits. Hitting the limit blocks for 10 / 30 minutes and logs `token_rate_limited`. The friendly 429 page is served at the same URL.
66. **Security ops**: `/dashboard/guest-stays/security` (hub), `/security/events` (filterable severity log), `/security/verifications` (one-time codes). The booking detail page now shows the latest verification status alongside the token panel.

### v9G migration & seed notes

- Migration: `drizzle/0017_guest_stay_security.sql` (idempotent). Adds 4 tables (`wifi_encryption_keys`, `guest_stay_token_verifications`, `guest_stay_security_events`, `guest_stay_rate_limits`) and three columns on `villa_wifi_credentials` (`password_ciphertext`, `password_key_version`, `password_migrated_at`). All new tables get force RLS internal-only; the `(token_prefix, ip_hash)` rate-limit row + `(guest_stay_token_id) WHERE status='pending'` verification row both have unique indexes.
- Seed: bootstrap key version `1` row + four notification templates (`guest_stay.verification_code` for email and sms, plus `security_alert` and `link_verified`). Wi-Fi ciphertext is NOT pre-baked into the seed because the AES blob depends on the runtime KMS secret — run the migration sweep after `db:seed`.
- Run `npm run db:migrate && npm run db:seed`, then visit `/dashboard/villa-guides/wifi/migrate` and click "Run migration sweep" to encrypt the seed's plaintext Wi-Fi rows.

### Security limitations — v9G

- Verification is **per token**, not per device — anyone who knows the token + receives the code can verify. v9H may add device binding.
- The KMS secret derives keys via scrypt — there is no real HSM. Rotate the env secret + the `wifi_encryption_keys` active row together.
- `guest_stay_rate_limits` grows over time. v9H adds a nightly sweep.
- ADR: [ADR-0018](./docs/ADR-0018_GUEST_STAY_SECURITY.md).

### v9H — Guest AI concierge v0

67. **Open the concierge**: `/stay/[token]/concierge` — token + verification gated. Guests can ask anything about their stay; the AI is grounded only in their villa's configured guide / neighborhood / services catalog.
68. **Live mode**: set `ANTHROPIC_API_KEY` (already documented in v8B) and flip `AI_DRY_RUN=0`. The concierge runs `claude-3-5-haiku-latest` (or `ANTHROPIC_MODEL` override) with a 15s timeout, 700-token output cap.
69. **Fallback mode**: when the API key is missing or `AI_DRY_RUN=1`, the concierge answers deterministically from the configured villa data — Wi-Fi / lock-code questions defer to the reveal pages; dinner / things-to-do questions read from the neighborhood list; service questions read from the catalog.
70. **Safety model**: the assistant is **read-only**. It cannot book, charge, cancel, or message staff. It cannot reveal the Wi-Fi password or smart-lock code — those keep their reveal-on-tap flow. Disallowed intents (asking for the Wi-Fi password / door code / cameras / owner finance / other guests, asking the AI to book / pay / cancel / call staff, unsafe-activity questions) are caught by a pure keyword guard and refused with copy that points at the right portal page. Outputs are sanitized to scrub stray 6-digit codes and 32+ char tokens.
71. **Limits**: max 12 user messages per session, 5 messages/minute and 20 messages/hour per token. Beyond that, the guest is sent back to the Concierge & services form.
72. **Admin observability**: `/dashboard/guest-ai` (hub), `/dashboard/guest-ai/sessions` (filterable list), `/dashboard/guest-ai/sessions/[id]` (full transcript, safety status badges, model + latency + token metrics, per-run safety flags). The booking guest-stay panel and the security-events log already pick up the `suspicious_access` rows fired by the AI guard.

### v9H migration & seed notes

- Migration: `drizzle/0018_guest_ai_concierge.sql` (idempotent). Adds 3 internal-only tables (`guest_ai_concierge_sessions`, `guest_ai_concierge_messages`, `guest_ai_concierge_runs`) with force RLS + `internal_read` + `internal_write`, a partial unique on the active session per token, and CHECK constraints on `role` and `safety_status`.
- Seed: a single notification template (`guest_ai.safety_attention`). No sample chat data — sessions only spin up when a verified guest hits the concierge route.
- Run `npm run db:migrate && npm run db:seed`. No additional env vars beyond v8B's `ANTHROPIC_API_KEY` / `AI_DRY_RUN`.

### Limitations — v9H

- Keyword-based intent detection is fragile. False negatives are caught by output sanitisation + the leak-check, but a model-graded classifier is a v9I candidate.
- Single-shot prompt — no tool use, no follow-up reasoning over fresh data. Tool use under a strict read-only allowlist is deferred.
- No streaming responses; `useActionState` round-trip is fine for short answers.
- English in / English out; localisation is deferred.
- ADR: [ADR-0019](./docs/ADR-0019_GUEST_AI_CONCIERGE.md).

### v9I — Guest concierge operational handoff

73. **Ask human concierge / Report this to staff**: under every AI reply at `/stay/[token]/concierge`, two new buttons open a modal where the guest picks an issue type (`ask_human`, `report_problem`, `service_question`, `ai_refusal_followup`), priority, types a short message, and optionally a preferred contact. Submitting creates a real `service_requests` row paired with a `guest_ai_handoffs` row that carries the redacted last-3-message conversation snapshot.
74. **Emergency handling**: if the message contains words like *fire / injury / police / ambulance / intruder*, the system routes to `emergency_concern` and forces priority `urgent` regardless of UI input. Concierge + property_manager + operations_manager all receive notifications, and a `suspicious_access` security event is logged for ops to follow up.
75. **Track requests**: the new `/stay/[token]/requests` page lists every request the guest sent — concierge-AI handoffs *and* v9E free-text concierge requests — with code, title, status, priority, and `created_at`. No internal notes, staff names, or financial details are exposed. Status updates flow automatically from the underlying `service_requests` row.
76. **Admin escalation surface**: `/dashboard/guest-ai/handoffs` (filterable list with severity / urgency pills), `/dashboard/guest-ai/handoffs/[id]` (full redacted excerpt + safety flags + linked SR + Acknowledge / Mark resolved buttons). The AI session detail page also lists every handoff fired from that session.
77. **Archive AI sessions**: `/dashboard/guest-ai/sessions/[id]` now has an admin-only **Archive session** button. Archiving releases the active-session slot so the next visit starts a fresh thread (closes the v9H known issue).
78. **Defence-in-depth redaction**: the modal text, the conversation snapshot, and the composed service-request body all run through `redactHandoffContext`. Even if a guest types their door code or Wi-Fi password, neither row will store it verbatim — codes / tokens / "password is X" patterns are scrubbed.

### v9I migration & seed notes

- Migration: `drizzle/0019_guest_concierge_handoff.sql` (idempotent). Adds one internal-only table (`guest_ai_handoffs`) with force RLS + `internal_read` + `internal_write`, CHECK constraints on `handoff_type` / `status` / `priority`, and the seven indexes mandated by the spec.
- Seed: three notification templates (`guest_ai.handoff_created`, `_urgent`, `_resolved_guest`). The `_resolved_guest` template is reserved for a v9J guest-facing notification and not yet queued.
- Run `npm run db:migrate && npm run db:seed`. No new env vars.

### Limitations — v9I

- Rate limits are per-token, not per-IP — a shared URL means a shared bucket. Acceptable in v9I; v9J could split.
- Acknowledging a handoff does NOT auto-accept the linked service_request; ops still works the ticket through their normal queue.
- Resolving a handoff does NOT auto-complete the service_request; explicit operator action required to close.
- Guests don't receive email / SMS yet on resolve. The template is seeded for v9J; current status is in-portal only.
- Last-3-message snapshot is a frozen excerpt; ops can click through to the full AI session for context.
- ADR: [ADR-0020](./docs/ADR-0020_GUEST_CONCIERGE_HANDOFF.md).

### v9J — Two-way guest request center

79. **Per-request detail**: tap any row in `/stay/[token]/requests` and `/stay/[token]/requests/[code]` opens — request status, priority, the redacted reply timeline (guest, staff, system), and a follow-up composer when the handoff is still open. Resolved requests show a confirmation card and route the guest back to the Concierge AI to start a new ask.
80. **Unread badges + previews**: the requests list now shows a "N new" pill, the latest staff/system reply preview (≤140 chars, redacted), and a last-update timestamp. Visiting the detail page marks the thread read.
81. **Admin two-way thread**: `/dashboard/guest-ai/handoffs/[id]` gains a guest-visible reply composer (with a live redaction warning) and a separate internal-note composer. The unified timeline shows visibility badges (`guest visible` / `internal note`), reply types, and a small `redacted` badge when raw vs sanitised diverge.
82. **System status replies**: acknowledging a handoff drops a guest-visible "Our team acknowledged this request" message; resolving drops a "Marked resolved by …" message + queues `guest_ai.handoff_resolved_guest`. Optional resolution notes are posted as a separate guest-visible staff reply (redacted).
83. **SLA dashboard**: `/dashboard/guest-ai/handoffs/metrics` — open / urgent-open / overdue counts, median time-to-ack / first-response / resolve, plus by-villa / by-type / by-priority breakdowns. Overdue thresholds: 30 min for urgent, 2 h for everything else.
84. **Defence-in-depth redaction**: every reply runs through `redactBase` which scrubs codes, tokens, password literals, emails, phones, and camera URLs (`rtsp://`, `rtmp://`, anything containing `camera` / `cctv` / `stream`). Guest-visible staff replies that change after redaction surface a warning to the operator before send.

### v9J migration & seed notes

- Migration: `drizzle/0020_guest_request_center.sql` (idempotent). Adds `guest_ai_handoff_replies` (force RLS internal-only, four indexes, CHECKs on author_type / visibility / reply_type) and five new columns on `guest_ai_handoffs` (`first_staff_reply_at`, `last_guest_reply_at`, `last_staff_reply_at`, `guest_unread_count`, `staff_unread_count`) plus partial indexes on the unread counters.
- Seed: two notification templates (`guest_ai.handoff_reply_guest` for staff inbox on guest replies, `guest_ai.handoff_reply_staff` reserved for future in-portal guest delivery).
- Run `npm run db:migrate && npm run db:seed`. No new env vars.

### Limitations — v9J

- No real-time push — the guest detail page renders on navigation. Polling or SSE could land in v9K.
- Read receipts are page-load granularity, not per-message.
- No file / photo uploads on replies.
- The `guest_ai.handoff_reply_staff` template is seeded but only delivered in-app; email/SMS to the guest is deferred.
- Internal notes are visible to anyone with `guest_ai.handoff.read` (no team-scoped sub-permission yet).
- ADR: [ADR-0021](./docs/ADR-0021_GUEST_REQUEST_CENTER.md).

### v9K — Concierge attachments + per-message read receipts

85. **Attachments on every reply**: both `/stay/[token]/requests/[code]` and `/dashboard/guest-ai/handoffs/[id]` now expose an attachment uploader after a reply is sent. Max 3 files per reply, ≤ 8 MB each, MIME limited to `image/jpeg | image/png | image/webp | application/pdf`. Files upload directly to a private Supabase Storage bucket (`guest-request-attachments`) via short-lived signed URLs; the row in `guest_ai_handoff_reply_attachments` is the source of truth.
86. **Signed-URL only**: attachments never have a public URL. Every list call mints a fresh 10-minute signed download URL. The `storage_path` column is server-only — guest projections drop it entirely (`GuestAttachmentView` shape).
87. **Per-message read receipts**: a new `guest_ai_handoff_reply_reads` table tracks who read what, idempotent on `(reply_id, reader_type, principal)`. Visiting the guest detail or admin detail page now records receipts automatically. The guest sees "Seen by team" on their replies once any staff member reads it; the admin sees "Seen by guest" on staff guest-visible replies and "Read by staff" on guest replies.
88. **Internal-note permission gate**: booking managers (read-only role) **no longer** see internal notes. The new `guest_ai.handoff.notes.read` permission gates the entire internal layer — internal replies and internal attachments are filtered out server-side, not hidden in CSS, so booking managers can't fish them out via DevTools.
89. **Metrics surface gains**: `/dashboard/guest-ai/handoffs/metrics` now shows median first-staff-read time, total unread by guest / staff, and attachment counts grouped by handoff type.
90. **AI isolation**: a static-source test asserts the AI context builder + fallback never import attachment / signed-URL helpers. The AI doesn't know attachments exist. If a guest asks the AI to "see the photo", it routes them to the human handoff, which has the file context.

### v9K migration & seed notes

- Migration: `drizzle/0021_guest_request_attachments_reads.sql` (idempotent). Adds two internal-only tables (`guest_ai_handoff_reply_reads` with COALESCE-based unique index per (reply, reader_type, principal); `guest_ai_handoff_reply_attachments` with CHECKs on MIME / size / status / visibility / uploader_type and a UNIQUE on `(storage_bucket, storage_path)`). Both tables are force RLS internal-only.
- Storage: create a private Supabase bucket named `guest-request-attachments` and grant access via the service-role key only. No public read policy; signed URLs only.
- New permissions: `guest_ai.handoff.notes.read` (super_admin / director / ops / property / concierge), `guest_ai.handoff.attachments.read` (adds booking_manager), `guest_ai.handoff.attachments.write` (same set as `notes.read`). Owners / agents / field roles excluded everywhere.
- No new seed rows. No new env vars.

### Limitations — v9K

- **EXIF / image metadata stripping is deferred.** Storage isolation (signed-URL-only, 10-min TTL, no public URLs, no AI access) mitigates the worst cases but doesn't strip embedded geolocation. Documented in ADR-0022 as a v9L target.
- No real-time push — read receipts and new uploads only appear on navigation.
- No client-side image preview on the admin side; staff click through to view the signed URL.
- 8 MB per file is conservative. Larger files need resizing client-side first.
- Booking managers lose access to internal notes. This is the intentional v9K tightening.
- ADR: [ADR-0022](./docs/ADR-0022_GUEST_REQUEST_ATTACHMENTS_AND_READ_RECEIPTS.md).

### v9L — Storage hardening: EXIF strip, cleanup, bucket validation

91. **EXIF / textual-metadata stripping**: every guest concierge attachment now goes through a server-side strip pipeline before becoming guest-visible. **JPEG**: `APP1` (EXIF + XMP) segments removed; `APP0` JFIF, `APP2` ICC, `SOS` entropy preserved. **PNG**: `tEXt` / `zTXt` / `iTXt` chunks dropped; `IHDR` / `IDAT` / `IEND` and CRCs preserved byte-for-byte. **WebP**: marked `warning` (passthrough) — full strip deferred. **PDF**: marked `not_required`. The processed bytes are uploaded back to the same `storage_path`. Pure helpers in [metadata-strip-pure.ts](management/src/features/guest-ai-concierge/metadata-strip-pure.ts).
92. **Guest projection**: `listGuestVisibleAttachmentsForHandoff` now filters to `metadata_status ∈ {stripped, not_required, warning}` AND `security_scan_status ∈ {passed, warning}`. Pending/failed rows are surfaced separately through `pendingGuestAttachmentsForHandoff` so the guest sees "Processing file securely…" or "Could not be processed safely" instead of an empty timeline. No technical errors leak to the guest.
93. **Storage bucket validation**: `/dashboard/guest-ai/storage` (admin) now exposes a health view (`bucket exists`, `private`, `signed upload`, `signed download`) plus per-row failed-strip triage, plus three buttons: **Validate bucket**, **Strip pending metadata**, **Cleanup stale pending**.
94. **Daily cleanup cron**: new `guest_request_attachment_cleanup` job runs at 04:00 UTC via `/api/cron/guest-request-attachments-cleanup`, gated by the existing `CRON_SECRET`. Sweeps `pending` rows older than 24h, deletes the storage object, flips the DB row to `deleted` with `deleted_reason='stale_pending'`. Failed-metadata rows are NOT auto-deleted (admins triage manually on the storage page).
95. **Client-side image resize**: when the guest picks an image >8 MB, [client-image-resize.ts](management/src/components/guest-ai/client-image-resize.ts) walks a longest-edge × quality ladder via `<canvas>` until the output is under 8 MB. Refuses oversize PDFs and non-image files with friendly copy.
96. **Storage page metrics**: `/dashboard/guest-ai/storage` shows pending uploads, pending metadata strips, failed metadata, stale pending (>24h). Admin handoff detail rows now badge each attachment with `metadata stripped` / `no metadata` / `review (webp)` / `strip failed` / `processing`.

### v9L migration & seed notes

- Migration: `drizzle/0022_guest_request_storage_hardening.sql` (idempotent). Adds 9 columns to `guest_ai_handoff_reply_attachments` (`metadata_status`, `metadata_stripped_at`, `metadata_error`, `original_size_bytes`, `processed_size_bytes`, `cleanup_eligible_at`, `deleted_reason`, `security_scan_status`, `security_scan_notes`) plus three indexes. Existing v9K PDF rows get auto-flipped to `metadata_status='not_required'`.
- Seed: no new rows. The default job catalogue gains `guest_request_attachment_cleanup` so re-running `db:seed` registers it.
- Run `npm run db:migrate && npm run db:seed`. No new env vars.

### v9L Supabase bucket setup checklist

1. Supabase Dashboard → Project → Storage → **Create bucket** named **`guest-request-attachments`**, **Public bucket OFF**.
2. Open `/dashboard/guest-ai/storage` and click **Validate bucket**.
3. Expected: `bucket exists = ok`, `private = ok` (or `unknown` with a note when the SDK doesn't expose the flag), `signed upload = ok`, `signed download = warning` (probe path has no object — that's fine).
4. Upload a test attachment from `/stay/[token]/requests/[code]` and confirm it renders. The first guest reply that includes a JPEG is a good end-to-end sanity check — the file should land with `metadata_status='stripped'` and the EXIF block should be gone.

### Limitations — v9L

- **WebP metadata isn't stripped.** We mark it `warning`, serve it via signed URL only, no AI access. Stripper deferred to v9M.
- **PDF metadata isn't processed.** Same as v9K; admins know from the badge + this ADR.
- **`bucket_private` may report `unknown`** when the Supabase SDK doesn't return the public flag — we surface `unknown` rather than claim `ok` we can't verify.
- **Strip runs inline** in the register action (not in the job runner). Acceptable for v9L's traffic; can move to async if processing time grows.
- **No virus / content moderation** beyond MIME + size enforcement.
- ADR: [ADR-0023](./docs/ADR-0023_GUEST_REQUEST_STORAGE_HARDENING.md).

### v9M — Realtime concierge updates via SSE

97. **Two new streaming routes**: `/stay/[token]/requests/[code]/stream` (token + verification gated, V9G rate-limit envelope) and `/dashboard/guest-ai/handoffs/[id]/stream` (gated by `guest_ai.handoff.read`). Both serve `text/event-stream` and emit typed events (`reply_created`, `reply_read`, `attachment_processing`, `attachment_uploaded`, `attachment_failed`, `handoff_status_changed`, `unread_count_changed`, plus `connected` / `heartbeat` / `error`).
98. **Polling-backed loop**: each stream seeds a cursor (latest reply / receipt / attachment-change / handoff timestamp) and re-polls every 2 seconds; only changed rows are emitted. Heartbeat every 25 s, max connection 5 min, then the browser reconnects with `Last-Event-ID`.
99. **Guest projection scrubs forbidden fields**: `projectForGuest` recursively strips `storage_path`, `tokenHash`, `passwordCiphertext`, `codeDisplay`, `displayPassword`, `raw_token`, `internal_only` from every payload. `publicSafeStatus` collapses ops statuses to the public set (`received | acknowledged | resolved | cancelled`). `attachmentLifecycle` drives the guest "Processing securely…" / "Uploaded" / "Could not be processed safely" copy.
100. **Internal notes never stream to guests, ever** — and only stream to admins with `guest_ai.handoff.notes.read`. The notes-perm filter runs at SQL level, not in CSS, so DevTools-ing the page can't unhide them.
101. **Read-receipt loop guards**: server actions are idempotent (`INSERT ... ON CONFLICT DO NOTHING`) and the client uses `makeReadReceiptGate(2_000ms)` so a flurry of `reply_created` events fires at most one mark-read write per 2 s.
102. **Client UI**: small `Live | Connecting… | Reconnecting…` status strip on both pages; `EventSource`-unsupported browsers see a "pull to refresh" fallback. New events trigger a 350 ms-debounced `router.refresh()` so the existing server projection stays the source of truth.

### v9M migration & seed notes

- No new tables. No new columns. No new env vars. The realtime layer is a thin streaming projection on top of v9I–v9L data.
- The `seedGuestCursor` function is idempotent — opening a stream is a read-only action.
- Run `npm run db:migrate && npm run db:seed`. Quality gate from v9L still passes unchanged.

### Limitations — v9M

- 2-second polling cadence (no LISTEN / NOTIFY or managed Realtime yet — the source factory is the seam where v9N+ can swap it out).
- 5-minute connection cap; browsers reconnect automatically with `Last-Event-ID`.
- One stream per handoff per browser tab — no multiplexing yet.
- `router.refresh()` re-fetches the whole page; we don't merge events into client state inline. Trade-off keeps the server projection as the canonical source.
- No per-token concurrent-stream cap beyond the V9G IP rate-limit envelope.
- ADR: [ADR-0024](./docs/ADR-0024_REALTIME_CONCIERGE_SSE.md).

### Prompt 102 — Guest Journey Automation

- Migration `drizzle/0024_guest_journey_automation.sql` introduces five new tables: `guest_journey_rules`, `guest_journey_suggestions`, `guest_journey_runs`, `guest_journey_events`, `guest_review_requests`. All five enable + force RLS with internal-only policies; owner reads still flow through `owner_visible_events` only.
- Deterministic rule engine in `src/features/guest-journey/`: pure helpers for anchor resolution, offset math, suggestion CTA building, review-channel routing, and owner-safe event sanitisation. The runner is idempotent via `(booking_id, rule_id)` unique indexes.
- Replaces the Prompt 101 `refreshOwnerVisibleEventsAction` stub with `rebuildOwnerVisibleEventsForOwner / ForVilla / ForAllOwners`. Sources merged: bookings (masked guest label), calendar blocks, owner stays, owner-visible operations tasks, maintenance tickets, published reviews, issued / approved / paid statements, and owner-visible journey events. Re-runs delete the existing window before insert, so the projection never duplicates.
- Three new cron jobs: `*/15 * * * *` (run due rules), `0 10 * * *` (post-stay review requests), `0 3 * * *` (owner-visible events rebuild). Endpoints under `/api/cron/guest-journey`, `/api/cron/guest-review-requests`, `/api/cron/owner-visible-events-rebuild`. All three honour the existing `CRON_SECRET` bearer auth.
- Guest-side: `/stay/[token]` now renders a "Recommended now" panel (top 3 active suggestions) and `/stay/[token]/services?service=<key>` highlights a specific service when deep-linked from a suggestion.
- Owner-side: new `/owner/preferences/calendar` route — owners can edit their own `owner_calendar_preferences` (currency, masked guest names, country, channel labels, maintenance details, density) scoped to `current_owner_ids()`.
- Admin-side: new `/dashboard/guest-journey/{,rules,rules/new,rules/[id],runs,suggestions,reviews}` and `/dashboard/owner-intelligence/rebuild`.
- Permissions: `guest_journey.{read,write,run,manage}` and `review_request.{read,write}`. Investor roles, all field roles, finance and accountant explicitly excluded.
- ADR: [ADR-0025](./docs/ADR-0025-GUEST_JOURNEY_AUTOMATION.md).

### Prompt 103 — Service Fulfilment & Vendor Ops

- Migration `drizzle/0025_service_fulfilment_vendor_ops.sql` introduces eight new tables: `service_vendors`, `service_vendor_services`, `guest_service_fulfilments`, `service_fulfilment_events`, `service_vendor_tokens`, `service_vendor_invoices`, `guest_service_ratings`, and `service_fulfilment_finance_links`. All eight enable + force RLS with internal-only policies; vendor + guest access flows exclusively through token-gated server actions.
- Operational fulfilment overlay 1:1 with `guest_service_orders` via UNIQUE `order_id`. Status set: `new / triage / awaiting_vendor / vendor_confirmed / guest_confirmed / scheduled / in_progress / completed / cancelled / failed / no_show`. Guest never sees internal triage; `guestFacingFulfilmentStatus` collapses everything below `scheduled` into `Pending confirmation`.
- Vendor portal at `/vendor/service/[token]` — token-gated; uses `buildVendorSafeFulfilmentView` to strip guest emails/phones (default), owner data, margin, internal notes, vendor quotes from other vendors, and lock secrets.
- Finance bridge (`bridgeFulfilmentToFinance`) writes both legs: revenue line for guest price + expense line for internal cost. Idempotent through `service_fulfilment_finance_links.fulfilment_id` UNIQUE; respects locked statement periods.
- Vendor registry at `/dashboard/service-fulfilment/vendors` with vendor↔service mappings; vendor invoice tracking at `/dashboard/service-fulfilment/invoices`; guest ratings at `/dashboard/service-fulfilment/ratings`; finance bridge dashboard at `/dashboard/service-fulfilment/finance-bridge`.
- Guest-side: `/stay/[token]/services/orders` lists the guest's own service requests; `/stay/[token]/services/orders/[id]` shows status, ETA, optional confirmation button, and a star-rating form once the service is `completed`.
- Permissions: `service_vendor.{read,write}`, `service_fulfilment.{read,write,dispatch,finance_bridge}`, `service_invoice.{read,write}`, `service_rating.{read,manage}`. Investor + all field roles excluded.
- ADR: [ADR-0026](./docs/ADR-0026-SERVICE_FULFILMENT_VENDOR_OPS.md).

### Prompt 104 — Dynamic Pricing & Availability Rules

- Migration `drizzle/0026_dynamic_pricing_availability_rules.sql` introduces nine new tables: `pricing_rule_sets`, `pricing_day_of_week_rules`, `pricing_occupancy_rules`, `pricing_close_out_rules`, `pricing_channel_rules`, `pricing_min_stay_rules`, `pricing_stop_sell_rules`, `pricing_quote_logs`, and `channel_push_events`. All nine enable + force RLS with internal-only policies; legacy `rate_plans` family is preserved untouched.
- Deterministic rule engine in `src/features/dynamic-pricing/` with pure helpers for night-by-night quoting (`quoteNight`, `quoteStay`), modifier resolution (day-of-week / occupancy / close-out / channel / min-stay / stop-sell), and public/admin explanation collapse. Pipeline order: base → manual override → day-of-week → occupancy → close-out → channel → clamp.
- Public `/api/v1/quote` upgraded with `pricingMode`, `available`, `reason`, `totalMinor`, `averageNightlyMinor`, `nightly[]`, `summary` — additive, never breaks the legacy response. IP / user-agent are hashed in `pricing_quote_logs`. Rule-set IDs never leave the server.
- Admin surfaces under `/dashboard/pricing`: hub, rule-sets list/create/detail, multi-villa calendar, quote tester, logs, channel-push simulator. Existing `/dashboard/bookings/rates` shows a banner pointing to the new engine; `/dashboard/villas/[id]/availability` adds a 30-day dynamic-pricing overlay.
- New role: `revenue_manager` with full dynamic-pricing capability. Permissions added: `dynamic_pricing.{read,write,manage}`, `pricing_quote.read`, `pricing_channel_push.simulate`. Investor + all field roles excluded.
- Seed: 2 rule sets (global Bali baseline + Enso S5 villa override), the documented modifier set across all six dimensions, 3 quote logs, 2 simulated channel-push events.
- Channel-manager push is a STUB — records would-be payloads as `simulated` events in `channel_push_events`. No OTA API calls.
- ADR: [ADR-0027](./docs/ADR-0027-DYNAMIC_PRICING_AND_AVAILABILITY_RULES.md).

### Prompt 105 — Direct Booking Hold & Checkout Stub

- Migration `drizzle/0027_direct_booking_hold_checkout_stub.sql` introduces five new tables: `direct_booking_holds`, `direct_booking_requests`, `direct_booking_request_events`, `direct_booking_hold_rate_limits`, `direct_booking_expiry_runs`. All five enable + force RLS with internal-only policies; the public API runs through the service-role connection.
- Hold lifecycle: public quote → `POST /api/v1/holds` (rate-limited 5 / IP / 10 min, 15-min TTL) → `internal_hold` calendar block installed → guest fills `/book/hold/[token]` → `POST /api/v1/holds/[token]/submit` creates a request → concierge approves manually → booking_manager converts to a canonical `bookings` row (which then triggers existing booking-automation hooks). No payment processing.
- Quote snapshot is captured on the hold row as immutable JSONB — internal `ruleSetId` is stripped before persisting, pinned by tests.
- Public booking UI under `/book/hold/[token]` (form), `/submitted`, `/expired`, `/cancelled`. Admin surfaces under `/dashboard/direct-bookings/{,holds[/id],requests[/id]}`.
- Cron job `direct_booking_hold_expiry` runs every 5 min; `/api/cron/direct-booking-expiry` honours `CRON_SECRET` via `handleCronJobRequest`.
- Permissions: `direct_booking.{read,write,approve,convert,manage}`. Concierge reads + writes; booking_manager (and director / super_admin) approves + converts. Investor + all field roles excluded.
- Token storage mirrors guest-stay tokens: SHA-256 hash + 8-char prefix; raw token returned exactly once. IP / UA stored as salted 16-char hashes.
- ADR: [ADR-0028](./docs/ADR-0028-DIRECT_BOOKING_HOLD_CHECKOUT_STUB.md).

### Prompt 106 — Direct Booking Deposit Workflow + Payment Provider Stub

- Migration `drizzle/0028_direct_booking_deposit_workflow.sql` introduces four new tables: `payment_provider_accounts`, `direct_booking_deposits`, `direct_booking_deposit_events`, `payment_webhook_events`. All four enable + force RLS with internal-only policies; webhooks are idempotent via UNIQUE partial index on `(provider_key, external_event_id)`.
- New deposit gate between request approval and booking conversion. `convertDirectBookingRequestToBookingAction` requires a deposit with status `paid` or `manually_marked_paid`; otherwise it rejects unless `convertWithoutDeposit=true` is posted AND the actor holds `direct_booking.manage`. Override always lands the booking as `tentative` (never `confirmed`).
- Default policy: 30% of total, $300 minimum, capped at total. Configurable per call via `calculateDepositAmount(totalMinor, policy)`.
- Manual-stub payment provider only. No Stripe / Xendit / Wise / crypto integration. The stub generates a `man_<deposit_id>` session and returns an internal `/book/hold/<token>/payment` URL. Future provider classes register in `provider-selector.ts` without schema changes.
- Public surfaces: `/book/hold/<token>/payment` (no card fields), `/book/hold/<token>/status` (collapsed timeline). Public API: `GET /api/v1/holds/<token>/deposit`, `POST /api/v1/holds/<token>/deposit/notify-paid` (records guest claim — NEVER auto-marks the row paid).
- Admin: `/dashboard/direct-bookings/deposits[/id]`, `/dashboard/payments` + `/providers` + `/webhooks`. Deposit panel surfaces on every request detail page.
- Permissions: `payments.{read,write,manage}`, `direct_booking.deposit.{read,write,mark_paid,refund}`. Mark-paid is finance / accountant / director / super_admin only; refund is finance_manager / director / super_admin only. Investor + all field roles excluded.
- ADR: [ADR-0029](./docs/ADR-0029-DIRECT_BOOKING_DEPOSIT_WORKFLOW.md).

### Prompt 107 — Direct Booking Finance Reconciliation + Deposit Expiry

- Migration `drizzle/0029_direct_booking_finance_reconciliation.sql` introduces `direct_booking_finance_links` (idempotent bridge between request → booking → revenue line → statement period). Three UNIQUE indexes guarantee no-dup posts: one on `request_id`, partial UNIQUE on `booking_id`, partial UNIQUE on `revenue_line_id`. Status enum: `pending` / `posted` / `skipped_no_booking` / `skipped_locked_period` / `failed` / `reversed`. RLS forced internal-only. Adds `balance_due_minor` + `expires_reason` columns to `direct_booking_deposits` and `finance_bridge_status` + `finance_link_id` columns to `direct_booking_requests`.
- Pure-helper module `finance-pure.ts` — `calculateBalanceDue`, `shouldPostDirectBookingRevenue`, `isDepositExpired`, `shouldExpireDeposit`, `publicDirectBookingStageSummary` (collapses internal status into ten guest-safe stages — `manually_marked_paid` never leaks), `directBookingFinanceStatusLabel`, `buildDirectBookingFinanceLinkCode`. All testable without database fixtures.
- Revenue posting (`finance-reconciliation.ts`) is idempotent end-to-end: re-running `postDirectBookingRevenue(requestId)` on a posted bridge no-ops via UNIQUE on `request_id`. Locked statement periods detected via `findLockingPeriod` from the finance engine — locked periods produce a `skipped_locked_period` link without writing a revenue line. Reverse archives the revenue_line (`archivedAt = now`, never deletes). Batch wrapper `reconcileDirectBookingsBatch(50)` for the admin button.
- Deposit expiry (`deposit-expiry.ts`) cascades: deposit → request → hold (with calendar block release). Cron `*/5 * * * *` at `/api/cron/direct-booking-deposit-expiry` runs `expireUnpaidDeposits(now, 100)`. Finance manager group is notified.
- Admin: `/dashboard/direct-bookings/reconciliation[/id]` with five-metric hub, filterable finance-link list, **Reconcile pending** action, detail page with money summary + reverse form. `/deposits` page gained Balance due / Expires / Actions columns with Expire-now button. `/requests/[id]` gained a Finance Reconciliation panel with Post-revenue-now button.
- Public: `/book/hold/[token]/status` rewrote into a clean public timeline driven by `publicStage` only — no provider session IDs, finance link IDs, revenue line IDs, statement period IDs, or `manually_marked_paid` literal anywhere on the page. Source-grep test enforces this.
- Public API (`PublicHoldView` / `PublicDepositView`): added `balanceDueMinor` + `balanceDueFormatted` + `publicStage` + `nextAction` (+ `canNotifyPaid` on deposit). No internal IDs exposed.
- Permissions: `direct_booking.reconcile.{read,write,reverse}` + `direct_booking.deposit.expire`. Reverse limited to super_admin / director / finance_manager. Investor + all field roles excluded.
- ADR: [ADR-0030](./docs/ADR-0030-DIRECT_BOOKING_FINANCE_RECONCILIATION.md).

### Prompt 108 — Direct Booking Owner Portal Surface + Owner Revenue Transparency

- Migration `drizzle/0030_direct_booking_owner_portal.sql` introduces three owner-safe projection tables: `owner_booking_summaries` (one row per booking / unconverted direct request / owner stay / maintenance block, with masked guest label + statement linkage), `owner_booking_revenue_breakdowns` (per-row line items), and `owner_revenue_source_monthly` (precomputed monthly source mix). All three RLS-forced internal-only with an `owner_self_read` policy via `public.current_owner_ids()`. Idempotency via partial UNIQUEs on `(owner_id, booking_id)` / `(owner_id, direct_booking_request_id)` / NULL-safe (owner, villa, project, period, source, currency).
- Pure helpers (`calendar-pure.ts`, `revenue-pure.ts`, `statement-source-groups.ts`) — `maskOwnerGuestName`, `mapBookingChannelToSourceType`, `publicBookingStatus` (collapses booking + request + deposit + hold statuses into eleven owner-facing values), `buildOwnerLabel`, `safeOwnerBookingProjection` (drops 28+ banned keys: email/phone/token/providerSession/financeLink/revenueLine/statementPeriod ids), `buildRevenueSourceMonthlyBuckets`, `summarizeOwnerRevenueSourceMix`, `formatOwnerRevenueExplanation`, `groupStatementLinesBySource`.
- Projection rebuild (`projection.ts`) — wipes + reinserts per-owner across the rolling window so every retry converges. Sources merged: `bookings` (channel + guest), unconverted `direct_booking_requests` + `direct_booking_holds`, `owner_stay_requests`, `villa_calendar_blocks` where `owner_visible = true`. Revenue linkage loaded via `revenue_lines` + `statement_lines` matched on `source_table='revenue_lines'`. Owner statement href only emitted when status is `issued`/`approved`/`paid`.
- Cron `0 4 * * *` at `/api/cron/owner-booking-projection-rebuild` runs `rebuildOwnerBookingSummariesForAllOwners(window)` over `[today − 90d, today + 365d]`. Per-row rebuild actions for booking + direct-request edges. Audit logged.
- Owner portal: `/owner/bookings` (filterable list), `/owner/bookings/[id]` (detail with timeline + revenue breakdown + statement link), `/owner/revenue` + `/owner/villas/[id]/revenue` (source mix cards + monthly bucket table), `/owner/calendar` upgraded with Direct bookings panel + legend, `/owner/villas/[id]/calendar` per-villa direct overlay.
- Admin: `/dashboard/owner-intelligence/bookings[/id]` (projection table + per-row rebuild + internal source trace), `/dashboard/owner-intelligence/revenue` (admin-side source mix with rebuild button). Reconciliation hub points to the projection.
- Owner statement detail polish — added a **Revenue source explanation** section that buckets lines into Direct booking / OTA / Guest services / Owner stay / Maintenance reserves / Taxes / Other. Source IDs never rendered (test grep enforced).
- Permissions: `owner_booking.{read,manage}` + `owner_revenue.{read,manage}`. Investor / investor_owner get reads only; concierge / housekeeper / technician / field excluded.
- ADR: [ADR-0031](./docs/ADR-0031-DIRECT_BOOKING_OWNER_PORTAL_SURFACE.md).

### Prompt 109 — Guest Booking Notifications + Guest Status Center Polish

- Migration `drizzle/0031_guest_booking_notifications_status_center.sql` introduces four token-scoped, RLS-forced internal-only tables: `direct_booking_guest_notifications` (append-only public-safe log with UNIQUE `dedupe_key`), `direct_booking_guest_status_snapshots` (denormalised public stage view, UNIQUE on `hold_id`), `direct_booking_guest_message_threads` + `direct_booking_guest_messages` (concierge ↔ guest threads with redacted bodies). No public RLS — guests reach these through token-bound server actions only. CHECK constraints pin severity/status/stage/author/visibility enums.
- Pure helpers (`guest-status-pure.ts`, `guest-messages-pure.ts`) — `buildPublicDirectBookingStage` collapses `(hold, request, deposit, booking)` into a fourteen-stage taxonomy (`quote_held` → `request_submitted` → `under_review` → `deposit_required` → `deposit_pending_confirmation` → `deposit_confirmed` → `approved` → `confirmed` → `in_house` → `completed`, plus `expired`/`cancelled`/`rejected`/`failed`). `buildGuestStatusCopy` produces premium non-technical headline + body + action per stage. `sanitizeGuestNotificationPayload` drops 18+ banned keys (provider/finance/webhook/token/internal-note ids). `buildNotificationForStageTransition` computes deterministic dedupe-keyed notifications. `redactGuestMessage` strips emails/phones/6-digit codes/≥24-char tokens/password phrases/provider+webhook ids.
- Lifecycle wiring — `syncGuestStatusForChain` rebuilds the snapshot + queues a stage-transition notification on hold create, request submit, request under_review, request approve, request reject, request convert, hold cancel by guest, hold expiry sweep, deposit create, guest-claimed-paid, deposit mark paid, deposit fail, deposit cancel, deposit expiry sweep. Best-effort — failures never break the caller's primary action.
- Public status center rewrite at `/book/hold/[token]/status` with a hero card (badge + headline + CTA + expiry copy), reservation summary, seven-step timeline, notification list, and concierge composer. New `/book/hold/[token]/messages` dedicated thread page. Both pages render only `body_redacted`.
- Public API: `GET /api/v1/holds/[token]/status` returns `{ snapshot, notifications, messagePreview, timeline }` with no internal IDs; `POST /notifications/[id]/read`; `GET` + `POST /messages` (zod-validated, redacted server-side, rate-limited 5/token/hr → 429 Retry-After). All routes are no-store + 405-with-Allow guards.
- Admin: `/dashboard/direct-bookings/guest-status[/id]` (snapshot list + detail with internal source trace + manual-notification queue) and `/dashboard/direct-bookings/messages[/threadId]` (unified inbox + thread reply with guest-visible/internal-only toggle + close/archive/reopen). Request detail page gained a Guest Status panel.
- Permissions: `direct_booking.guest_notifications.{read,write}` + `direct_booking.guest_messages.{read,write,manage}`. Concierge / booking_manager / property_manager / operations_manager can manage; finance_manager + accountant can read notifications only; investor + field roles excluded.
- ADR: [ADR-0032](./docs/ADR-0032-GUEST_BOOKING_STATUS_CENTER.md).

### Prompt 110 — Finance & Statement Transparency Final Polish

- Migration `drizzle/0032_finance_statement_transparency.sql` introduces four owner-safe projection tables: `statement_source_groups` (per-statement, per-source-bucket aggregate with stable owner-safe label), `statement_source_group_lines` (internal bridge with `source_trace_status` enum: linked / missing_source / ambiguous_source / estimated / manual_adjustment / archived_source), `statement_reconciliation_warnings` (severity info/warning/critical, status open/acknowledged/resolved/dismissed, partial UNIQUE on `(warning_type, source_table, source_id)` while open), `statement_explanation_snapshots` (deterministic owner-facing copy, UNIQUE per statement). All four RLS-forced internal-only with `owner_self_read` policies via `public.current_owner_ids()` gated by `owner_visible`. CHECK constraints pin all enums (14 group keys, 15 warning types, 6 trace statuses, 3 severities, 4 statuses).
- Pure helpers (`grouping-pure.ts`, `explanation-pure.ts`, `reconciliation-pure.ts`) — `classifyStatementLineSource` collapses `(line, ctx)` into one of 14 group keys (direct_booking_revenue beats guest_service beats ota beats owner_stay beats service_fulfilment beats maintenance/utility/inventory beats management_fees beats taxes beats reserves beats payouts beats adjustments beats other). `buildStatementSourceGroups` produces deterministic per-bucket aggregates with `net = gross − deductions`. `buildStatementExplanationSnapshot` returns headline + summary + bullets + payout/revenue/deduction/reserve/warning explanations. `detectStatementWarnings` walks pending direct-booking + guest-service + owner-stay + service-fulfilment bridges + locked-period skips + negative-payout + currency-mismatch + missing-source-trace. `warningSeverity` escalates pending revenue to critical when the statement is already issued/approved.
- Idempotent rebuild — `rebuildStatementTransparency(statementId)` wipes + reinserts groups / group_lines / explanation snapshot for one statement, upserts warnings via the partial UNIQUE. `rebuildAllStatementTransparency({})` covers `period_end ≥ today − 120d` × statuses `draft`/`issued`/`approved`. Cron `0 5 * * *` at `/api/cron/statement-transparency-rebuild` runs the bulk rebuild nightly. Audit-logged.
- Owner portal: `/owner/statements/[id]` gained Revenue source breakdown, Charges & deductions, "Why this number" snapshot card (with deterministic fallback), Items needing your attention (owner-visible warnings only), Linked activity (owner_booking_summaries with `statement_id = this.id`). `/owner/statements` shows a `TransparencyStatusBadge` per statement. `/owner/revenue` clarifies that statements are the canonical record.
- Admin: `/dashboard/finance/transparency` hub + statements table + `/statements/[id]` detail (owner-safe preview + admin source trace + all warnings) + `/warnings` filterable inbox (acknowledge/resolve/dismiss) + `/rebuild` manual forms. Cross-link from `/dashboard/finance/statements/[id]`.
- PDF polish — additive: `OwnerStatementPdf` accepts an optional `explanationSnapshot` prop. When the snapshot exists the renderer surfaces its headline + summary + bullets + payout note + (accent-colour) warning note. When absent it falls back to the existing deterministic explanation. Pre-110 behaviour preserved.
- Permissions: `statement_transparency.{read,manage}` + `statement_reconciliation.{read,manage}`. Investor / investor_owner have read only; finance_manager + accountant manage; concierge / field / vendor / agent excluded.
- ADR: [ADR-0033](./docs/ADR-0033-FINANCE_STATEMENT_TRANSPARENCY.md).

### Prompt 111 — Security Baseline & Operational Hardening

- Migration `drizzle/0033_security_baseline_operational_hardening.sql` introduces five RLS-forced internal-only tables: `auth_mfa_factors` (TOTP secret encrypted at rest, partial UNIQUE on active factor per user), `auth_mfa_recovery_codes` (SHA-256 hashed, status enum active/used/revoked), `auth_login_attempts` (hashed IP + UA, optional `locked_until`), `auth_security_events` (severity enum info/warning/critical, append-only), and `job_locks` (UNIQUE on `job_key`, status locked/released/expired). Plus a generic `record_sensitive_audit_event` PL/pgSQL trigger function attached to fourteen sensitive finance + auth tables (uses `to_jsonb(NEW)` / `to_jsonb(OLD)`, defensive guard against attaching to `audit_events` itself).
- MFA / TOTP — dependency-free TOTP verifier (HMAC-SHA1, 30s step, 6 digits, ±1 window) in `src/features/security-baseline/totp-pure.ts`. AES-256-GCM secret encryption with scrypt-derived keys (`arconique:security:v<n>` namespace, distinct from Wi-Fi crypto). Recovery codes: 10 per enrolment, format `ARQ-XXXX-XXXX`, only hashes persisted. UI flow: `/setup/mfa` → `/setup/mfa/verify` → `/setup/mfa/recovery-codes` (codes shown exactly once via action return value). Per-user `/dashboard/settings/security` + admin `/dashboard/security/mfa`.
- Login throttling — pure helper `decideLoginThrottle({emailAttempts, ipAttempts, now})` rolling-10-minute window (5 failures per email / 20 per IP → 15-minute lock). `recordLoginAttempt` hashes IP + UA, persists, and emits `login_failed` / `login_locked` security events. Service layer + admin pages (`/dashboard/security/auth`, `/login-attempts`, `/events`) ready; full enforcement on the Supabase sign-in path is deferred until the auth flow proxies through a dedicated server action.
- Job locks — `withJobLock` / `acquireJobLock` / `releaseJobLock` / `expireStaleJobLocks` in `src/features/jobs/locks.ts`. `executeJob` now wraps every run in lock acquire/release; collisions return `JobOutcome.status = "skipped"` with summary `skipped — already locked by <holder>`. `executeAllJobs` no longer fails the batch on a single skip. Admin `/dashboard/jobs/locks` shows current locks + Force-release button (`job_lock.manage`).
- Notification delivery — `deliverPendingNotifications` upgraded to `BEGIN; SELECT … FOR UPDATE SKIP LOCKED LIMIT 100; UPDATE … SET status='processing'; COMMIT;`. Provider calls happen outside the transaction so the lock window stays sub-millisecond. Source-grep test pins `FOR UPDATE SKIP LOCKED`.
- DB-resilience helpers — `src/features/system/db-health.ts` exports `safeCount`, `safeList`, `isMissingRelationError`, `isMissingColumnError`, `migrationPendingMessage`. New `/dashboard/system/health` page renders per-table presence grid + env readiness checklist (DATABASE_URL / Supabase auth / CRON_SECRET / APP_BASE_URL / SECURITY_ENCRYPTION_SECRET / STAY_LINK_KMS_SECRET / notifications dry-run / backup runbook URL).
- Permissions: `auth_security.{read,manage}` (note new prefix to avoid collision with the existing `security.*` camera keys), `mfa.manage` (super_admin / director only), `login_attempt.read`, `job_lock.{read,manage}`, `system_health.{read,manage}`. Investor / owner / field / vendor / agent / housekeeper / technician excluded.
- Backup / restore runbook: [RUNBOOK-BACKUP-RESTORE](./docs/RUNBOOK-BACKUP-RESTORE.md) — pre-migration checklist, restore drill, post-restore verification, secret rotation for `SECURITY_ENCRYPTION_SECRET` / `STAY_LINK_KMS_SECRET` / `CRON_SECRET`, what cannot be restored from app DB alone.
- ADR: [ADR-0034](./docs/ADR-0034-SECURITY_BASELINE_AND_OPERATIONAL_HARDENING.md).

### Prompt 112 — Full Demo Data Rebuild + End-to-End QA Pass

- Demo-data architecture in `src/features/demo-data/` — `demo-ids.ts` (stable UUIDs for every cross-referenced fixture), `demo-dates.ts` (anchored 2026 Q2 timeline), `constants.ts` (row-count floors + banned-token list + `@example.test` rule), `seed-summary.ts` (module-by-module inventory), `validate-demo-data.ts` (pure validator that takes count + projection-fetch callbacks and returns a structured report), `demo-scenarios.ts` (declarative 9-scenario walkthrough list).
- New CLI scripts in `package.json`: `npm run demo:rebuild` (refreshes the four projection layers — owner-visible events / owner-booking summaries / owner-revenue source mix / statement transparency), `npm run demo:validate` (counts every required table + scans owner / public projection tables for banned tokens, real-looking emails, real-looking phones, long-token blobs).
- Reusable resilience components in `src/components/system/` — `MigrationPendingCard`, `EmptyStateCard`, `QueryWarningCard`. Adopted across high-risk dashboards (`/dashboard/guest-stays/security`, `/dashboard/guest-ai/storage`, `/dashboard/maintenance-intelligence`, `/dashboard/utilities`, `/dashboard/pricing`, `/dashboard/jobs`) so a missing migration renders a friendly "Migration pending" banner instead of crashing the page.
- New `/dashboard/demo` walkthrough route — single launchpad rendering 9 scenario cards declaratively from `demo-scenarios.ts`. Each card lists live links, what to verify, caveats, and env hints. Token-bound flows are clearly badged "requires live token".
- [`docs/QA-DEMO-WALKTHROUGH.md`](./docs/QA-DEMO-WALKTHROUGH.md) — screenshot-ready end-to-end QA checklist: local startup, env table, demo users, 12 walkthrough sections (admin / owner / guest / direct booking / field / vendor / finance / operations / pricing / security-system / expected limitations / expected validation outcomes).
- ADR: [ADR-0035](./docs/ADR-0035-FULL_DEMO_DATA_AND_QA_PASS.md).

### Prompt 113 — Production Deployment Readiness & Environment Setup

- Typed env layer in `src/lib/env/` — `registry.ts` is the canonical inventory of every env var (categorised core / supabase / security / notifications / ai / payments / demo). `validation.ts` produces a structured `EnvReadinessReport` (status `ok` / `missing` / `warning` / `fatal` / `not_required`, redacted values, per-key messages). `report.ts` formats for CLI + dashboard.
- Production gates in `src/lib/deployment/production-gates.ts` — `assertNoDemoModeInProduction`, `assertNoDevCronBypassInProduction`, `assertSecuritySecretsPresentInProduction`, `assertNotificationModeExplicit`, `assertBootstrapSecretStrong`. Each returns a structured `GateResult`. Gates short-circuit to `ok` in `development` / `test`.
- Observability baseline in `src/lib/observability/` — `logger.ts` emits one JSON line per event with a known list of redacted field names (password / secret / tokenHash / providerSessionId / webhookPayload / Authorization / apiKey / guestEmail / guestPhone / etc.). `request-id.ts` resolves `x-request-id` / `x-vercel-id` headers and falls back to `randomUUID()`.
- Five preflight scripts wired in `package.json`: `npm run check:env` (env validator, fatal on production gaps), `npm run check:storage` (every bucket constant in code is documented), `npm run check:cron` (every cron route uses `handleCronJobRequest` / `handleCronRunAllRequest`, every job key is in `KNOWN_JOBS`, every route + key in checklist), `npm run check:migrations` (no duplicate prefixes, no obvious secrets, RLS coverage), `npm run preflight:deploy` (all four checks + typecheck + lint + test + build). Plus `npm run seed:production:minimal` documented stub.
- New `/dashboard/system/deployment` route — operator-facing readiness view. Surfaces env mode + counts, the redacted env table, production gate results, migration count + last filename, bucket privacy summary, cron route count + CRON_SECRET status, demo flag visibility.
- Six new docs: [DEPLOYMENT-RUNBOOK](./docs/DEPLOYMENT-RUNBOOK.md), [ENVIRONMENT-VARIABLES](./docs/ENVIRONMENT-VARIABLES.md), [SUPABASE-PROVISIONING-CHECKLIST](./docs/SUPABASE-PROVISIONING-CHECKLIST.md), [STORAGE-BUCKETS-CHECKLIST](./docs/STORAGE-BUCKETS-CHECKLIST.md), [VERCEL-CRON-CHECKLIST](./docs/VERCEL-CRON-CHECKLIST.md), [PRODUCTION-SEED-STRATEGY](./docs/PRODUCTION-SEED-STRATEGY.md).
- ADR: [ADR-0036](./docs/ADR-0036-PRODUCTION_DEPLOYMENT_READINESS.md).

### Prompt 114 — Staging Smoke Test & Production Hardening Fix Pass

- Route smoke-test inventory in `src/features/smoke-tests/route-inventory.ts` — pure file-walk that classifies every `page.tsx` / `route.ts` under `src/app/**` by audience (public / auth / internal / owner / guest / field / vendor / api-cron / api-public / api-token / development) and the expected unauth status. ~340 routes inventoried; new `npm run smoke:routes` asserts ≥ 80 routes + every required audience non-empty + every cron route expects 401.
- Cron auth verification in `scripts/check-cron-auth.ts` — confirms every `/api/cron/*` route goes through `handleCronJobRequest` / `handleCronRunAllRequest` and source-greps `src/features/jobs/auth.ts` for the load-bearing invariants (production gate, bearer comparison, localhost guard, typed rejection reason). Wired into `npm run preflight:deploy`. Full pure-decision matrix tested in `tests/p114-staging-smoke-hardening.test.ts`.
- Three new production gates: `assertNoBareDemoModeInProduction` (catches `DEMO_MODE=1`), `assertNoDemoSecurityFallbacksInProduction` (catches `ALLOW_DEMO_SECURITY_FALLBACKS=1`), `assertAiModeExplicit` (warns when `AI_DRY_RUN` is implicit, fatals when `AI_DRY_RUN=0` with no `ANTHROPIC_API_KEY`). The deployment dashboard now runs eight gates instead of five.
- Storage hardening: `src/features/system/storage-overview.ts` defines explicit `BucketDescriptor[]` (privacy / max-size / cleanup-cron / EXIF-strip flags). New `/dashboard/system/storage` page renders the inventory and links to per-bucket health pages. `scripts/check-storage-config.ts` extended to forbid public bucket name tokens in `src/`.
- `/dashboard/system/health` expanded — tracked tables now grouped into ten module groups (Identity & access, Owners & villas, Bookings, Direct booking, Finance & statements, Operations, Guest experience, Notifications, Jobs & cron, Security baseline). Each group renders as its own section with a per-group ready/incomplete badge.
- Staging readiness report: `npm run staging:report` aggregates env + production gates + route inventory + every static check + migration / cron summary into one Markdown doc at `tmp/staging-readiness-report.md`. Designed for an operator to attach to a launch ticket.
- Two admin dashboards adopted `safeList`: `integrations/calendar-feeds/new` (was crashing on missing `bookingChannels`), `settings/users/[id]` (was crashing on missing `appUsers` / `userRoles`).
- Two new docs: [STAGING-LAUNCH-CHECKLIST](./docs/STAGING-LAUNCH-CHECKLIST.md) (eight-phase pass/fail checklist for promoting staging), [SMOKE-TEST-ROUTE-MATRIX](./docs/SMOKE-TEST-ROUTE-MATRIX.md) (audience classes + expected unauth status + when to do live smoke).
- ADR: [ADR-0037](./docs/ADR-0037-STAGING_SMOKE_TEST_AND_HARDENING.md).

### Prompt 115 — Management OS Final Pre-Launch Polish & Scope Freeze

- Scope is **frozen** at the post-Prompt-114 baseline.  No new business domains land in v1.  Subsequent prompts may only fix bugs, polish copy / empty-states / a11y, harden production / staging readiness tooling, improve documentation, or run the deployment runbook against staging / production.  See [ADR-0038](./docs/ADR-0038-MANAGEMENT_OS_V1_SCOPE_FREEZE.md).
- Pre-launch known-issues registry at `src/features/prelaunch/known-issues.ts` — typed `KnownIssue[]` with severity / status / target / notes for every documented v1 limitation. Powers the demo dashboard pre-launch card and the post-v1 backlog.
- Polish across stakeholder surfaces — `/dashboard/demo` (v1 status banner + recommended 20-min and 45-min flows + "do not demo yet" list + accepted-limitation cards), `/dashboard/system/deployment` (go/no-go banner + runbook references), `/dashboard/system/health` (critical-modules summary + module-pending guidance), `/owner` (workspace overview + privacy reassurance), `/owner/calendar` (direct vs OTA legend), `/owner/bookings` (source explanation), `/owner/revenue` (statement canonicality + IDR-only note), `/owner/statements/[id]` (canonicality copy), `/stay/demo` (demo-only banner), `/book/hold/[token]/status` (no-payment + review copy), `/field` (assigned villa / priority / checklist hint), `/vendor/service/[token]` (guest-contact-hidden copy + accept/decline/ETA explanation).
- Six new docs: [MANAGEMENT_OS_V1_PRODUCT_MAP](./docs/MANAGEMENT_OS_V1_PRODUCT_MAP.md), [MANAGEMENT_OS_V1_SCOPE_FREEZE](./docs/MANAGEMENT_OS_V1_SCOPE_FREEZE.md), [MANAGEMENT_OS_ROLE_SURFACE_MATRIX](./docs/MANAGEMENT_OS_ROLE_SURFACE_MATRIX.md), [MANAGEMENT_OS_ROUTE_MAP](./docs/MANAGEMENT_OS_ROUTE_MAP.md), [MANAGEMENT_OS_LAUNCH_READINESS_SUMMARY](./docs/MANAGEMENT_OS_LAUNCH_READINESS_SUMMARY.md), [MANAGEMENT_OS_POST_V1_BACKLOG](./docs/MANAGEMENT_OS_POST_V1_BACKLOG.md). Plus [ADR-0038](./docs/ADR-0038-MANAGEMENT_OS_V1_SCOPE_FREEZE.md).
- Route map generator: `scripts/generate-route-map-doc.ts` walks the P114 inventory and writes `docs/MANAGEMENT_OS_ROUTE_MAP.md` (`npm run docs:route-map`).
- ADR: [ADR-0038](./docs/ADR-0038-MANAGEMENT_OS_V1_SCOPE_FREEZE.md).

### Management OS v1 status

Management OS v1 is **demo-ready**, **staging-ready**, and **production-ready conditionally** — gated on operator-side preconditions (Supabase project, env vars, Vercel cron, backups, MFA bootstrap).

- See [MANAGEMENT_OS_V1_PRODUCT_MAP](./docs/MANAGEMENT_OS_V1_PRODUCT_MAP.md) for the full module map.
- See [MANAGEMENT_OS_V1_SCOPE_FREEZE](./docs/MANAGEMENT_OS_V1_SCOPE_FREEZE.md) for what is in / out of v1.
- See [MANAGEMENT_OS_LAUNCH_READINESS_SUMMARY](./docs/MANAGEMENT_OS_LAUNCH_READINESS_SUMMARY.md) for the go/no-go criteria + suggested next direction.
- See [MANAGEMENT_OS_POST_V1_BACKLOG](./docs/MANAGEMENT_OS_POST_V1_BACKLOG.md) for the prioritised post-v1 roadmap.
- See [MANAGEMENT_OS_ROLE_SURFACE_MATRIX](./docs/MANAGEMENT_OS_ROLE_SURFACE_MATRIX.md) for who can see what.
- See [MANAGEMENT_OS_ROUTE_MAP](./docs/MANAGEMENT_OS_ROUTE_MAP.md) for the audited route inventory (regenerate via `npm run docs:route-map`).

The recommended next prompt is a staging deployment, not a feature.  See ADR-0038 §"Recommended next prompt".

### Deployment readiness

Run `npm run preflight:deploy` before any production deploy. See [DEPLOYMENT-RUNBOOK](./docs/DEPLOYMENT-RUNBOOK.md) for the full procedure, [ENVIRONMENT-VARIABLES](./docs/ENVIRONMENT-VARIABLES.md) for the env catalogue, [SUPABASE-PROVISIONING-CHECKLIST](./docs/SUPABASE-PROVISIONING-CHECKLIST.md) for first-time provisioning, [STORAGE-BUCKETS-CHECKLIST](./docs/STORAGE-BUCKETS-CHECKLIST.md) for bucket privacy rules, [VERCEL-CRON-CHECKLIST](./docs/VERCEL-CRON-CHECKLIST.md) for the cron schedule, and [PRODUCTION-SEED-STRATEGY](./docs/PRODUCTION-SEED-STRATEGY.md) for what production data should and should not contain.

### Staging smoke test

Run `npm run staging:report` from a staging-env-loaded shell to generate a Markdown readiness doc at `tmp/staging-readiness-report.md`. Walk through [STAGING-LAUNCH-CHECKLIST](./docs/STAGING-LAUNCH-CHECKLIST.md) for the manual phases (env verification, migrations + RLS, cron, storage, demo/mock leak hardening, manual UI smoke). Use [SMOKE-TEST-ROUTE-MATRIX](./docs/SMOKE-TEST-ROUTE-MATRIX.md) as the operator-facing audience map for what each route class should return without auth.

## Further reading

- Blueprint: [PRODUCT_SPEC](./docs/PRODUCT_SPEC.md) · [TECHNICAL_ARCHITECTURE](./docs/TECHNICAL_ARCHITECTURE.md) · [DATABASE_SCHEMA](./docs/DATABASE_SCHEMA.md) · [USER_ROLES_AND_PERMISSIONS](./docs/USER_ROLES_AND_PERMISSIONS.md) · [AI_ASSISTANTS_STRATEGY](./docs/AI_ASSISTANTS_STRATEGY.md) · [DESIGN_SYSTEM](./docs/DESIGN_SYSTEM.md) · [ROUTES_STRUCTURE](./docs/ROUTES_STRUCTURE.md) · [IMPLEMENTATION_ROADMAP](./docs/IMPLEMENTATION_ROADMAP.md)
- Decisions: [ADR-0001](./docs/ADR-0001-STACK_DECISIONS.md) · [ADR-0002](./docs/ADR-0002-BACKEND_FOUNDATION.md) · [ADR-0016](./docs/ADR-0016_GUEST_STAY_FOUNDATION.md) · [ADR-0017](./docs/ADR-0017_GUEST_SERVICES_UPSELLS.md) · [ADR-0018](./docs/ADR-0018_GUEST_STAY_SECURITY.md) · [ADR-0019](./docs/ADR-0019_GUEST_AI_CONCIERGE.md) · [ADR-0020](./docs/ADR-0020_GUEST_CONCIERGE_HANDOFF.md) · [ADR-0021](./docs/ADR-0021_GUEST_REQUEST_CENTER.md) · [ADR-0022](./docs/ADR-0022_GUEST_REQUEST_ATTACHMENTS_AND_READ_RECEIPTS.md) · [ADR-0023](./docs/ADR-0023_GUEST_REQUEST_STORAGE_HARDENING.md) · [ADR-0024](./docs/ADR-0024_REALTIME_CONCIERGE_SSE.md) · [ADR-0025](./docs/ADR-0025-GUEST_JOURNEY_AUTOMATION.md) · [ADR-0026](./docs/ADR-0026-SERVICE_FULFILMENT_VENDOR_OPS.md) · [ADR-0027](./docs/ADR-0027-DYNAMIC_PRICING_AND_AVAILABILITY_RULES.md) · [ADR-0028](./docs/ADR-0028-DIRECT_BOOKING_HOLD_CHECKOUT_STUB.md) · [ADR-0029](./docs/ADR-0029-DIRECT_BOOKING_DEPOSIT_WORKFLOW.md) · [ADR-0030](./docs/ADR-0030-DIRECT_BOOKING_FINANCE_RECONCILIATION.md) · [ADR-0031](./docs/ADR-0031-DIRECT_BOOKING_OWNER_PORTAL_SURFACE.md) · [ADR-0032](./docs/ADR-0032-GUEST_BOOKING_STATUS_CENTER.md) · [ADR-0033](./docs/ADR-0033-FINANCE_STATEMENT_TRANSPARENCY.md) · [ADR-0034](./docs/ADR-0034-SECURITY_BASELINE_AND_OPERATIONAL_HARDENING.md) · [ADR-0035](./docs/ADR-0035-FULL_DEMO_DATA_AND_QA_PASS.md) · [ADR-0036](./docs/ADR-0036-PRODUCTION_DEPLOYMENT_READINESS.md) · [ADR-0037](./docs/ADR-0037-STAGING_SMOKE_TEST_AND_HARDENING.md) · [ADR-0038](./docs/ADR-0038-MANAGEMENT_OS_V1_SCOPE_FREEZE.md)
- Polish notes: [VERSION_1_POLISH_NOTES](./docs/VERSION_1_POLISH_NOTES.md)
