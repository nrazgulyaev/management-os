# ADR-0012 — Villa Availability, Front Office, Readiness, Responsibility Scopes & Security Registry (v9A)

Status: Accepted · 2026-04-27

## Context

The pre-Development-OS audit (in conversation, not committed) flagged that
booking-core primitives — a master availability table, a per-villa readiness
timeline, and a front-office workflow — are not yet first-class. v9A closes
those gaps without committing to any of the things that should NOT ship yet:

- No owner-stay economics or compensation flow.
- No full rate calendar (separate v9-pricing track).
- No guest-services commerce.
- No real smart-lock control.
- No camera streaming — registry only.
- No new owner-portal exposure of internal calendar / guest data.

Everything in v9A is **internal-facing**. RLS on every new table is force-on
with `is_internal_user()`-gated `SELECT`; cameras get an additional internal-
only `ALL` policy as defence in depth.

## Decisions

### 1. `villa_calendar_blocks` is the single source of "not for sale tonight"

Every reason a villa is unavailable lives in one table:

```
guest_booking | owner_stay | maintenance_block | deep_cleaning |
inspection    | out_of_order | internal_hold | channel_hold
```

- `[starts_at, ends_at)` half-open intervals — **back-to-back stays are not
  a conflict** (the existing `endsAt` equals the new `startsAt`).
- `cancelled` and `completed` blocks are ignored by conflict detection.
- `(source_type, source_id)` has a **partial unique index** that only fires
  when `status = 'active'` — so re-syncing a cancelled-then-revived booking
  works without a manual cleanup.
- A DB CHECK enforces `ends_at > starts_at` so we never store a degenerate
  range.

The conflict-detection logic lives in `src/features/availability/calendar.ts`
as a pure module. Tests import it directly without `server-only`.

### 2. Booking ↔ block sync is one-way and idempotent

`syncBookingCalendarBlock(bookingId)` in
`src/features/availability/services.ts`:

- Booking active → upsert one `guest_booking` block (active).
- Booking `cancelled` / `no_show` → flip the existing block to `cancelled`.

The caller (booking actions, calendar-sync job) decides when to invoke this.
The action layer never imports this directly — it goes through service
helpers and audit-logs the result.

### 3. Readiness is an append-only timeline

`villa_readiness_states` has at most **one open row** per villa, enforced by
`UNIQUE(villa_id) WHERE effective_to IS NULL`. State transitions run inside
a transaction:

1. Close the previous open row (`effective_to = now()`).
2. Insert the new open row.

`autoSetReadinessFromTask` is a pure-mapping hook that converts task status
changes into readiness transitions for the safe / obvious cases:

| Task category | Task status     | Readiness   |
|---------------|-----------------|-------------|
| housekeeping  | open            | dirty       |
| housekeeping  | in_progress     | cleaning    |
| housekeeping  | needs_review    | inspection  |
| housekeeping  | approved/done   | ready       |

Maintenance and concierge tasks deliberately do not auto-bump readiness —
the relationship is non-trivial and we want operator intent.

### 4. Front office: arrivals / departures / in-house / requests

Read-only services, no new booking-state machine. The front desk sees:

- **Arrivals(date)**: confirmed/tentative bookings checking in, with
  villa, safe guest display name, pax count, channel, current readiness,
  open-service-request flag.
- **Departures(date)**: bookings checking out, with the most recent
  `expected_checkout_updated` event, the housekeeping task status,
  late-checkout request status, and the same-day next arrival.
- **In-house(date)**: stays where checked_in and `today < checkOut`,
  with open-service-request and maintenance-ticket counters.

Guest data is **safe-display only** (`Emma W.` not `Emma Whitmore` and not
the email). Phone / passport / full email never leave the database via
this surface.

### 5. Check-in / check-out requests are first-class

`checkin_checkout_requests` covers `early_checkin`, `late_checkout`,
`expected_checkout_time`, `early_checkout_notice`. Status transitions are
checked by a pure table:

```
requested → reviewing | approved | rejected | cancelled
reviewing → approved  | rejected | cancelled
approved  → completed | cancelled
rejected, cancelled, completed → terminal
```

Approvals can carry an optional fee (`fee_amount_minor`, `currency`) — when
v9-pricing lands these will hook into a posting flow; today they're
informational.

### 6. Responsibility scopes — narrow the actionable surface

`user_responsibility_scopes` lets us say *"property_manager Aria covers
Project Enso, all villas, but only housekeeping + maintenance"* without
stretching the role matrix. NULL columns mean "any".

The matcher (`matchesScope`, `userHasScopeForTask`) is pure and tested.
Future task-routing UIs and notification-targeting logic will read from
this table.

### 7. Security cameras — registry only, no streaming

`security_camera_devices` stores: name, location label, project/villa,
provider, **external app URL**, status, access-role label, notes.
`stream_url_encrypted` is a placeholder for a future encrypted-credential
flow — the read service intentionally **does not project** that column,
even when it's populated.

The platform never streams video. Operators click through to the vendor
portal. RLS makes the table internal-only and cameras get an extra
`internal_write` policy on top of the loop's read policy. Owners + guests
must not see this surface — `isOwnerSafeCameraSurface()` always returns
`false` as defence-in-depth in any code that might branch on visibility.

### 8. Permissions

Ten new keys (`availability.{read,write}`, `front_office.{read,write}`,
`readiness.{read,write}`, `responsibility_scopes.{read,manage}`,
`security.{read,manage}`). New role: `booking_manager` — front-office +
availability read/write. The migration inserts the role; the matrix lists
it in `INTERNAL_ROLES` and grants it the front-office + availability keys.

## Trade-offs accepted

- **Two sources of truth for occupancy**: `bookings.status` and
  `villa_calendar_blocks` (block_type='guest_booking'). The block is a
  derived view — `syncBookingCalendarBlock` keeps them in step. We could
  have made the block an actual VIEW; chose a real row so the calendar
  surface can join cleanly with manual blocks.
- **Auto-readiness only for housekeeping**. Other categories require
  operator intent.
- **Camera registry has no audit-trail of click-throughs**. We log
  create/update events but not "who opened the vendor portal at 02:14am".
  Logging click-throughs needs a redirector route — out of scope for v9A.
- **No DST hardening on `bookingDatesToBlockRange`**. We use UTC midnight at
  both ends. Real check-in/check-out times (e.g. 14:00 / 11:00 villa-local)
  land with v9-pricing.

## Out of scope (deferred)

- Owner-stay economics: who pays for cleaning, what the block does to the
  owner's distribution. v9A only adds the `owner_stay` block_type and the
  owner-safe calendar projection (`listOwnerSafeCalendarBlocks`).
- A `/owner/calendar` route — the projection helper is ready, the route
  isn't.
- Drag-create / drag-resize in the calendar UI.
- Channel manager outbound push (would write `channel_hold` blocks).
- Smart-lock integration.

## Operational runbook

- **Apply migration**: `npm run db:migrate` (idempotent re-run is safe).
- **Seed sample data**: `npm run db:seed` adds five blocks, five readiness
  rows, four stay events, three check-in/out requests, two scopes, three
  cameras.
- **Sync a booking's calendar block**: call
  `syncBookingCalendarBlock(bookingId)` from the booking action that
  changed the booking's status or dates. Idempotent.
- **Set readiness manually**: `/dashboard/readiness` (permission:
  `readiness.write`).
- **Add a manual block**: `/dashboard/availability/blocks/new` (permission:
  `availability.write`).
- **Add a camera**: `/dashboard/security/cameras/new` (permission:
  `security.manage`).
- **Add a responsibility scope**: `/dashboard/settings/responsibility-scopes`
  (permission: `responsibility_scopes.manage`).
