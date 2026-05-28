# Cleanup-A handoff — scope correction

**Date:** 2026-05-28
**Input:** `cleanup-a-handoff/prompts/{00..06}-*.md`
**Status:** NOT EXECUTED. The prompts target a schema that does not match `main`. This document maps each prompt's assumptions to the actual repo and proposes the corrective path.

## TL;DR

The handoff's seed says:

> All required Drizzle migrations are already in main (last is `0111`). All write paths (`actions.ts`, `services.ts`) are already wired to real Drizzle. Six `queries.ts` modules return empty arrays / null. That's the actual gap. No new tables. No schema PR needed. Six small read-path PRs, ~50-200 lines each.

Reading the repo at HEAD shows this is **wrong on three counts**:

1. **Most of the tables the prompts reference don't exist.** The 6 PRs name ~25 tables; only **8** actually exist in `src/lib/db/schema/`.
2. **The shared helpers the prompts call (`withOrgScope`, `getOrgClock`) don't exist.** `src/lib/db/scope.ts` is not in the tree.
3. **The 6 stub modules are not imported anywhere.** Cabinet routes consume a different feature layer (`services.ts` / `readiness-services.ts`). The stubs are dead reads pending a future refactor — wiring them today writes code nothing calls.

Wiring against tables that don't exist would produce code that fails to compile (or compiles and never runs). The honest deliverable is this correction document plus a fresh proposal sized to the real gap.

## Per-PR gap analysis

The repo has **494 pgTables** across `src/lib/db/schema/`. The list below shows which referenced tables actually exist vs. which similarly-named tables would be the real target.

### PR 1 — Channels (`src/features/channels/queries.ts`)

Prompt expects: `channels`, `channel_listings`, `rate_cells`, `sync_events`, `direct_bookings`, `channel_connections`, `channel_reservations`.

| Prompt table | Status | Real table to use |
|---|---|---|
| `channel_connections` | ✓ exists | `channel_connections` |
| `channel_reservations` | ✓ exists | `channel_reservations` |
| `sync_events` | ✗ missing | `channel_sync_log` (close shape) |
| `rate_cells` | ✗ missing | `rates_push` + `rate_plans` + `rate_plan_overrides` + `rate_plan_seasons` (different model — per-plan, not per-cell) |
| `direct_bookings` | ✗ missing | `bookings` filtered by `channel.type='direct'` |

Real shape implication: the grid is not (villa × channel × date) with cells, it's rate-plan-anchored. The `getChannelGridData` contract cannot be returned as-spec from real tables; cells would need to be synthesized from rate plans + overrides + actual bookings. That's a different feature, not a "wire the stub" job.

`src/features/channels/services.ts` (42 lines) already exists and lists `bookingChannels` (a separate, simpler config table) — that's what the live route actually consumes today.

### PR 2 — Front office (`src/features/front-office/queries.ts`)

Prompt expects: `checkin_checkout_requests`, `guest_id_records`, `housekeeping_turnovers`, `tax_exports`.

| Prompt table | Status | Real target |
|---|---|---|
| `checkin_checkout_requests` | ✓ exists | use as-is |
| `guest_id_records` | ✗ missing | guest ID fields likely on `guests` table; no separate registry table |
| `housekeeping_turnovers` | ✗ missing | use `operationTasks` filtered by kind, per existing `front-office/services.ts` |
| `tax_exports` | ✗ missing | `tax_period_reports` (closest equivalent) |

`src/features/front-office/services.ts` (435 lines) + `readiness-services.ts` (283 lines) already wire `bookings`, `guests`, `villas`, `villaReadinessStates`, `operationTasks`, `serviceRequests`. The route consumes those — not the stub. Wiring the stub adds dead code.

### PR 3 — Concierge (`src/features/concierge/queries.ts`)

Prompt expects: `guest_requests`, `concierge_threads`, `concierge_messages`, `guest_journey_moments`, `comp_offerings`, `guest_request_reads`.

| Prompt table | Status | Real target |
|---|---|---|
| `concierge_threads` | ✗ missing | `guest_ai_handoffs` (closest — different model) |
| `concierge_messages` | ✗ missing | `guest_ai_handoff_replies` + `guest_ai_concierge_messages` |
| `guest_requests` | ✗ missing | `guest_service_orders` + `guest_service_order_events` (different domain shape) |
| `guest_journey_moments` | ✗ missing | `guest_journey_events` (different shape — event log, not curated moments) |
| `comp_offerings` | ✗ missing | nothing equivalent |
| `guest_request_reads` | ✗ missing | nothing equivalent |

**Wiring not feasible against current schema.** The cabinet's data model (threads, curated journey moments, comp offerings) was never landed.

### PR 4 — Site reports (`src/features/site-reports/queries.ts`)

Prompt expects: `site_frames`, `incidents`, `weekly_reports`, `voice_notes`, `site_day_summaries`.

| Prompt table | Status | Real target |
|---|---|---|
| `voice_notes` | ✓ exists | use as-is |
| `site_frames` | ✗ missing | `site_reports` + `site_report_photos` (different model — report-anchored, not frame-anchored) |
| `incidents` | ✗ missing | nothing direct |
| `weekly_reports` | ✗ missing | nothing direct |
| `site_day_summaries` | ✗ missing | nothing direct |

**Partial wiring possible** against `site_reports` + `site_report_photos`, but the storyboard model differs enough that the existing `StoryboardDay` shape would need to be reshaped per source row.

### PR 5 — Sales (`src/features/sales/queries.ts`)

Prompt expects: `buyer_leads`, `stage_events`, `offers`, `units`.

| Prompt table | Status | Real target |
|---|---|---|
| `buyers` | ✓ exists | use as-is |
| `buyer_leads` | ✗ missing | nothing direct (use `buyers` + `buyer_progress_reports`) |
| `stage_events` | ✗ missing | nothing direct |
| `offers` | ✗ missing | nothing direct |
| `units` | ✗ missing | `unit_types` + `unit_price_snapshots` + `unit_discounts` + `unit_development_meta` (component-level, not row-level) |

**Wiring not feasible.** No pipeline + stage-events tables on `main`.

### PR 6 — Investors (`src/features/investors/queries.ts`)

Prompt expects: `funds`, `lps`, `lp_positions`, `capital_calls`, `capital_call_allocations`, `distributions`, `distribution_allocations`, `waterfall_params`, `waterfall_runs`.

| Prompt table | Status | Real target |
|---|---|---|
| `distributions` | ✓ exists | use as-is |
| `distribution_allocations` | ✓ exists | use as-is |
| `funds` | ✗ missing | nothing direct |
| `lps` / `lp_positions` | ✗ missing | nothing direct (closest: `capital_commitments` + `capital_drawdowns`) |
| `capital_calls` / `capital_call_allocations` | ✗ missing | `capital_drawdowns` (different shape) |
| `waterfall_params` / `waterfall_runs` | ✗ missing | `waterfall_rules` (rules engine, not param store) |

**Partial wiring possible** for `getLastDistribution` only. Everything else needs the fund/LP/position tables that were never landed.

## Helpers the handoff names that don't exist

- `src/lib/db/scope.ts` — does not exist. Hand-rolling `eq(table.organizationId, …)` is the current pattern across `services.ts` files.
- `withOrgScope(getDb(), orgId)` — does not exist.
- `getOrgClock(orgId).today()` — does not exist. Existing code uses `new Date()`.

`getCurrentAppUser()` (re-exported from `@/features/auth/current-user`) **does** exist and is the right helper for the staff-user fields the prompts mention.

## Why the existing stubs are dead code

| File | Lines | Imported by |
|---|---|---|
| `src/features/channels/queries.ts` | 68 | nothing |
| `src/features/front-office/queries.ts` | 69 | nothing |
| `src/features/concierge/queries.ts` | 55 | nothing |
| `src/features/site-reports/queries.ts` | 46 | nothing |
| `src/features/sales/queries.ts` | 40 | nothing |
| `src/features/investors/queries.ts` | 56 | nothing |

Cabinet routes already render against the older feature layer:
- `/dashboard/channels` uses `bookingChannels` via `src/features/channels/services.ts`
- `/dashboard/front-office` uses `bookings` + `villaReadinessStates` via `src/features/front-office/services.ts` + `readiness-services.ts`
- Other cabinets use their existing `services.ts` files where present, or mock data from the cabinet HTML drafts

The 6 stubs were created in Phase 2.4 as forward-looking surfaces for a route refactor that hasn't happened. Wiring them now means writing code that nothing calls, against tables that don't exist.

## Proposed corrective path

This batch should be paused and replaced with two follow-up packets:

### Packet A — schema delivery

Before the cleanup-A reads can be wired, the Phase 2.2-2.4 tables that were always going to ship in a "data PR" need to actually land. Per the earlier `2026-05-27-phase-2-data-wiring-scope.md`:

- 20 net-new tables (concierge_threads/messages, guest_requests, site_frames/incidents/weekly_reports, buyer_leads/stage_events/offers/units, funds/lps/lp_positions/capital_calls/+allocations, waterfall_params/runs)
- 2 ALTERs (statements owner_state, documents owner_id + kind)
- Already-exists confirmation for 3 (audit_log, distributions, distribution_allocations)

Split as recommended in that audit: mgmt → dev → owner, FK-dependency order, ~10-15 files each.

### Packet B — route refactor

Once Packet A's tables exist, refactor the cabinet routes to consume the `queries.ts` surfaces instead of the older `services.ts` layer. THAT is when wiring the stubs is meaningful — until then the stubs are unreferenced.

Cleanup-A as-handed-off skips Packet A and assumes Packet B's routes already exist. Both assumptions are wrong against the current `main`.

## Decision

This audit document is the deliverable for this turn. The 6 stub `queries.ts` files are left untouched — they correctly return empty / null, and the cabinet routes don't depend on them. No code is fake-wired against tables that don't exist.

If the user wants to proceed differently — for example, attempt partial wiring of the 2-3 PRs that have the most real schema overlap (channels + front-office + the small subset of investors that has `distributions`) — that's a separate, scoped task. The scope correction below is the precondition.

## Schema reality check (for the record)

Existence sweep over `src/lib/db/schema/`:

```
Of 33 tables referenced across the 6 prompts:
  ✓ exists      8   (channel_connections, channel_reservations, channel_sync_log,
                     checkin_checkout_requests, voice_notes, distributions,
                     distribution_allocations, plus base bookings/guests/villas)
  ✗ missing    25   (rate_cells, sync_events, guest_id_records, housekeeping_turnovers,
                     tax_exports, guest_requests, concierge_threads/messages,
                     guest_journey_moments, comp_offerings, site_frames, incidents,
                     weekly_reports, site_day_summaries, buyer_leads, stage_events,
                     offers, units, funds, lps, lp_positions, capital_calls,
                     capital_call_allocations, waterfall_params, waterfall_runs)
```

This matches the prior audit at `2026-05-27-phase-2-data-wiring-scope.md` — the gap is 15.5 senior-eng-days of schema work, not 6 stub-replacement PRs.
