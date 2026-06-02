# Task — Phase 2.3 PR 1 — Owner · Home (tonality anchor)

**Reference doc:** `_handoff/cabinets/owner-p1/01-home.html`

First PR — sets up the entire Owner Portal layout group. Critical foundations.

## Files

LAYOUT GROUP (new):
- `src/app/(owner-portal)/layout.tsx` · sets `data-product="management"` + `data-density="narrative"` on <html> · gates by `role: "owner"` middleware
- `src/app/(owner-portal)/owner/layout.tsx` · per-owner shell (sidebar nav for 7 cabinets · mobile = top hamburger)
- `src/middleware.ts` extension · ensure `owner.arconique.com` host triggers owner role gate

ROUTE:
- `src/app/(owner-portal)/owner/page.tsx` · home/dashboard

PRIMITIVES:
- `src/components/owner-portal/owner-greeting.tsx` · big greeting + narrative paragraph
- `src/components/owner-portal/hero-tile.tsx` · `<HeroTile variant="dark"|"flat" label value sub foot? />`
- `src/components/owner-portal/villa-card.tsx` · `<VillaCard villa orientation="row"|"col" />` (also used in /owner/villas list)
- `src/components/owner-portal/upcoming-list.tsx` · simplified booking list
- `src/components/owner-portal/quick-action-grid.tsx` · 4-up cards

DATA:
- `src/features/owner-portal/get-home.ts` · server fn `getOwnerHome(owner_id)` returns `{ ytdNet, pendingStatement?, nextStatementDate, villas, upcoming, recentActivity }` · cached 5min

CSS:
- New section in `src/styles/components.css` — narrative typography overrides for `[data-density="narrative"]`: `.greet` (48px display), `.owner-narr` (18px display), `.hero-tile` styles
- Mobile breakpoints in `src/styles/mobile.css`

## Validation

- Visit `owner.arconique.com` (or local equivalent) as owner user → home page renders with greeting + 3 hero tiles + villa card + upcoming + quick actions
- Pending statement card surfaces with gold border when owner_state="pending" exists
- Resize to 390px → mobile layout: stacked hero, col villa card, 2-col quick actions
- Non-owner user trying to access `/owner` → 403 / redirect to Mgmt portal

## Commit

`phase-2.3(owner-home): owner-portal layout group + home dashboard + 5 primitives + middleware gating`
