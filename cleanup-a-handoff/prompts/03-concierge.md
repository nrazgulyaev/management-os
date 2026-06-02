# cleanup-A · PR 3 — Concierge cabinet data wiring

**Goal.** Wire all five exports in `src/features/concierge/queries.ts`.

## Files

- Edit: `src/features/concierge/queries.ts`
- Read for context: `src/features/concierge/comp-policy.ts`,
  `src/features/concierge/escalation.ts`,
  `src/lib/db/schema/guest-ai-concierge.ts`,
  `src/lib/db/schema/guest-journey.ts`,
  `src/lib/db/schema/guest-services.ts`,
  `src/components/concierge/{request-inbox,thread,journey-timeline,comp-watch}.tsx`

## Reference migrations

- `0019_guest_concierge_handoff.sql` — handoff thread roots
- `0020_guest_request_center.sql` + `0021_guest_request_attachments_reads.sql` — requests + attachments
- `0022_guest_request_storage_hardening.sql` — RLS on the above
- `0024_guest_journey_automation.sql` — journey moments
- `0101_md_5_concierge_handoff.sql` — recent fields (priority, escalation_at)

## Per-function contract

### `getInbox()`

Return open `guest_requests` for org, ordered by:
1. `priority = 'urgent'` first, then `'normal'`, then `'low'`
2. Within priority, `created_at asc` (oldest first — that's the queue rule)

Cap 100. Map to `RequestInboxItem`:
- `requestId`, `bookingId`, `guestName`, `villaCode`, `subject`, `priority`, `createdAt`, `escalatedAt` (null if not escalated)
- `tone`: derived — `"danger"` if `escalated_at && now() - escalated_at > 30min`, `"warn"` if `priority = 'urgent'`, else `"ok"`
- `unreadCount` from `guest_request_reads` (rows where `read_at is null` for current staff user — see `getCurrentAppUser()` helper)

### `getThread(stayId)`

Return `GetThreadResult | null` for the stay's primary thread (one thread per
booking). Pull from `concierge_threads` joined with `bookings`, `guests`, `villas`.

`messages` = `concierge_messages` for the thread, ordered by `at asc`. Cap 200.
Map each to `ConciergeMessage` per the component's type:
- `author` = `'guest' | 'staff' | 'agent'`
- `body`, `at`, `attachments` (count only, full list lazy-loaded by detail route)
- For `agent` messages, include `agentCode` (e.g. `'concierge-agent'`)

If no thread for the stay → return `null` (route shows "no conversation yet" empty state).

### `getJourney(bookingId)`

Return `JourneyMoment[]` for the booking — all rows from `guest_journey_moments`
where `booking_id = bookingId`, ordered by `at asc`.

Map: `{id, at, kind, label, detail, tone}` per the timeline component.

### `getCompOffered(bookingId)`

Return all `comp_offerings` for the booking. Order by `offered_at desc`.

Map to `CompOfferedRow`:
- `id`, `offeredAt`, `amountIdr`, `kind` (`'discount' | 'voucher' | 'gift' | 'upgrade'`)
- `policyState`: pass through `comp-policy.ts` `evaluate({ amountIdr, ... })` to
  get `'within_policy' | 'requires_approval' | 'denied'`
- `approverName` from `users` if `approved_by` is set

### `postStaffMessage(input)`

1. Resolve thread by `input.threadId`; if not found, throw.
2. Insert `concierge_messages` row with `author = 'staff'`, `staff_user_id = input.staffUserId`, `body = input.body`, `at = now()`.
3. Bump `concierge_threads.last_activity_at`.
4. Return `{ messageId }`.

Wrap in transaction. Trigger `revalidatePath` in the **calling action**, not here.

## Acceptance

- Inbox respects urgent-first ordering and the 30-min escalation flag turns the row danger-tone.
- `getThread(stayId)` for a stay with no conversation returns `null` cleanly.
- Comp watch shows policy state evaluation matching `comp-policy.ts` rules (500k IDR threshold).
- `pnpm typecheck && pnpm lint` clean.

## Commit message

```
feat(concierge): wire inbox, thread, journey, comp watch

Replaces Phase 2.4 mgmt-04 read stubs with real Drizzle queries against
guest_requests, concierge_threads/messages, guest_journey_moments, comp_offerings.
postStaffMessage now inserts the message + bumps last_activity_at atomically.

Refs: cleanup-A
```
