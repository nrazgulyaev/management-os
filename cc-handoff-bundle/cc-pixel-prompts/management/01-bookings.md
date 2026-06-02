# Management OS · Bookings — pixel build prompt

> **Read `../00-MASTER.md` first.** It carries the token tables, primitive map, hard rules and the
> pixel-verify loop. This file is ONLY the orientation for this one design. Do one cabinet per session.

## Source of truth
- **Mockup (pixel target):** `cabinets/mgmt-p1/bookings.html`
- Open it in the design project. It is **self-documenting**: read its in-page
  **`anchor-nav`** (the `↓ …` chips = the sub-screens) and the **"↓ For Claude Code" (`#spec`)**
  block at the bottom — the mockup already specifies columns, KPIs, copy, states and data shape.
  Treat `#spec` as the functional brief; treat the rendered pixels as the visual target.
- **Mobile target:** `mobile-pass-mgmt-p1.html`

## Product / palette
`[data-product="management"]` — Newsreader display, Inter body, JetBrains Mono. Accent **terra `#C4583C`**, inverted band = forest `#1F3A33`.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/dashboard/bookings`
- `/dashboard/bookings/[id]`
- `/dashboard/bookings/calendar`
- `/dashboard/bookings/new`
- `/dashboard/bookings/rates`
- `/dashboard/bookings/sync`

**Repo status:** ✅ built deep — `/dashboard/bookings` `page.tsx` 12.6kb + `[id]` 9kb. Phase 2.1 landed list+filter+modals+⌘K and 6 detail bricks. **Redesign + fill**, don't rebuild.

## Sub-screens to deliver (pixel-match each)
- **Today strip (arrivals/departures/in-house counts)**
- **List (channel-tagged rows, filter bar, ⌘K)**
- **Detail (`detail-shell` 1fr/280px, 6 bricks, charges, tabs)**
- **New booking flow**
- **Cancel flow (DestructiveConfirmModal)**

## Primitive mapping — screen-specific (on top of MASTER §3)
`<ListPage>`+`<FilterBar>`+`<FacetPanel>`+`<BulkBar>` for the list · `Detail*` bricks + `useDetailForm` + `<InlineEdit>` for detail · `<Modal>`/`<DestructiveConfirmModal>` for new/cancel · channel pill = `.chip` with channel color · `<CommandPalette>`.

## Gotchas
- Channels are Airbnb · Booking.com · Agoda · Direct + travel-agent intake — each gets a consistent chip color; define once.
- `arrival-prep` agent in old design docs is **fiction** — use the real daily-digest pattern.
- Every booking row maps downstream to a Finance/Statements line — keep ids stable.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] Channel chip colors consistent with the mockup
- [ ] Today strip counts wired to live arrivals/departures
