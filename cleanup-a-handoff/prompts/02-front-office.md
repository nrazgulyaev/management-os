# cleanup-A · PR 2 — Front-office cabinet data wiring

**Goal.** Wire `getTodayBoard`, `getRegistry`, `getTurnovers` in
`src/features/front-office/queries.ts`. Leave `getCheckinFlowState` alone —
it's a bookmark loader and already does the right thing.

## Files

- Edit: `src/features/front-office/queries.ts`
- Read for context: `src/features/front-office/services.ts`,
  `src/features/front-office/room-board.ts`,
  `src/lib/db/schema/bookings.ts`,
  `src/lib/db/schema/availability.ts`,
  `src/lib/db/schema/guest-stays.ts`,
  `src/lib/db/schema/guest-stay-security.ts` (ID + visa records),
  `src/components/front-office/{guest-card,registry-table,turnover-monitor}.tsx`

## Reference migrations

- `0011_villa_availability_front_office_readiness.sql` — `checkin_checkout_requests`
- `0017_guest_stay_security.sql` — `guest_id_records`, visa fields
- `0099_md_5_front_office_copilot.sql` — front-office agent + registry views
- `0100_md_5_housekeeping_scheduler.sql` — `housekeeping_turnovers`

## Per-function contract

### `getTodayBoard()`

Return `{ date, arrivals, inHouse, departures, kpis }` for **today in org TZ**
(not server TZ — use `getOrgClock(orgId).today()`).

- `arrivals` = bookings with `check_in_date = today` and `status in ('confirmed','holdover')`
- `inHouse` = bookings overlapping `today` (`check_in_date <= today < check_out_date`) and `status = 'in_house'`
- `departures` = bookings with `check_out_date = today` and `status in ('in_house','departing')`

For each booking map to `TodayBoardBooking`:
- `villaCode` from joined `villas`
- `guestName` = primary guest from `guests` table
- `partySize`, `nights` from booking
- `windowLabel` = `formatTimeRange(plannedArrivalAt, plannedDepartureAt)`
- `flavour` derived from `checkin_checkout_requests.status` for that booking
  (if no request: `"pending"`; if `approved`: `"ready"`; if `late`: `"late"`)
- `badge` only when stay has open `concierge_handoff` row (`"VIP"` / `"Recovery"` / etc.)
- `nextAction` from `room-board.ts` helper `nextActionLabel(stay)`
- `href` = `/dashboard/front-office/bookings/${bookingId}`

KPIs: 4 fixed labels, computed from the same query:
1. `Arrivals today` — value: count, no tone
2. `In house` — count
3. `Departures today` — count
4. `Late check-outs` — count of `in_house` bookings where `planned_departure_at < now`; tone `"warn"` if > 0, `"danger"` if > 3

### `getRegistry()`

Return all `RegistryRow[]` for the **current month + previous month** window —
this matches what the registry table paginates over.

Source: `guest_id_records` joined with `bookings` and `villas`. Filter to
org. Order by `recorded_at desc`. Cap to 500 rows (route uses virtualization).

Map fields:
- `guestName`, `documentType`, `documentNumber`, `nationality`, `dob` — from `guest_id_records`
- `villaCode`, `checkInDate`, `checkOutDate` — from joined booking
- `taxReportedAt` (nullable) — from `tax_exports` table if a row exists for this booking

### `getTurnovers()`

Return all open turnovers (`housekeeping_turnovers` where `status != 'completed'`)
for org, joined with `bookings`/`villas` for the display fields. Order by
`expected_ready_at asc`. Cap 100.

Map to `TurnoverRow` per `turnover-monitor.tsx` props.

## Acceptance

- Today board reflects timezone correctly (test by spoofing org TZ to UTC+8 and confirming arrivals roll over at midnight Bali time, not midnight server time).
- Registry shows ID + visa rows; tax-export column is empty when no export row exists (not crash).
- Turnover monitor shows ETA countdown.
- `pnpm typecheck && pnpm lint` clean.

## Commit message

```
feat(front-office): wire today board, registry, turnovers

Replaces Phase 2.4 mgmt-03 read stubs with real Drizzle queries against
bookings, checkin_checkout_requests, guest_id_records, and housekeeping_turnovers.
getCheckinFlowState left untouched (already correct).

Refs: cleanup-A
```
