# 00 · Feature-gap rollup — cross-cabinet P0 synthesis

> ## 🛑 STOP — DO NOT PASTE SECTION A/B/C/D INTO CLAUDE CODE AS-IS (2026-05-29 · verified vs `nrazgulyaev/management-os@main`)
>
> This rollup was synthesized from audits written against the **partial `_repo` import** (only `src/features/{8 folders}` + a `drizzle/` snapshot frozen at `0111`). The live repo is built **far** past those assumptions, and a whole **phase-2-data-wiring wave already shipped** (`drizzle/0112–0115`, now imported). Executing this rollup unmodified would make Claude Code **rebuild existing cabinets and create duplicate/conflicting tables.** See `_ground-truth-2026-05-29.md` for the full route inventory.
>
> ### Section A (schema) — verified table-by-table against the real migrations (0000–0115):
>
> | Rollup proposes | Real status in `main` | Action |
> |---|---|---|
> | `sla_breaches` | ✅ **EXISTS** — `0112_phase_2_mgmt.sql`, exact shape | **delete from Section A** |
> | `capital_call_notices` (+ALTER `capital_drawdowns`) | ✅ shipped as **`capital_calls` + `capital_call_allocations`** — `0113_phase_2_dev.sql` | **delete — use real tables** |
> | (BOQ variance, cab 14) | ✅ shipped as **`boq_revisions` + `boq_actuals` + `variance_reviews`** — `0113` | n/a — already done |
> | (vendor scoring, cab 15) | ✅ shipped as **`vendor_scores`** — `0113` | n/a — already done |
> | (owner inbox, cab 20) | ✅ shipped as **`owner_threads` + `owner_messages`** — `0114_phase_2_owner.sql` | n/a — already done |
> | (owner settings toggles, cab 22) | ✅ shipped as **`owner_notification_prefs`** — `0114` | n/a — already done |
> | (owner statement state machine, cab 17) | ✅ **`owner_statements` ALTER +7 cols** (owner_state, auto_ack_at…) — `0112`; engine table from `0104_statement_1` | n/a — already done |
> | (villa gallery, cab 18) | ✅ **`villa_photos`** + `owner_activity_log` — `0115_phase_2_owner_l2.sql` | n/a |
> | `rate_cells`, `channel_listing_matches` (channels, cab 02) | 🔴 **not in any migration** — BUT the channels cabinet is **already built** on `channel_connections` (0076) + `channel_reservations` (0077). The design wants a different cell-state model than what shipped. | **product decision, not a blind build** |
> | `pricing_pins`, `pricing_runs`, `comp_villas`, `comp_set_observations` (cab 03) | 🔴 not in any migration — pricing cabinet built on `pricing_rules` (0036) + `dynamic_pricing_availability_rules` (0026). | **product decision** |
> | `comp_offered`, `concierge_escalations` (cab 04) | 🔴 not in any migration — concierge built on `guest_ai_concierge*` / `guest_ai_handoffs` (0018/0019) / `service_requests`. | **product decision** |
> | `weekly_reports` (cab 09) | 🔴 not in any migration — site-supervisor built on `site_reports` + `site_report_photos` (0040). Design's `site_frames` view + `weekly_reports` never shipped. | **product decision** |
> | `sales_pipeline_cards`, `sales_stage_events`, `sales_offers` (cab 10) | 🔴 not in any migration — sales built on `sales_schemes`/`sales_scheme_milestones` (0036) + `sales_conversation_threads` (0065) + contract/buyer tables. The kanban-card model never shipped. | **product decision** |
>
> **So Section A is ~half already-done (under the team's own names) and ~half "design wants a storage model the team didn't build" — NOT a clean to-do list.** The genuinely-absent tables all belong to **already-built P2 cabinets** (channels/pricing/concierge/sales/site-supervisor), so the question is *"do we re-platform the cabinet onto the design's richer model?"* — a product call, not a migration to paste.
>
> ### Sections B/C/D — largely STALE:
> - **C (data-fn wiring "returns empty")** — the `queries.ts` stubs cited were from the partial import; the **real cabinets are live-wired** (e.g. `dashboard-cabinet-queries.ts`, `operations-cabinet-queries.ts`, finance/owner/dev query layers all ship real reads). Re-verify each against `main` before "wiring."
> - **D (UI primitives + routes)** — **everything is built.** 299 dashboard pages, 58 dev-os route roots, 21 owner pages. Treat D as a *verification/mobile-parity* pass, not a build.
> - **B (agents)** — partially valid: the **fictional agent names** (`maintenance-triage`, `turnover-allocator`, `arrival-prep`, `conflict-investigator`, `statement-preparer`, etc.) are confirmed absent, but live cabinets use the **real roster** (`front_office_copilot`, `housekeeping_scheduler`, `concierge_handoff`, `security_copilot`, `daily_digest`, …) + the digest pattern. Don't seed fictional agents; decide per-cabinet whether the real roster covers the need.
>
> ### What actually survives as real, prioritized work:
> 1. **Severity vocabulary** (cab 08) — code `low/normal/high/urgent` vs design `P0–P3`. Reconcile.
> 2. **`computeSlaStatus()` pure fn + 5-min scan job** (cab 08) — the `sla_breaches` *table* exists (0112); verify the fn + cron that populate it.
> 3. **Cross-cabinet attention/triage feed** (cab 23) — genuinely absent; the live Overview has scattered tiles + a statement nudge, no unified queue.
> 4. **Stubbed Overview tiles** (cab 23) — "Open maintenance / Housekeeping / Owner-stay-requests" show `—`; wire to the (existing) ops/owner-stay queries.
> 5. **P2-cabinet storage-model decisions** — channels/pricing/concierge/sales/site-supervisor: keep shipped model or adopt the design's richer tables? Per-cabinet product call.
> 6. **owner-settings breadth** (cab 22) — `owner_notification_prefs` exists (0114); verify the 2FA-gated payout-edit surface.
>
> **Everything below this line is the ORIGINAL rollup, preserved for reference. Read it only through the filter above.**

---

# 00 · Feature-gap rollup — cross-cabinet P0 synthesis (ORIGINAL — STALE)

> Auto-built from 22 audits in `feature-gaps/`. This is the **paste-ready Claude Code prompt source** for the next implementation wave.

## How to use this document

Each section below is a **self-contained Claude Code prompt batch** — copy the section into a new Claude Code session and it'll have everything needed to execute. Sections are ordered by **dependency**: schema before agents before data-fn wiring before UI.

---

## Section A · Schema migrations (one PR)

**~13 net-new tables, 2 ALTERs, 1 materialised view, 2 helper views.** Group into a single migration file `drizzle/0112_feature_gap_p0_close.sql` because most are interlinked.

### Tables to add

```sql
-- 1. Channels cabinet (02) — the cell-state storage layer the entire ChannelGrid depends on.
CREATE TABLE rate_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  villa_id UUID NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES booking_channels(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  pushed_value NUMERIC(12,2),
  acked_value NUMERIC(12,2),
  sync_state TEXT NOT NULL CHECK (sync_state IN ('pending','synced','stale','conflict','blocked','booked')),
  last_push_at TIMESTAMPTZ,
  last_ack_at TIMESTAMPTZ,
  conflict_at TIMESTAMPTZ,
  blocked_at TIMESTAMPTZ,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (villa_id, channel_id, date)
);
CREATE INDEX rate_cells_org_state_idx ON rate_cells (organization_id, sync_state);
CREATE INDEX rate_cells_date_idx ON rate_cells (date);

-- 2. Channels — listing match output from channel-listing-matcher agent.
CREATE TABLE channel_listing_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_code TEXT NOT NULL,
  ext_id TEXT NOT NULL,
  ext_name TEXT NOT NULL,
  suggested_villa_id UUID REFERENCES villas(id),
  confidence NUMERIC(4,3),
  bucket TEXT NOT NULL CHECK (bucket IN ('matched','ambiguous','unmatched')),
  candidates_jsonb JSONB,
  resolved_villa_id UUID REFERENCES villas(id),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3-6. Dynamic pricing cabinet (03) — 4 missing tables.
CREATE TABLE pricing_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  villa_id UUID NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  pinned_rate_minor BIGINT NOT NULL,
  pinned_by_user_id UUID NOT NULL,
  expires_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (villa_id, date)
);

CREATE TABLE pricing_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('villa','project','global')),
  scope_id UUID,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  curve_before_jsonb JSONB,
  curve_after_jsonb JSONB,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID,
  rejection_reason TEXT
);

CREATE TABLE comp_villas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  our_villa_id UUID NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  ext_source TEXT NOT NULL CHECK (ext_source IN ('airbnb','booking','agoda','manual')),
  ext_listing_id TEXT,
  ext_url TEXT,
  similarity_score NUMERIC(4,3),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived'))
);

CREATE TABLE comp_set_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_villa_id UUID NOT NULL REFERENCES comp_villas(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  nightly_rate_minor BIGINT,
  min_los INTEGER,
  stop_sell BOOLEAN NOT NULL DEFAULT false,
  raw_payload_jsonb JSONB
);
CREATE INDEX comp_set_obs_villa_date_idx ON comp_set_observations (comp_villa_id, observed_at DESC);

-- 7. Concierge cabinet (04) — comp ledger per booking.
CREATE TABLE comp_offered (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  proposed_by_user_id UUID,
  proposed_by_agent TEXT,
  amount_idr BIGINT NOT NULL,
  reason TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('auto','staff','director','rejected','pending')),
  resolved_at TIMESTAMPTZ,
  audit_payload_jsonb JSONB
);
CREATE INDEX comp_offered_booking_idx ON comp_offered (booking_id);

-- 8. Site supervisor cabinet (09) — weekly reports.
CREATE TABLE weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  iso_week TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  hero_frame_ids JSONB,
  summary TEXT,
  kpis_jsonb JSONB,
  excluded_jsonb JSONB,
  composed_at TIMESTAMPTZ,
  composed_by_agent TEXT,
  published_at TIMESTAMPTZ,
  published_by_user_id UUID,
  pdf_url TEXT,
  UNIQUE (project_id, iso_week)
);

-- 9. Sales cabinet (10) — pipeline cards.
CREATE TABLE sales_pipeline_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('lead','qualified','tour','contract','closed_won','lost')),
  position INTEGER NOT NULL DEFAULT 0,
  contact_id UUID REFERENCES contacts(id),
  lead_id UUID REFERENCES leads(id),
  contract_group_id UUID REFERENCES contract_groups(id),
  buyer_id UUID REFERENCES buyers(id),
  assigned_rep_user_id UUID,
  entered_stage_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Sales — stage transition audit trail.
CREATE TABLE sales_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES sales_pipeline_cards(id) ON DELETE CASCADE,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID NOT NULL,
  auto_stamped BOOLEAN NOT NULL DEFAULT true,
  note TEXT
);

-- 11. Sales — offer log.
CREATE TABLE sales_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES sales_pipeline_cards(id) ON DELETE CASCADE,
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  proposed_by_user_id UUID NOT NULL,
  amount_idr BIGINT NOT NULL,
  list_price_idr BIGINT NOT NULL,
  discount_pct NUMERIC(5,2),
  outcome TEXT NOT NULL CHECK (outcome IN ('auto','manager','director','rejected','pending')),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID,
  linked_contract_group_id UUID REFERENCES contract_groups(id)
);

-- 12. Investors cabinet (11) — capital call notices (parent of capital_drawdowns).
CREATE TABLE capital_call_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fund_id UUID,
  number INTEGER NOT NULL,
  total_idr BIGINT NOT NULL,
  purpose TEXT NOT NULL,
  notice_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','partial','cancelled')),
  created_by_user_id UUID NOT NULL,
  sent_at TIMESTAMPTZ
);

ALTER TABLE capital_drawdowns ADD COLUMN notice_id UUID REFERENCES capital_call_notices(id);

-- 13. Concierge — escalation event audit.
CREATE TABLE concierge_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('escalation_ts','manual')),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID,
  staff_seen_at TIMESTAMPTZ,
  manager_bell_cleared_at TIMESTAMPTZ
);
```

### Materialised view (concierge cabinet)

```sql
CREATE MATERIALIZED VIEW concierge_requests AS
  SELECT
    s.id AS source_id,
    'in_stay' AS source,
    s.booking_id, ...
  FROM guest_ai_concierge_sessions s
  UNION ALL
  SELECT t.id, 'direct_booking', ... FROM direct_booking_guest_message_threads t
  UNION ALL
  SELECT h.id, 'handoff', ... FROM guest_ai_handoffs h
  UNION ALL
  SELECT e.id, 'journey_event', ... FROM guest_journey_events e WHERE needs_attention;

CREATE INDEX concierge_requests_org_priority_idx ON concierge_requests (organization_id, priority, last_activity_at DESC);
```

### Helper views

```sql
-- Site supervisor — flatten site_report_photos to design's "frame" unit.
CREATE VIEW site_frames AS
  SELECT
    p.id AS frame_id,
    sr.organization_id, sr.project_id,
    z.zone_code, p.kind, p.severity,
    p.caption, p.taken_at, p.gps_lat, p.gps_lng,
    p.spotlight_score, p.author_user_id
  FROM site_report_photos p
  JOIN site_reports sr ON sr.id = p.site_report_id
  LEFT JOIN site_report_zones z ON z.site_report_id = sr.id;
```

---

## Section B · Agent stubs → real implementations (one PR per agent cluster)

**~25 agent stubs across 7 cabinets need real impl.** Group by cluster.

### Cluster B1 · Channels agents
- `channel-listing-matcher` (`_repo/src/features/ai-agents/channels/channel-listing-matcher.ts`) — nightly + on-connect; persist to `channel_listing_matches`.
- `conflict-investigator` (`_repo/src/features/ai-agents/channels/conflict-investigator.ts`) — event-driven on `conflict` cell state.

### Cluster B2 · Dynamic pricing agents
- `comp-scraper` (`_repo/src/features/ai-agents/pricing/comp-scraper.ts`) — cron 2× daily; persist to `comp_set_observations`.
- `pricing-recommender` (`_repo/src/features/ai-agents/pricing/pricing-recommender.ts`) — daily 04:30; persist to `pricing_recommendations` (new table TBD).

### Cluster B3 · Concierge agents
- `concierge-agent` (`_repo/src/features/ai-agents/concierge/concierge-agent.ts`) — routes routine vs issue. **Currently stub returning `route: "issue", confidence: 0`.**

### Cluster B4 · Site supervisor agents (FOUR new files)
Create: `_repo/src/features/ai-agents/site-reports/{incident-classifier,captioner,weekly-drafter,site-supervisor}.ts`. None exist yet.

### Cluster B5 · Sales agents (THREE new files)
Create: `_repo/src/features/ai-agents/sales/{offer-drafter,lead-scorer,pipeline-supervisor}.ts`. None exist yet.

### Cluster B6 · Investors — one missing
- `call-reminder` — daily cron, finds unpaid `capital_call_notices` past `due_at + 7d`, notifies via `investor_portal_requests`.

### Cluster B7 · Operations (verify 3 agents exist)
- `maintenance-triage`, `turnover-allocator`, `arrival-prep` — referenced in design but not visible in `_repo`. **Locate or create.**

---

## Section C · Data-fn wiring (one PR per cabinet)

Cabinets whose `queries.ts` returns empty arrays/null today (most of P2/P3 wave):

| Cabinet | File | Status |
|---|---|---|
| 02 channels | `queries.ts.getChannelGridData/pushRate` | returns empty; blocked on `rate_cells` (Section A) |
| 03 dynamic-pricing | implicit; engine fns ready, `pricing-recommender` blocks | wire after `comp_villas` exists |
| 04 concierge | `queries.ts.getInbox/getThread/getJourney/getCompOffered/postStaffMessage` | all stubbed; wire after `concierge_requests` view + `comp_offered` exist |
| 09 site-supervisor | `queries.ts.getSiteDays/getIncident/getWeeklyReport/submitSiteFrame` | all stubbed; wire after `site_frames` view + `weekly_reports` exist |
| 10 sales | `queries.ts.getPipelineLanes/Cards/transitionLead` | all stubbed; wire after `sales_pipeline_cards/stage_events` exist |
| 11 investors | `queries.ts` (not inspected) | wire after `capital_call_notices` exists |

---

## Section D · UI primitives + routes (one PR per cluster)

Already-imported cabinets verified shipped: **05 bookings, 06 finance**. Remaining work:

### D1 · Mobile parity
- `mobile-pass-mgmt-p1.html` × 4 cabinets — verify components
- `mobile-pass-dev-p1.html` × 4 cabinets — verify components
- `mobile-pass-owner-p1.html` × 7 cabinets — verify components

### D2 · Capture flow (Site supervisor)
Camera-first capture component + GPS-required guard + voice-to-text (Claude haiku transcript). Lives in `src/components/site-reports/capture-flow.tsx` (referenced by `queries.ts.SubmitSiteFrameInput`).

### D3 · Connect-channel wizard (Channels)
3-step wizard + listing-match manual override UI. Schema (`channel_connections`) ready.

### D4 · Capital-call wizard (Investors)
3-step: total → preview pro-rata → 2FA-confirm. Uses `draftCapitalCall()` pure fn (cabinet 11).

---

## Section E · Cross-cutting wires (last PR)

| Wire | From → To | Status |
|---|---|---|
| Statement-preparer agent location | Cabinet 06 finance + 17 owner-statements | 🟡 referenced everywhere, code location unclear |
| Material-usage bridge | Operations → Finance | ✅ shipped (`material-usage-bridge*.ts`) |
| Owner-portal projection refresh | All owner-touching writes → owner-portal projection tables (mig 0030) | 🟡 verify triggers |
| RLS owner-self-read | `statement_explanation_snapshots` (mig 0032) | ✅ shipped — gold pattern |
| Audit log writes | Every privileged action across cabinets → `audit_log` | 🟡 verify all money/auth/config writes call `writeAudit()` helper |

---

## Suggested PR sequence (10 PRs)

| # | Title | Lines (est) | Days (senior) |
|---|---|---|---|
| 1 | `phase-2-6-schema(p0-close)` — all 13 tables + 1 view + 2 helpers | ~600 | 1.5 |
| 2 | `phase-2-6-channels(rate-cells-wire)` — `pushRate` + `resolveCellConflict` real | ~400 | 1 |
| 3 | `phase-2-6-pricing(pins-runs-comp)` — engine reads from new tables | ~500 | 1.5 |
| 4 | `phase-2-6-concierge(unified-inbox)` — materialised view + 5 stubbed fns wired | ~450 | 1 |
| 5 | `phase-2-6-site-supervisor(frames-weekly)` — frame view + weekly composer wire | ~400 | 1 |
| 6 | `phase-2-6-sales(pipeline-cards)` — 3 tables wired + FSM wire | ~500 | 1.5 |
| 7 | `phase-2-6-investors(capital-notice)` — wire + bring in `call-reminder` agent | ~350 | 1 |
| 8 | `phase-2-6-agents(impls-batch-1)` — 8 agent real impls | ~600 | 2 |
| 9 | `phase-2-6-agents(impls-batch-2)` — 8 more agent real impls | ~600 | 2 |
| 10 | `phase-2-6-mobile-verify` — components walk-through, mobile parity | ~300 | 1 |

**Total: ~4,700 lines · ~13.5 senior-eng days.**

---

## Open questions across cabinets (decide before Section A migration)

1. **Variant locking** — channels (3 variants), dynamic-pricing (2 variants), concierge (2 variants), site-supervisor (2 variants), sales (2 variants), investors (2 variants). All need a pick-one decision before migration shape is final.
2. **Channel-specific cancellation overrides** (cabinet 05 bookings) — Airbnb's strict/moderate/flexible vs platform default.
3. **`actions.ts` 51kb split** (cabinet 08 operations) — code-smell; refactor in Section A or defer?
4. **Statement-preparer agent location** — multiple cabinets reference it; where does it actually live in code?
5. **Owner-stay quota refresh** — calendar year vs anniversary vs per-villa pooled (cabinet 19 owner-calendar).
6. **owner-concierge tone** — formal investor-language confirmed?

---

> **End of rollup.** Paste any Section A-E block into a fresh Claude Code session with `_repo/` access and the implementation prompt should self-execute.
