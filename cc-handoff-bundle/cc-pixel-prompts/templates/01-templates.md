# Templates · Universal templates (8) — pixel build prompt

> **Read `../00-MASTER.md` first.** Token tables, primitive map, hard rules, pixel-verify loop live there.
> This file is ONLY the orientation for this one design.

## Source of truth
- **Mockup (pixel target):** `templates/index.html`
- Open it in the design project. Read its in-page **`anchor-nav`** (`↓ …` chips = sub-screens) and the
  **"↓ For Claude Code" (`#spec`)** block if present — it specifies columns, KPIs, copy, states, data shape.
- **Mobile target:** `mobile-pass-2.4-primitives.html`

## Product / palette
`[data-product="(mgmt + dev + owner)"]` — Phase 2.1 universal templates. These already landed as repo primitives — this folder is their pixel spec. Use when extending or composing.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `(reference — composed into every list/detail/modal/AI page)`

**Repo status:** Phase 2.1 done. Primitives in `src/components/{ui,dashboard,ai-agents}/*`. Job: keep pixel-synced.

## Sub-screens to deliver (pixel-match each)
- **detail-page.html → `Detail*` bricks**
- **list-filter.html → `ListPage`/`FilterBar`/`FacetPanel`/`BulkBar`**
- **modal.html → `Modal`/`ConfirmModal`/`DestructiveConfirmModal`**
- **pagination.html → `Pager*`**
- **empty-state.html → `EmptyState` (5 variants)**
- **cmd-k.html → `CommandPalette`**
- **ai-agent.html → `Agent*`**
- **mobile-tabbar.html → `MobileTabbar`**

## Primitive mapping — screen-specific (on top of MASTER §3)
Each template = one repo primitive family. Every cabinet builds on these — never re-implement.

## Gotchas
- If a cabinet needs a template variant that does not exist, extend the template primitive, not the page.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] Each template primitive matches its mockup
