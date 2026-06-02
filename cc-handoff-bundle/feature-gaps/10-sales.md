# Feature gap · 10 · Sales (Dev P2)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built. Routes: `/development-os/sales` (`page.tsx` 8.4kb + `[contactRoleId]` 8.3kb), plus sibling cabinets `buyers`, `contracts`, `discounts`, `marketing`, `communications`. Pure fns: `sales/{stage-machine.ts, offer-policy.ts, queries.ts}`. **Discard "not built".** Surviving items are design↔code deltas — verify against the sales feature layer + drizzle.

**Design sources**
- Desktop: `cabinets/dev-p2/sales.html` — 6 sections (hero pipeline, layout variants, buyer detail, contract flow, mobile, schema)
- Mobile: `mobile-pass-2.4-cabinets.html` § cabinet 06 — pipeline kanban + offer modal
- Phase: 2.4 dev-02 · commit `5f3213f`

**Repo paths (state as of feature-gap audit window)**
- Pure domain: `_repo/src/features/sales/{stage-machine,offer-policy,queries}.ts` — 3 files
- Agents: **NO `_repo/src/features/ai-agents/sales/` folder** — `offer-policy.ts` references an `offer-drafter` agent that isn't imported
- Schema · contacts/CRM (mig 0035): `contacts`, `contact_roles`, `contact_interactions`, `lead_sources`
- Schema · contracts (mig 0036): `contract_groups`, `contract_milestones`, `sales_schemes`, `sales_scheme_milestones`
- Schema · marketing leads (mig 0063): `leads`, `marketing_lead_sources`
- Schema · buyers (mig 0050): `buyers`, `buyer_unit_assignments`, `buyer_progress_reports`
- Executive alert category (mig 0060): `sales_pipeline` listed as monitored signal
- **Not imported into this project:** `src/components/sales/*` (pipeline-board, funnel-chart, buyer-detail, contract-page, payment-ladder, offer-modal — all referenced by `queries.ts` type imports), `src/app/(dashboard)/development-os/sales/*`, **and the entire `ai-agents/sales/` agent set**.

## TL;DR

Sales has **two tight pure modules** (`stage-machine.ts` — 6-stage FSM with explicit `FORWARD` map per stage, `offer-policy.ts` — 3-tier discount ladder 5%/15%/director) but sits on **the most fragmented schema in dev-OS**: 4 separate customer-lifecycle stages exist across 4 different migrations (`contacts` mig 0035 → `leads` mig 0063 → `contract_groups` mig 0036 → `buyers` mig 0050) with **no unifying `sales_pipeline` or `deals` table** to back the design's kanban. The cabinet's hero (6-lane kanban with cards moving from Lead to Closed-Won) has nowhere to write the per-card `stage` it shows. `transitionLead()` returns `{eventId:"stub"}` not because data wiring is missing but because there's no card table to update. Zero agents imported (vs the cabinet's `offer-drafter` reference). Contract flow (sec 04) is the **only section with a real schema match** — `contract_groups + contract_milestones + sales_schemes` cover what the design needs.

---

## Section-by-section

### 01 · Hero · pipeline kanban

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| 6-lane kanban (Lead / Qualified / Tour / Contract / Closed-Won / Lost) | designed | `stage-machine.ts` defines all 6 stages + FORWARD map ✅ | ✅ logic shipped | — |
| Per-card position (manual order within lane) | designed | `transitionLead.position: number` typed; **no `sales_pipeline_cards` table to store it** | 🔴 missing | 🔥 P0 |
| Drag → stage transition with audit | designed | `stampEvent()` produces audit payload ✅; **no `sales_stage_events` table to persist** | 🔴 missing | 🔥 P0 |
| Per-card preview (buyer name, villa, last activity, offer state) | designed | sources fragmented: `contacts.full_name` + `buyer_unit_assignments.villa_id` + `contact_interactions` + (TBD offers) | 🟡 sources exist, no view | 🔥 P0 |
| KPI strip (conversion %, avg time-in-stage, this-month-closed, pipeline value) | designed | derivable from event audit trail (if it existed) | 🔴 blocked on events table | ⭐ P1 |
| Lane-locked terminals (Closed-Won + Lost read-only) | designed | `isTerminal()` ✅ | ✅ logic | — |
| Inline lane filters (project / sales rep) | designed | not surfaced | 🔴 design only | ⭐ P1 |

### 02 · Layout variants

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| **Variant A**: Kanban (default) | designed | implied | 🔴 not picked in code | 💭 P2 |
| **Variant B**: Funnel chart (volumetric view) | designed | `queries.ts.getFunnelStages(): FunnelStage[]` typed | 🟡 type-shaped | 💭 P2 |

**Recommendation:** Variant A — kanban matches the FSM shape and gives sales reps something to drag. Variant B is an analytics surface that belongs in the project PM cabinet or as a side card, not the pipeline's primary surface.

### 03 · Buyer detail

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Full-page at `/sales/buyer/[contactId]` | designed | route not in proj | 🟡 unknown | ⭐ P1 |
| Contact info (name · email · phone · source) | designed | `contacts` + `lead_sources` shipped ✅ | ✅ schema | — |
| Interaction timeline (calls / emails / meetings / WA) | designed | `contact_interactions` shipped ✅ | ✅ schema | — |
| Linked villa interest + tour history | designed | `buyer_unit_assignments` shipped for post-sale; **no pre-sale "interest" table** | 🟡 partial | ⭐ P1 |
| Offer history with policy outcomes | designed | **no `sales_offers` table** | 🔴 missing | 🔥 P0 |
| Contract preview / generate | designed | `contract_groups` ready to receive | ✅ schema | — |
| Notes / tasks panel | designed | `contact_interactions` covers notes; no tasks | 🟡 partial | ⭐ P1 |

### 04 · Contract flow

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Contract page at `/sales/contract/[id]` | designed | route not in proj | 🟡 unknown | ⭐ P1 |
| Payment-ladder editor (deposit · milestone N · final) | designed | `sales_schemes + sales_scheme_milestones + contract_milestones` shipped ✅ | ✅ schema (best in cabinet) | — |
| Per-milestone amount + due date + linked payment | designed | `contract_milestones` shipped ✅ | ✅ schema | — |
| Offer policy applied to ladder | designed | `checkOfferPolicy()` pure fn ready ✅ | 🟡 logic ready, no integration | ⭐ P1 |
| Generate-contract action (template → PDF) | designed | not surfaced | 🔴 not wired | ⭐ P1 |
| E-sign flow | designed | not in scope per design copy | ⚪ design only | — |
| Contract status (draft · sent · signed · executed) | designed | unclear on `contract_groups.status` (need to check) | 🟡 likely partial | ⭐ P1 |

### 05 · Mobile

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Pipeline kanban (horizontal scroll by lane) | designed | no mobile component | 🔴 design only | ⭐ P1 |
| Card tap → buyer detail | designed | not in proj | 🔴 design only | ⭐ P1 |
| Offer modal (caution-style sheet) | designed | `checkOfferPolicy()` pure fn ✅; no UI | 🟡 logic ready | ⭐ P1 |
| Quick-action (call / WA / mark touched) | designed | gated on contact_interactions write | 🟡 schema ready | ⭐ P1 |

### 06 · Schema · agents · routes

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| `contacts` (CRM identity) | designed | shipped (mig 0035) ✅ | ✅ | — |
| `contact_roles` + `contact_interactions` + `lead_sources` | designed | shipped (mig 0035) ✅ | ✅ | — |
| `leads` (marketing-side capture) | designed | shipped (mig 0063) ✅ — separate from `contacts` (parallel funnel) | ✅ | — |
| `sales_pipeline_cards` (per-card kanban entry with `stage` + `position`) | designed (implied by hero) | **🔴 not in any migration** | 🔴 missing | 🔥 P0 |
| `sales_stage_events` (audit trail from `stampEvent()`) | designed (implied) | **🔴 not in any migration** | 🔴 missing | 🔥 P0 |
| `sales_offers` (offer-policy outcomes log) | designed | **🔴 not in any migration** | 🔴 missing | 🔥 P0 |
| `sales_schemes` + `sales_scheme_milestones` (payment templates) | designed | shipped (mig 0036) ✅ | ✅ | — |
| `contract_groups` + `contract_milestones` | designed | shipped (mig 0036) ✅ | ✅ | — |
| `buyers` + `buyer_unit_assignments` + `buyer_progress_reports` | designed (post-sale) | shipped (mig 0050) ✅ | ✅ | — |
| `offer-drafter` agent | designed (referenced in `offer-policy.ts` comments) | 🔴 **no agent file imported** | 🔴 missing | ⭐ P1 |
| `lead-scorer` agent (implied — marketing leads need scoring before lane entry) | implied | 🔴 not imported | 🔴 missing | ⭐ P1 |
| `pipeline-supervisor` copilot (cross-rep ranking, parallel to concierge_handoff) | implied | 🔴 not registered in `ai_agents_registry` (mig 0103) | 🔴 missing | ⭐ P1 |

---

## Cross-cutting

### Data wiring

| Concern | Status |
|---|---|
| `getPipelineLanes/Cards()` returns kanban data | 🔴 hard-blocked on `sales_pipeline_cards` table |
| `transitionLead()` writes a stage event | 🔴 hard-blocked on `sales_stage_events` table |
| `getBuyer()` returns full buyer detail | 🟡 sources exist but fragmented; needs `sales_contact_view` materialised view UNION contacts/leads/buyers |
| `getContract()` returns full contract | 🟡 schema ready; fn stubbed |
| `getFunnelStages()` returns volumetric breakdown | 🔴 blocked on stage_events for time-in-stage calculations |

### Schema fragmentation

Four separate identity / lifecycle stacks:
1. **`contacts` (mig 0035)** — generic CRM identity, free-form contact
2. **`leads` (mig 0063)** — marketing-attributed capture, distinct table
3. **`contract_groups` (mig 0036)** — post-decision contracts
4. **`buyers` (mig 0050)** — post-signing portal users

The cabinet's hero kanban assumes **one card per lifecycle**, so cards transitioning from Lead → Qualified should not require switching tables. Three resolutions:
- **A.** Add `sales_pipeline_cards` as the master, FK to whichever lifecycle row currently identifies them; transition tables as state changes. Recommend.
- **B.** Normalise the 4 tables into one `sales_parties`. Big lift.
- **C.** Keep separate, make the cabinet a multi-table join. UI complexity skyrockets.

### Agents — entire surface missing

The cabinet design implies at least 3 AI agents:
- **offer-drafter** — explicitly referenced in `offer-policy.ts` ("Pure fn used by OfferModal + offer-drafter agent"). Drafts an offer body matching the policy outcome (amount + reason + which approver chain).
- **lead-scorer** — implied by the kanban's "Qualified" stage. Computes a score for each Lead based on `contact_interactions` density + `lead_sources` quality + manual signals.
- **pipeline-supervisor** — parallel to `concierge_handoff` in mig 0101. Ranks reps' pipelines by attention urgency (stuck-in-stage, expiring offers, etc.).

**None are imported.** Three-agent gap.

### Mobile parity

Mobile design is kanban-first — same surface as desktop, just horizontal scroll. Offer modal on phone is the high-leverage flow (closing a deal at a meeting). Without the missing schema (offers table) the modal can compute the policy outcome but can't persist it.

---

## Recommended additions (prioritized)

### 🔥 P0 — ship before claiming "sales pipeline complete"

1. **Add 3 tables in one migration:**
   - `sales_pipeline_cards` — `id · org_id · project_id · stage (enum) · position · contact_id (nullable) · lead_id (nullable) · contract_group_id (nullable) · buyer_id (nullable) · assigned_rep_user_id · entered_stage_at · created_at`
   - `sales_stage_events` — `id · card_id · from_stage · to_stage · at · actor_user_id · auto_stamped (bool) · note` — exactly the shape `stampEvent()` produces
   - `sales_offers` — `id · card_id · proposed_at · proposed_by_user_id · amount_idr · list_price_idr · discount_pct · outcome (auto/manager/director/rejected) · resolved_at · resolved_by_user_id · linked_contract_group_id`
2. **Wire `transitionLead()`** — calls `stampEvent()`, writes to `sales_stage_events`, updates `sales_pipeline_cards.stage + position`.
3. **Wire `getPipelineLanes/Cards()`** — reads `sales_pipeline_cards` grouped by stage, joined to identity tables.
4. **Card hydration view** — `sales_card_summary` materialised view that picks the right identity table per card and exposes `{cardId, displayName, contactInfo, lastInteractionAt, currentOfferState}` for the kanban preview.

### ⭐ P1 — Phase 2.6

5. **Bring in 3 agents** — `_repo/src/features/ai-agents/sales/{offer-drafter,lead-scorer,pipeline-supervisor}.ts`. Stub OK for v1, real impl later.
6. **Add `sales_pipeline_supervisor` copilot to `ai_agents_registry`** (mig 0103 widen check).
7. **Lock Variant A** in design copy.
8. **Buyer-detail route + DetailPage bricks**.
9. **Contract page route + payment-ladder editor**.
10. **`sales_card_unit_interests` table** — pre-sale "buyer is interested in villa X" (vs `buyer_unit_assignments` which is post-sale).
11. **Mobile kanban + offer modal**.
12. **Tasks panel on buyer detail** — could re-use `operation_tasks` or add `sales_tasks`.

### 💭 P2

13. **Variant B (funnel chart)** documented as alternate, not built — or surface as a side card on the kanban hero.
14. **Bulk-edit lanes** (rare; usually 1 card at a time).
15. **E-sign integration** (out of scope per design).

---

## Things outside scope

- E-signature integration
- Marketing campaign attribution (lives in marketing cabinet via mig 0063 `marketing_lead_sources`)
- Buyer portal post-sale (Owner cabinet 16-22 set covers post-sale buyer ⇄ owner)
- Commission calculations (lives in finance / payroll)

## Open questions for product

- **Lead vs Contact** — `leads` (mig 0063) and `contacts` (mig 0035) exist as parallel tables. Should a card start as a Lead and "promote" to a Contact at Qualified stage? Or are they two parallel funnels for two source types (marketing campaigns vs direct outreach)? Confirm intent.
- **Stage position ordering** — `transitionLead.position: number` implies manual position within lane. Is it persisted, or just for the drag operation? Recommend persist for "this card is hotter than that one" signal.
- **Offer auto-approval threshold** — 5% inline is current default. Per-rep override (senior reps get 10%)? Per-project override? Suggest: per-org tunable, not per-rep.
- **Director-tier threshold** — 15%+ currently triggers director. Should it also fire on absolute amount thresholds (e.g. any offer > 5B IDR director-only)? Suggest: yes, add absolute floor.
- **Card-to-buyer continuity** — when a card hits Closed-Won, do we auto-create the `buyer` row? Or is that a separate "convert" action? Recommend auto-create with manual confirmation step.
