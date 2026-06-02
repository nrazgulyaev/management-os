# Management OS · Portfolio (cluster) — pixel build prompt

> **Read `../00-MASTER.md` first.** It carries the token tables, primitive map, hard rules and the
> pixel-verify loop. This file is ONLY the orientation for this one design. Do one cabinet per session.

## Source of truth
- **Mockup (pixel target):** `cabinets/mgmt-p3/Portfolio.html`
- Open it in the design project. It is **self-documenting**: read its in-page
  **`anchor-nav`** (the `↓ …` chips = the sub-screens) and the **"↓ For Claude Code" (`#spec`)**
  block at the bottom — the mockup already specifies columns, KPIs, copy, states and data shape.
  Treat `#spec` as the functional brief; treat the rendered pixels as the visual target.
- **Mobile target:** `mobile-pass-mgmt-p3-full.html`

## Product / palette
`[data-product="management"]` — Newsreader display, Inter body, JetBrains Mono. Accent **terra `#C4583C`**, inverted band = forest `#1F3A33`.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/dashboard/villas`
- `/dashboard/projects`
- `/dashboard/shares`

**Repo status:** ✅ all built. Cluster.

## Sub-screens to deliver (pixel-match each)
- **Villas**
- **Projects**
- **Shares**

## Primitive mapping — screen-specific (on top of MASTER §3)
Villa cards + detail; shares = equity table.

## Gotchas
- 3 routes in one mockup.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.

