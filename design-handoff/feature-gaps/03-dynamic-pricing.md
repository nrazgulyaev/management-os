# Feature gap · 03 · Dynamic pricing (Mgmt P2)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built deep. Route `/dashboard/pricing`: 8 pages — `page.tsx` + `calendar` / `channel-push` / `logs` / `quote` / `rule-sets`(+`[id]` 7.3kb / `new`). Feature: `dynamic-pricing/{quote-pure, availability-pure, rule-types, explainer, services, channel-push-stub, schema, actions}`. **Discard "not built".** Surviving: verify pricing-rule schema claims against `drizzle/0036`; the pure-fn engine is confirmed present.

**Design sources**
- Desktop: `cabinets/mgmt-p2/dynamic-pricing.html` — 6 sections (hero curve, 2 layout variants, rules editor sub-page, comp-set sub-page, mobile, engine spec)
- Mobile: `mobile-pass-2.4-cabinets.html` § cabinet 02 — curve-as-primary-surface
- Phase: 2.4 mgmt-02 · commit `d7879c4`

**Repo paths (state as of feature-gap audit window)**
- Engine: `_repo/src/features/dynamic-pricing/{rule-types,availability-pure,quote-pure,explainer,channel-push-stub}.ts` — 5 pure modules, no DB / no `server-only` imports
- Glue: `_repo/src/features/dynamic-pricing/{services,actions,schema}.ts` — DB readers + server actions + Zod schemas
- Agents: `_repo/src/features/ai-agents/pricing/{comp-scraper,pricing-recommender}.ts` — both declared, both stubbed
- Schema: `pricing_rule_sets`, `pricing_day_of_week_rules`, `pricing_occupancy_rules`, `pricing_close_out_rules`, `pricing_channel_rules`, `pricing_min_stay_rules`, `pricing_stop_sell_rules`, `pricing_quote_logs`, `channel_push_events` (all mig 0026); `pricing_rules` legacy single-row (mig 0036, dev-OS); `rate_plans` + `rate_plan_seasons` + `rate_plan_overrides` (mig 0012 owner-stay rates)
- **Not imported into this project:** `src/components/dynamic-pricing/*` (curve, rule editor, comp-set), `src/app/(dashboard)/dashboard/pricing/*`. Status below is inferred from data-layer + design.

## TL;DR

Dynamic pricing has the **strongest engine layer of any Mgmt-P2 cabinet** — 5 pure modules (rule shapes · availability calc · quote calc · admin+public explainer · channel-push outbox stub) backed by **8 dedicated tables** for the rule stack. The engine's reasoning is fully unit-testable and `explainer.ts` already produces the per-step deltas the design's "why this price?" tooltip needs. The hollow parts cluster around three missing concerns: **(1) comp-set storage** — both agents reference `comp_villas` but no such table exists, **(2) pricing pins / manual overrides** — design says "drag a handle to pin"; no `pricing_pins` table exists, **(3) algo runs** — design treats each engine evaluation as a reviewable run, but `pricing_quote_logs` only stores one-off quotes, not the daily-recompute audit trail. Both agents (`comp-scraper`, `pricing-recommender`) are stubbed but well-typed; flipping them on is gated entirely on the comp-set table. The 2 layout variants (sec 02) need locking before the curve UI ships.

---

## Section-by-section

### 01 · Hero · "Pricing — production view"

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Villa picker → 90-day rate curve | ✅ designed | engine: `quote-pure.ts` computes per-night final rate ✅; no `curve.tsx` component imported | 🟡 engine ready, no UI in proj | ⭐ P1 |
| Curve overlays (last year · comp set · target · floor/ceiling) | designed | last-year: derivable from `bookings`; comp-set: 🔴 no table; floor/ceiling: ✅ `pricing_rule_sets.min/max_rate_minor` | 🟡 mixed | 🔥 P0 |
| Drag-handle to pin a date's price | designed | **no `pricing_pins` table in schema**; engine has no `appliedPin` step | 🔴 missing | 🔥 P0 |
| Active rules stack (right rail, click-into) | designed | all 7 rule tables shipped ✅ | ✅ schema | — |
| "Why this price?" tooltip with per-step deltas | designed | `explainer.ts.buildNightlyPricingExplanation()` produces label+delta steps ✅ | ✅ engine ready | — |
| Algo-run acceptance ("run produced new curve, accept?") | designed | **no `pricing_runs` table**; `pricing_quote_logs` exists but only for one-off quote API calls | 🔴 missing | 🔥 P0 |
| KPI strip (occupancy 30/60/90, avg rate, comp-set delta) | designed | occupancy: derivable; avg rate: derivable; comp delta: 🔴 no comp table | 🟡 partial | ⭐ P1 |

### 02 · Layout variants

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| **Variant A**: curve hero, rules right-rail (default) | designed | implied | 🔴 not picked in code | 💭 P2 (gate on pick) |
| **Variant B**: rules hero, curve as result preview | designed | not in repo | 🔴 design only | 💭 P2 |

**Recommendation:** Variant A — curve-as-hero matches the mobile design (sec 05: "curve as primary surface") and matches the engine's per-night output. Variant B would force the same engine results into a rule-table UI; harder to scan. Lock A before the data-wiring PR.

### 03 · Pricing rules · full editor (sub-page)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Standalone page at `/pricing/rules` | designed | route not in proj | 🟡 unknown | ⭐ P1 |
| Rule-set CRUD (create / clone / archive / activate) | designed | `pricing_rule_sets` shipped + `scope_type/project_id/villa_id` columns ✅; actions: ❓ not confirmed | 🟡 schema ready, action surface unclear | ⭐ P1 |
| 7 rule types editable (DoW · occupancy · close-out · channel · min-stay · stop-sell · manual block) | designed | 7 tables shipped ✅; pure types in `rule-types.ts` ✅ | ✅ schema + types | — |
| Priority ordering / drag-reorder | designed | `pricing_rule_sets.priority` column exists ✅; no UI | 🟡 schema ready | ⭐ P1 |
| Per-rule status (active · paused · archived) | designed | all rule tables have status column ✅ | ✅ schema | — |
| Preview-on-save curve diff | designed | engine can run before/after; no preview surface | 🟡 engine ready, no UI | ⭐ P1 |
| Test-against-comp-set button | designed | 🔴 no comp data | 🔴 blocked on schema | ⭐ P1 |

### 04 · Comp set · competitive intelligence (sub-page)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Comp-villa list with similarity score | designed | **no `comp_villas` table**; agent stub `comp-scraper` references it | 🔴 missing | 🔥 P0 |
| Daily/2×-daily scrape from Airbnb / Booking | designed | `comp-scraper.ts` agent stubbed, cron `0 6,18 * * *` declared ✅ | 🟠 stub | 🔥 P0 |
| Comp-set observations time-series (per villa × date × source) | designed | **no `comp_set_observations` table** | 🔴 missing | 🔥 P0 |
| Our-position callout (below median · above ceiling · etc.) | designed | computed only if comp data exists | 🔴 blocked | ⭐ P1 |
| Similarity scoring (manual / auto) | designed | `comp-scraper` output mentions `resimilarityComputed` | 🟠 stub | ⭐ P1 |
| Highlighted recommendation card | designed | `pricing-recommender` agent stubbed, cron `30 4 * * *` declared ✅ | 🟠 stub | ⭐ P1 |
| One-click apply recommended rule | designed | recommender output schema has `suggestedRule?: unknown`; apply flow not coded | 🟡 typed, not wired | ⭐ P1 |

### 05 · Mobile · curve as primary surface

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Single-villa curve scroll | designed | no mobile component | 🔴 design only | ⭐ P1 |
| Tap-date → bottom-sheet override | designed | gated on `pricing_pins` table | 🔴 design + schema | ⭐ P1 |
| Accept-algo-run banner | designed | gated on `pricing_runs` table | 🔴 design + schema | ⭐ P1 |
| No rules editing on phone (read-only) | design constraint | — | ✅ honoured by absence | — |

### 06 · Engine · agents · schema

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| `pricing_rule_sets` (global/project/villa scope) | designed | shipped (mig 0026) ✅ | ✅ | — |
| 7 rule tables (DoW · occupancy · close-out · channel · min-stay · stop-sell · manual) | designed | 7 tables shipped (mig 0026) ✅ — `pricing_close_out_rules.modifier_type` even supports `stop_sell` | ✅ | — |
| `pricing_quote_logs` (every quote attempt) | designed | shipped (mig 0026) ✅ | ✅ | — |
| `comp_villas` (our villa ↔ external listing map) | designed | 🔴 not in any migration | 🔴 missing | 🔥 P0 |
| `comp_set_observations` (scraped rates time series) | designed | 🔴 not in any migration | 🔴 missing | 🔥 P0 |
| `pricing_pins` (manual rate overrides) | designed | 🔴 not in any migration | 🔴 missing | 🔥 P0 |
| `pricing_runs` (daily-recompute audit + accept/reject) | designed | 🔴 not in any migration | 🔴 missing | 🔥 P0 |
| `pricing_recommendations` (agent output, accept/reject log) | designed | 🔴 not in any migration | 🔴 missing | ⭐ P1 |
| Pure engine modules (rule-types · availability · quote · explainer) | designed | all 4 shipped ✅ — `quote-pure.ts` returns `QuoteStay` with full nightly breakdown | ✅ shipped | — |
| Channel-push outbox | designed | `channel-push-stub.ts` exists + `channel_push_events` table (mig 0026) ✅ | ✅ schema, stub fn | ⭐ P1 |
| Admin vs public explainer split | designed | `explainer.ts` exports `buildAdminCalendarCellTooltip` + `buildPublicQuoteSummary` — public version collapses internal modifier categories ✅ | ✅ shipped (impressive) | — |

---

## Cross-cutting

### Data wiring

| Concern | Status |
|---|---|
| Rule reads for engine | ✅ schema ready; `services.ts` builds `RuleBundle` (assumed from rule-types shape) |
| Quote calc on real bookings | ✅ `quote-pure.ts` is unit-testable; runs on synthetic + DB data |
| Pin reads/writes | 🔴 blocked on `pricing_pins` table |
| Comp-set reads | 🔴 blocked on `comp_villas` + `comp_set_observations` |
| Algo-run audit trail | 🔴 blocked on `pricing_runs` |
| Channel push fan-out | 🟡 `channel_push_events` table shipped; stub fn writes to it but doesn't enqueue downstream |

### Agents

| Agent | Declared | Cron | Output schema | Real impl |
|---|---|---|---|---|
| `comp-scraper` | ✅ | `0 6,18 * * *` (2× daily) | `scraped · errors · resimilarityComputed` | 🟠 returns zeros |
| `pricing-recommender` | ✅ | `30 4 * * *` daily 04:30 | `recommendations[] (kind · rationale · confidence · suggestedRule)` | 🟠 returns empty |

Both gated on `comp_villas` + `comp_set_observations`. `pricing-recommender` also needs `pricing_recommendations` persistence so the "highlighted card" survives across sessions.

### Mobile parity

Mobile design says "curve as primary surface" and explicitly defers rules editing to desktop. Engine output (`QuoteNight.finalRateMinor + explanationSteps`) is mobile-ready — same data, just narrower viewport. Bottom-sheet override flow needs `pricing_pins`.

### Layout-variant decision

A vs B isn't picked. Recommend Variant A (locked) because: (1) matches mobile design, (2) engine output is naturally per-night so curve is the right primary, (3) Variant B would require maintaining two parallel layouts as rules expand.

---

## Recommended additions (prioritized)

### 🔥 P0 — ship before claiming "dynamic pricing complete"

1. **Add 4 missing tables in one migration:**
   - `pricing_pins` — `id · org_id · villa_id · date · pinned_rate_minor · pinned_by_user_id · expires_at (nullable) · note · created_at`
   - `pricing_runs` — `id · org_id · scope · run_at · curve_jsonb (before+after) · accepted_at · accepted_by · rejection_reason`
   - `comp_villas` — `id · org_id · our_villa_id · ext_source (airbnb/booking/agoda) · ext_listing_id · ext_url · similarity_score · status (active/archived)`
   - `comp_set_observations` — `id · comp_villa_id · observed_at · nightly_rate_minor · min_los · stop_sell · raw_payload_jsonb`
2. **Wire `pricing_pins` into engine** — add a step in `quote-pure.ts` that consults pins before stop-sell/min-los/rules-stack. Pin → terminal value for that night.
3. **Lock Variant A** in design so curve component can be built without re-axis later.
4. **Comp-scraper agent: real impl** — read active `comp_villas`, fetch (TBD: scraping infra), upsert `comp_set_observations`, recompute `similarity_score`. Without this the entire comp-set sub-page (sec 04) is dead.

### ⭐ P1 — Phase 2.6

5. **Add `pricing_recommendations` table** + persist recommender output. Schema: `id · org_id · villa_id · kind · rationale · confidence · suggested_rule_jsonb · accepted_at · accepted_by · rejected_at · rejection_reason`.
6. **Pricing-recommender real impl** — reads `comp_set_observations` deltas + `bookings` occupancy + active `pricing_rule_sets`, emits 3-5 recommendations per villa.
7. **One-click apply for recommendation** — action that takes `pricing_recommendations.suggested_rule_jsonb` and inserts the appropriate rule row + marks recommendation accepted.
8. **Rules editor UI** — 7 rule types × CRUD. Schema is complete; this is pure UI work.
9. **Channel push fan-out from `channel_push_events`** — table exists but stub fn just writes to it. Needs a poller that consumes and fans out to the channel-sync worker (cabinet 02).
10. **Mobile: bottom-sheet override on tap-date** — gated on `pricing_pins`.
11. **Mobile: accept-algo-run banner** — gated on `pricing_runs`.
12. **Test-against-comp-set** in rules editor — preview button that runs engine + compares output to current `comp_set_observations`.

### 💭 P2

13. **Variant B layout** documented as alternate in `notes/`, not built.
14. **Preview-on-save curve diff** — engine can already do this; needs UI surface.

---

## Things outside scope

- Per-channel commission engine — lives in `pricing_channel_rules.commission_model`; finance reconciles, not pricing cabinet.
- Owner-hold dates — `pricing_stop_sell_rules.reason='owner_hold'` is the integration seam.
- Multi-currency conversion — engine works in `bigint minor units`; FX is finance's problem.

## Open questions for product

- **`pricing_runs` frequency** — daily? hourly? on-rule-change-only? Design implies daily but doesn't pin it.
- **Pin expiration default** — design says "respects pins forever or until you clear". Should pins have a default 90d expiration, or truly forever? Suggest defaulting to next-booking-window-end-date (~90d).
- **Comp-villa similarity** — is it human-curated (Sales sets up "these are comparable")? Auto-clustered (by capacity + location + rating)? `comp-scraper` only mentions "refreshes similarity_score" — implies initial mapping is human. Confirm.
- **Recommender → rule apply** — auto-apply at high confidence (e.g. ≥ 0.95) or always operator-confirmed? Design implies operator-confirmed; consistent with the rest of the platform's "AI suggests, human ships" pattern.
- **comp-scraper infra** — Airbnb/Booking aggressively block scrapers. Plan: use a 3rd-party rates-API service (AirDNA, KeyData) instead of direct scrape? This is a build-vs-buy call.
