# Foundations · Design System — pixel build prompt

> **Read `../00-MASTER.md` first.** Token tables, primitive map, hard rules, pixel-verify loop live there.
> This file is ONLY the orientation for this one design.

## Source of truth
- **Mockup (pixel target):** `design-system.html`
- Open it in the design project. Read its in-page **`anchor-nav`** (`↓ …` chips = sub-screens) and the
  **"↓ For Claude Code" (`#spec`)** block if present — it specifies columns, KPIs, copy, states, data shape.
- **Mobile target:** `mobile-pass-2.4-primitives.html`

## Product / palette
`[data-product="(all three)"]` — This IS the system. The repo `src/styles/tokens.css` + `cabinets/chrome.css` primitives must match this screen **exactly** — it is the canonical reference for §2/§3 of the master.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `(not a route — the design-system reference itself)`

**Repo status:** Phase 2.0 foundation. Tokens already in repo (`src/styles/{tokens,typography,components,…}.css`). Job: keep them in sync with this screen.

## Sub-screens to deliver (pixel-match each)
- **Color**
- **Type**
- **Spacing/radii/shadow**
- **Buttons**
- **Cards**
- **Badges/chips**
- **KPI**
- **Tables**
- **Forms**
- **Shell (sidebar/topbar)**
- **Patterns**
- **Mobile**

## Primitive mapping — screen-specific (on top of MASTER §3)
Every primitive in MASTER §3 is specified here with exact values. When you add/extend a primitive, update BOTH the repo component and verify against this screen.

## Gotchas
- Do not drift token values from this screen. If a cabinet needs a value not here, add it here (Layer B) first, then to the repo.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] Repo tokens.css values == this screen
- [ ] Primitive class values == chrome.css
