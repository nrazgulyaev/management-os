# Development OS · Procurement + Vendors — pixel build prompt

> **Read `../00-MASTER.md` first.** Token tables, primitive map, hard rules, pixel-verify loop live there.
> This file is ONLY the orientation for this one design. Do one cabinet per session.

## Source of truth
- **Mockup (pixel target):** `cabinets/dev-p1/procurement.html`
- Open it in the design project. It is **self-documenting**: read its in-page **`anchor-nav`**
  (`↓ …` chips = sub-screens) and the **"↓ For Claude Code" (`#spec`)** block — it already specifies
  columns, KPIs, copy, states, data shape. `#spec` = functional brief; rendered pixels = visual target.
- **Mobile target:** `mobile-pass-dev-p1.html`

## Product / palette
`[data-product="development"]` — Space Grotesk display (500), Inter body, IBM Plex Mono. Accent **amber `#FF6B35`**, inverted band = carbon `#14130E`.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/development-os/procurement`
- `/development-os/procurement/purchase-requests`
- `/development-os/procurement/purchase-requests/[code]`
- `/development-os/procurement/quotation-comparison`
- `/development-os/procurement/quotation-comparison/[requestCode]`
- `/development-os/procurement/quotations`

**Repo status:** ✅ built deep — purchase-requests + quotation-comparison(+matrix-island 11.5kb) + quotations(import wizard 23kb). Redesign.

## Sub-screens to deliver (pixel-match each)
- **RFQ list**
- **Quote comparison (matrix)**
- **Vendor scorecard**

## Primitive mapping — screen-specific (on top of MASTER §3)
Quote comparison = matrix table (the "matrix-island") with per-line winner highlight · vendor scorecard = `vendor_scores` driven card · import wizard = multi-step.

## Gotchas
- `vendor_scores` table exists (drizzle 0113) — wire the scorecard.
- Matrix-island is the centerpiece — match its column/winner styling exactly.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] Quote-comparison matrix matches mockup winner highlighting
