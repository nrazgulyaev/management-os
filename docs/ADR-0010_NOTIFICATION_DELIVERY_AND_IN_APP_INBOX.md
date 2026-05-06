# ADR-0010 — Notification Delivery, Inbox & Digest (v8A)

Status: Accepted · 2026-04-26

## Context

v7 shipped the queue + preferences schema and a no-op admin UI. v8A
ships actual delivery: a provider abstraction (in-app / Resend / Twilio
/ noop), a durable per-user inbox, a delivery worker job, and a daily
digest. The queue stays the source of truth — every `queueNotification`
call still writes one queue row; v8A adds one `notification_deliveries`
row per attempt and (for in_app) one `in_app_notifications` row per
recipient.

External providers stay defaulted-off. `NOTIFICATIONS_DRY_RUN=1` is the
default when env is missing; the worker routes everything through the
noop provider so testing in dev or staging never sends real email/SMS.

## Decisions

### 1. Three-layer model: queue → deliveries → inbox

```
notification_queue        — one row per "intent to notify"
        │
        ▼ (worker job picks it up)
notification_deliveries   — one row per attempt per recipient
        │
        ▼ (in_app provider only)
in_app_notifications      — one row per recipient inbox
```

The queue is the only thing application code writes. Everything below
is owned by the delivery worker. This keeps idempotency simple: re-queue
a row → worker generates a new delivery batch; queue dedupe still works
the same way it did in v7.

### 2. Provider abstraction

`features/notifications/providers/types.ts` defines a four-method
interface (`key`, `supports`, `isConfigured`, `send`). Four concrete
providers ship today:

- **in_app** — writes to `in_app_notifications`. Always configured.
- **noop** — succeeds without side effects. Catch-all for dry-run + any
  channel without a real provider.
- **resend** — calls `POST https://api.resend.com/emails` via plain
  `fetch`. No SDK, smaller bundle.
- **twilio** — calls
  `POST https://api.twilio.com/2010-04-01/Accounts/<sid>/Messages.json`
  with Basic Auth. No SDK. WhatsApp gets the `whatsapp:` prefix on
  `From`/`To` automatically.

`selectProvider(channel, opts)` is the single decision function:

```
in_app                          → inAppProvider
email + dry-run on              → noop
email + dry-run off + Resend OK → resend
email + dry-run off + Resend ❌ → noop
sms / whatsapp + dry-run on     → noop
sms / whatsapp + dry-run off + Twilio OK → twilio
sms / whatsapp + dry-run off + Twilio ❌ → noop
telegram                        → noop (deferred)
```

Tests cover every branch.

### 3. Default safety: dry-run

`NOTIFICATIONS_DRY_RUN` defaults to **on** when the env is unset
(`isNotificationsDryRun()`). To send real notifications you must
**explicitly** set both:

```
NOTIFICATIONS_DRY_RUN=0
RESEND_API_KEY=re_...        # for email
RESEND_FROM_EMAIL=...
TWILIO_ACCOUNT_SID=AC...     # for sms / whatsapp
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_SMS=+...
TWILIO_FROM_WHATSAPP=+...
```

This is the failsafe: a misconfigured deployment never accidentally
sends.

### 4. Recipient resolution

`resolveNotificationRecipients(queueRow)` maps a queue row to one or
more concrete recipients per channel:

- `internal_user` → `app_users.id`, optional email/phone.
- `owner` → for in_app, owner_id directly. For external channels, fan
  out to every linked `app_users_owners` row with a non-null address.
- `role` → every active internal app_user with that role. The role
  string lives in `payload.recipientRole` (set by jobs that queue
  role-targeted notifications, like the low-stock and digest jobs).
- `guest` → skipped today; ships with the guest portal in v8B.

When no recipient resolves, a single `skipped` delivery row records the
reason and the queue row is marked `failed` so an operator can fix the
addressing.

### 5. Preferences (most-specific wins)

`loadEffectivePreference({ appUserId, ownerId, roleKey, channel,
templateKey })` finds the most specific row that matches the recipient.
Specificity score:

```
app_user match  +4
owner match     +2
role match      +1
```

Higher score wins. The pure helper `shouldSuppressByPreference(pref,
now)` then returns `{ suppress, reason, reschedule? }`. A disabled
preference suppresses outright. Quiet hours suppress AND propose a
reschedule time = end of the current quiet window. If every recipient
suppresses with reschedules, the queue row's `next_attempt_at` is set
to the earliest reschedule and the row stays `queued` for the next
worker tick.

### 6. Quiet hours

`features/notifications/quiet-hours.ts` (pure):

- "HH:MM" 24h windows in the server's local timezone.
- `start < end` is a same-day window.
- `start > end` wraps midnight (22:00 → 07:00 = night-time).
- `nextQuietHoursEnd(pref, now)` returns the next time the window
  closes — used to set `next_attempt_at` precisely.

### 7. Delivery worker job

`runNotificationDeliveryJob` walks queued rows where
`scheduled_for <= now AND (next_attempt_at IS NULL OR next_attempt_at <=
now)`, batch limit 100. Per-recipient failures never throw — they
become `notification_deliveries.status = "failed"` rows with
`error_message`.

Status aggregation per queue row:

| Result                                  | Final queue status  |
|-----------------------------------------|---------------------|
| at least one `sent` delivery            | `sent`              |
| only suppressions, with a reschedule    | stays `queued` + `next_attempt_at` |
| only suppressions, no reschedule        | `suppressed`        |
| all `failed` (and no successes)         | `failed`            |
| no recipients                           | `failed` with reason|

Cron schedule: `*/10 * * * *` (every 10 min).

### 8. Digest job

`runNotificationDigestJob` builds a deterministic snapshot:

- open booking conflicts
- failed jobs in the last 24h
- urgent operation tasks (status not in completed/approved/cancelled)
- low-stock count
- pending material-usage bridge rows

Then queues one in-app digest per role (`super_admin`, `director`,
`operations_manager`). Dedupe key:

```
internal_daily_digest:YYYY-MM-DD:<role>
```

Same role on the same UTC day = no duplicate. Cron: `0 8 * * *` (daily
08:00). v8A keeps the digest in-app only by default; once an org turns
on Resend, operators can flip the role/template preference to email.

### 9. RLS

- `notification_deliveries` — `internal_read` only. Provider responses
  may carry tokens / phone numbers; never expose to owners or guests.
- `in_app_notifications` — `internal_read` (staff see all),
  `in_app_notifications_self_read` (any signed-in app_user sees their
  own rows), `in_app_notifications_owner_read` (owners see rows
  scoped to owners they're granted via `current_owner_ids()`).
- The new queue columns (`delivery_attempts` etc.) inherit the v7 queue
  policy (internal_read).

### 10. Cron + auth

Two new cron endpoints:

```
GET /api/cron/notifications-deliver  → deliver_pending_notifications
GET /api/cron/notifications-digest   → notification_digest_internal
```

Both go through the v7 `verifyCronAuth` flow — bearer in production,
localhost-with-warning in dev. `/api/cron/run-all` was extended in
`executeAllJobs` to walk these too, so a single Vercel-Cron entry can
keep everything ticking.

## What's implemented now

- Migration 0009 (`notification_deliveries`, `in_app_notifications`,
  queue retry columns).
- Drizzle schema additions + barrel export.
- Env: `RESEND_*`, `TWILIO_*`, `NOTIFICATIONS_DRY_RUN` + helpers
  (`isResendConfigured`, `isTwilioConfigured`, `isNotificationsDryRun`).
- Providers: `types`, `noop`, `in_app`, `resend`, `twilio`, `index`
  (with `selectProvider`).
- Pure quiet-hours helpers + tests.
- `delivery.ts` — `resolveNotificationRecipients`,
  `loadEffectivePreference`, `shouldSuppressByPreference`,
  `deliverNotification`, `deliverPendingNotifications`,
  `requeueNotification`.
- Two new jobs: `runNotificationDeliveryJob`,
  `runNotificationDigestJob` (+ pure `digestDedupeKey`).
- Cron routes + `executeAllJobs` extended.
- Services: `listInAppNotificationsForCurrentUser`,
  `countUnreadForCurrentUser`, `listNotificationDeliveries`,
  `listNotificationsWithAttempts`.
- Actions: `markInAppNotificationReadAction`,
  `archiveInAppNotificationAction`, `retryNotificationAction`,
  `deliverPendingNotificationsAction`, `queueDigestNowAction`,
  `updateCurrentUserNotificationPreferenceAction`.
- Admin routes: `/dashboard/notifications` (queue + provider mode +
  retry buttons), `/inbox`, `/deliveries`, `/preferences` (with
  self-edit form). Topbar bell shows unread count + links to inbox.
- Seed: delivery job definition, two sample inbox rows for
  super_admin/director, two sample preferences, a noop sample delivery
  row.
- Tests: provider selection, .supports filtering, noop/resend/twilio
  unconfigured-skip behaviour, quiet hours math + reschedule, digest
  dedupe, default catalog enabled flags, permission matrix sanity.

## What's deferred

- **Owner-portal inbox UI** — owner-scoped `in_app_notifications` rows
  exist + RLS lets owners read them, but the owner-portal dashboard
  doesn't render the inbox yet.
- **Telegram delivery** — channel exists, provider stays noop until
  v8B picks a Telegram client.
- **Retry backoff** — failed deliveries don't auto-retry yet. Operator
  clicks "Retry" or the delivery worker picks them up after the
  operator manually re-queues. Backoff lands with the worker-loop
  refactor.
- **HTML email templates** — Resend gets plain `text` today.
- **Digest scope expansion** — only `super_admin / director /
  operations_manager` get a digest. Per-team digests arrive when v9
  ships AI summaries.
- **External delivery during seed** — the seed script never calls
  Resend/Twilio. Sample deliveries are inserted via SQL only, with
  `provider="noop"`.

## Risks

- **Provider response logging** — we store `response_json` to aid
  debugging. Twilio/Resend responses can include phone numbers and
  email addresses. The internal-only RLS plus the
  `notifications.read` permission gate keep them off owner/guest
  surfaces, but if we ever expose deliveries to owners (v9+), redact
  before serving.
- **Quiet-hours timezone** — preferences are wall-clock in the server's
  timezone. Cross-region staff might see odd boundaries. v8B will add
  per-user timezone to `app_users` and convert at evaluation time.
- **Worker latency** — the delivery cron runs every 10 minutes. A
  notification queued at minute 9:59 arrives at 10:09 worst-case.
  Acceptable for ops alerts; not for real-time guest messaging (which
  v8B replaces with a queue-watcher worker on Trigger.dev / Inngest).
