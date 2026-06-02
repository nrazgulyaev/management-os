# cleanup-A · PR 1 — Channels cabinet data wiring

**Goal.** Replace the empty stubs in `src/features/channels/queries.ts` with
real Drizzle reads/writes against the channel-manager tables that already
exist in `main`.

## Files

- Edit: `src/features/channels/queries.ts`
- Read for context: `src/features/channels/state-machine.ts`,
  `src/features/channels/conflict-resolver.ts`,
  `src/lib/db/schema/channel-manager.ts`,
  `src/lib/db/schema/bookings.ts`,
  `src/lib/db/schema/availability.ts`,
  `src/lib/db/schema/villas.ts`,
  `src/components/channels/channel-grid.tsx` (for the return-type shapes)

## Reference migrations (already in main — do not duplicate)

- `0007_booking_channels_calendar_sync_automation.sql` — `channels` + sync events
- `0026_dynamic_pricing_availability_rules.sql` — `availability_rules`
- `0076_development_os_stage_6_p1_channel_connections.sql` — `channel_connections`
- `0077_development_os_stage_6_p1_channel_reservations.sql` — `channel_reservations`

## Per-function contract

### `getChannelGridData(input)`

Default window: 14 days from `input.anchor ?? today`. Return:

| Field | Source |
|---|---|
| `villas` | `villas` filtered to org; map `{id, code, label}` |
| `channels` | `channel_connections` joined with `channels` for label/colour; filter to `status = 'connected'` |
| `dates` | already built by `buildDateWindow` — keep as-is |
| `cells` | `rate_cells` for (villaId, channelId, date) in window; key = `"${villaId}:${channelId}:${dateISO}"` |
| `stays` | `bookings` overlapping the window, joined with `channel_reservations` for source label; map status → `Stay["state"]` |
| `kpis` | three KPIs derived from the same read: `kpiCells = count(cells)`, `kpiConflicts = count(cells where state='conflict')`, `kpiPendingSyncs = count(sync_events where status='pending')` |
| `recentEvents` | latest 10 `sync_events` ordered by `at desc`, mapped to `{id, at: at.toISOString(), label}` where label is humanised from `event_type` |
| `directFunnel` | aggregate of `bookings` grouped by `source` over the window: stages `["Search", "Quote viewed", "Quote sent", "Booked"]` with counts (zero-fill missing stages) |

All filters scoped via `withOrgScope(getDb(), orgId)`. If `db === null`, return
the same shape with `villas: []`, `channels: []`, empty maps — `dates` still
built from input.

### `pushRate(input)`

1. Parse `key` into `(villaId, channelId, dateISO)`.
2. Upsert into `rate_cells` (PK = `(villa_id, channel_id, occurs_on)`) with
   `amount`, `currency = 'IDR'`, `updated_by = actorUserId`, `updated_at = now()`,
   `sync_state = 'pending'`.
3. Insert a `sync_events` row: `event_type = 'rate.push'`, `status = 'pending'`,
   `payload = { villaId, channelId, dateISO, amount }`.
4. Wrap both in a transaction. On success return `{ ok: true, syncState: "pending" }`.
5. On error throw — the route already has an error boundary.

## Acceptance

- `getChannelGridData()` returns non-empty results on a seeded DB and the same
  empty shape on `db === null`.
- `pushRate` writes both rows atomically (verify by SELECT after).
- Open `/dashboard/channels` locally — the grid renders, sticky villa column
  works, mobile pinch-zoom still works.
- `pnpm typecheck && pnpm lint` clean.

## Commit message

```
feat(channels): wire grid + pushRate to channel-manager tables

Replaces Phase 2.4 mgmt-01 query stubs with real Drizzle reads against
channel_connections, rate_cells, sync_events, bookings, and channel_reservations.
pushRate now writes the upsert + sync event atomically.

Refs: cleanup-A
```
