# Owner Portal · Calendar — pixel build prompt

> **Read `../00-MASTER.md` first.** Token tables, primitive map, hard rules, pixel-verify loop live there.
> This file is ONLY the orientation for this one design.

## Source of truth
- **Mockup (pixel target):** `cabinets/owner-p1/04-calendar.html`
- Open it in the design project. Read its in-page **`anchor-nav`** (`↓ …` chips = sub-screens) and the
  **"↓ For Claude Code" (`#spec`)** block if present — it specifies columns, KPIs, copy, states, data shape.
- **Mobile target:** `mobile-pass-owner-p1.html`

## Product / palette
`[data-product="owner"]` — Mgmt palette, **calmer density + bigger type** (`.section-heading h1` 44px, `.kpi-narrative` Newsreader 44px, airy `table.guests` 18/22 cells). Never invent owner colors.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/owner/calendar`
- `/owner/preferences/calendar`

**Repo status:** ✅ `/owner/calendar` 14.4kb + `/owner/preferences/calendar`. Redesign.

## Sub-screens to deliver (pixel-match each)
- Read the mockup's `anchor-nav` row — each `↓ …` link is a sub-screen you must deliver.

## Primitive mapping — screen-specific (on top of MASTER §3)
`MonthCalendar` + `PipelineList` + `PersonalStayModal` · personal-stay quota display.

## Gotchas
- Personal-stay quota is a real rule — show remaining quota.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.

