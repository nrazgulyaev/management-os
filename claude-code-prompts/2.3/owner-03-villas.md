# Task — Phase 2.3 PR 3 — Owner · Villas (read-only profile)

**Reference doc:** `_handoff/cabinets/owner-p1/03-villas.html`

## Files

ROUTES:
- `src/app/(owner-portal)/owner/villas/page.tsx` · list (only when owner has 2+ villas; otherwise redirect to detail)
- `src/app/(owner-portal)/owner/villas/[id]/page.tsx` · detail

PRIMITIVES:
- `src/components/owner-portal/villa-hero.tsx` · 2-col photo + body with amenity badges + KPI strip
- `src/components/owner-portal/photo-grid.tsx` · 4-col aspect-ratio grid, click → lightbox
- `src/components/owner-portal/occupancy-bars.tsx` · 6-bar chart, terra fill
- `src/components/owner-portal/maintenance-log.tsx` · read-only list

DATA:
- `src/features/owner-portal/get-villa.ts` · server fn validates ownership; returns `{ villa, photos, ytdStats, monthlyStats, recentMaintenance }`

PHOTO PERMISSIONS:
- Existing villa photos table; Owner sees only `visible_to_owner=true` rows
- Hidden photos (work-in-progress shots) stay Mgmt-only

## Validation

- Villa hero with photo + amenity badges renders
- 6-month occupancy bars chart renders correctly (heights match data)
- Maintenance log shows 3 most-recent entries; "owner-visible" filter respected
- Click photo → lightbox · ESC closes
- Mobile: hero stacks vertical · photo grid 2-col

## Commit

`phase-2.3(owner-villas): list + detail with hero/gallery/occupancy/maintenance · 4 primitives`
