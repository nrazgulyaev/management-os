# Stage 10 / Phase 10.A — UX Research Foundation — Decisions

**Date**: 2026-05-08
**Hours target**: 1 week (operator-driven for interviews) | Tests target: 0 (research phase, no code) | Migrations: 0
**Tests delivered**: 0 (no engineering code in this phase)
**Test count**: 5000 (unchanged from Stage 9 close)

---

## Why a research phase before any role-specific UX

Stage 10 ships 14 phases of role-specific UX over ~12 weeks. The plan as-written calls Phase 10.A "BLOCKING" — no engineering until research lands. This was already the operator's stated discipline ("DON'T launch engineering без user briefs ready"). Phase 10.A's job: lay scaffolding + reference benchmarks so the 9 role-driving phases (10.C–10.K) consume real briefs, not assistant guesses.

Engineering deliverables that depend on this phase:
- 10.B Design System extension — primitive list comes from cross-role pattern synthesis
- 10.C–10.K — each role phase consumes one brief from `docs/ux-research/briefs/`
- 10.L AI cross-integration + 10.M Mobile + 10.N polish — themes drive scope cuts

---

## Phase 10.A scope split — assistant vs. operator

The plan and the operator's prior cadence both make this split explicit. **Assistant cannot conduct interviews; operator cannot scale reference-app analysis solo.**

| Deliverable | Owner | Status today |
|---|---|---|
| Directory structure + README | assistant | ✅ shipped |
| 11 reference-app catalogs (33 apps total) | assistant + research agents | ✅ shipped |
| Interview guide (script + capture template + sampling) | assistant | ✅ shipped |
| 11 role briefs (skeleton with codebase ties + reference patterns) | assistant | ✅ shipped |
| Executive summary (cross-role themes, phase ordering, scope cuts) | assistant | ✅ shipped |
| 22-33 interview sessions | operator | ⏳ in flight |
| 11 `interviews/{role}/synthesis.md` files | operator | ⏳ in flight |
| Briefs updated with verbatim quotes + timed friction | operator + assistant fold-in | ⏳ pending interviews |
| Phase-order sign-off | operator | ⏳ pending |

---

## Reference-app research delegation pattern

Instead of one large research pass, dispatched 4 parallel general-purpose agents:

1. **Agent 1** — bookkeeper (QuickBooks / Xero / Wave) + cleaner (Properly / Breezeway / Turno) + QS (CostX / Bluebeam / Buildxact)
2. **Agent 2** — project-manager (Procore / Buildertrend / Asana) + CFO (Mosaic / Cube / Fathom) + procurement (Coupa / Procurify / Tradogram)
3. **Agent 3** — marketing (HubSpot / Pipedrive / Trello) + owner (AppFolio Investor Manager / Juniper Square / RealPage IMS) + front-office (Cloudbeds / Mews / Hostfully)
4. **Agent 4** — warehouse (Sortly / Fishbowl / Cin7) + operations-manager (Hostaway / Guesty / iGMS)

Each agent: WebSearch + WebFetch verified product features (May 2026), wrote 3 catalogs per assignment, surfaced cross-app patterns. Total: 11 catalogs, ~700-1500 words each, all cited.

Pattern that worked: each agent owned a coherent set of 2-3 roles, not 11 single-role agents (less context overhead per agent + cross-role pattern surfacing within agent's set).

---

## Cross-role themes (8 patterns surfaced ≥3 of 11 catalogs)

Detailed in `docs/ux-research/research-summary.md`. One-line summaries:

1. **Mobile ≠ desktop-shrunk** — phone-only roles need different mental models
2. **Kanban / timeline / matrix as primary surface** — same primitive, different data
3. **Drill-down with provenance** — every aggregate carries its source
4. **Required-fields-per-stage gating** — transitions enforce data quality
5. **Auto-message-with-edit-before-send** — never full automation
6. **Excel parity is non-negotiable** — analytical roles always xlsx-round-trip
7. **Unified inbox** — one thread, channel-source badges
8. **Lifecycle-event-driven auto-tasks** — reservation events → ops tasks

Implication for 10.B: original plan called for 10 design-system primitives. Research surfaces 12 (added `DrillDownPanel`, `UnifiedInbox` as platform-level, not role-specific).

---

## Phase ordering — recommendations to operator

Plan-as-written: 10.B → 10.C-10.K (sequential or parallel) → 10.L → 10.M → 10.N.

Research suggests:
- **Schedule 10.D Cleaner early** — highest greenfield (no current surface), blocks field-ops adoption, validates mobile primitives from 10.B
- **Schedule 10.E QS last** — riskiest novel UX (PDF/DWG measurement vs. CostX); prototype-test with practitioners before committing
- **Schedule 10.J Owner earlier** — strong reference patterns, mostly assembly of existing data
- **Run 10.M Mobile concurrent with 10.D**, not as a polish pass — they're the same problem

**Operator decides; recommendations are not commands.** Final order should reflect what the actual customer cohort ranks as most painful, surfaced in interviews.

---

## What changed in existing code

Nothing. This is a research phase. Zero TS, zero SQL, zero tests, zero migrations.

Only files added:
- `docs/ux-research/README.md` — directory map + process
- `docs/ux-research/interview-guide.md` — protocol + capture template
- `docs/ux-research/research-summary.md` — executive synthesis
- `docs/ux-research/reference-apps/{role}.md` × 11
- `docs/ux-research/briefs/_template.md` + `briefs/{role}.md` × 11
- `docs/ux-research/interviews/{role}/` empty directories × 11 (operator fills)

---

## Trade-offs + scope discipline

**1. Briefs are skeletons, not finals.** Every brief explicitly says "draft (interviews pending)." Acceptance criteria are placeholder estimates. Operator MUST fold synthesis docs in before consuming the brief in 10.C-10.K. The skeleton is correct codebase tie-ins + reference-app patterns + question framings — not opinions disguised as research findings.

**2. Reference-app catalogs went slightly over the 600-900-word budget.** Agents produced 700-1500 words each. The extra weight is in concrete pattern descriptions tied to villa-management context (e.g. "two-pane reconciliation, single big green OK button + arrow-down + Enter" for Bali bank-feed coding). Engineering clarity > word-count discipline.

**3. No interviews conducted by assistant.** Original plan calls for "22-33 user interviews." Assistant cannot run them. Phase 10.A acceptance is split: assistant ships scaffolding + benchmarks (done today), operator runs interviews (1 week, parallel). This avoids 4 phase-blocking days where assistant has nothing to do.

**4. No prototypes, no Figma.** Briefs include ASCII flow sketches, not designs. Real Figma in 10.B once primitives are decided.

**5. Warehouse + operations-manager are skeleton-only.** Not in the 9 phase-driving roles. Backlog catalogs + briefs shipped so future phases have a baseline; full briefs deferred until those phases scheduled.

**6. Stage 10 phase ordering is a recommendation, not a decision.** Operator owns the final order based on customer-cohort prioritization from interviews.

---

## Phase 10.A acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| 11 reference-app catalogs | 11 | ✅ 11 (33 apps) |
| Interview guide + capture template | 1 | ✅ 1 |
| 11 role brief skeletons | 11 | ✅ 11 (+ template) |
| Executive summary with cross-role themes | 1 | ✅ 1 |
| Directory structure + README | 1 | ✅ 1 |
| Build clean | yes | ✅ (no code change) |
| Tests | unchanged | ✅ 5000 |
| Migrations | 0 | ✅ |

**Assistant-side Phase 10.A ACCEPTED.** Operator-side (interviews + synthesis docs + brief fold-in + phase-order sign-off) remains in flight.

---

## What unblocks Stage 10.B

Phase 10.B (Design System extension) starts when:
1. ≥6 of 9 phase-driving roles have `interviews/{role}/synthesis.md` shipped
2. Operator confirms phase order
3. Operator confirms primitive list (12 vs. 10 — research recommends 12)

Until then, **STAGE 10 / PHASE 10.A ACCEPTED (assistant deliverables); awaiting operator interview cycle.**

---

## Stage 10 status

**14 phases planned, ~12 weeks:**
- 10.A (UX research foundation) — assistant-side ✅ shipped today; operator interviews in flight ⏳
- 10.B (Design System extension) — pending interviews
- 10.C (Bookkeeper Rapid-Entry) — brief ready, awaits 10.B + bookkeeper synthesis
- 10.D (Cleaner Mobile Workflow) — brief ready, awaits 10.B + cleaner synthesis
- 10.E (QS Drawing-Aware Measurement) — brief ready, recommend last
- 10.F (Project Manager Gantt) — brief ready
- 10.G (CFO Drill-Down Dashboards) — brief ready, depends on Stage 9.I work
- 10.H (Procurement RFQ Matrix) — brief ready
- 10.I (Marketing Kanban Funnel) — brief ready
- 10.J (Owner Confidence Dashboard) — brief ready, recommend earlier
- 10.K (Front Office Journey Timeline) — brief ready
- 10.L (AI Assist Cross-Integration) — pending role phases
- 10.M (Mobile Optimization) — recommend concurrent with 10.D
- 10.N (Polish + Acceptance) — pending all role phases
