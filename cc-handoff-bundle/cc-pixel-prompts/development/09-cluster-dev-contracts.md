# Development OS · Dev Contracts (cluster) — pixel build prompt

> **Read `../00-MASTER.md` first.** Token tables, primitive map, hard rules, pixel-verify loop live there.
> This file is ONLY the orientation for this one design. Do one cabinet per session.

## Source of truth
- **Mockup (pixel target):** `cabinets/dev-p3/Dev Contracts.html`
- Open it in the design project. It is **self-documenting**: read its in-page **`anchor-nav`**
  (`↓ …` chips = sub-screens) and the **"↓ For Claude Code" (`#spec`)** block — it already specifies
  columns, KPIs, copy, states, data shape. `#spec` = functional brief; rendered pixels = visual target.
- **Mobile target:** `mobile-pass-dev-p3-full.html`

## Product / palette
`[data-product="development"]` — Space Grotesk display (500), Inter body, IBM Plex Mono. Accent **amber `#FF6B35`**, inverted band = carbon `#14130E`.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/development-os/contracts`
- `/development-os/invoices`
- `/development-os/discounts`
- `/development-os/commitments`

**Repo status:** ✅ all built. Cluster.

## Sub-screens to deliver (pixel-match each)
- **Contracts**
- **Invoices**
- **Discounts**
- **Commitments**

## Primitive mapping — screen-specific (on top of MASTER §3)
Document/contract rows + invoice tables + commitment ladder.

## Gotchas
- 4 routes in one mockup.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.

