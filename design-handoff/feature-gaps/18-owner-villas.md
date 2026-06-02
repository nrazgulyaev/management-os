# Feature gap · 18 · Owner · Villas (Owner P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built deep. Route `/owner/villas`: `page.tsx` 4.6kb + `[id]/{calendar 10kb, health 8.7kb, revenue, timeline}`. **Discard "not built".** The per-villa health/timeline/revenue split the design proposed is already shipped. Surviving: design↔code deltas only.

**Design sources**
- Desktop: `cabinets/owner-p1/03-villas.html`
- Phase: 2.3 owner-03 · commit `a2e67fb`

**Repo paths**
- Routes: `src/app/(owner)/owner/villas/page.tsx` (4.6kb) + `villas/[id]/calendar/page.tsx` (10kb) + `villas/[id]/health/page.tsx` (8.7kb) + `villas/[id]/revenue/page.tsx` (3.2kb) + `villas/[id]/timeline/page.tsx` (3.4kb)
- Components: `src/components/owner-portal/` includes villa-hero, villa-card, villa-mini, health-pill, photo-grid
- Feature: `src/features/owner-portal/get-villa.ts` + `health-pure.ts` + `health-services.ts` + `health.ts`
- Schema · villas (mig 0000), villa_status_events (mig 0000), villa availability + readiness (mig 0011), villa coordinates (mig 0093)

## TL;DR

Owner Villas is **per-villa drill-in**: list → detail with 4 tabs (calendar 10kb, health 8.7kb, revenue 3.2kb, timeline 3.4kb). The health module has both pure + services + plain `.ts` files — strongest health-scoring discipline in the platform (parallel to projects cabinet 12 health.ts but with more layering: `health-pure.ts` for math, `health-services.ts` for DB reads, `health.ts` for the surface). Photo-grid and villa-hero handle the visual surface. **0 P0** if villa imagery storage is set up.

---

## Section-by-section

### Villa list
| Element | Status |
|---|---|
| `villas/page.tsx` (4.6kb) | ✅ |
| `villa-card.tsx`, `villa-mini.tsx` | ✅ |
| Health badge per villa | ✅ via `health-pill.tsx` |

### Villa detail · 4 tabs
| Element | Status |
|---|---|
| Calendar tab (10kb route) | ✅ |
| Health tab (8.7kb route) — likely incident summary + retention + utility usage | ✅ |
| Revenue tab (3.2kb) — per-villa revenue history | ✅ |
| Timeline tab (3.4kb) — villa lifecycle events | ✅ |

### Health composition
| Element | Status |
|---|---|
| `health-pure.ts` — math | ✅ pure |
| `health-services.ts` — DB | ✅ |
| `health.ts` — surface | ✅ |

### Maintenance log (`maintenance-log.tsx`)
| Element | Status |
|---|---|
| Per-villa maintenance history | ✅ via cross-cabinet to Operations |

---

## Recommended additions

### 🔥 P0 — none

### ⭐ P1
1. **Photo storage layer** — `photo-grid.tsx` shipped, verify S3-like backing.
2. **Revenue vs operating-cost overlay** — current revenue tab is revenue-only; owners often want net.
3. **GPS coordinates** — mig 0093 added; verify surface in villa hero.

### 💭 P2
4. **Compare-villas view** — multi-villa side-by-side for portfolio owners.

## Open questions
- **Health weights** — same algorithm as projects cabinet or different?
- **Timeline granularity** — every event or filtered?
