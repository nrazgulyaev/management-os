# Development OS · CFO / Finance — pixel build prompt

> **Read `../00-MASTER.md` first.** Token tables, primitive map, hard rules, pixel-verify loop live there.
> This file is ONLY the orientation for this one design. Do one cabinet per session.

## Source of truth
- **Mockup (pixel target):** `cabinets/dev-p1/cfo.html`
- Open it in the design project. It is **self-documenting**: read its in-page **`anchor-nav`**
  (`↓ …` chips = sub-screens) and the **"↓ For Claude Code" (`#spec`)** block — it already specifies
  columns, KPIs, copy, states, data shape. `#spec` = functional brief; rendered pixels = visual target.
- **Mobile target:** `mobile-pass-dev-p1.html`

## Product / palette
`[data-product="development"]` — Space Grotesk display (500), Inter body, IBM Plex Mono. Accent **amber `#FF6B35`**, inverted band = carbon `#14130E`.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/development-os/cfo`
- `/development-os/cfo/capital-calls`
- `/development-os/cfo/capital-calls/[id]`
- `/development-os/cfo/cashflow`
- `/development-os/cfo/distributions`
- `/development-os/finance`
- `/development-os/profitability`
- `/development-os/cashflow-forecast`
- `/development-os/banking`

**Repo status:** ✅ built — `/development-os/cfo` 11.6kb + capital-calls/cashflow/distributions, plus finance/profitability/cashflow-forecast/banking. Redesign.

## Sub-screens to deliver (pixel-match each)
- Read the mockup's `anchor-nav` row — each `↓ …` link is a sub-screen you must deliver.

## Primitive mapping — screen-specific (on top of MASTER §3)
**`WaterfallChart`** for the distribution waterfall · P&L = `table.data` with `td.num` · cashflow = curve/area chart · KPI strip via `<Kpi>`.

## Gotchas
- Canonical waterfall calculator + XIRR are pure fns — render their output; never recompute in UI.
- Capital-call issuer issues pro-rata — show the issued ladder.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] WaterfallChart matches mockup tiers
