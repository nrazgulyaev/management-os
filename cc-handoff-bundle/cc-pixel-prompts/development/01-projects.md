# Development OS · Projects + PM — pixel build prompt

> **Read `../00-MASTER.md` first.** Token tables, primitive map, hard rules, pixel-verify loop live there.
> This file is ONLY the orientation for this one design. Do one cabinet per session.

## Source of truth
- **Mockup (pixel target):** `cabinets/dev-p1/projects.html`
- Open it in the design project. It is **self-documenting**: read its in-page **`anchor-nav`**
  (`↓ …` chips = sub-screens) and the **"↓ For Claude Code" (`#spec`)** block — it already specifies
  columns, KPIs, copy, states, data shape. `#spec` = functional brief; rendered pixels = visual target.
- **Mobile target:** `mobile-pass-dev-p1.html`

## Product / palette
`[data-product="development"]` — Space Grotesk display (500), Inter body, IBM Plex Mono. Accent **amber `#FF6B35`**, inverted band = carbon `#14130E`.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/development-os/projects`
- `/development-os/projects/[slug]`
- `/development-os/projects/[slug]/milestones`
- `/development-os/projects/[slug]/schedule`
- `/development-os/projects/[slug]/risks`
- `/development-os/projects/[slug]/waterfall`
- `/development-os/projects/[slug]/work-packages`
- `/development-os/projects/[slug]/change-orders`
- `/development-os/projects/[slug]/permits`
- `/development-os/projects/[slug]/decisions`

**Repo status:** ✅ built **extremely deep** — `[slug]/page.tsx` 41.7kb + 32 sub-pages (boq/change-orders/decisions/land/milestones/permits/risks/schedule/waterfall/work-packages). Redesign, do NOT rebuild the data layer.

## Sub-screens to deliver (pixel-match each)
- **List**
- **Project detail (deep hub)**
- **Milestones**
- **New project**

## Primitive mapping — screen-specific (on top of MASTER §3)
Project detail = tabbed hub (`.detail-tabs`) · milestones = `PipelineBoard`/timeline · risks heatmap = grid · schedule lookahead = gantt-ish rows · waterfall simulator = `WaterfallChart`.

## Gotchas
- `[slug]` detail is 41.7kb with ~10 tabs — match each tab's layout to the mockup; do not collapse tabs.
- Schedule + risks each have sub-views (lookahead/tasks, heatmap) — preserve.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] Each project-detail tab matches mockup
- [ ] Waterfall simulator uses WaterfallChart primitive
