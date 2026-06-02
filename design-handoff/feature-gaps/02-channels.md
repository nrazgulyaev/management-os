# Feature gap · 02 · Channels &amp; direct bookings (Mgmt P2)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built. Routes: `/dashboard/channels` (`page.tsx` 2.6kb + `new`/form 3.3kb — deliberately thin UI), `/dashboard/integrations` (+conflicts/automation), `/dashboard/bookings/sync`, `/dashboard/direct-bookings`. Deep logic in `channels/{state-machine, conflict-resolver, services, queries, actions, schema}`. **Discard "not built" findings.** The one finding worth keeping is a real **schema check, not a UI gap**: verify whether cell-state storage (`rate_cells` per the 00-rollup §A) actually exists in `drizzle/` or is still net-new — the conflict-resolver implies a storage layer.

**Design sources**
- Desktop: `cabinets/mgmt-p2/channels.html` — 9 sections (hero overview, 3 layout variants, direct-bookings list, detail, conflict modal, connect-channel wizard, mobile, state machine spec, schema/agents/routes)
- Mobile: `mobile-pass-2.4-cabinets.html` § cabinet 01 — single-villa view + sticky conflict banner
- Phase: 2.4 mgmt-01 · commit `d8e2ed8`

**Repo paths (state as of feature-gap audit window)**
- Data layer: `_repo/src/features/channels/{actions,conflict-resolver,queries,schema,services,state-machine}.ts` — 6 files, ~340 lines total
- Agents: `_repo/src/features/ai-agents/channels/{channel-listing-matcher,conflict-investigator}.ts` — both declared, both stubbed
- Schema: `booking_channels` (mig 0000 + status check tighten 0001), `channel_calendar_feeds` (0007), `channel_connections` + `channel_sync_log` (0076), `channel_reservations` (0077), full direct-booking stack `direct_booking_holds/requests/deposits/finance_links/guest_notifications/status_snapshots/message_threads/messages` (migs 0027–0031)
- **Not imported into this project:** `src/components/channels/*` (incl. `channel-grid.tsx` referenced by `queries.ts` type imports), `src/app/(dashboard)/dashboard/channels/*`, `src/app/(dashboard)/dashboard/bookings/direct/*`. Status below is inferred from data-layer signatures + design.

## TL;DR

Channels is **two cabinets in one** — a rate-sync console (sec 01–02, 05, 08) and a direct-bookings sub-cabinet (sec 03–04). The split shows in the code: direct-bookings has 5 migrations + 8 tables + status-center workflow tables fully shipped, while the rate-sync console has **two solid domain modules** (`state-machine.ts` — 6 states, `conflict-resolver.ts` — 3-way audit + side-effect), agent stubs, and `channel_connections + channel_sync_log` infrastructure — but **no `rate_cells` table** for the cell-by-cell state the ChannelGrid depends on. `queries.ts.getChannelGridData()` returns empty arrays today; without a rate-cells table it can't return real data even if wired. The Connect-channel wizard (sec 06) is the most fully-codified flow on the rate side: `channel_connections` schema explicitly models OAuth/API-key envelopes, sync state per direction, listing-match status. The 3 layout variants (sec 02) are pick-one-before-shipping design choices that haven't been narrowed in code. Mobile single-villa pattern has no scaffold yet.

---

## Section-by-section

### 01 · Hero · "Channels overview — production view"

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| 14-day ChannelGrid (villa × channel × date) | ✅ designed | `queries.ts.getChannelGridData()` returns `{villas:[], channels:[], cells:{}, …}` — no data source | 🟡 type-shaped, empty | 🔥 P0 |
| Per-cell sync-state badges (pending/synced/stale/conflict/blocked/booked) | designed | `state-machine.ts.transition()` — 6 states, full FSM ✅ | ✅ logic shipped, no UI/data | ⭐ P1 |
| Top KPI strip (open conflicts, last sync, % synced, channel mix) | designed | not surfaced | 🔴 designed only | ⭐ P1 |
| Activity rail (recent sync events feed) | designed | `channel_sync_log` table exists ✅ but `queries.ts.recentEvents` returns `[]` | 🟡 data exists, no read | ⭐ P1 |
| Direct funnel sidebar (request → hold → quote → booking) | designed | direct-booking pipeline shipped (5 migrations); `queries.ts.directFunnel` returns `[]` | 🟡 data exists, no aggregation fn | ⭐ P1 |
| Inline rate-cell edit | designed | `queries.ts.pushRate()` returns `{ok:true, syncState:"pending"}` — no-op | 🟡 stub | 🔥 P0 |
| Bulk-edit toolbar on range-select | designed | nothing | 🔴 designed only | 💭 P2 |
| `rate_cells` table | implied (the grid's storage) | **no such table in schema** | 🔴 missing | 🔥 P0 |

### 02 · Three layout variants

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| **Variant A**: Villa-rows × date-columns × channel-stripes (default) | designed | implied default — no `channel-grid.tsx` component imported | 🔴 design only | 💭 P2 (gate on pick) |
| **Variant B**: Channel-rows × date-columns | designed | not in repo | 🔴 design only | 💭 P2 |
| **Variant C**: Channel-cards with per-villa drill-in | designed | not in repo | 🔴 design only | 💭 P2 |

**Recommendation:** lock variant before Claude-Code-handoff. Design copy says "pick one before PR 1; other two stay as discarded options in `notes/`." That decision hasn't been made yet — and it gates the shape of `getChannelGridData()`'s row/col axes.

### 03 · Direct bookings · list

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| List at `/dashboard/bookings/direct` (re-uses Phase 2.1 `<ListPage>`) | designed | `direct_booking_requests` + `direct_booking_holds` tables shipped ✅, no route imported | 🟡 data exists, route not in proj | ⭐ P1 |
| Status badges (new / under_review / quoted / hold / deposit_pending / converted / expired / cancelled) | designed | `direct_booking_holds.status` check `('active','converted','expired','cancelled','rejected')` + `direct_booking_requests` separate status | 🟡 schema shipped, badge mapping not coded | ⭐ P1 |
| Filter chips (status + villa + date window) | designed | `<FilterBar>` primitive from Phase 2.1 ✅ — wiring not in proj | 🟡 primitive ready | ⭐ P1 |
| Cross-link to source channel (Airbnb / Booking / direct) | designed | `booking_channels` table joins, `bookings.channel_id` FK exists ✅ | ✅ schema | — |

### 04 · Direct booking · detail

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Detail at `/dashboard/bookings/direct/[code]` (Phase 2.1 `<DetailPage>` bricks) | designed | not in proj | 🟡 primitive ready | ⭐ P1 |
| Hold timeline (request → quote → hold → deposit → convert) | designed | `direct_booking_request_events` append-only timeline shipped ✅ (mig 0027) | ✅ schema | — |
| Guest message thread inline | designed | `direct_booking_guest_message_threads` + `_messages` shipped ✅ (mig 0031) | ✅ schema | — |
| Notifications log | designed | `direct_booking_guest_notifications` shipped ✅ (mig 0031) | ✅ schema | — |
| Public guest-status snapshots | designed | `direct_booking_guest_status_snapshots` shipped ✅ (mig 0031) | ✅ schema | — |
| Finance link panel (deposit / payout / payment ledger) | designed | `direct_booking_finance_links` shipped ✅ (mig 0029) | ✅ schema | — |
| Convert-to-booking action | designed | not surfaced in `actions.ts` (which only handles channel CRUD) | 🔴 action stub | 🔥 P0 |

**Note:** the direct-booking domain is the **most fully migrated workflow in the entire Mgmt-OS repo** — 5 dedicated migrations, 8+ tables, full guest-side message/notification/status stack. The cabinet sits on top of solid foundations; the gap is action wiring + route surfacing, not schema.

### 05 · Sync conflict modal

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| 3-way conflict resolution (accept-channel / force-ours / flag-and-pause) | designed | `conflict-resolver.ts.resolveConflict()` — pure fn, full audit + side-effect output ✅ | ✅ shipped | — |
| Recent drift histogram inline ("why?") | designed | `conflict-investigator.ts.ConflictInvestigatorOutput.recentDriftSamples` typed but agent returns `[]` | 🟠 stub | ⭐ P1 |
| AI recommendation with rationale + confidence | designed | `conflict-investigator.ts` — agent stub, returns `confidence:0` | 🟠 stub | ⭐ P1 |
| Conflict audit-log row | designed | `ConflictAuditPayload` typed, no DB write surfaced | 🟡 typed, not wired | 🔥 P0 |
| Side-effect: retry-push / open-ticket | designed | `ConflictFollowup` typed, no enqueue surfaced | 🟡 typed, not wired | 🔥 P0 |
| Flag-and-pause writes `channel_sync_log` entry | designed | `channel_sync_log` table shipped ✅; no helper | 🟡 schema ready, fn missing | ⭐ P1 |

**Note:** `conflict-resolver.ts` is the strongest domain module in the cabinet — full unit-testable pure-function shape with audit + followup envelope. The gap is purely call-site: nothing invokes it because there's no `rate_cells.conflict` row to invoke it from.

### 06 · Connect channel wizard

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| 3-step wizard (pick channel → auth → map listings) | designed | `channel_connections` table shipped with OAuth envelope columns ✅ (mig 0076), no UI in proj | 🟡 schema + auth slots ready | ⭐ P1 |
| Step 2: OAuth + API-key paths | designed | `channel_connections` has encrypted-credentials column + `STAY_LINK_KMS_SECRET` envelope (per mig 0076 comment) | ✅ schema | — |
| Step 3: listing-to-villa match (matched / ambiguous / unmatched) | designed | `channel-listing-matcher.ts` agent declared with 3-bucket output + 0.85/0.55 thresholds; returns empty | 🟠 stub | ⭐ P1 |
| Manual override of ambiguous matches | designed | nothing — no `channel_listing_overrides` table or write fn | 🔴 designed only | ⭐ P1 |
| Sync direction toggles (inventory · rates · amenities · reservations · webhooks) | implied (mig 0076 enumerates `sync_type`) | schema enumerates all 5 sync types ✅ | ✅ schema | — |
| Connection-status display (active / paused / disconnected / error) | implied | `channel_connections.status` + per-direction `last_*_sync_at + status` columns ✅ | ✅ schema | — |

### 07 · Mobile · single-villa view

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Single-villa scroll + 3-day window | designed | no mobile-specific component | 🔴 design only | ⭐ P1 |
| Villa switcher in topbar | designed | nothing | 🔴 design only | ⭐ P1 |
| Sticky conflict banner | designed | nothing | 🔴 design only | ⭐ P1 |
| Bottom-sheet rate-edit | designed | nothing | 🔴 design only | ⭐ P1 |
| Bulk-edit NOT supported on mobile | design constraint | — | ✅ honoured by absence | — |

### 08 · States &amp; events spec

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| 6-state cell FSM (pending → synced → stale → conflict → blocked → booked) | designed | `state-machine.ts.transition()` — pure fn, 6 states, all 7 event kinds ✅ | ✅ shipped | — |
| `STALE_AFTER_MS` = 4h | designed | exported constant ✅ | ✅ shipped | — |
| Role-based action menus (ops / director / viewer) | designed | `getNextActions(state, role)` ✅ | ✅ shipped | — |
| Direct-booking lifecycle FSM | designed | `direct_booking_holds.status` enum exists, no transition table coded | 🟡 enum ready, FSM gap | ⭐ P1 |

### 09 · Schema · agents · routes

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| `booking_channels` table | designed | shipped (mig 0000) ✅ | ✅ | — |
| `channel_connections` (per-org per-villa per-channel) | designed | shipped (mig 0076) ✅ | ✅ | — |
| `channel_sync_log` (audit per attempt) | designed | shipped (mig 0076), partitioned monthly via index strategy | ✅ | — |
| `channel_reservations` (pulled bookings) | designed | shipped (mig 0077) ✅ | ✅ | — |
| `rate_cells` (per cell-state storage) | designed (implied by grid) | **not in any migration** | 🔴 missing | 🔥 P0 |
| `channel_listing_matches` (matcher agent output) | implied | not in schema | 🔴 missing | ⭐ P1 |
| Channel CRUD (create / archive / unarchive) | designed | `actions.ts.createChannelAction / archiveChannelAction / unarchiveChannelAction` ✅ | ✅ shipped | — |
| Route at `/dashboard/channels` | designed | not in proj (no `app/` dir imported) | 🟡 unknown — likely missing | ⭐ P1 |
| Agent registration in registry | implied | `channel-listing-matcher` exports `cron: "0 3 * * *"`, `conflict-investigator` no cron declared | 🟡 declared, registration status unknown | ⭐ P1 |

---

## Cross-cutting

### Data wiring

| Concern | Status |
|---|---|
| `getChannelGridData()` returns real cells | 🔴 hard-blocked on missing `rate_cells` table |
| `recentEvents` reads from `channel_sync_log` | 🟡 schema exists, fn returns `[]` |
| `directFunnel` aggregates `direct_booking_requests/holds` | 🟡 schema exists, fn returns `[]` |
| `pushRate()` writes a row to (missing) `rate_cells` + enqueues sync job | 🔴 stub returns `pending` synthetically |
| `resolveCellConflict()` calls `conflict-resolver.resolveConflict()` and persists | 🟡 pure fn ready, persistence gap |
| Channel list reads from `booking_channels` | ✅ via `services.ts` w/ mock fallback |

### Agents

| Agent | Declared | Cron | Output schema | Real impl |
|---|---|---|---|---|
| `channel-listing-matcher` | ✅ | `0 3 * * *` nightly + on-connect | `matches[] · bucket-counts` | 🟠 returns empty |
| `conflict-investigator` | ✅ | not declared (event-driven?) | `recommendation · confidence · rationale · drift samples` | 🟠 returns `accept-channel · 0 conf` |

Both agents need: (1) registration in `_repo/src/features/ai-agents/registry.ts`, (2) real Anthropic call, (3) persistence table (`channel_listing_matches` for matcher, `channel_conflict_resolutions` for investigator-recommended/operator-confirmed).

### Mobile parity

Mobile pattern (single-villa scroll + sticky conflict banner) doesn't exist in code. None of the desktop components are responsive past Tailwind defaults. The mobile design's "bulk-edit NOT supported on mobile" rule is honoured-by-absence, not enforced — needs to stay an explicit decision when components ship.

### Layout-variant decision

Sec 02 surfaces three discarded-or-shipped layouts. The decision hasn't been made. **Until it is, sec 01's grid axis (rows = villas vs rows = channels) is ambiguous and `getChannelGridData()` can't be specified.** Recommend: lock Variant A (villa-rows × date-columns × channel-stripes) in the data-wiring PR; carry B/C as notes/options for Phase 2.6.

---

## Recommended additions (prioritized)

### 🔥 P0 — ship before claiming "channels console complete"

1. **Add `rate_cells` table** — the cell-state storage layer the entire ChannelGrid depends on. Columns: `id · organization_id · villa_id · channel_id · date · pushed_value · acked_value · sync_state · last_push_at · last_ack_at · conflict_at · blocked_at · booking_id (nullable)`. Unique constraint on `(villa_id, channel_id, date)`. Index on `(organization_id, sync_state)` for the dashboard's "open conflicts" query.
2. **Wire `pushRate()` → DB + enqueue sync job** — currently stubs `pending`. Should write to `rate_cells`, transition via `state-machine.ts`, then enqueue a per-channel push job.
3. **Wire `resolveCellConflict()`** — currently the pure fn exists but no one calls it. Should: (1) take cell-id + resolution, (2) call `resolveConflict()`, (3) write audit to `channel_sync_log`, (4) execute side-effect (retry-push enqueue OR open-ticket via `support_tickets`).
4. **Lock the layout variant** for sec 02 before any of the above ships, to avoid re-aligning grid axes.
5. **Convert-to-booking action** — `direct_booking_holds` schema is ready; needs an action that consumes the hold and inserts into `bookings` + writes a `direct_booking_finance_links` row.

### ⭐ P1 — ship in Phase 2.6

6. **Both agents to real impl** — `channel-listing-matcher` (nightly + on-connect) and `conflict-investigator` (event-driven on `conflict` state transition). Persist to `channel_listing_matches` (new) + `channel_conflict_resolutions` (new).
7. **Direct-booking sub-cabinet UI** — `/dashboard/bookings/direct` list + `/dashboard/bookings/direct/[code]` detail. Schema is ready, all 8 tables shipped — the gap is purely route + DetailPage brick wiring.
8. **`channel_sync_log` activity rail read** — `recentEvents` aggregation, paginate by `triggered_at DESC`.
9. **Connect-channel wizard UI** — 3 steps + manual-override for ambiguous matches.
10. **Mobile single-villa pattern** — 7 mobile primitives needed (villa switcher topbar, 3-day grid collapse, sticky conflict banner, bottom-sheet rate edit, etc.).
11. **Drift histogram inline** in conflict modal — needs the matcher's `recentDriftSamples[]` to be real.

### 💭 P2

12. **Bulk-edit toolbar** on range-select for the grid.
13. **Variants B + C** documented as alternates in `notes/`, not built.

---

## Things outside scope

- iCal feed import — `channel_calendar_feeds` table exists for one-way pull, no design surface in this cabinet.
- Per-channel commission engine — handled in finance cabinet, not here.
- Channel-specific quirks (Booking.com vs Airbnb token refresh cycles, rate-plan mapping) — design treats channels generically; these will surface when wiring real OAuth flows.

## Open questions for product

- **`rate_cells` retention** — how far back do we keep cell history? Design implies live-grid only; suggest 90d hot + monthly partitioned cold (matches `audit_log` cabinet 07 pattern).
- **Conflict-investigator trigger** — event-driven (on every `push-ack` that produces `conflict`) or batched (nightly)? Design copy is ambiguous. Suggest event-driven, so ops sees a recommendation in the modal first time they open it.
- **Listing-matcher confidence thresholds** — currently 0.85 / 0.55 hard-coded in agent stub. Make per-org tunable, or platform-wide constant? Suggest constant for v1.
- **Rate-cell vs availability-cell unification** — design treats "rate" cells as state-holders, but the same (villa, date) tuple has availability concerns from owner stays (mig 0012) and front-office readiness (mig 0011). Investigate whether `rate_cells` should join availability or stay separate.
