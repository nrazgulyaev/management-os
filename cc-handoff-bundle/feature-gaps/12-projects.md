# Feature gap · 12 · Projects + PM (Dev P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built **extremely deep** — the largest cabinet in the app. `/development-os/projects/[slug]/page.tsx` is **41.7kb**, with **32 pages**: `boq` · `change-orders`(+`[code]`/`new`) · `company`(+`[id]`) · `decisions`(+`[code]`/`new`) · `land` (9.4kb) · `milestones` · `permits`(+`[id]`) · `risks`(+`heatmap`/`[code]`/`new`) · `schedule`(+`lookahead`/`tasks`+`[code]`/`new`) · `waterfall`(+`simulator`) · `work-packages`(+`[code]`/`new`). **Almost certainly fully built — discard nearly every "not built" finding** and re-verify any survivor against the real pages before trusting.

**Design sources**
- Desktop: `cabinets/dev-p1/projects.html`
- Phase: 2.2 dev-01 (Phase 1 → 2.2 carry-forward)

**Repo paths**
- Feature data: `src/features/projects/{actions,form,health,schema,services,types}.ts` — 6 files, ~22kb total
- Pure module: `health.ts` (2.7kb) — project health scoring
- Components (not imported): `src/components/projects/*` (10 files in repo)
- Routes (not imported): `src/app/(development-app)/development-os/projects/*` (32 files in repo)
- Schema · core (mig 0000): `projects`, `villas`, `villa_status_events`
- Schema · dev OS stage 2.1 (mig 0034): development-os stage 2.1 project structures
- Schema · stage 4.A project setup (mig 0045): project setup expanded
- Schema · stage 5.B project cycle (mig 0058): project cycle (lifecycle)
- Schema · stage 5.B profitability + cashflow (mig 0059): mat view layer

## TL;DR

Projects + PM is the **top-level Dev OS cabinet** — every other Dev cabinet hangs off `projects.id`. Modest feature folder (6 files, ~22kb) but **the richest route tree in Dev OS** (32 files) reflecting the breadth of project management surfaces. One polished pure module: `health.ts` (2.7kb — project health scoring, likely traffic-light or weighted-sum). Schema layer is extraordinarily mature — `projects` + `villas` are mig 0000 (founding tables), then layers of dev-OS extensions (migs 0034, 0045, 0058, 0059) covering project setup, lifecycle, and profitability+cashflow. **Cross-cabinet anchor** — like bookings is for Mgmt OS, projects is for Dev OS: every Dev cabinet's primary FK.

---

## Section-by-section

### Project list + detail

| Element | Status |
|---|---|
| Project CRUD via `actions.ts` (7.1kb) + `form.tsx` (6.6kb) | ✅ shipped |
| Project list reads via `services.ts` (3.8kb) | ✅ shipped |
| Project health badge via `health.ts` | ✅ pure fn shipped |
| Schema validation via `schema.ts` + `types.ts` | ✅ shipped |

### Cross-domain surfaces (per 32-file route tree)

| Element | Status |
|---|---|
| Project dashboard | ✅ likely shipped |
| Per-project sub-cabinets (cashflow / BOQ / vendors / drawings / site reports) | ✅ likely shipped via cross-route links |
| Project lifecycle FSM (lead → discovery → design → build → handover → operate) | ✅ schema via mig 0058 |
| Project setup wizard | ✅ mig 0045 |

### Health scoring

| Element | Status |
|---|---|
| `health.ts` (2.7kb) — signals likely include: schedule variance, budget burn, RFI count, defect rate, vendor performance | ✅ pure fn |
| Health badge surfacing in lists + detail | 🟡 verify component |
| Threshold tuning | 🟡 likely hard-coded; consider per-org tunable in v2 |

### Profitability + cashflow mat view

| Element | Status |
|---|---|
| Materialized view per mig 0059 (profitability + cashflow) | ✅ schema |
| Surface in project detail | 🟡 verify route |

---

## Cross-cutting

### Agents

No dedicated `_repo/src/features/ai-agents/projects/`. Project-level intelligence likely lives in cabinets that own the relevant data (CFO for finance, BOQ for quantity surveys, etc).

### Cross-cabinet dependencies

| Cabinet | Direction |
|---|---|
| 13 CFO | reads project for revenue/cost roll-ups |
| 14 BOQ + QS | quantity sheets per project |
| 15 Procurement | POs per project |
| 09 Site supervisor | site reports per project |
| 11 Investors | commitments + drawdowns per project |
| 10 Sales | leads filtered by project |

### Mobile parity

Per `mobile-pass-dev-p1.html` — to verify.

---

## Recommended additions (prioritized)

### 🔥 P0 — none

### ⭐ P1

1. **Verify components + routes imports** — 10 components + 32 routes in repo.
2. **Project-supervisor copilot** (parallel to concierge_handoff) — cross-project attention ranking; likely worth adding.
3. **Refresh schedule for profitability mat view** — every N min? on-write triggers? Verify.

### 💭 P2

4. **Per-org health weights** — currently likely hard-coded.

---

## Open questions for product

- **Project lifecycle stages** — mig 0058 covers the full cycle but the design copy may pin specific stages. Confirm alignment.
- **Health signals weighting** — derive-tier and retention-risk patterns suggest pure-fn approach; confirm health.ts is similar.
- **Mat view refresh strategy** — performance vs freshness tradeoff for cashflow.
