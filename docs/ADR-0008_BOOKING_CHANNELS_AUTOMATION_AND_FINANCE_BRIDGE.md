# ADR-0008 — Booking Channels Sync, Automation & Finance Bridge (v6)

Status: Accepted · 2026-04-26

## Context

v3 wired the finance ledger, v4 added operations and field workflows, v5
shipped inventory + storage uploads. v6 closes the integration loop:
external booking calendars import via iCal, those bookings auto-mint
operations tasks, owner-chargeable material consumption flows back to the
finance ledger, and physical stock counts can finally reconcile against
the books.

Per the prompt we explicitly **defer**: full Airbnb / Booking.com REST
API OAuth, payment processing, WhatsApp / Telegram, smart-lock control,
AI runtime, and a native mobile app.

## Decisions

### 1. iCal first, REST API later

iCal is the lowest-common-denominator channel integration:

- Airbnb, Booking.com, Vrbo, and most agency tools expose per-listing
  `.ics` URLs out of the box.
- Read-only — we never push reservations back, which removes one whole
  class of conflict.
- One small parser handles every channel; the per-vendor parts (auth
  refresh, rate limits, signing) all wait for v8+.

`features/integrations/calendar-sync/ical.ts` is a pure RFC 5545 subset
parser. It handles VEVENT blocks, line unfolding, `DTSTART;VALUE=DATE`,
`DATE-TIME`, and the four common backslash escapes. Anything malformed
goes to `IcsParseResult.errors` so we never lose the rest of the feed
to a single bad record.

### 2. Feed → events → bookings

```
channel_calendar_feeds (1) — — — — (N) channel_calendar_events
                                      │
                                      ▼ (materialise)
                              bookings (sourceReference = external_uid)
                                      │
                                      ▼ (run automation)
                              operation_tasks (turnover, inspection)
```

`syncCalendarFeed(feedId)`:

1. Fetches the URL with a no-cache GET.
2. Parses VEVENTs.
3. Upserts `channel_calendar_events` keyed by `(feed_id, external_uid)`.
4. Marks events that disappeared from the feed as `cancelled`.
5. Writes `lastSyncedAt` / `lastError` on the feed.

Insert / update each event runs `scoreConflict()` against existing
bookings on the same villa. An overlap creates a `booking_conflicts` row
(with severity `warning`) and stamps `conflictStatus = "overlap"` on the
event so the operator sees both signals.

### 3. Materialising an event as a booking

`materialiseCalendarEventAsBooking(eventId)` is the operator-triggered
path (the operator clicks "Create booking" on the integrations event
list). It:

- De-duplicates by `bookings.source_reference = external_uid`.
- Inherits `villa_id` and `channel_id` from the feed.
- Carries `check_in / check_out` straight from the event (treating
  iCal's exclusive DTEND as the booking checkout date).
- Sets all monetary fields to `0` because channel iCals don't include
  rates. **We never invent financial values** — finance handles
  reconciliation manually via revenue lines.
- Sets `bookingCode = EXT-<short uid>` and notes the source feed.
- Triggers `runBookingAutomationForBooking()` so the standard task
  chain (turnover cleaning + arrival inspection) is created
  immediately.

### 4. Conflict detection

`detectBookingConflicts(villaId, checkIn, checkOut, excludeBookingId?)`
returns active bookings that overlap a given window on the same villa.
It honours iCal's exclusive-checkout convention: `existing.checkOut =
new.checkIn` is **not** an overlap. The comparison runs as
`existing.checkIn < new.checkOut AND existing.checkOut > new.checkIn`.

The pure variant `dateRangesOverlap` lives in `ical.ts` so it can be
unit-tested without a database.

### 5. Booking automation

`booking_automation_rules` defines the rule catalog (rule name, trigger,
category, task type key, checklist template key, title template, due
offset minutes, optional villa/project filter). Two rules ship by
default:

| Name                | Trigger          | Category     | Task type           | Checklist template          | Anchor   | Offset  |
|---------------------|------------------|--------------|---------------------|-----------------------------|----------|---------|
| Checkout cleaning   | booking_created  | housekeeping | turnover_clean      | tpl_checkout_clean          | checkout | +60 min |
| Arrival inspection  | booking_created  | inspection   | arrival_inspection  | tpl_arrival_inspection      | checkin  | -180 min|

`runBookingAutomationForBooking(bookingId)`:

1. Loads every active rule for `booking_created`.
2. Applies optional villa/project filters.
3. Skips rules that already have a `booking_automation_runs` row for
   `(booking_id, rule_id)` (idempotency via partial unique index).
4. Skips rules whose checklist template / task type key resolves to a
   missing template (logs a `skipped` run with reason).
5. Materialises the operation task, attaches the checklist instance,
   and writes a `created` run.
6. Writes one audit event per run.

The anchor logic is intentionally simple in v6 — inspection rules pin
to check-in, everything else pins to check-out. v7 will let rules
explicitly declare their anchor when we add more rule types.

### 6. Material usage → finance bridge

When field staff log material usage on a task, v5 already creates a
`task_material_usage` row + a `consume` `inventory_movement`. v6 adds
the finance leg:

`createExpenseFromTaskMaterialUsage(usageId)`:

1. Look up the existing `finance_material_usage_links` row — repeated
   calls are idempotent.
2. Refuse if neither the usage nor the item is `owner_chargeable` →
   write `skipped_not_chargeable`.
3. Compute `amount_minor = round(quantity × unit_cost_minor)`.
4. If we have no unit cost or no currency, bail with status `failed`
   and a clear reason (operator can fix the item and retry).
5. Resolve `expense_date = task.completed_at ?? today`. Run
   `findLockingPeriod` — if the date falls in a `closed` or `locked`
   period, write `skipped_locked_period` so finance can cut a manual
   `finance_adjustment` instead. We never attempt to write into a
   locked period because the DB trigger from migration 0002 would
   reject it anyway.
6. Map `(item.itemType, category.key)` to an `expense_type` via the
   pure helper `mapItemToExpenseType` (towels → `linen_replacement`,
   amenities/toiletries → `toiletries`, chemicals → `consumables`,
   spare parts → `spare_part`, default → `maintenance`).
7. Insert the `expense_lines` row with allocation_scope = `villa` if
   the task has a villa, otherwise `project_pool`.
8. Upsert the `finance_material_usage_links` row (`status = "created"`)
   and the denormalised pointer on `task_material_usage`
   (`finance_bridge_status = "created"`, `expense_line_id`).

`bridgePendingMaterialUsageAction()` walks every `pending` row with a
batch cap of 200; `bridgeMaterialUsageForTaskAction(taskId)` is the
per-task control on the operations task detail page;
`bridgeOneMaterialUsageAction(usageId)` is the single-row retry on
`/dashboard/finance/material-usage`.

### 7. Inventory counts workflow

```
draft → submitted → approved → adjusted
        ↓                ↓
        cancelled        cancelled
```

`createInventoryCountAction(locationId)` mints a draft + pre-fills lines
from the location's current `inventory_stock_levels`. The counter
overwrites `counted_quantity` per line via the inline editor; variance
is recomputed on every keystroke save and re-validated on submit.

`approveInventoryCountAction` walks lines, generates one
`count_correction` movement per non-zero variance through the v5
`applyMovement` helper, and flips the count to `adjusted`. We pass
`allowNegative: true` for count corrections specifically — physical
counts can find less stock than the books carry; the system must
honour reality.

### 8. Storage policies

We did **not** add `storage.objects` policies in this migration — the
`task-attachments` bucket continues to run service-role-only via signed
upload/download URLs. Adding RLS-checked direct browser uploads is
useful but couples Supabase Storage configuration to a database
migration we'd need to keep in lockstep, so it's deferred. See
`scripts/storage-policies.sql.example` (commented) in the next
iteration.

### 9. Permissions

New keys (matrix in `features/auth/permission-matrix.ts`):

- `integrations.read / write`
- `bookings.sync`
- `bookings.conflict.manage`
- `automation.read / write`
- `inventory.count.read / write / approve`
- `finance.bridge_material_usage`

Operations manager owns sync, conflict resolution, automation; finance
manager + accountant own the material-usage bridge; procurement manager
+ housekeeping supervisor own counts (procurement also approves them).

## What's implemented now

- Migration `0007_booking_channels_calendar_sync_automation.sql`.
- Drizzle schema `integrations.ts`; `task_material_usage` extended with
  bridge columns.
- Pure helpers: `ical.ts`, `inventory/counts.ts`, the bridge maths in
  `material-usage-bridge.ts`.
- Server actions for: feeds (CRUD + sync), events (materialise,
  ignore), conflicts (acknowledge, resolve), automation (rule CRUD,
  manual run, batch run, default seeder), counts (create, line edit,
  submit, approve, cancel), finance bridge (pending batch, per-task,
  per-row).
- Admin routes:
  `/dashboard/integrations`, `/calendar-feeds`, `/new`, `/[id]`,
  `/calendar-events`, `/conflicts`, `/automation`,
  `/dashboard/bookings/calendar`, `/dashboard/bookings/sync`,
  `/dashboard/inventory/counts` (full workflow now), `/[id]`,
  `/dashboard/finance/material-usage`.
- Booking detail upgraded with automation runs + manual "Run
  automation" button.
- Operations task detail upgraded with bridge button on the material
  usage section.
- Sidebar nav: separate "Integrations" group, calendar + sync under
  Bookings, material-usage under Finance.
- Seed: 3 calendar feeds, 2 calendar events (one with overlap), 1 open
  conflict, 2 default automation rules.
- Tests: 0007 migration shape, ICS parser (3 forms + error
  resilience), date-range overlap, feed URL validator, automation
  title interpolation, finance bridge maths, expense type mapping,
  count variance, schema validators, permission matrix.

## What's deferred

- Cron / background scheduler — sync runs only on operator click.
  Vercel Cron or a worker queue lands when we wire AI in v7+.
- API-based channel integrations (Airbnb / Booking.com REST). iCal is
  enough until guests need messaging or pre-arrival upsell.
- HEIC photo support, payment processing, WhatsApp / Telegram, smart
  lock control — all explicitly out of v6 scope.
- Supabase Storage RLS policies for direct-browser uploads. Service-
  role upload/download still runs the show.
- Rule editor UI — for now operators edit rules via SQL or the seeded
  defaults. The data model + actions support edit; the form is the v7
  polish.
- Cross-statement-period auto-bridging via `finance_adjustments`. v6
  marks `skipped_locked_period` and surfaces it in the UI so finance
  handles it manually.

## Risks

- **Free-text iCal payloads**: a malformed feed can produce 0 events
  even when the URL responds 200. We surface `lastError` per feed and
  keep the previous events instead of nuking them.
- **Conflict noise**: until operators acknowledge / resolve conflicts,
  re-running sync will keep the existing row (we de-dupe per event)
  but the integrations dashboard count will stay high. This is the
  intended pressure to act, not a bug.
- **No automation backpressure**: a single booking with 50 active
  rules creates 50 tasks. Today we only ship two defaults; v7 will add
  rate limiting if rule sets grow.
