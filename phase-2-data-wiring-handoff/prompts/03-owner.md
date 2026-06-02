# phase-2-data-wiring · PR 3 — Owner slice

**Source of truth:** `docs/audits/2026-05-27-phase-2-data-wiring-scope.md` §§ "Owner Portal (4)", "ALTERs", "Data functions".

## What this PR lands

- 4 net-new tables
- 1 ALTER (`documents`)
- 6 owner-portal-queries fns wired off mocks onto real reads
- 1 agent cron (`owner-concierge`)
- Bundle PDF stitcher hooked into `src/lib/pdf/`
- Owner section of `db/seed/phase-2-data.ts`
- Backfill of the FK constraint deferred from PR 1 (`ownerStatements.dispute_thread_id` → `owner_threads.id`)

Unblocks: every owner-portal queries fn that's currently returning empty arrays or mocks. After this PR, the Owner Portal renders real data end-to-end.

## Tables

### 1. `owner_threads` → `src/lib/db/schema/owner-threads.ts`

One thread per conversation between owner and Mgmt / concierge agent. Per-owner inbox surfaces these.

- `id` uuid PK
- `ownerId` uuid FK → `owners.id` (`cascade`)
- `subject` text notNull
- `kind` text notNull default `'general'` — enum: `general | dispute | personal_stay_request | maintenance_question | tax_question | onboarding | offboarding | other`
- `relatedEntityType` text nullable — e.g. `statement`, `booking`, `maintenance_ticket`
- `relatedEntityId` uuid nullable — soft reference
- `lastMessageAt` timestamptz notNull default now()
- `unreadCount` integer notNull default 0 — denormalized; the owner-message-insert trigger / write path increments
- `status` text notNull default `'open'` — enum: `open | resolved | escalated | archived`
- `createdAt`, `updatedAt`

Indices: `(owner_id, last_message_at desc)`, `(status, last_message_at)`.

### 2. `owner_messages` → same file

- `id` uuid PK
- `threadId` uuid FK → `owner_threads.id` (`cascade`)
- `actorKind` text notNull — enum: `owner | mgmt_staff | concierge_agent | system`
- `actorId` uuid nullable — `appUsers.id` for owner/staff, agent code for agent, null for system
- `body` text notNull
- `inlineActions` jsonb nullable — structured actions the agent surfaces ("book chef", "approve comp")
- `attachments` jsonb nullable — array of file refs (PDFs, etc.)
- `sentAt` timestamptz notNull default now()
- `readByOwnerAt` timestamptz nullable

Indices: `(thread_id, sent_at)`, `(actor_kind, sent_at)`.

### 3. `owner_notification_prefs` → `src/lib/db/schema/owner-notification-prefs.ts`

One row per owner. Drives the Owner Portal settings page toggles.

- `id` uuid PK
- `ownerId` uuid FK → `owners.id` (`cascade`) **unique** — one row per owner
- `statementReady` boolean notNull default `true`
- `maintenanceUpdates` boolean notNull default `true`
- `qReviewReminder` boolean notNull default `true`
- `arrivalAlerts` boolean notNull default `false` — opt-in (per audit)
- `marketingUpdates` boolean notNull default `false`
- `taxDocReady` boolean notNull default `true`
- `createdAt`, `updatedAt`

No additional indices needed beyond the unique on `owner_id`.

### 4. `owner_concierge_agent_runs` — **NOTE:** the audit doesn't list this as a separate table because runs are likely tracked in `agentRuns` (verify in `agents.ts`). If `agentRuns` exists and supports per-thread context, register `owner-concierge` to write into it. If not, surface this as a follow-up scope and DON'T invent a new agent-run table — the prior audit explicitly stays away from that.

## ALTER

### `documents`

Per audit: add owner-portal visibility & metadata.

- `ownerId` uuid FK → `owners.id` (`set null`) nullable
- `kind` — extend the existing enum. Audit calls for these additions (verify current enum values in `documents.ts` first): `contract | amendment | statement | tax_certificate | tax_assessment | vendor_receipt | photo | maintenance_report | letter | other`
- `signedAt` timestamptz nullable
- `signedHash` text nullable — content hash at sign time
- `expiresAt` timestamptz nullable
- `visibleToOwner` boolean notNull default `true`

Indices: `(owner_id, kind, created_at desc)` for the Documents cabinet group queries.

## Deferred from PR 1

The `ownerStatements.dispute_thread_id` column was added in PR 1 as nullable without an FK. Add the FK constraint now that `owner_threads` exists:

```sql
ALTER TABLE owner_statements
  ADD CONSTRAINT owner_statements_dispute_thread_id_fkey
  FOREIGN KEY (dispute_thread_id) REFERENCES owner_threads(id) ON DELETE SET NULL;
```

Drop the TODO comment in `finance.ts` (or wherever the column was declared).

## Owner-portal-queries wiring (6 fns)

Per audit, these fns exist on disk and partially work:

| File | Current | Wire to |
|---|---|---|
| `get-home.ts` | KPIs + statements + villas live; `upcoming` + `recentActivity` mocked | Join `bookings` (for upcoming) + new `owner_activity_log` reads (mirror existing pattern; if no log table, surface as scope gap) |
| `get-villa.ts` | header live | Join `villa_photos` + `maintenance_tickets` (verify table names — likely existing) |
| `get-calendar.ts` | villa picker + empty events | Join `bookings` + `owner_stays` for the month window |
| `get-inbox.ts` / `get-thread.ts` | empty arrays | Read from new `owner_threads` + `owner_messages` |
| `get-documents.ts` | 4-group skeleton | Read from `documents` filtered by `owner_id = currentOwner.id AND visible_to_owner = true`, grouped by `kind` |
| `get-settings.ts` | defaults | Read `owners` + `owner_notification_prefs` |

For each wired fn:
- Drop the mock data inside the fn
- Add the real query
- Keep the same return shape (the route components expect it)
- Handle empty DB by returning empty arrays / null, never throw

`generate-bundle.ts` needs the PDF stitcher. The audit calls for hooking into `src/lib/pdf/` (existing). If `src/lib/pdf/` exposes a `stitchPdfs(urls: string[]): Promise<Buffer>` or similar — use it. If not, surface as scope gap.

## Agent registration

| code | trigger |
|---|---|
| `owner-concierge` | on `owner_messages` insert where `actor_kind='owner'` |

Implement as a DB trigger or a post-insert hook in the action that writes the message. The audit doesn't mandate DB-level trigger — code-level is fine.

## Seed (owner section of `db/seed/phase-2-data.ts`)

- 14 owners (overlap with mgmt-seed's owners — verify on key)
- 1 `owner_notification_prefs` per owner (default values, 4 with custom overrides)
- 5 `owner_threads` (2 open, 1 escalated, 2 archived)
- 32 `owner_messages` across the threads (mix of owner / mgmt_staff / concierge_agent voices)
- 18 documents tagged with `owner_id` + `visible_to_owner` (4 contracts, 8 statements, 3 tax, 3 maintenance reports)

Idempotent.

## Validation

```
pnpm db:generate phase-2-owner
pnpm db:migrate
pnpm db:seed
pnpm typecheck && pnpm lint
pnpm smoke:routes
```

Manual: open Owner Portal home (any seeded owner's auth), confirm:
- `/owner/inbox` shows threads from seed
- `/owner/documents` groups by kind, ZIP bundle download works end-to-end
- `/owner/settings/notifications` reflects pref toggles
- `/owner/statements/<id>` shows acknowledge / dispute CTAs and acknowledging writes `owner_acked_at` + transitions `owner_state`

## Commit message

```
feat(phase-2-data-wiring/owner): land 4 tables, documents ALTER, wire 6 owner-portal-queries

Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Owner Portal.
Owner Portal now renders real data end-to-end. Closes Phase 2.3 mock gap.

owner_threads, owner_messages, owner_notification_prefs.
documents: +owner_id, +visible_to_owner, +signed_at/hash, +expires_at, kind enum extended.
Wires get-home/villa/calendar/inbox/thread/documents/settings off mocks.
Registers owner-concierge agent. Hooks generate-bundle into src/lib/pdf/.
Adds owner section of db/seed/phase-2-data.ts.
Backfills ownerStatements.dispute_thread_id FK (deferred from PR 1).

Refs: phase-2-data-wiring
```
