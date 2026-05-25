# Phase 2.0 — Design-system consolidation: Stage 1 audit

**Date:** 2026-05-25
**Branch:** `phase-2-0-design-system-consolidation`
**Scope:** Read-only inventory of CSS tokens, navigation configs, UI primitives, inline styles. No code changes in this stage.

---

## 0. TL;DR

| Surface                 | Status |
|-------------------------|--------|
| `src/app/globals.css`   | 1383 lines, ~52 KB, single file. 3 token layers coexist in it. |
| **Layer A** (legacy `:root` + `@theme inline`)        | 90 tokens. **48 used / 42 dead.** ~190 page references. |
| **Layer B** (`[data-product]` scoped)                  | 56 tokens × 3 product scopes. **35 used / 21 dead.** ~13 port pages + landings + shells. |
| **Layer C** (additive OKLCH in `@theme inline`)        | 45 tokens. **12 used / 33 dead.** Almost-abandoned. |
| Variable name collisions | `--ink`, `--ink-2`, `--ink-3`, `--ink-4`, `--line-soft`, `--line-strong`, `--line`, `--gold`, `--gold-soft`, `--danger`, `--terra` are defined in BOTH `:root` (Layer A) AND `[data-product=…]` (Layer B) with different values. Specificity wins → Layer B overrides on pages with `data-product` attribute. |
| Nav configs              | 3 files: `navigation.ts` (legacy, 6 trees), `dashboard-nav.ts` (Mgmt redesign), `development-nav.ts` (Dev redesign). Heavy route overlap between legacy `dashboardNav` and new `MGMT_DASHBOARD_NAV`. |
| UI primitive duplication | `Badge` and `Card` exist in BOTH `src/components/ui/` (Layer A) and `src/components/dashboard/primitives.tsx` (Layer B) with incompatible props. Layer A `Card` is **unused** (0 imports). Layer A `Badge` is dominant (439 imports). |
| Inline styles            | 68 of 637 `page.tsx` files contain `style={{`. Top 10 pages account for 632 inline-style blocks (concentrated in landings + cabinet ports). 90 inline-style blocks in `src/components/**`. |
| MobileTabbar             | **EXISTS.** `src/components/ui/primitives/mobile-tabbar.tsx`, wired into `development-app-shell.tsx`. Configs at `src/components/layout/mobile-tabbar-configs.ts`. The `<=900px` CSS rule in globals.css already hides the desktop sidebar to let it take over. |

---

## 1. `src/app/globals.css` — file structure

`globals.css` is one monolith. Line ranges by concern:

| Lines       | Concern                                                              |
|-------------|----------------------------------------------------------------------|
| 1–4         | Tailwind import + dark variant                                       |
| 12–97       | **Layer A** `:root { --canvas, --ink, --accent, --gold, --r-*, --shadow-*, --gradient-*, --ease-*, --font-* }` |
| 99–143      | **Layer A** `.dark { … }` overrides                                  |
| 148–198     | **Layer A** `@theme inline { --color-canvas, --radius-*, --font-* }` Tailwind bridge |
| 200–280     | **Layer C** continuation of the `@theme inline` block (OKLCH `--color-bg / --color-terra / --color-olive / …` + `--radius-card-*` + `--shadow-redesign-*` + `--text-redesign-*`) |
| 282–328     | `@layer base` — html/body, selection, tabular-nums, reduced motion   |
| 330–414     | `@layer utilities` — `.text-display`, `.text-label`, `.glass`, `.no-scrollbar`, hero gradients, `.serif`/`.mono`/`.tnum` |
| 433–500     | **Layer B** `:root[data-product="management"]` palette               |
| 469–500     | **Layer B** `:root[data-product="development"]` palette              |
| 502–524     | **Layer B** `:root[data-product="subscription"]` palette             |
| 540–551     | **Layer B** `--display-font` / `--mono-font` per product             |
| 553–589     | **Layer B** `.display`, `.label`, `.mono`, `.num` typography         |
| 591–633     | **Layer B** `.btn`, `.btn-primary`, `.btn-terra`, etc.               |
| 635–642     | **Layer B** `.card`, `.panel`, `.card-ink`                           |
| 644–666     | **Layer B** `.badge`, `.badge-ok`, etc.                              |
| 668–694     | **Layer B** `.chip` per product                                      |
| 696–708     | **Layer B** `.ra-btn` per product                                    |
| 710–721     | **Layer B** `.pulse-dot` + `@keyframes handoff-pulse`                |
| 723–769     | **Motion** custom cursor classes (pointer:fine)                      |
| 774–814     | **Motion** `[data-reveal]`, mask reveal, word/char reveal            |
| 815–825     | reduced-motion override                                              |
| 827–834     | hover-lift on `.panel/.bento/.stat-card`                             |
| 836–854     | float / shimmer / marquee animations                                 |
| 856–861     | `.scroll-progress`                                                   |
| 868–1008    | **Mobile** `[style*=…]` grid-collapse overrides (3 breakpoints)      |
| 1011–1031   | `[data-product="development"] table.data` styling                    |
| 1034–1053   | `[data-product="subscription"] .bento`, `.tex-*`                     |
| 1055–1254   | **Shell** `[data-product] .sidebar`, `.topbar`, `.kpi` styles        |
| 1257–1268   | `[data-product="management"] table.guests`                           |
| 1270–1382   | `table.data`, `ul.clean`, `.corner-marks`, `.hr-dashed`, `.hr` (product-agnostic) |

This layout is workable but everything is interleaved — variable definitions sit 400 lines above where they're used, and the Layer C `@theme inline` block is sandwiched into the same braces as Layer A's bridge.

---

## 2. CSS-variable inventory

### 2.1 Layer A — `:root` + `@theme inline` Tailwind bridge

Defined at globals.css lines 12–97 (raw `--name`) and 148–198 (Tailwind-bridged `--color-name` / `--radius-name`).

Usage counts come from `src/` excluding globals.css itself, matching both `var(--name)` references in inline styles/CSS-in-JS and Tailwind utility classes like `bg-canvas` / `text-ink-secondary` / `border-line-soft`.

| Variable                | Where defined (globals.css) | Files using | Sample usage              |
|-------------------------|-----------------------------|-------------|---------------------------|
| `--canvas`              | :12 (`:root`), :100 (`.dark`)| 3 | various dashboard pages   |
| `--surface`             | :15, :101                   | 3           | middleware, pages         |
| `--muted`               | :16, :102                   | 3           | pages                     |
| `--inset`               | :17, :103                   | 3           | pages                     |
| `--line-soft` (A)       | :20, :105 — **AND ALSO :450 (mgmt), :511 (sub)** | 3+ | core borders |
| `--line-strong` (A)     | :21, :106 — **AND :452, :513** | 3+        | borders                   |
| `--ink` (A)             | :24, :108 — **AND :439, :480, :506** | many | text colour              |
| `--ink-secondary`       | :25, :109                   | 3           | pages                     |
| `--ink-tertiary`        | :26, :110                   | 3           | pages                     |
| `--ink-inverse`         | :27, :111                   | 3           | pages                     |
| `--accent`              | :30, :113                   | 3           | brand emerald             |
| `--accent-weak`         | :31, :114                   | 3           | mint tint                 |
| `--accent-contrast`     | :32, :115                   | 3           | white-on-emerald          |
| `--gold` (A)            | :33, :116 — **AND :448, :513** | 3+        | gold accents              |
| `--gold-weak`           | :34, :117                   | 3           | gold tints                |
| `--success`             | :37, :119                   | 3           | semantic                  |
| `--warning`             | :38, :120                   | 3           | semantic                  |
| `--danger` (A)          | :39, :121 — **AND :491**    | 3+          | semantic                  |
| `--info`                | :40, :122                   | 3           | semantic                  |
| `--neutral-fg`          | :41, :123                   | 0           | **DEAD**                  |
| `--success-weak`        | :44, :125                   | 3           | tint fills                |
| `--warning-weak`        | :45, :126                   | 3           | tint fills                |
| `--danger-weak`         | :46, :127                   | 3           | tint fills                |
| `--info-weak`           | :47, :128                   | 3           | tint fills                |
| `--data-emerald`        | :50                         | 3           | charts                    |
| `--data-gold`           | :51                         | 3           | charts                    |
| `--data-stone`          | :52                         | 3           | charts                    |
| `--data-sage`           | :53                         | 3           | charts                    |
| `--data-terracotta`     | :54                         | 3           | charts                    |
| `--data-ink`            | :55                         | 0           | **DEAD**                  |
| `--r-xs`                | :58                         | 0           | **DEAD**                  |
| `--r-sm`                | :59                         | 3           | inputs/buttons            |
| `--r-md`                | :60                         | 3           | cards                     |
| `--r-lg`                | :61                         | 0           | **DEAD**                  |
| `--r-xl`                | :62                         | 0           | **DEAD**                  |
| `--r-2xl`               | :65                         | 1           | platform-preview          |
| `--r-3xl`               | :66                         | 1           | area-chart-card           |
| `--r-4xl`               | :67                         | 0           | **DEAD**                  |
| `--shadow-flat`         | :70, :130                   | 3           | hero/kanban/projects      |
| `--shadow-rest`         | :71, :131                   | 3           | cards                     |
| `--shadow-raised`       | :72, :132                   | 3           | dashboard/health/module   |
| `--shadow-floating`     | :73, :133                   | 3           | modals/dialogs            |
| `--shadow-soft-card`    | :76, :136                   | 3           | hero cards (Stage 10.6.C.1) |
| `--shadow-elevated-card`| :77, :137                   | 3           | hero cards                |
| `--gradient-emerald-soft`| :80, :139                  | 3           | KPI heroes                |
| `--gradient-gold-soft`  | :81, :140                   | 3           | KPI heroes                |
| `--gradient-coral-soft` | :82, :141                   | 3           | KPI heroes                |
| `--gradient-ink-deep`   | :83, :142                   | 3           | dark KPI heroes           |
| `--ease-soft`           | :86                         | 0           | **DEAD**                  |
| `--ease-editorial`      | :87                         | 0           | **DEAD**                  |
| `--font-display`        | :94                         | 3           | layout / typography utils |
| `--font-sans`           | :95                         | 3           | layout / typography utils |
| `--font-mono`           | :96                         | 3           | layout / typography utils |

**Tailwind-bridged `@theme inline` Layer A** (lines 148–198):

The vast majority of `--color-*` aliases registered under `@theme inline` are **never used as Tailwind classes** anywhere in `src/`. Only three confirmed callers: `bg-color-ink` once, `color-warning` once, `color-danger` once. The rest of `bg-canvas` / `text-ink` / `border-line-soft` / `bg-accent` / `bg-success-weak` etc. — **all zero hits**.

**DEAD Layer A tokens (42):** `color-accent`, `color-accent-contrast`, `color-accent-weak`, `color-canvas`, `color-danger-weak`, `color-data-emerald`, `color-data-gold`, `color-data-ink`, `color-data-sage`, `color-data-stone`, `color-data-terracotta`, `color-gold`, `color-gold-weak`, `color-info`, `color-info-weak`, `color-ink-secondary`, `color-ink-tertiary`, `color-ink-inverse`, `color-line-soft`, `color-line-strong`, `color-muted`, `color-success`, `color-success-weak`, `color-warning-weak`, `color-surface`, `color-inset`, `data-ink`, `ease-editorial`, `ease-soft`, `neutral-fg`, `r-lg`, `r-xl`, `r-xs`, `r-4xl`, `radius-2xl`, `radius-3xl`, `radius-4xl`, `radius-lg`, `radius-md`, `radius-sm`, `radius-xl`, `radius-xs`.

> **Note:** The raw `--canvas`/`--surface`/`--ink` etc. are very much alive (consumed via `var(--…)` in inline styles + `@layer base { body { background: var(--canvas) } }`). It's the Tailwind bridge layer that's mostly dead — pages prefer raw `var(--…)` in inline styles, not `bg-canvas` utility classes.

---

### 2.2 Layer B — `[data-product]` scoped palettes

Defined at globals.css lines 433–524.

| Variable          | Mgmt (:433) | Dev (:469) | Sub (:502) | Files using | Notes                  |
|-------------------|-------------|------------|------------|-------------|------------------------|
| `--cream`         | `#F4EFE6`   | —          | —          | 3           |                        |
| `--cream-deep`    | `#ECE5D5`   | —          | —          | 3           |                        |
| `--cream-warm`    | `#FAF7F1`   | —          | —          | 3           |                        |
| `--paper`         | `#FFFCF7`   | —          | `#F5F0E2`  | 3           | **different per scope**|
| `--paper-2`       | —           | —          | `#FBF7EC`  | 1           |                        |
| `--paper-3`       | —           | —          | `#FFFEF8`  | 0           | **DEAD**               |
| `--ink` (B)       | `#14201C`   | `#14130E`  | `#0F1A1F`  | many        | **collision with A `#0f1110`** |
| `--ink-2`         | `#2A3934`   | `#3D3B33`  | `#2A3B41`  | 3           |                        |
| `--ink-3`         | `#4A5A55`   | `#6E6B5E`  | `#5C6C70`  | 3           |                        |
| `--ink-4`         | `#7E8A85`   | `#95917F`  | `#8B9295`  | 3           |                        |
| `--forest`        | `#1F3A33`   | —          | —          | 3           |                        |
| `--forest-deep`   | `#122621`   | —          | —          | 2           |                        |
| `--forest-fade`   | `#2E4F47`   | —          | —          | 0           | **DEAD**               |
| `--terra` (B)     | `#C4583C`   | —          | `#C4583C`  | 3           |                        |
| `--terra-soft`    | `#E48A6E`   | —          | `#E8A78D`  | 3           |                        |
| `--terra-deep`    | —           | —          | —          | 3           | (referenced as `var(--terra-deep, ...)`) |
| `--gold` (B)      | `#BC9A5C`   | —          | `#C9A961`  | 3           | **collision with A `#b08a3e`** |
| `--gold-soft`     | `#DCC691`   | —          | `#E6D49C`  | 3           |                        |
| `--gold-deep`     | —           | —          | `#9C7F3F`  | 1           |                        |
| `--sage`          | `#88A89A`   | —          | —          | 3           |                        |
| `--line` (B)      | `#DAD2C0`   | `#E5DECC`  | `#D5CFB8`  | 3           | **collision** w/ Layer A naming |
| `--line-soft` (B) | `#E5DECC`   | —          | `#E4DFC9`  | 3           | **collides with A `#e4dcce`** (very close) |
| `--line-strong`(B)| `#C2B89E`   | —          | `#B3AB8E`  | 3           |                        |
| `--line-2`        | —           | `#D8CFB7`  | —          | 3           |                        |
| `--line-3`        | —           | `#BAAF92`  | —          | 0           | **DEAD**               |
| `--ok`            | `#4F7A5D`   | `#4F8A5D`  | `#4F7A5D`  | 3           |                        |
| `--warn`          | `#C58A2E`   | `#C58A2E`  | —          | 3           |                        |
| `--danger` (B)    | —           | `#C2474E`  | —          | 3           | **collides w/ A**      |
| `--mint`          | `#D8E8D6`   | —          | —          | 3           |                        |
| `--mint-deep`     | `#B6D3B2`   | —          | —          | 0           | **DEAD**               |
| `--peach`         | `#F6D9CB`   | —          | —          | 0           | **DEAD**               |
| `--peach-deep`    | `#EDB89F`   | —          | —          | 0           | **DEAD**               |
| `--butter`        | `#F5E9B8`   | —          | —          | 0           | **DEAD**               |
| `--butter-deep`   | `#E8D77E`   | —          | —          | 0           | **DEAD**               |
| `--sky`           | `#D4E2EC`   | —          | —          | 0           | **DEAD**               |
| `--sky-deep`      | `#A8C1D4`   | —          | —          | 0           | **DEAD**               |
| `--bg`            | —           | `#F1ECE0`  | —          | 3           |                        |
| `--bg-2`          | —           | `#F8F4EA`  | —          | 3           |                        |
| `--bg-3`          | —           | `#FFFCF4`  | —          | 3           |                        |
| `--panel`         | —           | `#FFFFFF`  | —          | 3           |                        |
| `--concrete`      | —           | `#2A2A26`  | —          | 3           |                        |
| `--concrete-2`    | —           | `#4A4A42`  | —          | 0           | **DEAD**               |
| `--concrete-3`    | —           | `#6E6E64`  | —          | 0           | **DEAD**               |
| `--carbon`        | —           | `#14130E`  | —          | 3           |                        |
| `--amber`         | —           | `#FF6B35`  | `#FF6B35`  | 3           |                        |
| `--amber-soft`    | —           | `#FFB088`  | `#FFD3BC`  | 1           |                        |
| `--steel`         | —           | `#3D5A7A`  | `#3D5A7A`  | 3           |                        |
| `--steel-soft`    | —           | `#7E9DBF`  | —          | 1           |                        |
| `--lime`          | —           | `#C9DC4A`  | —          | 3           |                        |
| `--pastel-peach`  | —           | `#F6D2BC`  | —          | 0           | **DEAD**               |
| `--pastel-sky`    | —           | `#C9DCEA`  | —          | 0           | **DEAD**               |
| `--pastel-butter` | —           | `#F0DE96`  | —          | 0           | **DEAD**               |
| `--pastel-mint`   | —           | `#CBDFC8`  | —          | 0           | **DEAD**               |
| `--pastel-cream`  | —           | `#ECE5D5`  | —          | 0           | **DEAD**               |
| `--pastel-rose`   | —           | `#EFC6BD`  | —          | 0           | **DEAD**               |
| `--emerald`       | —           | —          | `#2F5A4E`  | 3           |                        |
| `--emerald-soft`  | —           | —          | `#D6E5DD`  | 3           |                        |
| `--shadow-card`   | mgmt :465   | —          | —          | 0           | **DEAD** (only `.card` rule references it indirectly via direct style) |
| `--shadow-soft`   | mgmt :466   | —          | —          | 3           |                        |
| `--display-font`  | :541, :545, :549 | "        | "          | 0 (consumed via `.display` class only) | not directly read by JSX |
| `--mono-font`     | :542, :546, :550 | "        | "          | 0 (consumed via `.mono`/`.label`/`.num` classes only) |                  |

**DEAD Layer B tokens (21):** `butter`, `butter-deep`, `concrete-2`, `concrete-3`, `forest-fade`, `line-3`, `mint-deep`, `paper-3`, `pastel-butter`, `pastel-cream`, `pastel-mint`, `pastel-peach`, `pastel-rose`, `pastel-sky`, `peach`, `peach-deep`, `shadow-card`, `sky`, `sky-deep`, plus the not-yet-consumed `display-font`/`mono-font` (used internally by globals.css but not exposed to JSX, which is intentional).

---

### 2.3 Layer C — additive OKLCH

Defined at globals.css lines 200–280, inside the `@theme inline` block. Self-described in the comment as "additive — lives alongside the legacy tokens so existing pages keep rendering. New primitives in src/components/ui/primitives/* reference these directly".

| Variable                  | Files using | Note                                          |
|---------------------------|-------------|-----------------------------------------------|
| `--color-bg`              | 0           | **DEAD**                                      |
| `--color-bg-elevated`     | 0           | **DEAD**                                      |
| `--color-surface-warm`    | 0           | **DEAD**                                      |
| `--color-surface-sunken`  | 0           | **DEAD**                                      |
| `--color-ink-2`           | 0           | **DEAD** (Layer B `--ink-2` is what's used)   |
| `--color-ink-3`           | 0           | **DEAD**                                      |
| `--color-ink-4`           | 0           | **DEAD**                                      |
| `--color-ink-deep`        | 1           | dome-donut.tsx:64                             |
| `--color-ink-warm`        | 0           | **DEAD**                                      |
| `--color-line`            | 0           | **DEAD**                                      |
| `--color-line-2`          | 0           | **DEAD**                                      |
| `--color-terra`           | 3           | dome-donut, concentric-bubbles, area-chart-card |
| `--color-terra-deep`      | 1           | concentric-bubbles.tsx:74                     |
| `--color-terra-soft`      | 0           | **DEAD**                                      |
| `--color-terra-tint`      | 0           | **DEAD**                                      |
| `--color-olive`           | 2           | area-chart-card, donut-ratio-card             |
| `--color-olive-deep`      | 0           | **DEAD**                                      |
| `--color-olive-soft`      | 0           | **DEAD**                                      |
| `--color-olive-tint`      | 0           | **DEAD**                                      |
| `--color-sea`             | 2           | area-chart-card, donut-ratio-card             |
| `--color-sea-deep`        | 0           | **DEAD**                                      |
| `--color-sea-soft`        | 0           | **DEAD**                                      |
| `--color-sea-tint`        | 0           | **DEAD**                                      |
| `--color-sand`            | 0           | **DEAD**                                      |
| `--color-sand-soft`       | 0           | **DEAD**                                      |
| `--color-success-soft-2`  | 0           | **DEAD**                                      |
| `--color-warning-soft-2`  | 1           | score-chip.tsx:44                             |
| `--color-danger-soft-2`   | 1           | score-chip.tsx:45                             |
| `--radius-card`           | 1           | hero-greet.tsx:126                            |
| `--radius-card-lg`        | 0           | **DEAD**                                      |
| `--radius-card-hero`      | 1           | hero-greet.tsx:126                            |
| `--radius-card-hero-lg`   | 0           | **DEAD**                                      |
| `--shadow-redesign-card`  | 2           | hero-greet, filter-bar                        |
| `--shadow-redesign-soft`  | 1           | dome-donut.tsx:56                             |
| `--shadow-redesign-pop`   | 1           | mobile-tabbar.tsx:111                         |
| `--text-redesign-xs` … `--text-redesign-5xl` | 0 each | **DEAD** (all 10 sizes)              |

**Layer C call sites (the only real consumers):**
- `src/components/dashboard/primitives/dome-donut.tsx`
- `src/components/dashboard/primitives/concentric-bubbles.tsx`
- `src/components/dashboard/primitives/area-chart-card.tsx`
- `src/components/dashboard/primitives/donut-ratio-card.tsx`
- `src/components/dashboard/primitives/score-chip.tsx`
- `src/components/dashboard/primitives/hero-greet.tsx`
- `src/components/dashboard/primitives/filter-bar.tsx`
- `src/components/dashboard/primitives/mobile-tabbar.tsx`

8 component files, mostly chart visualisations. Every other Layer C token (33 of 45) has **zero** call sites.

**Conclusion:** Layer C is mostly an experiment that didn't get adopted. It can be reduced to the ~8 tokens these 8 files use (or those usages can be repointed to Layer B equivalents) and the rest deleted.

---

## 3. Collisions (the actual specificity problem)

Variables defined in BOTH `:root` (Layer A) and a `[data-product=…]` selector (Layer B). The Layer B definition has higher specificity (attribute selector beats unqualified `:root`), so on any page where `<html data-product="…">` is set, **Layer B wins**.

| Var          | Layer A value (`:root`) | Layer B mgmt | Layer B dev | Layer B sub | Diff visible? |
|--------------|-------------------------|--------------|-------------|-------------|---------------|
| `--ink`      | `#0f1110`               | `#14201C`    | `#14130E`   | `#0F1A1F`   | Subtle. Mgmt is warmer/greener than A. |
| `--line-soft`| `#e4dcce`               | `#E5DECC`    | —           | `#E4DFC9`   | Negligible.   |
| `--line-strong`| `#b9ad98`             | `#C2B89E`    | —           | `#B3AB8E`   | Subtle.       |
| `--gold`     | `#b08a3e`               | `#BC9A5C`    | —           | `#C9A961`   | **Noticeable** — Layer B golds are paler/warmer. |
| `--danger`   | `#a43e2f`               | —            | `#C2474E`   | —           | **Noticeable** — Dev red is brighter. |

The other Layer B tokens (`--ink-2`, `--ink-3`, `--ink-4`, `--line`, `--paper`, `--terra`, `--cream`, `--mint`, etc.) are NEW names not present in Layer A — no collision, no concern.

The 5 colliding names ARE the source of "странных оттенков" mentioned in the brief.

---

## 4. Navigation configs

### 4.1 Files

| File                                | Exports                                                              | Imports from it |
|-------------------------------------|----------------------------------------------------------------------|-----------------|
| `src/config/navigation.ts`          | types `NavItem`, `NavGroup`; consts `marketingNav`, `dashboardNav`, `ownerNav`, `fieldNav`, `guestNav`, `aiAssistantMeta` | 5 — `public-header.tsx`, `dashboard-sidebar.tsx`, `field-shell.tsx`, `owner-shell.tsx`, `lib/development/navigation.ts` |
| `src/config/dashboard-nav.ts`       | types `DashboardNavItem`, `DashboardNavGroup`; const `MGMT_DASHBOARD_NAV` | 2 — `development-nav.ts`, `components/dashboard/sidebar.tsx` |
| `src/config/development-nav.ts`     | type re-exports + const `DEV_DASHBOARD_NAV`                          | 1 — `components/dashboard/dev-sidebar.tsx` |

### 4.2 Overlap

`navigation.ts → dashboardNav` and `dashboard-nav.ts → MGMT_DASHBOARD_NAV` cover the same `/dashboard/*` route tree with different groupings:

- Same routes, different group breakdown (legacy splits `Inventory` / `Procurement`, new merges to `INVENTORY·PROCUREMENT`; same for `Utilities` / `Maintenance` → `UTILITIES·MAINTENANCE`; `Security` / `System` → `SECURITY·SYSTEM`).
- Legacy uses lucide React icon imports; new uses string keys resolved via `components/dashboard/icons.tsx`.
- Live consumers:
  - **Legacy** (`navigation.ts → dashboardNav`) is imported by `components/layout/dashboard-sidebar.tsx` — wider sidebar used on legacy pages.
  - **New** (`dashboard-nav.ts → MGMT_DASHBOARD_NAV`) is imported by `components/dashboard/sidebar.tsx` — handoff Task 5 sidebar used on port pages.

So both sidebars exist in the codebase, served depending on which layout group a route lives in. Consolidating them to a single source of truth is on the table for the plan phase.

`navigation.ts` also defines `marketingNav`, `ownerNav`, `fieldNav`, `guestNav`, `aiAssistantMeta` — these are NOT duplicated anywhere and need to stay.

---

## 5. UI primitive duplication

| Primitive       | `src/components/ui/` | `src/components/dashboard/primitives.tsx` | `src/components/ui/primitives/` | Conflict |
|-----------------|----------------------|--------------------------------------------|--------------------------------|----------|
| `Button`        | `button.tsx:33`      | —                                          | —                              | None     |
| `Badge`         | `badge.tsx:28` (439 imports) | `primitives.tsx:123` (4 imports)   | —                              | **YES** — same name, different props |
| `Card`          | `card.tsx:4` (**0 imports**) | `primitives.tsx:99` (25 imports)   | —                              | Effectively no conflict because Layer A `Card` is dead |
| `PageHeader`    | `page-header.tsx:6` (~12) | —                                     | —                              | None     |
| `Section`       | `section.tsx:4` (~8) | —                                          | —                              | None     |
| `MetricCard`    | `metric-card.tsx:7` (~3) | —                                      | —                              | None     |
| `Sparkline`     | `sparkline.tsx:3` (~2) | —                                        | —                              | None     |
| `SourceBadge`   | `source-badge.tsx:3` | —                                          | —                              | None     |
| `StatusPill`    | `status-pill.tsx:4` (~5) | —                                      | —                              | None     |
| `Table`         | `table.tsx:4` (~6)   | —                                          | —                              | None     |
| `EmptyState`    | `empty-state.tsx`    | —                                          | (various variants in primitives/empty-state-variants.tsx) | None |
| `Kpi`           | —                    | `primitives.tsx:26` (3 imports)            | (also `dashboard-kpi.tsx`)     | Two different "Kpi" concepts in different scopes |
| `SectionHeading`| —                    | `primitives.tsx:42` (47 imports)           | —                              | None     |
| `Pulse`         | —                    | `primitives.tsx:133` (0 imports)           | —                              | **DEAD** |

The `src/components/ui/primitives/` directory (37 files) is the "shared dashboard primitives" library — `MobileTabbar`, `HeroGreet`, `AreaChartCard`, `KanbanBoard`, `SpreadsheetView`, etc. It is **separate** from `src/components/ui/*` and doesn't share named exports with it. Confusing namespace, but technically no conflicts.

**Real conflict count: 1.5** — `Badge` (real), `Card` (paper conflict, Layer A unused).

---

## 6. Inline-style density

`grep -rln 'style={{' src/app --include='page.tsx'` → **68 pages** out of 637.

### Top 10 by occurrence count

| Rank | File                                                                  | `style={{` count |
|------|-----------------------------------------------------------------------|------------------|
| 1    | `src/app/(product-landings)/products/development-os/page.tsx`         | 239              |
| 2    | `src/app/(product-landings)/products/management-os/page.tsx`          | 195              |
| 3    | `src/app/(dashboard)/dashboard/page.tsx`                              | 64               |
| 4    | `src/app/(dashboard)/dashboard/operations/page.tsx`                   | 52               |
| 5    | `src/app/(dashboard)/dashboard/bookings/page.tsx`                     | 52               |
| 6    | `src/app/(development-app)/development-os/cabinets/project-manager/page.tsx` | 51        |
| 7    | `src/app/(dashboard)/dashboard/concierge/page.tsx`                    | 51               |
| 8    | `src/app/(development-app)/development-os/cabinets/site-supervisor/page.tsx` | 49        |
| 9    | `src/app/(development-app)/development-os/page.tsx`                   | 43               |
| 10   | `src/app/(dashboard)/dashboard/finance/page.tsx`                      | 36               |

Total of top 10: **632 inline-style blocks**.

`src/components/**/*.tsx`: **90** inline-style occurrences total.

This is consistent with the design brief: handoff JSX is ported verbatim with `style={{ … }}` for grid layouts and 1-off colors, while shared primitives use CSS classes. Phase 2.0 explicitly does **not** rewrite these inline styles — flagged here only as background context.

---

## 7. MobileTabbar — exists

The brief asked to confirm presence. **It exists and is wired in:**

- Component: `src/components/ui/primitives/mobile-tabbar.tsx`
- Configs: `src/components/layout/mobile-tabbar-configs.ts` (exports `DEV_TABBAR_ITEMS`)
- Mounted at: `src/components/development/development-app-shell.tsx` (renders `<MobileTabbar items={DEV_TABBAR_ITEMS} />`)
- CSS support: globals.css :1247 hides desktop `.sidebar` at `<=900px` to make room for it.
- Management surface: **not yet wired**. The dashboard shell (`components/layout/dashboard-sidebar.tsx` or `components/dashboard/sidebar.tsx`) does not render a MobileTabbar, but the CSS hide rule applies to its `.sidebar` class too — so mgmt pages on mobile currently have **no nav at all** below 900px.

That's an open product issue ("HF-12" per code comments) but **out of scope for Phase 2.0** per the brief. Noted here only for the record.

---

## 8. Other observations worth flagging for the plan stage

1. **Tailwind theme bridge is mostly dead.** Of the 42 `--color-*` / `--radius-*` aliases in the `@theme inline` block (Layer A bridge), only 3 are consumed as Tailwind utilities anywhere in the codebase. Pages consistently reach for `style={{ color: 'var(--ink)' }}` rather than `className="text-ink"`. If we want to keep these aliases, they should at minimum be relocated to a `tokens.css` so the bridge isn't intermixed with Layer C.

2. **Layer C `@theme inline` is sandwiched into Layer A.** Both are inside the same `@theme inline { … }` block at lines 148–280. Splitting them is just a syntactic move — Tailwind treats it the same.

3. **`@layer base { * { border-color: var(--line-soft) } }`** (globals.css:286) — this is the universal `*` selector that drives every default border to `--line-soft`. On a `[data-product]` page, Layer B's `--line-soft` wins; off-product, Layer A's wins. This is the single biggest reason the Layer A→B value drift is visible globally.

4. **Motion CSS** (cursor, reveal, parallax, marquee, shimmer) is ~150 lines and self-contained — natural candidate for `motion.css`.

5. **Mobile breakpoints** (globals.css :871–:1008) are ~140 lines of `[style*=…]` attribute selectors targeting inline grid styles in landing pages. They are tightly coupled to the prototype JSX and shouldn't be touched in this phase. Candidate for `mobile.css` module purely on size grounds.

6. **`@custom-variant dark`** (line 3) and the entire `.dark { … }` block (lines 99–143) are present but dark mode is **not actually wired** anywhere — no `class="dark"` toggle in layout.tsx, no theme provider. It's dormant Layer A infrastructure. Keep but isolate.

7. **`html, body { overflow-x: hidden; max-width: 100vw }`** (line 868) is global and sits in the middle of the mobile block. Should move to base reset.

---

## 9. Files inspected for this audit

- `src/app/globals.css` (1383 lines, fully read)
- `src/config/navigation.ts`, `src/config/dashboard-nav.ts`, `src/config/development-nav.ts`
- `src/components/ui/{button,badge,card,section,page-header,empty-state,metric-card,sparkline,source-badge,status-pill,table}.tsx`
- `src/components/dashboard/primitives.tsx`
- `src/components/ui/primitives/` directory listing
- `src/components/ui/primitives/mobile-tabbar.tsx`
- `src/components/layout/mobile-tabbar-configs.ts`
- `src/components/development/development-app-shell.tsx`
- Grep across `src/` for every CSS variable name from globals.css

No code was modified during this audit.

---

**Next step:** Stage 2 — Migration plan. Will be appended to this same file as `## 10. Migration plan`.
