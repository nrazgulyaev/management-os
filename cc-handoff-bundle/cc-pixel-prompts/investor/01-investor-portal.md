# Investor Portal — pixel build prompt

> **Read `../00-MASTER.md` first** for the global contract (tokens, primitives-first, no inline styles,
> the pixel-verify loop). This file is the orientation for the LP-facing investor portal.

> ⚠️ **Scope note.** Per `CLAUDE.md`, `(investor-portal)` is **"Investor… NOT in current scope."** The
> repo already has **20 `(investor-portal)` pages** (capital, commitments, distributions, wallet,
> forecasts). This is distinct from the internal **Dev OS · Investors** cabinet
> (`/development-os/investors`, which the *developer* uses to manage LPs — already designed separately).
> This prompt is the **LP's own** portal. Confirm greenlight before building.

## Source of truth
- **Mockup (pixel target):** `Investor Portal.html` (project root)
- Desktop app, **1320px** design width, scaled-to-fit. Left sidebar + topbar shell.
- Scales for **both personas** (one portal): single-project partner *and* institutional multi-project LP.
  The topbar project-switcher ("Все проекты · 3") flips portfolio-roll-up vs single-project views.

## Product / palette — Dev OS engineering palette, investor-calm density
`[data-product="development"]` hues, but **calmer + bigger numbers** than the internal Dev OS:
```
Surfaces  bg #F1ECE0 · bg-2 #F8F4EA · panel #FFFFFF
Ink       #14130E / #3D3B33 / #6E6B5E / #95917F · carbon #14130E
Brand     amber #FF6B35 (accent) · amber-deep #D8541F · steel #3D5A7A · lime #C9DC4A
Lines     #E5DECC / #D8CFB7 / soft #ECE6D5
Radii     card 14 · card-lg 18 · hero 22 · pill 999
Type      Space Grotesk (display) · Inter (body) · IBM Plex Mono (numbers — tabular)
```
Decide whether this is a new `[data-product="investor"]` scope or reuses development tokens. Don't fork
the palette — reuse the dev hues.

## Sub-screens to deliver (7 — pixel-match each)
- **Overview / Сводка** — TWO variants in the mockup (toggle top-right):
  - **A · portfolio command** — 5-KPI row (Committed/Called/Distributed/Net IRR+MOIC/NAV), distribution
    **waterfall**, capital-deployment bars, next-capital-call alert, recent activity, IRR forecast curve.
  - **B · per-project narrative** — dark portfolio-totals strip + one rich card per project
    (committed/value/IRR/MOIC + deployment progress + status badge).
  - Ship the picked one (or A/B both). Don't merge.
- **Capital calls** — outstanding-call alert + history table + call-detail pro-rata breakdown + pay/wire flow.
- **Distributions** — distribution **waterfall** (return of capital → pref 8% → profit split → GP carry
  20%) + history table + next-distribution estimate.
- **Commitments** — totals KPIs + per-project commitments table (committed/called/remaining) + SPV structure + ownership %.
- **Forecasts** — XIRR curve (actual + dashed projection) + exit scenarios (upside/base/downside) + assumptions.
- **Documents** — grouped (agreements / reports / tax) doc rows with download.
- **Wallet** — available-to-withdraw balance + withdraw flow + payout method (2FA-gated edit) + movements ledger.

## Charts / primitives (map to repo)
- **WaterfallChart** (Phase 2.4 primitive — `ds-2.4-primitives.html`) drives the distribution waterfall.
  The internal Investors cabinet already uses it — **reuse, don't re-draw**.
- XIRR curve = a small area+line chart; the canonical **XIRR + waterfall pure fns already exist** in
  `src/features/investors/*` (waterfall/irr/capital-call). **Render their output — never recompute in UI.**
- Capital-call pro-rata = the existing **capital-call issuer** (pro-rata). `capital_calls` +
  `capital_call_allocations` tables exist (drizzle 0113) — bind to them.
- KPI tiles = `<Kpi>`; tables = `table.data` with tabular `td.num`; badges = `<HandoffBadge>` variants.

## Repo wiring (when greenlit)
- Real agent: **`investor_copilot`** (agent 0098) + `investor_relations` (mig 0062). Use these, not invented names.
- The LP portal reads the *same* capital-account / distribution data the Dev OS Investors cabinet writes —
  keep the numbers consistent across both surfaces (single source).
- Wallet payout edit is **2FA-gated** (mirror the Owner Portal settings pattern).

## Gotchas
- **Investor-calm, not ops-dense.** Bigger Space Grotesk numbers, more whitespace than internal Dev OS.
- All money is **tabular-figures monospace**, right-aligned in tables.
- Both personas share one layout — the project-switcher state drives roll-up vs single-project; don't build two portals.

## Acceptance (in addition to MASTER §7)
- [ ] All 7 screens match the mockup at **1320px**; chosen overview variant exact.
- [ ] WaterfallChart + XIRR curve reuse the existing primitives/pure-fns (no recompute in UI).
- [ ] Capital-call pro-rata bound to `capital_calls`/`capital_call_allocations`.
- [ ] Numbers reconcile with the Dev OS Investors cabinet (single source).
- [ ] Wallet payout edit 2FA-gated; uses `investor_copilot` for any assistant UI.
