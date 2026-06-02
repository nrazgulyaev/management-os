# Feature gap · 08 · Operations (Mgmt P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull from `nrazgulyaev/management-os@main`)
>
> **This audit was originally written against the partial `_repo` import (only `src/features/{channels,concierge,dynamic-pricing,front-office,investors,sales,site-reports,ai-agents}/` + `drizzle/`). That import does NOT contain `src/app/**`, `src/components/**`, or the `src/features/{dashboard,operations,maintenance-intelligence,…}/` folders. Many "missing / orphaned / not built" findings below are WRONG.** Verified against the live repo:
>
> | Original finding | Reality in `main` | Verdict |
> |---|---|---|
> | "no `src/features/operations/`" | `src/features/operations/operations-cabinet-queries.ts` exists: `getOperationsKpis`, `getVillaStatusBoard`, `getMaintenanceTickets`, `getPreventiveUpcoming`, `getHousekeepingProgress`, `getServiceRequestsForCabinet` | ❌ overturned |
> | Operations cabinet UI "not verified / unclear" | `operations/page.tsx` (14.4kb) fully built + live-wired, **17 sub-pages**: tasks (+[id]/new), housekeeping (+[id]), maintenance (+[id]/new), preventive (+new), service-requests (+[id]), damage-reports (+new), checklists, turnovers | ❌ overturned |
> | "`maintenance_risk_events` orphaned, not surfaced" | **Entire `maintenance-intelligence` cabinet** (8 pages): `risks/page.tsx` (7.6kb) is a full filterable risk feed — 7 risk types (`overdue_maintenance`, `utility_low_balance`, `utility_critical_balance`, `no_recent_reading`, `repeated_ticket`, `upcoming_guest_conflict`, `arrival_not_ready`), severity/status pills, idempotent `ScanRisksButton`, `listMaintenanceRiskEvents()` service. **Exactly the "risk feed" I recommended — already built.** | ❌ overturned |
> | "utilities orphaned, no UI" | Full `utilities` cabinet (7 pages): accounts (+[id]/new), readings, payments, risks | ❌ overturned |
> | "preventive has no UI" | `operations/preventive/` (+new) + `maintenance-intelligence/{plans,plans/[id],plans/new,templates,templates/new,windows}` | ❌ overturned |
> | "damage reports not surfaced" | `operations/damage-reports/` (+new) built | ❌ overturned |
> | **Severity vocabulary** `low/normal/high/urgent` vs design P0/P1/P2/P3 | `operations/page.tsx` `SEVERITY_TONE` map uses `low/normal/high/urgent` verbatim. Design diverges. | ✅ **still valid** |
> | **SLA model missing** (`sla_breaches`, `computeSlaStatus`) | **`sla_breaches` table now EXISTS** — landed in `drizzle/0112_phase_2_mgmt.sql` (post-`_repo`-snapshot), shape matches my rec 1b verbatim (`ticket_id`→maintenance_tickets, `breached_at`, `resolved_at`, `breach_minutes`, append-only). What may still be open: the `computeSlaStatus()` pure fn + the 5-min scan job + the severity rename. | 🟡 **table DONE (0112); verify fn + scan job** |
> | **3 fictional agents** (`maintenance-triage`/`turnover-allocator`/`arrival-prep`) | Live cabinet's AI band is an **empty-state for the `daily_digest` agent** ("first time the daily-digest agent files a run") — the cabinet does NOT depend on the 3 design-named agents at all. They were design fiction; the real architecture uses the digest pattern. | ✅ agents absent, but **reframe**: cabinet doesn't need them |
>
> **Net:** The Operations + Maintenance-intelligence + Utilities surface is **already built and live-wired** far beyond what this audit assumed. The genuine remaining gaps are narrow: **(1)** severity vocabulary mismatch (design P0–P3 vs code low/normal/high/urgent — decide which wins); **(2)** explicit per-ticket SLA targets + breach tracking (age-only today); **(3)** several live tiles are stubbed `—` pending seed data (housekeeping tasks, preventive schedule, photo evidence). The "build a risk feed / utilities UI / preventive UI / damage UI" recommendations below are **already done — do not rebuild.** Read the sections below through this lens.

**Design sources**
- Desktop: `cabinets/mgmt-p1/operations.html` — 6 sections (intro + IA, hero strip, maintenance queue, housekeeping board, SLA model, claude-code handoff)
- Mobile: `mobile-pass-mgmt-p1.html` § cabinet 04 — Now-tile + Maintenance + Turnover checklist (29-task) flow
- Phase: 2.2 mgmt-04 · commit `b370242`

**Repo paths**
- Feature data folder: **🔴 no `_repo/src/features/operations/` and no `_repo/src/features/maintenance/` in the import**. Per CLAUDE.md, code landed in `src/components/operations/` + `src/app/(dashboard)/dashboard/operations/*` at commit `b370242` but was not part of this audit's import set.
- Closest in-import siblings used by ops:
  - `_repo/src/features/front-office/readiness-services.ts` — reads `villa_readiness_states` for the arrival-prep view ("Stage 10.M.1 — Front-office readiness aggregation")
  - `_repo/src/features/dynamic-pricing/availability-pure.ts` — merges `villa_calendar_blocks` (incl. `maintenance_block`, `out_of_order`) into the per-night availability map
  - Finance bridge (cabinet 06) `material-usage-bridge*.ts` consumes ops material-usage rows downstream
- Routes (design): `/dashboard/operations` · `/dashboard/operations/maintenance/[id]` · `/dashboard/operations/turnovers`
- Schema · **three dedicated migrations** — the deepest schema footprint in the audited set:
  - **0005 operations runtime** — `operation_task_types`, `operation_tasks`, `checklist_templates`, `checklist_template_items`, `task_checklists`, `task_checklist_items`, `maintenance_tickets`, `preventive_schedules`, `task_attachments`, `damage_reports`, `service_requests`
  - **0011 villa availability + front-office readiness** — `villa_calendar_blocks` (with `maintenance_block` / `deep_cleaning` / `inspection` / `out_of_order` block types), `villa_readiness_states` (append-only timeline · `dirty` / `cleaning` / `inspection` / `ready` / `occupied` / `maintenance_block` / `out_of_order`), `user_responsibility_scopes` with `operations` / `housekeeping` / `maintenance` scopes
  - **0014 preventive maintenance + utilities** — `maintenance_templates`, `villa_maintenance_plans`, `maintenance_window_suggestions`, `utility_accounts`, `utility_readings`, `utility_payment_reminders`, `maintenance_risk_events`
- Seed: `operation_task_types` × 7 (turnover_clean, deep_clean, arrival_inspection, common_area_inspection, pool_check, ac_inspection, guest_request) · `checklist_templates` × 5 · sample `operation_tasks` + `maintenance_tickets` · 4 housekeeping roles (`housekeeping_supervisor`, `housekeeper`, `technician`, `operations_manager`)
- Agents: **only `housekeeping_scheduler` is seeded** (mig 0100, `requires_operator_review=TRUE`, claude-haiku-4-5). The three agents the design declares (`maintenance-triage`, `turnover-allocator`, `arrival-prep`) are **not in `agent_configurations` and not in `_repo/src/features/ai-agents/`**.

## TL;DR

Operations has the **deepest schema footprint in the audited set** — 3 dedicated migrations (0005 · 0011 · 0014), 18+ tables, plus an append-only `villa_readiness_states` timeline with partial-unique-index enforcement of "one open row per villa". The data model is more honest than the design admits: it already encodes preventive scheduling (`preventive_schedules` + `villa_maintenance_plans` + `maintenance_window_suggestions`), a unified risk feed (`maintenance_risk_events` — overdue maintenance, low utility, repeat tickets, unready arrivals), utilities (`utility_accounts` + readings + payment reminders), and damage capture (`damage_reports`) — none of which the cabinet's 3-zone hero/queue/kanban surfaces. The cabinet's **hollow side is the SLA model and the agent stack**: the design specifies a 4-priority P0/P1/P2/P3 system with a new `sla_breaches` table + a new `computeSlaStatus()` pure fn, but the only existing primitive is `maintenance_tickets.severity` (4 levels — low/normal/high/urgent) + `operation_task_types.default_sla_minutes` (a per-type SLA window). 3 of 4 declared agents are absent — `maintenance-triage`, `turnover-allocator`, `arrival-prep` are not seeded; only `housekeeping_scheduler` ships. The cabinet's UI code (components + 3 routes) landed at commit `b370242` per CLAUDE.md but is not in the `_repo` import — depth of UI implementation can't be verified from this session.

---

## Section-by-section

### Anatomy · Information architecture

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| 3 routes (operations · maintenance/[id] · turnovers) | designed | landed at commit `b370242` per CLAUDE.md, not in `_repo` import | 🟡 trust-but-verify | ⭐ P1 |
| Single-page command center / 3-zone scroll | designed | not verified | 🟡 unclear | ⭐ P1 |
| 4 modals (`NewMaintenanceTicket`, `AssignStaff`, `ResolveTicket`, `EscalateTicket`) | designed | not in `_repo` import; CLAUDE.md Phase 2.1 includes a generic `Modal` / `ConfirmModal` / `DestructiveConfirmModal` shell that these would compose | 🟡 unclear | ⭐ P1 |
| `AssignStaffModal` as cross-cabinet primitive | designed (used in turnovers, tickets, arrivals) | not verified | 🟡 unclear | ⭐ P1 |

### Zone 1 · "Today" hero strip (3 tiles · dark arrivals dominant)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Arrivals-tonight tile (dark, dominant) | designed | data primitive `bookings` exists ✅ + `checkin_checkout_requests` (mig 0011) ✅ | 🟡 component not verified | ⭐ P1 |
| SLA tile counter (`P3 / P2 / P1 breached`) | designed | **🔴 no SLA computation primitive** — `maintenance_tickets.severity` exists (4-level) but there is no `computeSlaStatus()` fn and no `sla_breaches` table | 🔴 missing | 🔥 P0 |
| Turnovers-today tile (3 / 2 done / 1 in-progress) | designed | `operation_tasks` joined to `operation_task_types.key='turnover_clean'` gives the count; status enum covers `open/in_progress/completed` ✅ | 🟡 query not verified | ⭐ P1 |
| Channel-sync pulse top-right | designed (decorative) | `channel_sync_jobs` exists (cabinet 02 channels) ✅ | ✅ data side | — |
| Hero is `<OpsHero>` polymorphic primitive | designed (label + big-num + context + footer) | not in `_repo` import | 🟡 unclear | ⭐ P1 |

### Zone 2 · Maintenance queue (card-list · SLA-risk-first sort)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| `maintenance_tickets` table | designed | ✅ mig 0005 — 8-state status (open/triaged/scheduled/in_progress/waiting_parts/resolved/closed/cancelled), 11 issue categories, FK to villa/booking/project, `owner_chargeable`, `estimated_cost_minor`/`actual_cost_minor` | ✅ shipped | — |
| Priority badge P0/P1/P2/P3 | designed (new component) | **schema uses `severity` enum (low/normal/high/urgent)** — 4 levels, but labels don't match the design's P0/P1/P2/P3 vocabulary | 🟡 vocabulary mismatch | 🔥 P0 |
| SLA pill (on-track / at-risk / breached) | designed (new component + new pure fn) | **🔴 no `computeSlaStatus(ticket, now)` pure fn**; no target-hours mapping; no breach log | 🔴 missing | 🔥 P0 |
| Sort by SLA-risk → priority | designed | needs SLA fn first | 🔴 blocked on SLA fn | 🔥 P0 |
| Breached row tinted warn (visual) | designed | depends on SLA fn output | 🔴 blocked | 🔥 P0 |
| Inline-assign via staff chip click | designed | `operation_tasks.assigned_to` + `maintenance_tickets` (no direct assignee FK; assignment flows via `task_id` → operation_tasks) — works but indirect | 🟡 indirect | ⭐ P1 |
| `<StaffChip>` (unassigned variant) | designed (new component) | not verified | 🟡 unclear | ⭐ P1 |
| Triage-agent pulse "last run 12m ago" (visible chrome) | designed | **🔴 `maintenance-triage` agent not in `agent_configurations`** | 🔴 missing | 🔥 P0 |

### Zone 3 · Housekeeping turnovers (4-col kanban)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| 4-column kanban (To-clean / In-progress / Inspected / Ready) | designed | **mapping not formal**: `operation_tasks.status` is 8-value (open/scheduled/in_progress/blocked/completed/cancelled/needs_review/approved); `villa_readiness_states.readiness_status` is 8-value (unknown/dirty/cleaning/inspection/ready/occupied/maintenance_block/out_of_order). Design's 4 columns could fold either, but the mapping needs a pure fn. | 🟡 mapping fn missing | ⭐ P1 |
| Drag-between-columns | designed (uses `@dnd-kit` — flagged as new dep in spec) | **CLAUDE.md confirms `@dnd-kit/core` + `@dnd-kit/sortable` added in Phase 2.2** ✅ | ✅ dep landed | — |
| Compact embed + full board at `/operations/turnovers` | designed | not verified in `_repo` | 🟡 unclear | ⭐ P1 |
| Cleaner avatar on each card | designed | `operation_tasks.assigned_to` ✅ — staff lookup works | ✅ data side | — |
| Quick-checklist modal on card click | designed | `task_checklists` + `task_checklist_items` shipped ✅ (mig 0005, full templating system with `photo_required` items) | ✅ data, 🟡 UI not verified | ⭐ P1 |
| `turnover_clean` task type (180-min default SLA) | designed | ✅ seeded — `operation_task_types.key='turnover_clean'`, `default_priority='high'`, `default_sla_minutes=180` | ✅ shipped | — |
| Mobile: 29-task checklist grouped by area, photo-as-proof | designed | `task_checklist_items.section` ✅ + `photo_required` flag ✅ + `task_attachments.attachment_type='photo'` ✅ | ✅ schema; 🟡 UI not verified | ⭐ P1 |
| Mobile "Help me" escalation pre-filled with current task | designed | no dedicated escalation primitive; would write to `operation_tasks.internal_notes` + reassign | 🟡 ad-hoc | 💭 P2 |

### Priority × SLA model (the design's central new abstraction)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| 4 priorities P0 (2h) / P1 (8h) / P2 (48h) / P3 (14d) | designed | **🔴 not in any table**; closest is `maintenance_tickets.severity` (4 levels, no time targets) and `operation_task_types.default_sla_minutes` (per-type, e.g. turnover_clean=180m, arrival_inspection=30m, pool_check=30m) | 🔴 model mismatch | 🔥 P0 |
| `sla_breaches` table (FK ticket_id, breached_at, resolved_at?, breach_minutes) | designed | **🔴 table does not exist** | 🔴 missing | 🔥 P0 |
| `computeSlaStatus(ticket, now)` pure fn at `src/features/maintenance/sla.ts` | designed | **🔴 no `src/features/maintenance/` folder in `_repo`** | 🔴 missing | 🔥 P0 |
| Re-compute every 5 min (cron / scan) | designed | `ai_assistant_runs` infra exists ✅ (mig 0010) but no SLA-breach scan job | 🔴 missing | 🔥 P0 |
| Breach → notification to GM + ticket owner | designed | notification infra (mig 0008 + 0009) exists ✅; would need a new notification template + trigger | 🟠 wireable | ⭐ P1 |
| Breach → monthly SLA scorecard (Director's morning brief) | designed | dashboard surface owns this; no surface in code | 🟠 wireable | ⭐ P1 |

### Flow A · Create maintenance ticket (`NewMaintenanceTicketModal`)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Modal form-md with priority + photo + villa + description | designed | `maintenance_tickets` columns cover all fields ✅ + `task_attachments` for photos ✅ + 11 `issue_category` enum values ✅ | ✅ data side | — |
| Auto-route via `maintenance-triage` agent | designed | **🔴 agent missing** (see Cross-cutting) | 🔴 missing | 🔥 P0 |

### Flow B · Resolve ticket (`ResolveTicketModal`)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Confirm + cost + 1-3 photos + owner-visible toggle + brief description | designed | `maintenance_tickets.actual_cost_minor` ✅ + `task_attachments` ✅ + `maintenance_tickets.owner_chargeable` ✅ (similar semantic) | ✅ data side | — |
| Status transition to `resolved` | designed | `maintenance_tickets.status='resolved'` + `resolved_at` ✅ | ✅ schema | — |
| Owner-visible toggle → owner statement line via material-usage-bridge | designed (implied cross-cabinet) | finance bridge exists ✅ (`material-usage-bridge*.ts`) | ✅ cross-cabinet wire | — |

### Flow C · Escalate ticket (`EscalateTicketModal`)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Reassign + bump priority + reason | designed | reassign via `operation_tasks.assigned_to` update ✅; priority bump via `maintenance_tickets.severity` update ✅; reason has no dedicated column (would land in `operation_tasks.internal_notes`) | 🟡 ad-hoc reason capture | 💭 P2 |
| Reassign to senior | designed | `user_responsibility_scopes` (mig 0011) ✅ — has `seniority`-like scope grouping; not yet a rank field | 🟡 partial | 💭 P2 |

---

## Cross-cutting

### Agents — the largest single gap in this cabinet

| Agent | Declared in design | In `agent_configurations` seed | In `_repo/src/features/ai-agents/` | Status |
|---|---|---|---|---|
| `housekeeping_scheduler` | not in design (came from Phase MD-5) | ✅ mig 0100 — claude-haiku-4-5, `requires_operator_review=TRUE`, daily budget 800 minor, "user-invoked from cabinet apex" | not in `_repo` (no `ai-agents/operations/` folder) | 🟡 seed-only |
| `maintenance-triage` | designed (Zone 2 chrome shows "TRIAGE AGENT · LAST RUN 12M AGO") | **🔴 not seeded** | **🔴 no code** | 🔴 P0 gap |
| `turnover-allocator` | designed (runs every 90s · assigns cleaners by geography + workload) | **🔴 not seeded** | **🔴 no code** — overlaps semantically with `housekeeping_scheduler` which is user-invoked, not 90s-cron | 🔴 P0 gap |
| `arrival-prep` | designed (shared with Bookings · writes to `arrival_prep_checklist`) | **🔴 not seeded** | **🔴 no code**; `front-office/readiness-services.ts` covers the read-side only | 🔴 P0 gap (shared with cabinet 05) |

The `housekeeping_scheduler` agent (mig 0100) is the **only** ops-related agent in the system, and it does NOT match the design's `turnover-allocator` spec — `housekeeping_scheduler` is user-invoked from "the cabinet apex" with `requires_operator_review=TRUE`, while `turnover-allocator` is described as a 90s-cron auto-allocator. These are two different agents; one should not silently absorb the other.

### Data wiring

| Concern | Status |
|---|---|
| `operation_tasks` listable per villa / date / status | ✅ schema indexed for it (7 indexes incl. status / category / villa / project / assigned / scheduled / due) |
| `maintenance_tickets` ↔ `operation_tasks` FK | ✅ `task_id` link (mig 0005) |
| Material-usage-bridge to Finance | ✅ `material-usage-bridge*.ts` files shipped (per audit 06) |
| Preventive maintenance auto-task generation | ✅ schema (`preventive_schedules` + `villa_maintenance_plans` + `maintenance_window_suggestions`) but no design surface to view/approve windows |
| Risk feed (`maintenance_risk_events`) | ✅ schema; **🟡 not surfaced in cabinet design** — should be a 4th hero tile or sidebar |
| Damage reports | ✅ schema (`damage_reports`); not surfaced in cabinet (lives in incidents elsewhere?) |
| Service requests | ✅ schema; surfaced via Concierge cabinet, not Operations |
| Utility accounts + readings + reminders | ✅ schema; **🔴 not surfaced** in any cabinet — potentially orphaned |
| Append-only readiness timeline | ✅ excellent design — partial unique index enforces one open row per villa, service layer must close-then-insert |

### Cross-cabinet dependencies

| Cabinet | Direction | Status |
|---|---|---|
| 01 front-office | `villa_readiness_states` is the upstream "is the villa ready for arrival?" signal | ✅ `front-office/readiness-services.ts` shipped |
| 03 dynamic-pricing | `villa_calendar_blocks` `maintenance_block` / `out_of_order` excluded from quotable nights | ✅ `availability-pure.ts` honours all 8 block types incl. `maintenance_block` |
| 04 concierge | guest requests route into `service_requests` then `operation_tasks` | ✅ FK chain shipped |
| 05 bookings | `operation_tasks.booking_id` links turnover ↔ booking | ✅ schema |
| 06 finance / statements | `material-usage-bridge*.ts` consumes ops material-usage; ticket actual_cost → owner statement line via `owner_chargeable` flag | ✅ bridge shipped |
| 07 owners | owner-chargeable maintenance shows on owner statement; ops cabinet doesn't surface owner attribution beyond the toggle | ✅ |
| 16 owner home | `maintenance_risk_events` could feed "what needs your attention" — not wired | 🟠 future |
| 18 owner villas | ticket history per villa → owner detail page | 🟠 future |

### Schema-vs-design mismatches (notable)

1. **Severity vocabulary**: schema = `low/normal/high/urgent`; design = `P0/P1/P2/P3`. Both are 4-level, mapping 1:1 by position. **🔒 Locked 2026-05-28**: rename schema enum to `p0/p1/p2/p3`. Done now while no prod data exists; one `ALTER TYPE` + bulk find-replace `'urgent'→'p0'` etc. across ~10-20 callsites. Severity is the cabinet's central abstraction (sort, color, SLA target, escalation rule) — dual vocabulary would cost a lot of context-switching downstream.
2. **No SLA targets table**: design says targets are P0=2h, P1=8h, P2=48h, P3=14d. Schema has `operation_task_types.default_sla_minutes` (per task type) and nothing on `maintenance_tickets`. The two SLA primitives are incompatible — ticket SLA should override task-type SLA per severity. **🔒 Locked**: tickets get a hard-coded `slaTargetHours(severity)` table in `src/features/maintenance/sla.ts` (P0=2 / P1=8 / P2=48 / P3=336). `operation_task_types.default_sla_minutes` stays in place for non-ticket tasks (turnover_clean=180m, etc.) — they live in different SLA universes.
3. **`maintenance_risk_events` orphaned in design**: the unified risk feed already exists in schema (overdue maintenance, low utility, repeat tickets, unready arrivals) but the cabinet's hero/queue/board doesn't show it. **🔒 Locked**: surface as **4th hero tile** "Risks today" with click-through to a `/dashboard/operations/risks` drill-in page. Single SQL query against `maintenance_risk_events WHERE status='open'`.
4. **Utilities orphaned**: `utility_accounts` / `utility_readings` / `utility_payment_reminders` exist with no UI. **🔒 Locked split**:
   - Alerts (low balance / payment overdue) feed `maintenance_risk_events` → show in Operations risk tile.
   - Reading + payment management page at `/dashboard/operations/utilities/` (Phase 2.6+ — for the person who actually walks meters).
   - Owner-facing utility cost lines stay in Owner statements via Finance bridge (already wired).
5. **Preventive maintenance has no UI**: `villa_maintenance_plans` + `maintenance_window_suggestions` exist; cabinet doesn't surface "windows to approve". **🔒 Locked**: sub-page at `/dashboard/operations/preventive/` (Phase 2.6+) listing next-due plans + candidate windows to confirm. Overdue plans surface via `maintenance_risk_events` in the main cabinet's risk tile.

### Mobile parity (vs `mobile-pass-mgmt-p1.html` § 04)

| Mobile artifact | Status |
|---|---|
| "Now" tile (inverted ink, "right now" picture, 60s refresh) | designed mobile-side; reads same primitives as desktop arrival tile | ✅ data |
| Maintenance card with P1/P2/P3 chip + SLA pill + occupancy context ("guest in house") | depends on SLA fn (P0 gap) | 🔴 blocked |
| 29-task turnover checklist grouped by area, photo-as-proof | `task_checklist_items.section` + `photo_required` ✅ schema | ✅ |
| "Help me" escalation pre-filled | ad-hoc (`internal_notes` capture) | 💭 P2 |

---

## Recommended additions (prioritized)

### 🔥 P0 — Phase 2.6 must-haves

1. **SLA model** — four sub-tasks (all locked):
   - **1a.** Rename `maintenance_tickets.severity` enum `low/normal/high/urgent` → `p0/p1/p2/p3`. One `ALTER TYPE` migration + grep-replace across callsites. Do now before prod data exists.
   - **1b.** Add `sla_breaches` table (`id`, `ticket_id` FK, `breached_at`, `resolved_at?`, `breach_minutes`). Partial unique index on `(ticket_id) WHERE resolved_at IS NULL` to enforce one open breach per ticket.
   - **1c.** New `src/features/maintenance/sla.ts` with `computeSlaStatus(ticket, now)` pure fn + `slaTargetHours(severity)` table. Hard-coded: P0=2 / P1=8 / P2=48 / P3=336 hours. Tickets and `operation_task_types.default_sla_minutes` (turnover/inspection tasks) live in different SLA universes — don't merge.
   - **1d.** SLA-breach scan job — runs every 5 min, opens a `sla_breaches` row for any ticket where `age_minutes >= target_minutes` and no open breach exists. Notification fan-out via existing infra (mig 0008/0009).
2. **`maintenance-triage` agent** — seed `agent_configurations` + implement at `src/features/ai-agents/maintenance/triage.ts`. Auto-classifies severity + routes to contractor based on `issue_category` + villa. Event-driven on ticket-created.
3. **`turnover-allocator` as cron function, NOT agent** — 🔒 Locked: this is deterministic dispatch (geography + current workload) not LLM-grade judgment. Implement as a pure scheduler in `src/features/operations/turnover-allocator.ts` that runs on a 90s cron and reads `operation_tasks WHERE task_type='turnover_clean' AND assigned_to IS NULL`, assigns by villa cluster + assignee count. No LLM cost, no review queue, no agent_configurations seed. The dispatch is small enough to be transparent.
4. **`arrival-prep` agent** — 🔒 Locked: writes to **existing `operation_tasks` (`task_type='arrival_inspection'`) + `task_checklists`** — no new `arrival_prep_checklist` table. Event-driven on `bookings.status='confirmed'`: create the inspection task from the checklist template, attach to booking, assign by villa scope. Shared with Bookings cabinet (per cabinet 05 audit also flagged as P0).
5. **`housekeeping_scheduler` rename + scope clarification** — keep as the only LLM agent in this area, but rename to `housekeeping-planner` (or update its description) to make clear it's **next-day planning** (review queue, role/skill matching, fairness), NOT today's allocation. Today's allocation = `turnover-allocator` cron fn (item 3).

### ⭐ P1 — Phase 2.6 polish

6. **Verify ops UI imports** — components + 3 routes landed at commit `b370242` per CLAUDE.md but were not in this audit's import scope. Pull `src/components/operations/*` + `src/app/(dashboard)/dashboard/operations/*` and verify the kanban columns map correctly to `operation_tasks.status`.
7. **Kanban column-mapping pure fn** — `mapTaskToKanbanColumn(task): "to-clean" | "in-progress" | "inspected" | "ready"`. Currently no formal mapping between schema's 8-state enum and design's 4-column board.
8. **Hero strip primitive `<OpsHero>`** — verify exists; if not, build polymorphic `<OpsTile label big-num context footer>`. Now sized for **4 tiles** (arrivals · SLA · turnovers · **risks**).
9. **4th hero tile: `<RisksTile>` reading `maintenance_risk_events`** — 🔒 Locked. Single SQL: `SELECT risk_type, COUNT(*) FROM maintenance_risk_events WHERE status='open' GROUP BY risk_type`. Click-through to `/dashboard/operations/risks` drill-in page with the full feed (overdue plans · low utility · repeat tickets · unready arrivals).
10. **Modals** — confirm `NewMaintenanceTicketModal` / `AssignStaffModal` / `ResolveTicketModal` / `EscalateTicketModal` exist; build the gaps. `AssignStaffModal` is cross-cabinet — should live in `src/components/shared/` not under operations.
11. **Reason capture on escalation** — add `maintenance_tickets.escalation_reason` text column rather than burying in `internal_notes`.

### 💭 P2 — when nearby work touches

12. **Preventive maintenance sub-page** — `/dashboard/operations/preventive/` showing `villa_maintenance_plans` next-due + `maintenance_window_suggestions` to approve. Overdue items already surface via the risks tile (item 9), so this page is for the planner — pace defer to a later 2.6+ sub-PR.
13. **Utilities sub-page** — `/dashboard/operations/utilities/` for meter readings + payment scheduling (the person who walks meters). Low-balance / overdue alerts already surface via the risks tile (item 9). Owner-visible utility lines already wired via Finance bridge.
14. **Damage reports UI** — `damage_reports` table exists; surface in ops cabinet or fold into incident flow elsewhere.
15. **Senior-staff rank field** — `app_users.seniority` or extend `user_responsibility_scopes` so `EscalateTicketModal` "reassign to senior" has a defined target set.

---

## Things outside scope

- Field-staff mobile app (Field portal — Phase 2.5+) — separate cabinet stack, not Mgmt OS.
- GPS check-in for turnovers — design explicitly defers ("NOT in 2.2").
- Automated supply reorder — defers; bridge to procurement cabinet.
- Live photo upload from cleaner mobile — defers; foundation exists in `task_attachments`.

## Resolved decisions (2026-05-28)

- 🔒 **Severity enum** — rename schema `low/normal/high/urgent` → `p0/p1/p2/p3`. Single source of truth, no dual vocabulary. Done now before prod data.
- 🔒 **SLA target authority** — hard-coded per severity in `src/features/maintenance/sla.ts` (P0=2h, P1=8h, P2=48h, P3=14d). Not org-configurable in P1. Ticket SLA (severity) and task-type SLA (`operation_task_types.default_sla_minutes`) live in **different SLA universes** — a turnover task and a maintenance ticket are SLA-tracked independently.
- 🔒 **`arrival_prep_checklist`** — does NOT become a new table. The existing `operation_tasks` (with seeded `task_type='arrival_inspection'`) + `task_checklists` + `task_checklist_items` cover it. Design copy updated to use the existing primitive names.
- 🔒 **`turnover-allocator`** — cron function (`src/features/operations/turnover-allocator.ts`), NOT an agent. Deterministic dispatch (geography + workload), runs every 90s. No LLM cost, no review queue.
- 🔒 **`housekeeping_scheduler`** — stays as the only LLM agent in the housekeeping area, scoped to **next-day planning** (review queue, skill/fairness). Rename to `housekeeping-planner` for clarity vs `turnover-allocator`.
- 🔒 **`maintenance_risk_events`** — surfaced as the **4th hero tile** "Risks today" + drill-in at `/dashboard/operations/risks`. One SQL query, group by `risk_type`.
- 🔒 **Preventive maintenance** — overdue plans surface via the risks tile. The plan management UI is a Phase 2.6+ sub-page at `/dashboard/operations/preventive/`.
- 🔒 **Utilities** — split: alerts (low balance, overdue) feed the risks tile; reading + payment management at `/dashboard/operations/utilities/` (Phase 2.6+); owner-visible utility lines already wired via Finance bridge.
