# Platform Admin · Platform Console — pixel build prompt

> **Read `../00-MASTER.md` first.** Token tables, primitive map, hard rules, pixel-verify loop live there.
> This file is ONLY the orientation for this one design.

## Source of truth
- **Mockup (pixel target):** `cabinets/super-admin/Platform Console.html`
- Open it in the design project. Read its in-page **`anchor-nav`** (`↓ …` chips = sub-screens) and the
  **"↓ For Claude Code" (`#spec`)** block if present — it specifies columns, KPIs, copy, states, data shape.
- **Mobile target:** `mobile-pass-2.6-2.7-clusters.html`

## Product / palette
`[data-product="(platform — dark cool-blue)"]` — Dark operator console. NOT a `[data-product]` palette — uses the platform dark theme (cool-blue accent `#5B9DFF`). Aligned to real `/platform/*` routes.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/platform`
- `/platform/organizations`
- `/platform/revenue`
- `/platform/usage`
- `/platform/ai-agents`
- `/platform/audit`

**Repo status:** Phase 2.5 · primary. Verify which `/platform/*` routes exist in main before building.

## Sub-screens to deliver (pixel-match each)
- **Organizations**
- **Revenue**
- **Usage**
- **AI agents**
- **Audit log**

## Primitive mapping — screen-specific (on top of MASTER §3)
Dark-theme tables + KPI tiles + audit log dense table. This is a distinct theme — define its tokens once; do not reuse mgmt/dev card recipes verbatim.

## Gotchas
- The earlier 10-screen super-admin draft (`cabinets/super-admin/01..10`, `hub.html`) is **superseded** by this Console — treat those as reference only.
- Confirm `/platform/*` routes against ground-truth before wiring.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] Console matches dark theme of mockup
- [ ] Audit log table dense + monospace
