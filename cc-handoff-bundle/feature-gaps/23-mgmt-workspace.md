# Feature gap · 23 · Workspace Overview (Mgmt — new cabinet)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull from `nrazgulyaev/management-os@main`)
>
> **Written against the partial `_repo` import (no `src/app/**`, no `src/components/**`, no `src/features/dashboard/`). Key premises below are WRONG.** Verified against the live repo:
>
> | Original premise | Reality in `main` | Verdict |
> |---|---|---|
> | "Replaces the **empty Overview stub**" / "no `/dashboard` landing route found" | `/dashboard/page.tsx` (16.9kb) is a **fully built, live-wired Portfolio Overview** (`force-dynamic`). Nav registers it: `MGMT_DASHBOARD_NAV` → group `WORKSPACE` → `{ href: "/dashboard", label: "Overview" }`. The `mgmt-workspace.html` design is a **redesign proposal**, NOT filling a void. | ❌ overturned — reframe as redesign |
> | "`src/features/workspace/` — none" | Real fns live in `src/features/dashboard/dashboard-cabinet-queries.ts` (13.6kb) + `live-counts.ts`: `getPortfolioMetrics`, `getRevenueByChannel`, `getMonthlyRevenueStrip`, `getOwnersYtdPayouts`, `getPortfolioProjects`, `getTodaySchedule`, `getCurrentStatementNudge`, `getLiveDashboardCounts` | ❌ overturned |
> | **CSAT KPI has no backing** | CONFIRMED — and **already resolved the way I recommended**. Live KPI strip = Occupancy YTD / ADR / RevPAR / Gross MTD / Net-to-owners MTD. No CSAT anywhere. The design's CSAT tile is the divergence, not the code. | ✅ valid; resolution already shipped |
> | **Unified attention/triage feed missing** | CONFIRMED. The live Overview has **no triage queue** — it has scattered tiles (Today table, channel mix, 6-month gross, owners, portfolio table) + a single dashed statement-nudge band. The design's "Needs attention" feed is a **genuine value-add** not in the live page. (Note: a separate `maintenance-intelligence/risks` feed DOES exist, and `statement_reconciliation_warnings` is surfaced in finance — so the *sources* are even more built-out than I claimed; only the *cross-cabinet aggregator* is absent.) | ✅ **still the headline P0** |
> | "4 dead cabinet-map links: Villas / Inventory / Utilities / Settings" | All four have real routes (`/dashboard/villas`, `/dashboard/inventory`, `/dashboard/utilities`, `/dashboard/settings`). The cabinet map should **bind to `MGMT_DASHBOARD_NAV`** (14 groups, ~60 items) — authoritative, far richer than the design's 16-card subset. | ❌ overturned |
> | Live-agent panel (6 fictional agents) | Live page uses `<RecentDigestsTile basePath="/dashboard/digests">`, NOT an agent roster. There's a whole `/dashboard/digests` cabinet + `agent_digest_subscriptions`. The 6 design agent names remain fictional. | ✅ valid; real pattern = digests tile |
> | (new finding) | Live Overview **stubs** these as `—`: "Open maintenance", "Housekeeping", "Owner stay requests" (operational-health 4-up), and `getCurrentStatementNudge()` returns `null` pending the STATEMENT-1 sprint. These are **genuine wiring gaps.** | ✅ real gaps |
>
> **Net:** This is **not a new cabinet** — it's a redesign of an existing, live-wired Overview. The two real opportunities are **(1)** the cross-cabinet **attention/triage feed** (genuinely absent — the headline P0) and **(2)** wiring the 3 stubbed operational-health tiles + statement nudge once their source sprints land. Most "build the route / wire KPIs / fix dead links" items below are **already done.** The agent-roster rewrite + CSAT-swap findings are correct and (for CSAT) already shipped.

**Design sources**
- Desktop: `cabinets/new/mgmt-workspace.html` — 6 sections (cover, hero+KPI, attention feed, today snapshot, AI-agents activity, cabinet map)
- Mobile: none yet — **🔴 no mobile artifact for this cabinet** (it's a brand-new proposal)
- Phase: net-new · not yet in any phase plan · proposed landing for Mgmt OS

**What this is**
The **operator's first screen** — the landing for Management OS that "replaces the empty Overview stub." A pure **hub / aggregation surface**: it owns no data of its own, it reads from every other cabinet and surfaces three things in priority order — (1) what needs attention now, (2) today's ops snapshot, (3) a map to every cabinet with live badge counts. Every card drills into a Phase 2 cabinet.

**Repo paths**
- Feature data folder: **🔴 none** — no `src/features/workspace/`, no `src/features/overview/`, no `src/features/home/` in the import.
- Route: **🔴 no `/dashboard` landing or `/dashboard/overview` route found** in the imported code. CLAUDE.md confirms the nav single-source is `src/config/dashboard-nav.ts` (not in import) — the "empty Overview stub" the design references is not visible in `_repo`.
- Schema: **no dedicated tables** — and correctly so for a hub. The question is whether the aggregation layer (attention feed) gets a backing table/view or is query-time. See "The central architectural question" below.

## TL;DR

This is the **first audited cabinet that owns no data** — it's a read-only hub. The good news: **almost every source feed it aggregates already exists in schema** — channel-sync state, statement reconciliation warnings, ops risk events, concierge escalations, owner-stay requests, pricing comp drift. The bad news, in three parts: **(1)** there is **no attention-feed aggregation layer** — no `attention_items` table, no unifying view, no `getWorkspaceFeed()` data fn — yet the repo already ships *two* exemplary "open-row, partial-unique-index, severity-tiered" feed tables (`statement_reconciliation_warnings` mig 0032 + `maintenance_risk_events` mig 0014) that are the exact pattern this should generalize. **(2)** the **6 named AI agents in the design are fictional** — `statement-preparer` / `draft-replier` / `conflict-investigator` / `triage-router` / `visa-watcher` match **zero** agent keys in the repo; the real agent roster is keyed differently (`front_office_copilot`, `housekeeping_scheduler`, `concierge_handoff`, etc.) and there is **no mgmt-side daily-digest / workspace-summary agent** at all (the seeded `daily_digest` + `executive_business` agents are construction/dev-scoped). **(3)** the **guest-CSAT KPI has no backing primitive anywhere** — no csat / satisfaction / nps / review-score table exists. The live-agent panel, by contrast, *is* backed: `agent_runs` was extended for scheduled runs + tool-call introspection (mig 0110) and a `notifications` table landed (mig 0111). Net: the hub is ~70% backed by existing source data, but needs one real aggregation primitive, an honest agent-roster rewrite, and either a CSAT source or a different 5th KPI.

---

## The central architectural question

**Does the attention feed get a backing table, a view, or a query-time aggregator?**

The design's "Needs attention" feed unions ~6 heterogeneous sources (channel conflicts, statement warnings, overdue ops, owner-stay requests, pricing recommendations, support SLA breaches). There are three ways to back it, and the repo already demonstrates the right one twice:

| Option | What it means | Verdict |
|---|---|---|
| **A. Per-source query-time aggregator** | `getWorkspaceFeed()` runs N queries (one per source), normalizes each to a common `AttentionItem` shape, merges + sorts by urgency. No new table. | ✅ **Recommended for v1.** Cheapest, always-fresh, no sync risk. Each source already has an indexed "open" query. |
| **B. Materialized `attention_items` table** | A trigger/cron writes a row per actionable event into one table; feed reads one table. | 💭 Later, if query-time fan-out gets slow (>6 sources, >50 villas). The repo's `statement_reconciliation_warnings` + `maintenance_risk_events` are *exactly* this shape (open-row partial-unique-index, severity enum, `source_table`+`source_id` provenance) — generalizing them into one `attention_items` is the natural Phase 3 move. |
| **C. Read from `notifications`** | mig 0111 added a `notifications` table; feed = unresolved notifications. | 🟡 Partial — notifications are user-addressed messages, not the same as cabinet-level actionable state. Good for the bell icon, wrong abstraction for the triage queue. |

**🔒 Recommendation:** Option A now (`src/features/workspace/feed.ts` with a normalizer per source + a single `AttentionItem` union type), with the two existing warning/risk tables as the template for the `AttentionItem` shape. Promote to Option B (unified `attention_items`) only when fan-out cost is measured, not before.

---

## Section-by-section

### Section 01 · Hero · greeting + 5-KPI strip

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Time-of-day greeting + last-sync line | designed | trivial client-side; sync state from `channel_sync_jobs` last-run ✅ | 🟢 trivial | 💭 P2 |
| KPI · occupancy 30d | designed | `bookings` + `villa_calendar_blocks` → occupancy calc exists (cabinet 03 availability) ✅ | 🟡 needs aggregation fn | ⭐ P1 |
| KPI · revenue MTD | designed | finance engine (mig 0002) + `owner_statements` ✅ | 🟡 needs aggregation fn | ⭐ P1 |
| KPI · open ops tasks | designed | `operation_tasks WHERE status IN (open,in_progress)` ✅ + overdue via SLA (cabinet 08) | 🟡 needs SLA fn (P0 in cab 08) | ⭐ P1 |
| KPI · **guest CSAT 7d** | designed (`4.7 · 11 ratings · 0 escalations`) | **🔴 no CSAT / satisfaction / NPS / review-score primitive anywhere in schema** | 🔴 no backing | 🔥 P0 (decide) |
| KPI · statements due | designed | `owner_statements` status + scheduled issue ✅ | 🟡 needs aggregation fn | ⭐ P1 |
| KPIs are teaser-links to cabinets | designed | routing only | 🟢 trivial | 💭 P2 |

**CSAT decision needed.** No guest-satisfaction data exists. Three options: **(a)** build a CSAT primitive (post-stay survey → `guest_csat` table — real work, probably its own feature); **(b)** swap the 5th KPI for something backed (e.g. "ADR · 30d" or "channel health" or "AI cost today" — all have data); **(c)** ship 4 KPIs. Recommend **(b)** for v1 — don't block the hub on a survey system that doesn't exist.

### Section 02 · Needs-attention feed (urgency-sorted triage queue)

| Attention source (per design) | Repo backing | Status | Priority |
|---|---|---|---|
| **Channel sync paused / conflicts** ("Booking.com sync paused — 3 villas frozen") | `channel_sync_jobs` + conflict tables (cabinet 02) ✅ | ✅ source exists | ⭐ P1 |
| **Statement reconciliation warnings** ("WG-may-2025 has 2 warnings") | **✅ `statement_reconciliation_warnings`** (mig 0032) — full table: `warning_type`, `severity` (info/warning/critical), `status` (open/ack/resolved/dismissed), `owner_visible`, `source_table`+`source_id` provenance, open-row partial-unique-index. Exemplary. | ✅ shipped, indexed for exactly this | — |
| **Ops tasks overdue / turnover delays** | `operation_tasks` + `maintenance_risk_events` (mig 0014) ✅ | ✅ source exists (SLA fn pending — cab 08 P0) | ⭐ P1 |
| **Owner stay request pending** | owner-stay request tables (cabinet 07/17) ✅ | ✅ source exists | ⭐ P1 |
| **AI agent recommendation** ("dynamic-pricing comp drift") | dynamic-pricing comp tables (cabinet 03) + `agent_runs` output ✅ | ✅ source exists | ⭐ P1 |
| **Support SLA breach** (design copy mentions support tickets) | concierge `evaluateEscalation()` URGENT 30-min SLA (`concierge/escalation.ts`) ✅ + `service_requests` | ✅ source exists | ⭐ P1 |
| **Unified `AttentionItem` shape + normalizer per source** | **🔴 does not exist** — no `getWorkspaceFeed()`, no common type, no urgency-sort | 🔴 missing | 🔥 P0 |
| 3-tier edge (urgent=danger / warn=amber / info=terra) | designed | maps cleanly onto existing severity enums (`info/warning/critical`) — needs a `severity → tier` fn | 🟡 mapping fn | ⭐ P1 |

The feed's **sources are all present and well-indexed; the aggregation layer is the single P0 gap.** Two of the six sources (`statement_reconciliation_warnings`, `maintenance_risk_events`) are already in the exact "open actionable item" shape — they should define the `AttentionItem` contract.

### Section 03 · Today · ops snapshot (4 tiles)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Arrivals today (4 · 3 confirmed · 1 ETA late) | designed | `bookings` + `checkin_checkout_requests` (mig 0011) ✅ | 🟡 needs aggregation fn | ⭐ P1 |
| Departures today | designed | same ✅ | 🟡 needs fn | ⭐ P1 |
| In-house (8 · 2 VIP · 1 anniversary) | designed | `bookings` in-stay + guest profile flags ✅ (VIP/anniversary tags — verify exist) | 🟡 needs fn + tag check | ⭐ P1 |
| Turnovers (3 · 1 delayed) | designed | `operation_tasks` (turnover_clean) ✅ | 🟡 needs fn | ⭐ P1 |
| Mirrors front-office "Today" cabinet | designed | `front-office/services.ts` exists ✅ — workspace should **reuse** front-office's today-aggregation, not reimplement | 🟡 reuse, don't fork | ⭐ P1 |

This snapshot **duplicates** the front-office cabinet's "Today" view. The hub tile should call the same `front-office` aggregation fn — flag to avoid two divergent today-counts.

### Section 04 · AI agents activity ("what's been autonomous in 24h")

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Live agent rows (name · summary · run count · status dot) | designed | **✅ backed**: `agent_runs` extended for scheduled runs + per-run tool-call introspection (mig 0110) + `agent_configurations` registry | ✅ data side | ⭐ P1 |
| Per-agent run history + cost drill-in | designed | `agent_runs` + budget columns on `agent_configurations` ✅ | ✅ data side | ⭐ P1 |
| "8 active · $84 today" cost rollup | designed | budget/cost tracking on `agent_runs` ✅ | 🟡 needs rollup query | ⭐ P1 |
| **Agent names: `statement-preparer`, `draft-replier`, `dynamic-pricing`, `conflict-investigator`, `triage-router`, `visa-watcher`** | designed | **🔴 ZERO match real agent keys.** Real roster: `front_office_copilot`, `housekeeping_scheduler`, `concierge_handoff`, `investor_copilot`, `security_copilot` (MD-5 seeds) + `executive_business`, `daily_digest`, `weekly_plan`, `photo_analyst`, `construction_supervisor`, etc. (mig 0062). | 🔴 design uses fictional names | 🔥 P0 (rewrite) |
| `visa-watcher` agent | designed | front-office cabinet (cab 01) flagged visa-watcher as a P2.4 stub — verify if it became real | 🟡 cross-check cab 01 | ⭐ P1 |

**The agent panel must be rewritten against the real roster** before build. Map each design row to an actual seeded agent or delete it. The closest real agents to the design's intent: `front_office_copilot` (≈ today's-ops), `concierge_handoff` (≈ draft-replier/triage), `housekeeping_scheduler` (≈ ops). There is **no mgmt-side `daily_digest`** — the seeded `daily_digest` is construction-scoped ("end-of-day per-project digest"). If the workspace wants an autonomous "here's your morning brief" agent, it's net-new.

### Section 05 · Cabinet map (16 cards with badge counts)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| 16 cabinet cards grouped by domain | designed | each target cabinet exists (Phase 2.2–2.4) ✅ | ✅ links resolve | ⭐ P1 |
| Live badge counts ("247 live · 4 arrivals", "3 villas paused") | designed | each count = one query against the target cabinet's tables — **needs a `getCabinetBadges()` fan-out** | 🔴 aggregation missing | ⭐ P1 |
| `has-attn` highlight (amber) on cabinets with open items | designed | derives from same feed sources as §02 | 🟡 reuse feed | ⭐ P1 |
| Cards: Bookings/Calendar/Channels/Rate-plans/Front-office/Operations/Concierge/Finance/Owners/Villas/Projects/Owner-stays/Inventory/Utilities/AI-agents/Settings | designed | most map to built cabinets; **Villas, Inventory/Stock-command, Utilities, Settings link to `#`** (not built / orphaned — Utilities ties to cab 08 orphan-data finding) | 🟡 4 dead links | ⭐ P1 |
| Single-source nav (`dashboard-nav.ts`) | per CLAUDE.md | cabinet map should **read from `dashboard-nav.ts`**, not hardcode 16 cards — otherwise it drifts from the real sidebar | 🟡 should bind to nav config | ⭐ P1 |

---

## Cross-cutting

### Agents — design roster vs real roster

| Design agent (fictional) | Closest real agent | Notes |
|---|---|---|
| `statement-preparer` | none (finance has services, no seeded agent) | statement prep is a data fn, not an agent in repo |
| `draft-replier` | `concierge_handoff` (mig 0101) | concierge agent drafts replies — closest match |
| `dynamic-pricing` | none seeded (pricing is `pricing/` pure module) | pricing is deterministic, not an agent |
| `conflict-investigator` | none (channels has conflict resolver as pure fn) | channel conflict resolution is pure logic, cab 02 |
| `triage-router` | none | maps to the §02 feed normalizer, which is a data fn not an agent |
| `visa-watcher` | possibly real (cab 01 stub) | cross-check front-office audit |

**Takeaway:** the design conflates "autonomous data functions" with "LLM agents." Most of these are deterministic pure modules (pricing, conflict resolution, feed triage), not `agent_configurations` rows. The live-agent panel should show the **actual** seeded agents (`front_office_copilot`, `housekeeping_scheduler`, `concierge_handoff`, `security_copilot`, + dev-side ones if mgmt operator sees them) and let the deterministic functions surface as system activity, not "agents."

### Data wiring

| Concern | Status |
|---|---|
| `agent_runs` extended for scheduled + introspection | ✅ mig 0110 |
| `notifications` table | ✅ mig 0111 (good for bell icon, not the triage feed) |
| `agent_digest_subscriptions` | ✅ mig 0111 — a user can subscribe to digests; **this is the closest thing to a "workspace summary" primitive** and should be leveraged |
| Statement warnings feed | ✅ `statement_reconciliation_warnings` (mig 0032) |
| Ops risk feed | ✅ `maintenance_risk_events` (mig 0014) |
| Unified attention aggregator | 🔴 missing — the one real P0 |
| Cabinet badge fan-out | 🔴 missing |
| Front-office today reuse | 🟡 fn exists, must be shared not forked |

### Cross-cabinet dependencies (this hub reads from ALL of these)

| Cabinet | What the hub pulls | Status |
|---|---|---|
| 02 channels | sync-paused / conflict count → attention + badge | ✅ source |
| 03 dynamic-pricing | comp-drift recommendation → attention; rate-plan count → badge | ✅ source |
| 04 concierge | escalation SLA breach → attention; active-stays → badge | ✅ source (`escalation.ts`) |
| 01 front-office | today snapshot (arr/dep/in-house) | ✅ reuse fn |
| 06 finance | reconciliation warnings → attention; statements-due KPI | ✅ source |
| 07 owners | owner-stay requests → attention; owner counts → badge | ✅ source |
| 08 operations | overdue tasks / risk events → attention; open-task KPI | ✅ source (SLA fn pending) |
| intelligence | agent runs + cost → §04 panel | ✅ `agent_runs` |

The hub is a **downstream consumer of every other cabinet's P0 work.** It should be built **last** in the wave, after the source feeds it reads are real — otherwise its attention list and badges are hardcoded mock data.

---

## Recommended additions (prioritized)

### 🔥 P0 — before this hub can ship with real data

1. **Attention-feed aggregator** — `src/features/workspace/feed.ts`: a common `AttentionItem` type + one normalizer per source (channels / statements / ops / owner-stays / pricing / concierge-SLA) + urgency sort + `severity → tier` map. Option A (query-time fan-out). Model the `AttentionItem` shape on the two existing warning/risk tables.
2. **Agent-roster rewrite** — replace the 6 fictional agent names in the design with the actual seeded roster from `agent_configurations`. Decide which agents a Mgmt operator sees (mgmt + cross-cutting; probably hide pure dev agents). Delete rows that are really deterministic functions, not agents.
3. **CSAT decision** — no satisfaction primitive exists. Either swap the 5th KPI for a backed metric (ADR / channel-health / AI-cost — recommended for v1) or scope a real `guest_csat` post-stay survey feature (separate, larger).

### ⭐ P1 — hub assembly

4. **KPI aggregation fns** — occupancy-30d / revenue-MTD / open-ops / statements-due. Most reuse existing cabinet calcs; wire, don't reinvent.
5. **`getCabinetBadges()` fan-out** — one count per cabinet card. Bind the card list to `dashboard-nav.ts` so the map can't drift from the real sidebar.
6. **Reuse front-office "Today" fn** for §03 — don't fork the arr/dep/in-house counts.
7. **Live-agent panel** off `agent_runs` (mig 0110) + budget rollup for "$X today."
8. **Wire 4 dead cabinet-map links** (Villas, Inventory/Stock, Utilities, Settings) — or mark them "coming soon" honestly. Utilities ties to the cab-08 orphan-data finding.
9. **Route + nav** — create the `/dashboard` (or `/dashboard/overview`) landing route and register it as the Mgmt OS home in `dashboard-nav.ts`, replacing the empty Overview stub.

### 💭 P2 — polish / later

10. **Mobile artifact** — no mobile design exists for this cabinet. The attention feed + today snapshot are the highest-value mobile surfaces in the whole product (operator checks phone first thing). Should get a dedicated mobile pass.
11. **Promote to materialized `attention_items`** — only if query-time fan-out is measured slow. Generalize `statement_reconciliation_warnings` + `maintenance_risk_events` into one feed table.
12. **Leverage `agent_digest_subscriptions`** (mig 0111) — let the operator subscribe to a morning workspace digest; this is the natural home for a future mgmt `daily_digest` agent.
13. **Quick-actions wiring** — the 6 quick-action buttons (New booking / Issue statement / Block dates / Comp guest / New task / Search guest) are routing + modal triggers; low effort, do alongside.

---

## Things outside scope / open questions for product

- **Is "Overview" really empty in the repo?** The design says it replaces an empty stub, but no Overview route is in the import (nav config `dashboard-nav.ts` not imported). Confirm the current state before building.
- **Which agents does a Mgmt operator see?** The real roster mixes mgmt + dev + cross-cutting agents. The §04 panel needs a product call on the visible set.
- **CSAT** — build a real survey primitive, or drop the KPI? Recommend drop-for-v1, build later as its own feature.
- **Hub build-order** — this cabinet must be built **after** its source cabinets' P0 work (esp. cab 08 SLA fn, cab 02 conflict counts), or it ships on mock data. Suggest sequencing it at the *end* of the Phase 2.6 wave, not the start.
- **Is the cabinet map authoritative or decorative?** If authoritative, it must bind to `dashboard-nav.ts`. If it's a curated "most-used" subset, that's a different (smaller) component.
