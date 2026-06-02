# Mobile · Mobile passes (9 files) — pixel build prompt

> **Read `../00-MASTER.md` first.** Token tables, primitive map, hard rules, pixel-verify loop live there.
> This file is ONLY the orientation for this one design.

## Source of truth
- **Mockup (pixel target):** `mobile-pass-mgmt-p1.html`
- Open it in the design project. Read its in-page **`anchor-nav`** (`↓ …` chips = sub-screens) and the
  **"↓ For Claude Code" (`#spec`)** block if present — it specifies columns, KPIs, copy, states, data shape.
- **Mobile target:** `(these ARE the mobile targets)`

## Product / palette
`[data-product="(all)"]` — Per the design rules, **mobile is first-class**. These 9 files are the phone-width target for every cabinet at ≤900px (sidebar → `<MobileTabbar>`) and ≤600px.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `(reference — applies to every cabinet route on phone widths)`

**Repo status:** Each cabinet redesign must pass its corresponding mobile pass.

## Sub-screens to deliver (pixel-match each)
- **mobile-pass-mgmt-p1.html — Mgmt core**
- **mobile-pass-dev-p1.html — Dev core**
- **mobile-pass-owner-p1.html — Owner (7)**
- **mobile-pass-2.4-cabinets.html — channels/pricing/front-office/concierge**
- **mobile-pass-2.4-primitives.html — 2.4 primitives**
- **mobile-pass-2.6-new-cabinets.html — new cabinets**
- **mobile-pass-2.6-2.7-clusters.html — auth + key P3 + platform**
- **mobile-pass-mgmt-p3-full.html — all 20 mgmt P3**
- **mobile-pass-dev-p3-full.html — all 16 dev P3**

## Primitive mapping — screen-specific (on top of MASTER §3)
`<MobileTabbar>` (HF-12 fixed) replaces the sidebar. `MGMT_PRIMARY_MOBILE_TABS` = /dashboard, /dashboard/bookings, /dashboard/guests, /dashboard/finance (+More sheet).

## Gotchas
- Do not treat mobile as an afterthought — each per-cabinet prompt names its mobile-pass file; match it.
- `.mobile-frame` is 360–390px; tabbar from chrome.css.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] Every cabinet passes its mobile-pass at 390px
