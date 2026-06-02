# Packet C · PR 1 — owner data layer 2 (villa, calendar, home activity)

**Goal:** Wire the three owner-portal query fns that were left as stubs in PR 3:
`get-villa.ts`, `get-calendar.ts`, `get-home.ts`. Each needs a small schema addition.

## Tables to add

### 1. `villa_photos` → `src/lib/db/schema/villa-photos.ts`

Photo metadata for the Owner Portal Villa cabinet's hero gallery + the Mgmt-side villa header. Photos themselves live in object storage; this table stores URLs + ordering + captions.

- `id` uuid PK
- `villaId` uuid FK → `villas.id` (`cascade`)
- `url` text notNull — storage URL (S3 / Supabase / Cloudflare R2 — whatever's already in use)
- `caption` text nullable
- `kind` text notNull default `'hero'` — enum: `hero | gallery | floorplan | aerial | room | outside`
- `position` integer notNull default 0 — display order within (villaId, kind)
- `width` integer nullable
- `height` integer nullable
- `uploadedByUserId` uuid FK → `appUsers.id` (`set null`)
- `visibleToOwner` boolean notNull default `true`
- `createdAt`, `updatedAt`

Indices: `(villa_id, kind, position)`, `(villa_id, created_at desc)`.

### 2. `owner_stays` → `src/lib/db/schema/owner-stays.ts`

The owner's own personal stays at their villa. Distinct from guest `bookings` — owner stays don't generate revenue, may use complimentary nights from MSA budget, and block out the calendar.

- `id` uuid PK
- `ownerId` uuid FK → `owners.id` (`cascade`)
- `villaId` uuid FK → `villas.id` (`restrict`)
- `checkIn` date notNull
- `checkOut` date notNull
- `nights` integer notNull
- `partyAdults` integer notNull default 2
- `partyChildren` integer notNull default 0
- `status` text notNull default `'requested'` — enum: `requested | confirmed | declined | cancelled | completed`
- `requestedAt` timestamptz notNull default now()
- `confirmedAt` timestamptz nullable
- `confirmedByUserId` uuid FK → `appUsers.id` (`set null`)
- `declinedReason` text nullable
- `usesComplimentaryBudget` boolean notNull default `true`
- `note` text nullable
- `createdAt`, `updatedAt`

Indices: `(owner_id, check_in)`, `(villa_id, check_in)`, `(status, check_in)` for the "upcoming requests to confirm" Mgmt-side query.

### 3. `owner_activity_log` → `src/lib/db/schema/owner-activity-log.ts`

Append-only event stream surfaced on the Owner Portal Home "recent activity" section. Different from `auditEvents` — this is owner-facing, narrative-style, with display-ready fields.

- `id` uuid PK
- `ownerId` uuid FK → `owners.id` (`cascade`)
- `kind` text notNull — enum: `statement_issued | statement_paid | booking_confirmed | maintenance_closed | personal_stay_confirmed | document_uploaded | message_received | q_review_scheduled | tax_doc_ready | other`
- `relatedEntityType` text nullable — soft reference
- `relatedEntityId` uuid nullable
- `subject` text notNull — display title
- `body` text nullable — optional one-line body for richer entries
- `linkUrl` text nullable — owner-portal route to drill into
- `occurredAt` timestamptz notNull default now()
- `readByOwnerAt` timestamptz nullable

Indices: `(owner_id, occurred_at desc)`, `(owner_id, read_by_owner_at)` for unread counts.

## Query wiring

### `src/features/owner-portal/get-villa.ts`

Current state: header is live, photos + maintenance log are stubbed.

Wire:
- **photos** — read from new `villa_photos` filtered by `villa_id = villa.id AND visible_to_owner = true`. Order by `kind` priority (hero first), then `position`. Cap 24 (the gallery only shows ~16-20 max).
- **maintenanceLog** — read from existing `maintenanceTickets` filtered by `villa_id`, `closed_at IS NOT NULL`, `closed_at >= now() - interval '12 months'`. Cap 12. Map to `{id, kind, title, closedAt, costShareIdr}`. Cost-share comes from the ticket's `passthrough_amount` field (verify name in `maintenance-intelligence.ts`).

Keep the return shape unchanged — only the photos + maintenanceLog properties get populated instead of returning empty arrays.

### `src/features/owner-portal/get-calendar.ts`

Current state: villa picker live, events + pipeline empty.

Wire:
- **events** (booked nights, owner stays, requests) — for `(villaId, monthStart, monthEnd)`:
  - `bookings` rows where `villa_id = villaId AND (check_in, check_out)` overlaps the window AND `status IN ('confirmed', 'checked_in', 'checked_out')` → map to `{id, kind: 'guest', label: '<guest first name>', checkIn, checkOut, source}`
  - `owner_stays` rows where `villa_id = villaId AND (check_in, check_out)` overlaps the window AND `status IN ('requested', 'confirmed')` → map to `{id, kind: 'personal' | 'personal_request', label: 'Your stay', checkIn, checkOut}`
- **pipeline** — upcoming events for the next 30 days from the same two sources, ordered by `check_in asc`, cap 8.

Both filtered through ownership scope (owner must own the villa).

### `src/features/owner-portal/get-home.ts`

Current state: KPIs + statements + villas live, `upcoming` + `recentActivity` stubbed.

Wire:
- **upcoming** — same union query as `get-calendar.ts` pipeline, scoped to ALL villas the owner owns, next 14 days, cap 6.
- **recentActivity** — read from new `owner_activity_log` filtered by `owner_id = currentOwner.id`, ordered by `occurred_at desc`, cap 8. Map directly to the existing UI shape.

## Seed (append to `drizzle/seed/phase-2-owner.sql`)

Add a `seedPhase2OwnerL2()` section (or append rows to the existing function, wrapped in idempotent guards):

- `villa_photos`: 6 per active demo villa × 3 villas = 18 rows (1 hero, 4 gallery, 1 aerial each)
- `owner_stays`: 3 confirmed (past), 2 confirmed (future), 1 requested (pending Mgmt confirmation), 1 declined — across 4 owners
- `owner_activity_log`: 24 rows across 14 owners (mix of all 10 kinds, dates spanning last 30 days)

All upserted on deterministic keys.

## Validation

```
pnpm db:generate phase-2-owner-l2     # or hand-write 0115_phase_2_owner_l2.sql
pnpm db:migrate
pnpm db:seed                           # needs base-seed hotfix first
pnpm typecheck && pnpm lint
pnpm smoke:routes
```

Manual:
- Open Owner Portal Home (any seeded owner) → "Recent activity" section shows entries from seed
- Open Owner Portal Villa detail → photo gallery renders, maintenance log shows last year's closed tickets
- Open Owner Portal Calendar → guest stays sage-tinted, personal stays accent-tinted, pending requests dashed

## Commit message

```
feat(phase-2-data-l2/owner): wire villa, calendar, home off mocks

Lands villa_photos, owner_stays, owner_activity_log + extends seed.
Wires get-villa.ts (photos + maintenance log), get-calendar.ts (events + pipeline),
get-home.ts (upcoming + recentActivity) off the stub returns from PR 3.

Owner Portal Home, Villa, Calendar now render real data end-to-end.

Refs: phase-2-data-wiring, packet-c
```
