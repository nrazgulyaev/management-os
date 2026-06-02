# Feature gap · 16 · Owner · Home (Owner P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built. Route `/owner` → `page.tsx` **15.9kb** (full live owner home). Owner portal feature layer: `owner-portal/`, `owner-intelligence/`, `owner-bookings/`. **Discard "not built".** Surviving: design↔code deltas — verify against the owner-portal feature layer + drizzle.

**Design sources**
- Desktop: `cabinets/owner-p1/01-home.html`
- Phase: 2.3 owner-01 · commit `cf6f093`

**Repo paths**
- Feature data: `src/features/owner-portal/` (10 files) + `src/features/owner-intelligence/` (7 files) + `src/features/owner-bookings/` (6 files) — three folders share the cabinet surface
- Components: `src/components/owner-portal/` — 27 files imported (rich)
- Routes: `src/app/(owner)/owner/page.tsx` (15.9kb — the largest single owner page)
- Schema · uses owners + ownership_shares (mig 0000), owner stays (mig 0012), owner statements (mig 0002), owner-portal projection tables (mig 0030)

## TL;DR

Owner Home is the **owner-portal hub** — 15.9kb in `page.tsx` alone, backed by 3 separate feature folders (owner-portal master, owner-intelligence for AI surfaces, owner-bookings for stay-management). 27 components imported. Uses the **owner-portal projection tables** pattern (mig 0030: owners read denormalised projections, not raw transactional tables — the redaction seam). Cabinet design promises 5 primitives + getOwnerHome + narrative density CSS. CSS scoped under `[data-product="owner"]` per CLAUDE.md (uses Mgmt palette + Newsreader display font verbatim). **0 P0 if owner-portal projection tables are populated by triggers/agents**; otherwise needs population layer.

---

## Section-by-section

### Home greeting + insights
| Element | Status |
|---|---|
| `owner-greeting.tsx` shipped | ✅ |
| `insight-card.tsx`, `agent-recommend-banner.tsx`, `dismiss-insight-modal.tsx` shipped | ✅ |
| Owner-intelligence agent for insights | 🟡 verify (`src/features/owner-intelligence/`) |

### Hero tiles + KPIs
| Element | Status |
|---|---|
| `hero-tile.tsx`, `num-kpi.tsx`, `net-hero.tsx`, `occupancy-bars.tsx` shipped | ✅ |

### Quick actions
| Element | Status |
|---|---|
| `quick-action-grid.tsx` shipped | ✅ |

### Cross-cabinet entry points
| Element | Status |
|---|---|
| Links to statements (17), villas (18), calendar (19), inbox (20), documents (21), settings (22) | ✅ via routes |

---

## Cross-cutting

### Agents
- `owner-intelligence` agent (folder exists) — likely powers insight cards
- `concierge-handoff` copilot reads owner-relevant signals

### Mobile parity
Per `mobile-pass-owner-p1.html` — gold-standard for narrative density (per CLAUDE.md).

---

## Recommended additions

### 🔥 P0 — none if projections populated

### ⭐ P1
1. **Verify owner-portal projection tables are populated** — mig 0030 schema exists, confirm trigger/agent layer fills them.
2. **owner-intelligence agent details** — confirm scope (insight ranking, anomaly detection, narrative summary).

### 💭 P2
3. **Insight dismissal feedback loop** — learn from owner dismissals.

## Open questions
- **Projection refresh cadence** — real-time triggers or scheduled?
- **owner-intelligence vs concierge-handoff** — separate agents or same?
