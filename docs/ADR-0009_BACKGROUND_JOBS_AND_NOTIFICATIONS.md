# ADR-0009 — Background Jobs & Notification Queue (v7)

Status: Accepted · 2026-04-26

## Context

By v6 we had a stack of operator-triggered automations: calendar sync,
preventive task generation, material-usage finance bridge, low-stock
detection. Each ran only when someone clicked a button. v7 turns that
catalog into a real cron-driven background runtime, captures every run
in a structured log, and lays a notification-queue foundation so v8 can
plug in WhatsApp / SMS / email providers without a schema rewrite.

Per the prompt we explicitly **defer**: external delivery providers,
payment processing, full Airbnb/Booking REST OAuth, smart-lock control,
and the AI runtime.

## Decisions

### 1. Vercel-Cron-compatible HTTP triggers

Vercel Cron + `/api/cron/<job>` is the cheapest scheduler that lines up
with our hosting target. Every job has a route handler that:

1. Verifies `Authorization: Bearer <CRON_SECRET>` (production never
   accepts a missing/invalid bearer).
2. In development, when `CRON_SECRET` is unset AND the request comes
   from `localhost`, the route accepts the call with a console warning.
3. Calls into `executeJob(jobKey, "cron", null)` which wraps the
   runner and returns a JSON envelope `{ ok, jobRunId, status, summary,
   metrics }`.

The "run all" endpoint walks every known job, swallows per-job failures
(so one bad job never poisons the others), and returns one envelope
per run.

### 2. `withJobRun` lifecycle wrapper

Every job goes through `withJobRun(jobKey, triggerType, createdBy, fn)`:

1. Insert a `job_runs` row with status `running`.
2. Pass a `JobRunHandle` to `fn` so it can log structured events.
3. When `fn` returns a `JobOutcome`, write `finished_at`,
   `duration_ms`, `status`, `result_summary`, `metrics`, and emit a
   final audit event.
4. If `fn` throws, capture the error message into `job_runs.error_message`,
   stamp status `failed`, and re-throw.

The handle's `event(level, message, metadata)` writes a row into
`job_run_events`. Calls fall back to `console.log` when DB is unavailable
so dev runs are still observable.

### 3. Per-job runners

Every job is its own module (`src/features/jobs/<job>-job.ts`) exporting
a `run<Job>Job(handle, opts?)` async function returning `JobOutcome`.
The actions dispatch table (`features/jobs/actions.ts::executeJob`) is
the only place that maps a key to a runner. Adding a job is:

1. New entry in `definitions.ts`.
2. New runner file.
3. Register the key in the `KNOWN_JOBS` set + dispatch switch.
4. Optional: drop a route under `/api/cron/<key>`.

### 4. Calendar sync job

`runCalendarSyncJob(handle, { respectFeedInterval })`:

- Lists every active `channel_calendar_feeds` row.
- Skips a feed when `now − last_success_at < sync_interval_minutes`.
- Calls the v6 `syncCalendarFeed(feed.id)` for every non-skipped feed.
- Captures per-feed metrics: fetched / inserted / updated / cancelled /
  conflicts.
- Per-feed failures never throw — they accumulate as
  `metrics.errors[]` and the run finishes `partial_success` if at
  least one feed succeeded, `failed` if all failed, `success` otherwise.
- Always emits a `bookings.sync.cron` audit event.

### 5. Preventive tasks job

`runPreventiveTasksJob(handle)` is a re-implementation of the v4
generator that doesn't go through `requirePermission` (the cron route
already authed via `CRON_SECRET`; the manual path goes through
`runJobManuallyAction` which adds `jobs.run`). It:

- Walks active `preventive_schedules`.
- Skips schedules with `next_due_on > today` or
  `last_generated_on = today`.
- Mints a task code via the v4 `nextDailyCounter("OPS")` + `buildTaskCode`.
- Optionally instantiates a checklist from the schedule's template.
- Advances `next_due_on` via `computeNextDueOn`.
- Audits each generation.

### 6. Material-usage bridge job

`runMaterialUsageFinanceBridgeJob(handle)`:

- Reads up to 200 `task_material_usage` rows with
  `finance_bridge_status = "pending"`.
- Calls the v6 `createExpenseFromTaskMaterialUsage(usageId)` per row.
- Counts `expensesCreated`, `skippedLocked`, `skippedNotChargeable`,
  `failed`.
- Status policy: `success` if everything resolved; `partial_success`
  if some succeeded with some failures; `failed` if the entire batch
  errored without producing any successes / safe skips.

### 7. Low-stock scan job + notification queue

`runLowStockScanJob(handle)`:

- Walks `listLowStockItems()` (items at or below their reorder point).
- Computes a `critical` count (out-of-stock items).
- Queues one `low_stock_alert` notification per recipient role
  (`operations_manager`, `procurement_manager`).
- Dedupe key: `low_stock_alert:<role>:<YYYY-MM-DD>`. The DB has a
  partial unique index on `(dedupe_key)` while
  `status IN ('queued','sent')`, so the second attempt of the day
  short-circuits to `suppressed`.
- Priority is `high` when any item is fully out, otherwise `normal`.
- Payload includes the full item list (id, sku, name, totalStock,
  reorderPoint, unit) so v8 templates render rich content.

### 8. Notification queue (durable, no providers yet)

The queue tables and admin UI ship today. There is **no** outbound
delivery — `sent` status is set manually by `markNotificationSentAction`
or, in v8, by the provider worker. Channels (`in_app | email |
whatsapp | sms | telegram`) are part of the schema so providers add
later without migration.

`queueNotification(input)` is the single entry point used by jobs +
server actions. It honours `dedupe_key` by short-circuiting on an
existing open row. Lower-level admin actions:

- `markNotificationSentAction` — operator confirms manual delivery.
- `markNotificationFailedAction` — capture an external failure.
- `cancelNotificationAction` — operator-side cancel before send.
- `updateNotificationPreferenceAction` — upsert per-user / per-owner /
  per-role preference rows. The editor UI lands with v8 alongside the
  external providers.

### 9. CRON_SECRET auth model

`features/jobs/auth.ts` exports `verifyCronAuth(...)` (pure) +
`verifyCronAuthFromRequest(request)` (Next-Request helper). Decision
matrix:

| Bearer matches `CRON_SECRET` | Production?            | Result                |
|------------------------------|------------------------|-----------------------|
| Yes                          | any                    | accept                |
| No / missing                 | yes                    | reject (401)          |
| No / missing, secret unset   | no, host = localhost   | accept + warn in console |
| No / missing, secret unset   | no, host ≠ localhost   | reject (401)          |
| Bearer wrong, secret set     | any                    | reject (401)          |

Production never accepts a missing or wrong bearer — even on
deployments that forget to set `CRON_SECRET`, the endpoints stay locked
because the secret-vs-bearer comparison runs first.

### 10. Default cron schedules

| Key                              | Cron            | Default state |
|----------------------------------|-----------------|---------------|
| `calendar_sync_active_feeds`     | `*/30 * * * *`  | enabled       |
| `generate_preventive_tasks`      | `0 5 * * *`     | enabled       |
| `bridge_pending_material_usage`  | `0 */3 * * *`   | enabled       |
| `scan_low_stock`                 | `0 7 * * *`     | enabled       |
| `notification_digest_internal`   | `0 8 * * *`     | disabled      |

The notification digest is intentionally off until v8 ships providers
— enabling it today would aggregate notifications no one delivers.

### 11. Operational monitoring

`/dashboard/jobs` lists definitions + recent runs + manual "Run now"
buttons. `/dashboard/jobs/runs` is the searchable run history (filter
by status / job key). `/dashboard/jobs/runs/[id]` shows the full
event log + metrics JSON + error trace.

Existing dashboards now show a `LastRunBadge` for the relevant cron
heartbeat:

- `/dashboard/integrations` — last calendar sync.
- `/dashboard/operations` — last preventive run.
- `/dashboard/finance/material-usage` — last bridge run.
- `/dashboard/inventory` — last low-stock scan.

### 12. Permissions

New keys: `jobs.read | jobs.run | jobs.manage`,
`notifications.read | notifications.write | notifications.manage`.

- `super_admin / director` — everything.
- `operations_manager` — full jobs + notifications.
- `property_manager / finance_manager / procurement_manager` —
  `jobs.read + jobs.run` (and notifications.read).
- Field staff (housekeeper / technician) — none.

## What's implemented now

- Migration `drizzle/0008_background_jobs_notifications.sql`.
- Drizzle schema `jobs.ts` + `notifications.ts` + barrel.
- Job runner: `runner.ts`, `services.ts`, `actions.ts`, `definitions.ts`,
  `auth.ts`, `cron-handler.ts`.
- Per-job runners for calendar sync, preventive, material-usage bridge,
  low-stock scan.
- Notifications: `services.ts` (`queueNotification`,
  `suppressDuplicateNotification`, list + preference helpers),
  `actions.ts` (mark sent / failed / cancelled, upsert preference).
- Cron routes: `/api/cron/calendar-sync`, `/preventive-tasks`,
  `/material-usage-bridge`, `/low-stock-scan`, `/run-all`.
- Admin routes: `/dashboard/jobs`, `/jobs/runs`, `/jobs/runs/[id]`,
  `/dashboard/notifications`, `/notifications/preferences`.
- Last-run badges on integrations / operations / finance-material-usage /
  inventory pages.
- Sidebar nav entries under "System".
- Seed: 5 default job definitions, 3 sample successful runs, 2 queued
  low-stock alerts.
- Tests: migration shape, default catalog, cron auth (3 paths),
  low-stock dedupe, permission matrix.

## What's deferred

- **External delivery providers** (email / WhatsApp / SMS / Telegram).
  The queue, schema, dedupe, and admin UI are ready; providers + a
  worker-loop `runNotificationDeliveryJob` ship in v8.
- **Job retry policy** — `max_retries` is in schema but the runner
  currently runs each job exactly once per trigger. Retry-on-failure
  comes when v8 adds a worker loop.
- **Job concurrency lock** — two cron triggers landing inside the same
  Vercel invocation window can technically run a job twice. Acceptable
  for read-mostly jobs (calendar sync, low-stock scan); the bridge and
  preventive jobs are de-duped at the row level (`finance_material_usage_links.task_material_usage_id` unique;
  preventive `last_generated_on = today` short-circuits).
- **Per-user notification feed** — the schema supports per-user preferences
  but the inbox UI for end-users (owners / staff in-app) is a v8 polish.
- **Notification digest job** is enabled=false. Enabling now would
  aggregate notifications no provider delivers.

## Risks

- **Cron drift** — Vercel Cron schedules at-most-once-per-minute
  granularity and best-effort timing. For our ops cadence (every 30
  min / hourly / daily) that's fine. AI workloads in v8+ may need a
  proper queue.
- **Long-running jobs** — Vercel function timeouts cap us at 60s
  default / 5 min on Pro. The `timeout_seconds` column documents
  expectations but doesn't enforce them; the calendar sync job is the
  one most likely to exceed limits when feed counts grow. We'll
  switch to a worker queue (Inngest / Trigger.dev / Supabase Queues)
  if a single job ever crosses 5 min.
- **Audit-log volume** — every job run + every event writes audit
  rows. v8 will partition or shorten retention if `audit_events` grows
  hot.
