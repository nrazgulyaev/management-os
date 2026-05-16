# Task-6-DATA — Live data wiring for the 5 Mgmt cabinet visual ports

## Context

Sprint `_handoff/` Task 6 split into two phases on operator decision:

- **TASK-6-VISUAL** (shipped — commit pending in this branch) — 1:1 visual
  ports of `_handoff/management/{bookings,concierge,finance,operations,
  ai-hub}.html` into the live Next.js app. Each prototype's hard-coded
  demo arrays were preserved verbatim and flagged with
  `// TODO(task-6-data): wire to <fn>` comments at the point of use.
- **TASK-6-DATA** (this document) — replace those mock arrays with
  server-fetched data from the existing `features/*` services, or
  introduce a single new service per cabinet where the existing surface
  isn't authoritative yet.

The Overview cabinet (`src/app/(dashboard)/dashboard/page.tsx`) was
already wired in commit `95501b1` and is **not** in this TODO — it
reads `getLiveDashboardCounts()` + `getCurrentAppUser()` live and uses
`portfolioMetrics` / `revenueByChannel` / `monthlyRevenueStrip` /
`mockProjects` / `mockOwners` mocks where no live equivalent ships
today.

## How to read this doc

For each cabinet I list:

- **File** — the page that needs the wiring
- **Mock arrays in the file** — what's currently TODO-flagged
- **Target service function(s)** — what to call. ⚡ marks services
  that don't exist yet and need to be created. ✅ marks ones that
  already exist.
- **Complexity** — Low (1-3 read queries), Med (4-8 + light shape
  mapping), High (joins / aggregations / new schema needed)

## Cabinet 1 — Bookings

**File:** `src/app/(dashboard)/dashboard/bookings/page.tsx`

| Mock array | Target | Service status | Notes |
|---|---|---|---|
| `BOOKINGS` (9 rows) | `listBookings({ status, project, channel, limit })` | ✅ exists at `src/features/bookings/services.ts` | Need to shape DB row → prototype shape (code/guest/villa/ch/in/out/nights/gross/state/vip/lang). `state` enum maps directly. `gross` formatting can be a small helper. |
| `RATE_PLANS` (4 rows) | `listRatePlans()` | ✅ exists at `src/features/pricing/services.ts` (rule-sets surface) | The `Rate plans · active` panel shows base + multipliers + MLOS. The existing pricing rule-set shape is richer (per-villa + channel-set + season ranges). Reduce to the 5-column prototype view. |
| `CHANNEL_HEALTH` (6 rows) | `getChannelHealth()` | ⚡ new service needed | Aggregates per-channel: connection state, last-sync timestamp, conflict count (from `bookings.channel_conflicts` or equivalent), MTD revenue share. Realistic source: cron output table. **Complexity: Med.** |
| `CALENDAR_VILLAS` (8 villas × N blocks) | `getCalendarStrip({ from, days })` | ⚡ new service needed | Returns per-villa block list for the next 14 nights. Sources: bookings, owner stays, maintenance OOO blocks. **Complexity: Med-High** (3 sources to merge). |
| Conflict resolver text (ES-S5 / Booking.com) | `listOpenChannelConflicts()` | ⚡ new service needed | One row per active conflict with action options. **Complexity: Med.** |
| 5-up KPIs (Bookings MTD / ADR / Lead time / Conflicts / Cancellation) | `getBookingsKpis({ period })` | ⚡ new service needed | Composite read. Mostly aggregations over existing `bookings` rows. **Complexity: Low-Med.** |

**Sprint estimate:** 1 day for an ops engineer familiar with the
existing bookings service. The calendar strip is the riskiest piece
(3-source merge + DST handling).

## Cabinet 2 — Concierge

**File:** `src/app/(dashboard)/dashboard/concierge/page.tsx`

| Mock array | Target | Service status | Notes |
|---|---|---|---|
| `SESSIONS` (6 rows) | `listActiveSessions()` | ⚡ new at `src/features/guest-ai/services.ts` | Returns active + recent sessions across channels (WhatsApp, in-stay portal, email). Shape: id/guest/villa/lang/started/msgs/status/last. **Complexity: Med** — relies on per-channel adapters. |
| `HANDOFFS` (2 rows) | `listHandoffs({ status: "open" })` | ⚡ new service needed | Filtered from sessions where status was escalated. Shape: id/from-session/villa/who/text/priority/assigned/elapsed. **Complexity: Low.** |
| `TRANSCRIPT` (active right-pane chat) | `getActiveSession(sessionId)` | ⚡ new service needed (spec callout) | Returns full message list (from "guest" / "ai" / "human"), translation metadata, tasks-created summary footer. **Complexity: Med** — needs translation lookup. |
| `SAFETY` (3 rows) | `listGuestSafetyEvents({ since: "-24h" })` | ⚡ new at `src/features/security/services.ts` | Token reuse, WiFi reveal, lock attempts. Sources: audit log + smart-lock provider webhooks. **Complexity: Med.** |
| 5-up KPIs (Active / Messages today / Auto-resolved % / Handoffs / CSAT) | `getConciergeKpis({ period })` | ⚡ new service needed | Aggregation; CSAT needs a feedback-collection mechanism that may not exist yet. **Complexity: Med-High.** |
| Memory editor block (4 hard-coded facts) | `listAcrossStayMemories({ ownerScope })` | ⚡ new service needed | Allergies, preferences, child-safety flags. **Complexity: Low** — JSON column on owner/guest, simple read. |

**Sprint estimate:** 2 days. Heaviest cabinet — the live transcript +
multilingual translation are non-trivial. CSAT needs a product
decision before wiring.

## Cabinet 3 — Finance

**File:** `src/app/(dashboard)/dashboard/finance/page.tsx`

| Mock array | Target | Service status | Notes |
|---|---|---|---|
| `STMT_LINES` (17 rows — Emma Whitmore EV-07 March 2026) | `getStatementDetail(statementId)` | ⚡ new at `src/features/finance/services.ts` (spec callout) | Returns ledger lines grouped by section (revenue / fees / taxes / expenses / shared / mgmt / reserves). Each line has the line label, hint, and signed amount. **Complexity: Med** — schema for statement lines + section enum needed if absent. |
| `STMT_LIST` (5 statements for March 2026) | `listStatementsForPeriod(period)` | ⚡ new service needed | Returns one row per (owner × villa × period) with status (draft/approved/settled), net, sent date. **Complexity: Low** once the statement table exists. |
| `PAYMENTS` (5 payouts queued + settled) | `listPayoutsForCurrentOrg({ since })` | ⚡ new service needed | Source: payouts table + provider webhook state. **Complexity: Low.** |
| `TRANSPARENCY_ROWS` (5 bookings with collapsed 14-more tail) | `listStatementBookings(statementId)` | ⚡ new service needed | Per-line drill-down from the statement to the bookings + channel + payment. Hash-linked. **Complexity: Med** — requires the statement-line → bookings join table. |
| `WATERFALL` (8-row distribution percentages) | `getDistributionWaterfall({ period })` | ⚡ new service needed | Aggregation over `STMT_LINES` totals normalised to gross. Can be derived client-side from getStatementDetail. **Complexity: Low.** |
| 5-up KPIs (Gross / Fees / Taxes / Opex / Net) | Computed from `getStatementDetail()` | ✅ derivable | No new service needed — sum sections client-side. |
| Material-usage bridge footer (8 entries) | `getMaterialUsageBridgePending()` | ⚡ new service needed | Inventory consumption staged for next bridge run. **Complexity: Med** — touches inventory + finance bridge table. |

**Sprint estimate:** 2-3 days. This is the load-bearing cabinet for
owner trust — schema + service work is substantial.

## Cabinet 4 — Operations

**File:** `src/app/(dashboard)/dashboard/operations/page.tsx`

| Mock array | Target | Service status | Notes |
|---|---|---|---|
| `HOUSEKEEPING` (3 rows) | `listHousekeepingForToday()` | ✅ exists at `src/features/operations/services.ts` (some shape) | Existing service returns broader housekeeping ops; reduce to today's 3-active. **Complexity: Low.** |
| `MAINTENANCE` (4 rows) | `listOpenMaintenance()` | ✅ exists | Filter to status ∈ {open, triaged, in_progress, waiting_parts}. Shape: villa/title/cat/pri/status/ago/who/sla. **Complexity: Low.** |
| `PREVENTIVE` (3 rows) | `listPreventiveUpcoming({ days: 30 })` | ✅ exists at `src/features/maintenance-intelligence/services.ts` | Already shaped. **Complexity: Low.** |
| `SERVICE_REQUESTS` (6 rows) | `listServiceRequests({ status })` | ✅ exists at `src/features/guest-services/services.ts` | Shape match: code/villa/guest/request/service/vendor/state. **Complexity: Low.** |
| AI Copilot band (ES-S5 3-hour gap narrative) | `getOperationsCopilotRun()` | ⚡ new — AI agent surface | Returns latest agent suggestion + reasoning + apply-action. **Complexity: High** (AI infra). |
| 6-up KPIs (Turnovers / Arrivals / Tickets / Preventive / Service / Photos) | `getOperationsKpis()` | ⚡ new service needed | Aggregation. **Complexity: Low-Med.** |
| Status board (8 status tiles) | `getStatusBoard()` | ⚡ new service needed | Per-villa current state rollup. **Complexity: Med** — joins bookings + owner-stays + maintenance OOO. |

**Sprint estimate:** 1.5 days (excluding the AI Copilot band which is
its own multi-day workstream).

## Cabinet 5 — AI Hub

**File:** `src/app/(dashboard)/dashboard/ai/page.tsx`

| Mock array | Target | Service status | Notes |
|---|---|---|---|
| `AI_AGENTS` (8 cards) | `listAgents()` | ⚡ new at `src/features/ai/services.ts` — or reuse `src/lib/mock/ai-assistants.ts` | The mock module already has the right shape. Decision: keep mock until per-tenant agent enablement ships, then wire to a `agent_registry` table. **Complexity: Low** (mock → service swap) or **Med** (real registry). |
| `AI_INBOX` (5 messages) | `listAiInbox({ read })` | ⚡ new service needed | Cross-agent runs that produced human-visible output. **Complexity: Med.** |
| `RUNS` (6 audit-log rows) | `listRecentRuns({ limit, filter })` | ⚡ new service needed | Full audit-log read from `ai_runs` table. **Complexity: Low** — table likely exists for compliance. |
| Refusal footer note (`run-9aa` blocked) | Derived from `listRecentRuns()` | ✅ derivable | Filter by status=blocked, show 1 row. |
| 5-up KPIs (Agents live / Runs 30d / Avg latency / Token spend / Refusals) | `getAiHubKpis({ period })` | ⚡ new service needed | Aggregation over `ai_runs`. **Complexity: Low-Med.** |

**Sprint estimate:** 1 day once the `ai_runs` table is confirmed
authoritative. If not, schema work first.

## Cross-cabinet rollup

| Cabinet | New services needed | Existing services to extend | Sprint estimate |
|---|---|---|---|
| Bookings | 5 | 2 | 1 day |
| Concierge | 6 | 0 | 2 days |
| Finance | 6 | 0 | 2-3 days |
| Operations | 3 | 4 | 1.5 days |
| AI Hub | 4 | 1 (mock → registry) | 1 day |
| **Total** | **24** | **7** | **~8 days senior-eng** |

## Recommended TASK-6-DATA prompt sequence

Operator can sprint these one cabinet at a time. Recommended order:

1. **Operations** — smallest delta, services mostly exist.
2. **AI Hub** — service work shares schema with future AI surfaces.
3. **Bookings** — calendar strip is the riskiest piece, isolate it.
4. **Finance** — schema-heavy, do after Bookings to learn the pattern.
5. **Concierge** — most green-field; postpone until WhatsApp adapter
   is settled.

## Hard constraints carried from TASK-6-VISUAL

- `// TODO(task-6-data):` comments mark every replacement site. When
  wiring, search the file for that marker and ensure 0 remain after
  the swap.
- HF-12 RSC pattern: never pass a forwardRef component (lucide) across
  a server→client prop. Use the existing `DashboardIcon` registry if
  icons need to flow through service results.
- Task 5 shell wraps every cabinet; don't bypass it.
- ARCH-1 cookie SSO and HF-13 routing untouched.
