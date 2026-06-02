# Phase 2 data-wiring — Claude Code handoff

**Status:** REPLACES the earlier `cleanup-a/` batch (which assumed tables that don't exist in `main`).

This batch implements the gap identified in:
- `docs/audits/2026-05-27-phase-2-data-wiring-scope.md` (source of truth — 463-table existence sweep, 15.5-day estimate)
- `docs/audits/2026-05-28-cleanup-a-handoff-scope-correction.md` (correction note)

## What's actually in the gap

Per the prior audit, the deferred work from Phases 2.2 + 2.3 (and the data-bedrock for 2.4) is:

- **20 net-new tables**
- **2 ALTERs** (`statements`, `documents`)
- **17 agent cron registrations** (agent code already exists; no triggers)
- **Seed file** `db/seed/phase-2-data.ts` for realistic fixtures

Cabinet UIs already render. Routes consume the older feature layer (`services.ts`, `readiness-services.ts`, `owner-portal-queries.ts`) — some live, some mocking the bits the schema doesn't yet cover. This batch lands the missing data primitives so the routes can be migrated off mocks.

## Sliced into 3 PRs (FK-dependency order)

| # | PR | Tables | Other | File count |
|---|---|---|---|---|
| 1 | `phase-2-data-wiring(mgmt)`   | 4 new | + statements ALTER, 4 agent crons, mgmt seed | ~10-12 |
| 2 | `phase-2-data-wiring(dev)`    | 12 new + 1 view | + 11 agent crons, dev seed | ~14-16 |
| 3 | `phase-2-data-wiring(owner)`  | 4 new | + documents ALTER, 6 owner-portal-queries wired, 1 agent cron, bundle PDF stitcher, owner seed | ~12-14 |

Run in order. PR 2 depends on PR 1's owner_insights pattern; PR 3 depends on PR 1's statements ALTER. The audit recommends serial review, but each PR's code is independent.

## What's NOT in this batch

- **Route refactor** (Packet B) — switching cabinet routes from `services.ts` to forward-looking `queries.ts` surfaces. That's a follow-up after these tables exist. The 6 dead `queries.ts` stubs that were the centerpiece of the cancelled cleanup-A batch stay untouched here — they become wiring targets in Packet B.
- **Bookings / channels / pricing schema gaps** — already wired or non-issues. The prior audit explicitly lists `bookings`, `villas`, `direct-booking*` as live. Channel-manager (incl. `channel_connections`, `channel_reservations`, `channel_sync_log`) already exists in `src/lib/db/schema/channel-manager.ts`.
- **Schema for things that already exist under a different name** — `projects`, `boq_items` (the audit calls out the rename), `cashflow_forecasts` (re-uses existing `monthly_projections JSONB` shape), `audit_events` (re-used as-is).

## How to ship

1. Copy `prompts/` into the repo's `.claude/prompts/phase-2-data-wiring/`.
2. Read `00-context.md` first.
3. Run `01-mgmt.md`, then `02-dev.md`, then `03-owner.md`.
4. Each PR validates with `db:migrate` + `db:seed` + `typecheck` + `smoke:routes`.

## Reference

- `docs/audits/2026-05-27-phase-2-data-wiring-scope.md` — read this first; it's the design doc
- `docs/audits/2026-05-28-cleanup-a-handoff-scope-correction.md` — why the cleanup-a batch was wrong
- `src/lib/db/schema/audit.ts` — exemplar pattern for a small append-only table
- `src/lib/db/schema/bookings.ts` — exemplar pattern for a multi-FK table with status enum
- `src/lib/db/schema/finance.ts` — exemplar for the statements ALTER target
- `src/features/jobs/definitions.ts` + `src/features/jobs/actions.ts` — pattern for cron registration
- `src/features/ai-agents/registry.ts` — registry pattern (currently only 2 agents registered)
