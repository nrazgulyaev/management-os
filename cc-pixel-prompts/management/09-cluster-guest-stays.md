# Management OS · Guest Stays (cluster) — pixel build prompt

> **Read `../00-MASTER.md` first.** It carries the token tables, primitive map, hard rules and the
> pixel-verify loop. This file is ONLY the orientation for this one design. Do one cabinet per session.

## Source of truth
- **Mockup (pixel target):** `cabinets/mgmt-p3/Guest Stays.html`
- Open it in the design project. It is **self-documenting**: read its in-page
  **`anchor-nav`** (the `↓ …` chips = the sub-screens) and the **"↓ For Claude Code" (`#spec`)**
  block at the bottom — the mockup already specifies columns, KPIs, copy, states and data shape.
  Treat `#spec` as the functional brief; treat the rendered pixels as the visual target.
- **Mobile target:** `mobile-pass-mgmt-p3-full.html`

## Product / palette
`[data-product="management"]` — Newsreader display, Inter body, JetBrains Mono. Accent **terra `#C4583C`**, inverted band = forest `#1F3A33`.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/dashboard/guest-stays`
- `/dashboard/guest-services`
- `/dashboard/guest-journey`
- `/dashboard/guest-ai`
- `/dashboard/guests`

**Repo status:** ✅ all built. Cluster of 4 cabinets — one file, several routes. Redesign each.

## Sub-screens to deliver (pixel-match each)
- **Guest stays**
- **Guest services**
- **Guest journey**
- **Guest AI**

## Primitive mapping — screen-specific (on top of MASTER §3)
Each cabinet = list/detail via `<ListPage>` + `Detail*`. Journey = timeline primitive.

## Gotchas
- One mockup covers 4 routes — ship as 4 page redesigns, not one mega-page.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.

