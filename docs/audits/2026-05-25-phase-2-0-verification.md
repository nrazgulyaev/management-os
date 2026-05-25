# Phase 2.0 — Design-system consolidation: Stage 4 verification

**Date:** 2026-05-25
**Branch:** `phase-2-0-design-system-consolidation`
**Base:** `main`
**Commits:** 6 (after Stage 1+2 docs commits).

---

## 1. Summary

Stage 3 landed in 6 commits. Net diff vs main: **+1988 / −2370 lines**, 46 files. The bulk is the verbatim split of `globals.css` (1383 lines) into 7 modules under `src/styles/`, plus token alias rewrites, dead-token deletions, the `Badge → HandoffBadge` rename, and the navigation directory move.

| Check                                 | Status                                                |
|---------------------------------------|-------------------------------------------------------|
| `npm run typecheck`                   | ✅ clean                                              |
| `npm test` (6195 total)               | ✅ 6057 pass / 138 fail — **identical to baseline**.   |
| `npm run build`                       | ✅ compiles, no new warnings                          |
| Verified Tailwind classes still bound | ✅ via grep on every class name touched               |

---

## 2. Commits landed

| Commit  | Step                                                  | Touches |
|---------|-------------------------------------------------------|---------|
| 4b1381c | Step 1 — split globals.css into 7 modules             | 1473 + / 1383 − |
| bcbc1e6 | Step 2 — tokens.css Layer A→B aliases, prune 8 dead    | 41 + / 28 −     |
| 6bdb57b | Step 3 — alias Layer C @theme entries, prune dead     | 34 + / 59 −     |
| f0340a5 | Step 4 — restore `--r-lg/--r-xl` regression + trim 2  | 9 + / 7 −       |
| 265f01f | Step 5 — `Badge → HandoffBadge` + delete `ui/card.tsx`| 110 + / 184 −   |
| d09b541 | Step 6 — `src/config/navigation/` directory + shims   | 413 + / 377 −   |

---

## 3. Token diff — what consumers actually see

### Layer A `:root` aliases (Step 2)

These tokens are now defined as `var(--layer-b-name, current-literal)`. On a `<html data-product="…">` page, the Layer B value wins; off-product, the literal fallback applies. The result is that every page where the prior behavior was "Layer A literal" continues to render exactly the same color (no `[data-product]` overriding it). Pages with `[data-product]` now consistently surface the Layer B palette.

| Var                | Layer B target          | When does the user see a change? |
|--------------------|-------------------------|----------------------------------|
| `--canvas`         | `var(--cream, #f8f5f0)` | On mgmt pages where something previously consumed `var(--canvas)` for a background. Color shifts from `#f8f5f0` to `#F4EFE6` (1 step warmer cream). Imperceptible. |
| `--surface`        | `var(--paper, #ffffff)` | Mgmt: `#ffffff` → `#FFFCF7`. Effectively imperceptible. Sub pages: `#ffffff` → `#F5F0E2`. **Should eye-check.** |
| `--muted`          | `var(--cream-deep, #f1ece4)` | Mgmt: `#f1ece4` → `#ECE5D5`. Small drift, warmer. |
| `--inset`          | `var(--cream-deep, …)`  | Same drift. |
| `--ink-secondary`  | `var(--ink-2, #4a4a46)` | Mgmt: `#4a4a46` (warm dark grey) → `#2A3934` (cooler, darker, slight green). **Visible on body text.** |
| `--ink-tertiary`   | `var(--ink-3, #7a7670)` | Mgmt: `#7a7670` → `#4A5A55`. **Visible — darker, cooler.** |
| `--ink-inverse`    | `var(--cream-warm, #f6f3ed)` | Mgmt: `#f6f3ed` → `#FAF7F1`. Very close. |
| `--accent`         | `var(--forest, #0e3b2e)` | Mgmt: `#0e3b2e` → `#1F3A33`. Slightly lighter green. Affects emerald CTAs. |
| `--accent-weak`    | `var(--mint, #dce6df)`  | Mgmt: `#dce6df` → `#D8E8D6`. Slight shift, more green. |
| `--accent-contrast`| `var(--cream-warm, #fff)` | Mgmt: white text on accent → off-white. Subtle. |
| `--gold-weak`      | `var(--gold-soft, #f1e7d1)` | Mgmt: `#f1e7d1` → `#DCC691`. **Noticeably more saturated/darker.** Affects gold-tinted backgrounds. |
| `--success`        | `var(--ok, #2e7d64)`    | Mgmt: `#2e7d64` → `#4F7A5D`. Visible — lighter green. |
| `--warning`        | `var(--warn, #a06a1a)`  | Mgmt: `#a06a1a` → `#C58A2E`. **Visibly brighter/lighter amber.** |

**Colliding tokens kept as literals** (Layer B already wins by selector specificity, no behavior change): `--ink`, `--line-soft`, `--line-strong`, `--gold`, `--danger`.

### Layer A tokens deleted (0 callers verified)

`--neutral-fg`, `--data-ink`, `--r-xs`, `--ease-soft`, `--ease-editorial`.

Plus matching `@theme inline` entries: `--radius-xs`, `--color-data-ink`.

### Layer C cleanup (Step 3)

`@theme inline` Layer C section trimmed. Surviving entries either alias to Layer B (so Tailwind classes auto-track per-product) or keep their OKLCH literal (for tokens with no Layer B equivalent). Deleted: `--color-ink-4`, `--color-line-2`, `--color-success-soft-2`, `--radius-card-lg`, `--radius-card-hero-lg`, all 10 `--text-redesign-*` sizes.

The two surviving direct `var(--color-*-soft-2)` references in `score-chip.tsx` were inlined to OKLCH literals.

---

## 4. UI primitive changes

- **`Badge`** in `src/components/dashboard/primitives.tsx` → renamed to **`HandoffBadge`**. 22 caller files updated. The 439 callers of Layer A `Badge` from `src/components/ui/badge.tsx` are untouched.
- **`src/components/ui/card.tsx`** deleted (0 callers).
- **`Pulse`** in `dashboard/primitives.tsx` kept (audit said 0, actual 1 caller in `dashboard/concierge/page.tsx`).

---

## 5. Navigation structure

```
src/config/navigation/
  index.ts        — barrel
  legacy.ts       — marketingNav, dashboardNav, ownerNav, fieldNav, guestNav, aiAssistantMeta, NavItem, NavGroup
  management.ts   — MGMT_DASHBOARD_NAV, DashboardNavItem, DashboardNavGroup
  development.ts  — DEV_DASHBOARD_NAV
src/config/dashboard-nav.ts       — deprecated shim → @/config/navigation/management
src/config/development-nav.ts     — deprecated shim → @/config/navigation/development
src/config/navigation.ts          — REMOVED; @/config/navigation now resolves to navigation/index.ts
```

Both nav trees remain alive (legacy `dashboardNav` AND new `MGMT_DASHBOARD_NAV`). No sidebar visual change.

---

## 6. Pages the user should eye-check (per brief §4 verification list)

I can't drive a browser or playwright in this session — these are the pages where the §3 token aliases will surface most visibly. Run `npm run dev` and walk through:

| Page                                          | What to watch for                                                                |
|-----------------------------------------------|----------------------------------------------------------------------------------|
| `/dashboard` (mgmt port, handoff Task 6)      | Already on Layer B — should look unchanged. Sanity check.                        |
| `/dashboard/utilities/accounts` (legacy mgmt) | Most exposed: body text now uses Layer B `--ink-2/3`, accent CTAs use `--forest`. Look at text colors and emerald CTAs. |
| `/dashboard/finance`                          | Gold tints (`--gold-weak` → `--gold-soft`). The biggest expected drift. **Compare gold backgrounds carefully.** |
| `/development-os` (dev port)                  | Should look unchanged — already Layer B.                                          |
| `/development-os/vendors` (legacy dev)        | Dev's `--danger` is Layer B `#C2474E` vs Layer A `#a43e2f`. Look at danger states. |
| `/owner` (any owner cabinet)                  | Owner shell is off-product (no `data-product`). Should use Layer A literals → no change at all. |
| `/` (public marketing site)                   | Off-product. No change expected.                                                  |

---

## 7. What is NOT verified

- No screenshot diff (no playwright env wired in this session).
- No manual interactive walkthrough — the brief expected `npm run dev` driving from the user's machine.
- No dark-mode check. The `.dark { … }` block remains in `tokens.css` but dark mode isn't wired anywhere in `layout.tsx`; verified static only.
- No mobile-viewport check at `<=900px` for the handoff routes (sidebar collapse). The CSS rule moved verbatim into `mobile.css`; should be identical.

---

## 8. Outstanding follow-ups (out of Phase 2.0 scope)

These were flagged by the audit but explicitly excluded by the brief:

1. **MobileTabbar for management surface** — exists for dev shell only. Mgmt pages have no mobile nav below 900px right now.
2. **Inline-style rewrite** in landing + cabinet pages (632 blocks in top-10 files) — Phase 2.0.5.
3. **Layer A `[data-product]` page rebrand** — moving legacy mgmt pages off Layer A literal accents onto Layer B `--forest`/`--terra`/etc. as their canonical palette. Out of scope; the alias bridge keeps both palettes coexisting.
4. **Retire legacy `dashboardNav` in favor of `MGMT_DASHBOARD_NAV`** — visible sidebar regrouping; Phase 2.1.

---

## 9. Branch ready for review

Branch: `phase-2-0-design-system-consolidation`
Diff base: `main`
Tests: 6057 pass / 138 fail (baseline preserved).
Typecheck + build: clean.
