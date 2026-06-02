# Auth · Auth Suite — pixel build prompt

> **Read `../00-MASTER.md` first.** Token tables, primitive map, hard rules, pixel-verify loop live there.
> This file is ONLY the orientation for this one design.

## Source of truth
- **Mockup (pixel target):** `auth/Auth Suite.html`
- Open it in the design project. Read its in-page **`anchor-nav`** (`↓ …` chips = sub-screens) and the
  **"↓ For Claude Code" (`#spec`)** block if present — it specifies columns, KPIs, copy, states, data shape.
- **Mobile target:** `mobile-pass-2.6-2.7-clusters.html`

## Product / palette
`[data-product="(per-platform — see below)"]` — One suite, **6 platforms**, each with its own panel tone (warm · premium · editorial). The center auth card adapts per platform; the brand/side panel carries the platform identity.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`
- `/mfa`
- `/bootstrap (admin first-run)`

**Repo status:** Phase 2.5 · clickable. Maps to the `auth/` feature + route group. Verify real auth routes in main.

## Sub-screens to deliver (pixel-match each)
- **Sign-in (per platform)**
- **Sign-up**
- **Forgot password**
- **Reset password**
- **MFA verify**
- **Admin bootstrap**

## Primitive mapping — screen-specific (on top of MASTER §3)
Auth card (form primitives: `.field`/`.input`/`.btn-accent`) + platform side-panel · 3 tones via a tone token set. 6 platforms = Management · Owner · Development · Investor · Buyer · Platform.

## Gotchas
- Tone switcher (warm/premium/editorial) maps to platform — bake as a prop, not 6 copies.
- Investor/Buyer platforms are out of the broader build scope but their auth IS in scope.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] All 8 screen types render
- [ ] Per-platform tone switch works
