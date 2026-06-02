# Management OS · Front office — pixel build prompt

> **Read `../00-MASTER.md` first.** It carries the token tables, primitive map, hard rules and the
> pixel-verify loop. This file is ONLY the orientation for this one design. Do one cabinet per session.

## Source of truth
- **Mockup (pixel target):** `cabinets/mgmt-p2/front-office.html`
- Open it in the design project. It is **self-documenting**: read its in-page
  **`anchor-nav`** (the `↓ …` chips = the sub-screens) and the **"↓ For Claude Code" (`#spec`)**
  block at the bottom — the mockup already specifies columns, KPIs, copy, states and data shape.
  Treat `#spec` as the functional brief; treat the rendered pixels as the visual target.
- **Mobile target:** `mobile-pass-2.4-cabinets.html`

## Product / palette
`[data-product="management"]` — Newsreader display, Inter body, JetBrains Mono. Accent **terra `#C4583C`**, inverted band = forest `#1F3A33`.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/dashboard/front-office`
- `/dashboard/front-office/arrivals`
- `/dashboard/front-office/departures`
- `/dashboard/front-office/in-house`
- `/dashboard/front-office/readiness`
- `/dashboard/front-office/requests`

**Repo status:** ✅ built deep — `/dashboard/front-office` 17.4kb + arrivals/departures/in-house/readiness/requests. Redesign.

## Sub-screens to deliver (pixel-match each)
- Read the mockup's `anchor-nav` row — each `↓ …` link is a sub-screen you must deliver.

## Primitive mapping — screen-specific (on top of MASTER §3)
4-step check-in FSM as a stepper · room-board = card grid · tax-export gate = guarded action.

## Gotchas
- Real agents: `front_office_copilot`, `housekeeping_scheduler`. `visa-watcher` is fiction.
- Tax-export gate blocks export until conditions met — preserve the gate.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] Check-in stepper states match mockup
