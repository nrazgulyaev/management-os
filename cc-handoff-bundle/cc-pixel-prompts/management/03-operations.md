# Management OS · Operations — pixel build prompt

> **Read `../00-MASTER.md` first.** It carries the token tables, primitive map, hard rules and the
> pixel-verify loop. This file is ONLY the orientation for this one design. Do one cabinet per session.

## Source of truth
- **Mockup (pixel target):** `cabinets/mgmt-p1/operations.html`
- Open it in the design project. It is **self-documenting**: read its in-page
  **`anchor-nav`** (the `↓ …` chips = the sub-screens) and the **"↓ For Claude Code" (`#spec`)**
  block at the bottom — the mockup already specifies columns, KPIs, copy, states and data shape.
  Treat `#spec` as the functional brief; treat the rendered pixels as the visual target.
- **Mobile target:** `mobile-pass-mgmt-p1.html`

## Product / palette
`[data-product="management"]` — Newsreader display, Inter body, JetBrains Mono. Accent **terra `#C4583C`**, inverted band = forest `#1F3A33`.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/dashboard/operations`
- `/dashboard/operations/tasks`
- `/dashboard/operations/housekeeping`
- `/dashboard/operations/maintenance`
- `/dashboard/operations/preventive`
- `/dashboard/operations/service-requests`
- `/dashboard/operations/damage-reports`
- `/dashboard/operations/turnovers`
- `/dashboard/maintenance-intelligence`

**Repo status:** ✅ built very deep — `/dashboard/operations` 17 pages + `/dashboard/maintenance-intelligence` 8 pages. Redesign.

## Sub-screens to deliver (pixel-match each)
- **Today (command-center hero)**
- **Maintenance queue**
- **Housekeeping board**
- **SLA model**

## Primitive mapping — screen-specific (on top of MASTER §3)
Today hero = `.card-inverted` band + KPI row · queues = `<ListPage>` · board = column layout of `.card`s · SLA = badge + age display.

## Gotchas
- **Severity vocab conflict:** code uses `low/normal/high/urgent`; design used `P0–P3`. Pick the code vocab and map labels — do NOT introduce P0–P3 into code.
- Per-ticket SLA targets + breach is a **real surviving gap** (today it is age-only) — design shows targets; flag if backend lacks them.
- `maintenance-triage` / `turnover-allocator` agents are fiction — cabinet uses daily-digest.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] Severity labels map to low/normal/high/urgent
- [ ] SLA display matches mockup
