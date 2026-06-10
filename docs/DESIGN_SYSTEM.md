# Arconique Management OS — Design System

**Status:** As-built (revised)
**Last revised:** 2026-06-10

This is the design contract for the platform. It describes what is **actually shipped** after the full pixel-redesign pass — not the original v0 blueprint. It documents the token architecture, the per-product palettes as implemented, and the primitive map a contributor reaches for. The companion `docs/DESIGN-SYSTEM-BUILD-PROMPT.md` carries the functional build contract (10 P0 blocks, competitor-parity mandate); this doc is the visual/structural reference.

> The system is premium, editorial, calm, and investment-grade. It is explicitly not a generic SaaS dashboard. The philosophy and "do-not" sections below survive from the original blueprint; the color, token, typography, and component sections have been rewritten to match the code.

---

## 1. Design Philosophy

1. **Editorial, not industrial.** Fewer elements, more whitespace, stronger typography. The product reads like a private-wealth quarterly, not a CRM.
2. **Calm over alarm.** Status is communicated through hierarchy and tone — red is earned, not decorative.
3. **Restraint as signal.** One accent color at a time, one chart style per context, one motion language across surfaces.
4. **Data is the hero.** Numbers are large, typography is refined, columns align, tables breathe.
5. **Surface-appropriate density.** Management is efficient but never crowded; owner portal is statement-grade; development OS is engineering-dense; guest portal is boutique-hotel; platform admin is a dry operator console.
6. **Motion explains, it does not entertain.** Transitions clarify change; nothing bounces for decoration.
7. **Brand-owned primitives.** We start from Radix + shadcn scaffolding, but we rename, restyle, and wrap them. The product never reads as "stock shadcn".
8. **One product, many palettes.** A single Next app renders five distinct visual identities driven entirely by tokens — components never hard-code color.

---

## 2. Brand Foundation

### 2.1 Voice & tone
- **Voice:** precise, warm, adult, confident. Never corporate-jargony, never cutesy.
- **Tone per surface** (this is also the copy contract in the build prompt):
  - Management — warm hospitality, succinct.
  - Development OS — engineering, terse.
  - Owner — calm investor, formal and respectful.
  - Guest — warm and boutique.
  - Platform admin — dry operator.

### 2.2 Naming conventions
- Buttons name the action, not the feature: "Generate statement" not "Generate".
- Empty states speak to the user: "No statements yet. Your first statement will appear after month-end close."
- Errors explain consequence + recovery.

---

## 3. Token Architecture (the most important section)

All design tokens live in **`src/styles/tokens.css`** — the single source of truth. Component CSS lives in `src/styles/components/*.css` (imported by `src/app/globals.css`) and references those tokens; it imports nothing and hard-codes nothing.

There are **three layers**. Understanding which layer you are writing in is the core mental model of this design system.

### 3.A — Layer A (legacy global)
`:root` + `.dark` in `tokens.css`. The original warm-cream neutral + emerald accent scale (`--canvas`, `--surface`, `--ink`, `--accent`, `--gold`, the `--success/--warning/--danger/--info` semantics, radii `--r-sm…--r-4xl`, the soft shadow scale, and the data-viz sequence). Consumed by ~190 older pages via `var(--…)` and by `body { background: var(--canvas) }`.

Crucially, **most Layer A tokens are now aliased to their Layer B equivalent** — e.g. `--canvas: var(--cream, #f8f5f0)`. The literal after the comma is the off-product fallback (public site, owner shell pre-stamp, field shell). So on a `data-product` page, the Layer A name naturally resolves to the per-product value. A handful that *collide* by name with Layer B (`--line-soft`, `--line-strong`, `--ink`, `--gold`, `--danger`) keep raw literals here and are overridden by Layer B via selector specificity.

> Layer C (an earlier additive OKLCH layer) was migrated into Layer A / inlined and deleted. Do not reintroduce it.

### 3.B — Layer B (`[data-product]` palette) — THE TARGET LANGUAGE
`:root[data-product="…"]` blocks in `tokens.css`. These are the handoff palettes. Because `:root[data-product="x"]` has higher specificity than `:root`, on a stamped page these win for any colliding token name. **Everything new migrates here.** This is the language the redesign speaks. Per-product palette values are in §4.

### 3.C — The `@theme inline` Tailwind bridge
The `@theme inline { … }` block registers a curated subset of tokens as Tailwind utility classes — so `bg-canvas`, `text-ink-secondary`, `border-line`, `bg-terra`, `bg-amber`, `bg-carbon`, `shadow-redesign-card`, `rounded-card`, `font-display`, etc. are real classes. Bridge entries that have a Layer B equivalent are written `--color-terra: var(--terra, <fallback>)` so the Tailwind class **auto-tracks the per-product palette**. Truly-dead bridge entries (no `var()` caller and no class consumer) were pruned. A few decorative scales (`--color-olive/sea/sand`, the data-viz sequence) keep OKLCH literals on purpose so they don't drift with the UI palette.

### 3.D — The rules (binding)
1. **Layer B is the target.** New surfaces are authored in the `[data-product]` language; older Layer A pages migrate toward it.
2. **No `style={{…}}` in production.** Mocks use inline styles for speed; ported code converts to classes / tokens. (A small number of legacy `<Card>` callsites still pass `style={{padding}}` — those are being migrated to the `padding` prop; do not add new ones.)
3. **No new palette, no 5th font, no ad-hoc CSS var.** A genuinely new token is added in **two places**: the Layer B `[data-product]` block(s) in `tokens.css`, **and** an alias in the `@theme inline` bridge so it becomes a Tailwind utility. Never inline a hex at the callsite.
4. Decorative chart / score palettes stay as deliberate literals (documented in `tokens.css`) — don't "fix" them into UI tokens.

### 3.E — How a surface gets its palette (the stamping model)
The `data-product` attribute (and an optional `data-surface` marker) is what activates a palette. There are two stamping paths:

- **Root layout (`src/app/layout.tsx`).** `resolveDataProduct()` reads the middleware `x-product` header and stamps `<html data-product="…">` for exactly three products: `management`, `development`, `subscription`. Everything else falls through to no attribute (inherits Management/Layer-A defaults).
- **Per-shell stamping.** The other surfaces are stamped on their **route-group root**, not on `<html>`, by their shell component:
  - `OwnerShell` → `data-product="owner"` (`src/components/layout/owner-shell.tsx`)
  - `StayShell` → `data-product="guest"` + `data-surface="guest-stay"` (`stay-shell.tsx`)
  - `PlatformShell` → `data-product="platform"` + `data-surface="platform-os"` (`platform-shell.tsx`)
  - `DevelopmentAppShell` → `data-product="development"` + `data-surface="development-os"`
  - Investor portal layout → `data-product="development"` + `data-surface="investor-portal"` (`src/app/(investor-portal)/layout.tsx`)

Because guest/platform/investor are stamped on a *nested* element, `tokens.css` defines both the `:root[data-product="x"]` (canonical) **and** a bare `[data-product="x"]` selector for each so they resolve whatever host they're mounted on (e.g. an impersonated investor portal reached via the management host).

### 3.F — `data-surface` remaps (the alias bridge per surface)
A palette block only sets brand vars (`--terra`, `--amber`, `--bg-2`, …). The many shared primitives that write generic utilities (`bg-canvas`, `bg-surface`, `text-ink-secondary`, `border-line-soft`, `bg-accent-weak`, the gradient/soft-fill badge classes) need those generics pointed at the right surface. That is the job of the **`data-surface` remap blocks** in `tokens.css`:

| `data-surface` | Remaps the generic aliases onto… |
|---|---|
| `development-os` | engineering surfaces + amber accent + Space Grotesk / IBM Plex (Dev OS cabinets) |
| `investor-portal` | the dev palette surfaces (investor portal reuses Dev OS visuals) |
| `guest-stay` | the airy lightened-hospitality surfaces + generous radii |
| `platform-os` | the dark carbon console + cool-blue accent + dark hero-KPI gradients + Space Grotesk / IBM Plex |

So a `<DashboardKpi tone="emerald-soft">` renders a warm cream gradient on Management but a cool-blue band under `platform-os`, with zero changes to the component — the remap recolors the gradient token underneath it.

---

## 4. Per-Product Palettes (as implemented)

Defining file for all of these is `src/styles/tokens.css`. Display fonts are wired via `next/font` in `src/app/layout.tsx` (Newsreader, Inter, JetBrains Mono, Space Grotesk, IBM Plex Mono, Fraunces) and exposed as `--font-*` axes; each product remaps `--font-display` / `--font-mono`.

| Product | `data-product` | Surface bg | Accent | Display font | Notes |
|---|---|---|---|---|---|
| **Management OS** | `management` | cream `#F4EFE6` | **terra** `#C4583C` | **Newsreader** (serif) | `/dashboard/**`. The reference palette: cream/paper surfaces, forest `#1F3A33`, gold `#BC9A5C`, sage; pastel accent fills (mint/peach/butter/sky). |
| **Development OS** | `development` + `data-surface="development-os"` | sand `#F1ECE0` / panel `#FFFFFF` | **amber** `#FF6B35` | **Space Grotesk** | `/development-os/**`. Engineering palette: concrete/carbon ink, steel `#3D5A7A`, lime `#C9DC4A`; mono = IBM Plex. |
| **Owner Portal** | `owner` (shares the management token block) | cream | terra | Newsreader | `/owner/**`. Same Layer B block as management (`:root[data-product="management"], :root[data-product="owner"]`) — statement-grade, **larger type**, calm investor tone. |
| **Investor Portal** | `development` + `data-surface="investor-portal"` | dev sand | amber | Space Grotesk | Reuses the **dev** engineering palette via a nested `[data-product="development"]` + the investor-portal remap. Amber hero-KPI gradient drives the wallet "available to withdraw" tile. |
| **Guest Stay Portal** | `guest` + `data-surface="guest-stay"` | sand `#FAF6EE` | terra | Newsreader | `/stay`. The **lightened-hospitality** palette we added: management *hues* but airier (lighter cream, lighter ink), generous luxury radii (`--r-card: 22px`, `--r-hero: 32px`), softer hospitality shadows. A token-gated public surface served on the management host. |
| **Platform Admin OS** | `platform` + `data-surface="platform-os"` | carbon `#0E1116` | **cool-blue** `#5B9DFF` | Space Grotesk | `/platform/**`. The **only dark surface** — inverts the warm scale to layered carbon panels with a cool-blue accent; gold `#E0B341`; mono = IBM Plex. Hero-KPI gradients recolored to the blue console band. |
| **Subscription** | `subscription` | paper `#F5F0E2` | gold/terra | Fraunces | Landing + pricing only; no inner cabinets. Editorial variable-axis serif. |

Notes:
- **Owner ≠ its own palette.** It is intentionally management's token block, differentiated by larger type and layout, not color.
- **Investor portal ≠ its own palette.** It is the development palette reused on a non-dev host.
- Dark mode (`.dark`, Layer A) still exists for the legacy emerald scale, but the *product surfaces* are light by design except Platform, which is intrinsically dark.

---

## 5. Typography

### 5.1 Typefaces (as wired in `src/app/layout.tsx` via `next/font/google`)

| Role | Family | Used by |
|---|---|---|
| Display — Management / Owner / Guest | **Newsreader** (warm humanist serif, has italic) | `--font-display` under those products |
| Display — Development / Platform | **Space Grotesk** | remapped under `development-os` / `platform-os` |
| Display — Subscription | **Fraunces** (variable-axis editorial serif) | `--font-display` under `subscription` |
| Body (all products) | **Inter** | `--font-sans` / `--default-font-family` |
| Mono — Management / Subscription / Guest | **JetBrains Mono** | `--font-mono` |
| Mono — Development / Platform | **IBM Plex Mono** | remapped `--font-mono` |

The legacy variable names `--font-display` / `--font-sans` / `--font-mono` are preserved as aliases, so existing primitives keep their typography. The per-product axes (`--font-newsreader`, `--font-space`, `--font-fraunces`, `--font-plex`, `--font-inter`, `--font-jetbrains`) are also exposed and remapped per surface. The Tailwind utilities `font-display` / `font-sans` / `font-mono` and `.text-display` all resolve these.

### 5.2 Usage rules
- Page/section titles use the product display face (serif on mgmt/owner/guest/sub, Space Grotesk on dev/platform). The `PageHeader` primitive uses `text-display` at 36–44px; `SectionHeading` uses `.display` at 42px.
- Numbers in tables/statements/KPIs use the product mono face for decimal alignment (`.num`, `text-num`).
- No all-caps except the `.label` / `.text-label` micro-label (letter-spacing, 10.5–12px).

---

## 6. Spacing, Radii, Elevation

### 6.1 Radii
Layer A registers `--r-sm: 8`, `--r-md: 12`, `--r-lg: 20`, `--r-xl: 32`, plus `--r-2xl/3xl/4xl` and bridges them to Tailwind `rounded-*`. The redesign adds **card radii** — `--r-card` / `--r-card-lg` / `--r-hero` — set per product (mgmt 18/22/28, dev 14/18/22, guest 22/28/32, platform 14/18/22) and exposed as `rounded-card` / `rounded-card-lg` / `rounded-hero`. Card radius is therefore a per-product signal: management is rounder than dev/platform, guest is the roundest.

### 6.2 Elevation
Shadows are **soft and low**; never default material shadows.

- Layer A scale: `--shadow-flat` (hairline ring), `--shadow-rest`, `--shadow-raised`, `--shadow-floating`, plus the redesign `--shadow-soft-card` / `--shadow-elevated-card` (and dark-mode variants).
- Redesign Tailwind shadows: `shadow-redesign-card` / `shadow-redesign-soft` / `shadow-redesign-pop` (driven by `--shadow-redesign-*` in the bridge).
- Per-product `--shadow-card` / `--shadow-soft` are defined inside several Layer B blocks (mgmt, guest, platform) with surface-appropriate tints.
- Hero-card gradients (`--gradient-emerald-soft` / `-gold-soft` / `-coral-soft` / `-ink-deep`, plus dev's `--gradient-amber-hero`) feed the primary KPI tiles and are recolored per surface by the `data-surface` remaps.

---

## 7. Primitive Map (what to reach for)

Two component families coexist by design:

- **Layer A primitives** — `src/components/ui/*` — Tailwind-class based, consume the bridged tokens. The broad inventory (~439 `Badge` imports etc.).
- **Layer B (handoff) primitives** — `src/components/dashboard/primitives.tsx` + `src/components/ui/primitives/*` — render the prototype's `.kpi` / `.card` / `.badge` / `.section-heading` CSS classes which are styled per-product in `src/styles/components/*.css` under `[data-product]` scopes. **One component renders correctly under any product surface** because the classes resolve the local palette.

### 7.1 Layout & content primitives
- **`PageHeader`** (`ui/page-header.tsx`) — eyebrow + display title (36–44px) + description + breadcrumbs + actions slot. The Layer B analogue is **`SectionHeading`** (`dashboard/primitives.tsx`), which renders the `.section-heading` / `.display` cabinet header.
- **`Section`** (`ui/section.tsx`) — titled content block.
- **`Card`** (`dashboard/primitives.tsx`) — renders `.card` (per-product surface/border/radius in `primitives.css`). Props: `padding` (`none`/`tight`/`default`/`lg`), `overflowHidden`, `tone="dark"` (inverted editorial AI band — forest-deep on mgmt, ink on dev), `id` for in-page anchors. Legacy callsites still pass `style={{padding}}`; the `padding` prop is the migration target.
- **`ListPage`** (`dashboard/list-page.tsx`, "template 04") — 5-zone list anatomy: header → filter-bar **or** bulk-bar → optional facets + table + pager.
- **`DetailPage`** family (`dashboard/detail/*` — `detail-page`, `detail-header`, `detail-tabs`, `detail-side`, `detail-actionbar`, `detail-activity`, `detail-related`) — "template 05" detail anatomy with optional two-column `DetailMainAndSide` (main + ~300px right rail) and a CSS-stuck bottom action bar.

### 7.2 Metric / KPI primitives
- **`Kpi`** (`dashboard/primitives.tsx`) — the cabinet `.kpi` tile: label + value + sub, `tone` ∈ `accent/success/warn/danger/gold` (color picked per product in `shell.css`).
- **`MetricCard`** (`ui/metric-card.tsx`) — Layer A metric with delta trend (up/down/flat) + hint.
- **`DashboardKpi`** (`ui/primitives/dashboard-kpi.tsx`) — drill-aware KPI: traffic-light variance, delta, optional sparkline + drill handler, `variant` (`default` 28px / `hero` 56–72px), and `tone` (legacy `emerald-soft`/`gold-soft`/`coral-soft`/`ink-deep` gradients + redesign terra/olive/sea/sand/ink-warm axes). Gradients are remapped per surface.

### 7.3 Tables
- **`table.data`** — the shared data-table class, styled per-product in `primitives.css` (sticky-ish headers, hover stripe, `.num` right-aligned mono cells). Plus `ui/table.tsx`, `ui/sortable-header.tsx`, `ui/table-empty.tsx`, and `dashboard/bulk-bar.tsx` for selection/batch actions.

### 7.4 Badges & status
- **`Badge`** (`ui/badge.tsx`) — Layer A, `cva`-based, tones `neutral/accent/gold/success/warning/danger/info/outline` (uses `bg-*-weak` / `text-*` bridged tokens). ~439 imports.
- **`HandoffBadge`** (`dashboard/primitives.tsx`) — Layer B pill, mono-font, per-product via the `.badge` / `.badge-*` classes in `primitives.css`. Tones: `ok/warn/danger/gold/info/ink/soft/amber` (plus mgmt `accent`, dev `steel`). Use this one on handoff-ported pages.
- **`StatusPill`** (`ui/status-pill.tsx`), **`SourceBadge`** (`ui/source-badge.tsx`), **`ScoreChip`** (`ui/primitives/score-chip.tsx`), and **`Pulse`** (`.pulse-dot` animated live dot, color per product) round out the status kit.

### 7.5 The State Kit — the 7 states + ComingSoon
Barrel: **`src/components/ui/state/index.ts`**. A view is in exactly one state at a time; cabinets import these instead of hand-rolling:

1. **`EmptyState`** (`ui/empty-state.tsx`) — headline + one sentence + one primary action (variants/tones).
2. **`LoadingState`** — spinner + label.
3. **`Skeleton` / `SkeletonText` / `SkeletonGroup`** — stable placeholders (no shimmer on trust-critical surfaces).
4. **`ErrorState`** — in-surface failure (distinct from the route boundary).
5. **`Forbidden`** — authenticated-but-unauthorized; wired off the RBAC gate (block 08).
6. **`DegradedState`** — offline / db-null / service-down.
7. **`PartialDataNotice`** — rendered but knowingly incomplete.

Plus **`ComingSoon`** — the affordance that closes the "no disabled button without a reason" debt. The route-level boundary lives separately (`@/components/system/route-error-boundary`, wired by each portal's `error.tsx`).

### 7.6 The Modal-First pattern
**`ModalFirstAddButton`** (`ui/primitives/modal-first-add-button.tsx`) is the single helper every list-page Add CTA should use: it opens an inline `EntityModal` (HTML5 `<dialog>`) wrapping the form, refreshes on success, and renders an optional "Open as full page" deep-link footer to a `/new` route. It supports a `permissionGate` that hides the button entirely when the user lacks the permission. This restores the Modal-First invariant (add/edit happens in a modal, not a `/new` navigation). Related: `EntityFormModal` (Radix, schema-driven), `ConfirmDialog` (two-step destructive confirm), and the `.modal` CSS in `components/modal.css`.

### 7.7 Page templates (detail / list / AI)
The unified templates are the composition wrappers above plus the AI surface primitives: **`UnifiedInbox`**, **`AiAssistantGrid`** (`dashboard/ai-assistant-grid.tsx`), **`AiAuditLog`**, **`CommsPanel`**, and the command palette (`components/command-palette.css`). Detail / list / AI-agent / list+filter screens are built from these templates, not ad-hoc. Other notable Layer B primitives in `ui/primitives/`: `HeroGreet` / `CabinetGreetingBlock`, `PageHeaderHero` / `DetailPageHero`, `FilterBar` / `FilterPills` / `facet-panel`, `KanbanBoard`, `Timeline` / `RecordTimeline`, `DrawingViewer` (coordination/estimator), `RfqMatrix`, `SpreadsheetView`, `area-chart-card` / `donut-ratio-card` / `dome-donut` / `concentric-bubbles` / `sparkline-chart` (charts), `MobileTaskCard` / `PhotoCapture` / `VoiceNote` / `GeoCheckIn` (field).

### 7.8 Shell & navigation
- `dashboard/sidebar.tsx` (Mgmt) + `dashboard/dev-sidebar.tsx` (Dev) + `dashboard/topbar.tsx`; mobile uses `dashboard/mobile-tabbar.tsx` (sidebar collapses to tab bar ≤900px). Shell CSS in `components/shell.css`. Nav is config-driven (`src/config/dashboard-nav.ts`, `src/config/development-nav.ts`).

---

## 8. Iconography & Imagery

- **Icons:** Lucide as the base (see `dashboard/icons.tsx`), 1.5px stroke; filled reserved for status markers. Icons share their label's color unless signaling a meaningful status.
- **Photography:** editorial, warm, architectural — never stock-tropical-beach. Alt text mandatory.
- **Illustration:** minimal line work in `--line-strong` with occasional gold. No 3D SaaS gradient blobs, no mascots.

---

## 9. Motion System

Motion is centralized in a **`MotionLayer`** mounted once in the root layout, with the motion CSS in `src/styles/motion.css` (cursor / reveal / parallax / count-up / magnetic / mobile-responsive). Components consume presets, never importing Framer directly.

- Duration 150–400ms for interactions; 500–900ms for section reveals; easing `easeSoft [0.22,1,0.36,1]` / `easeEditorial [0.2,0.8,0.2,1]`.
- **Always respect `prefers-reduced-motion`** — presets become no-ops.
- Vocabulary: fade-rise (12px), staggered lists (≤8 children), share-layout on object→detail nav (~240ms), scroll-linked reveals, number counters on hero KPIs only (stop ≤600ms).
- Parallax: marketing/editorial pages only (cap 10%); forbidden on admin/owner/guest/field/platform operational surfaces.
- AI streaming: soft mask-gradient reveal, low-opacity cursor bar; no typewriter clicks.

---

## 10. Surface-Specific Guidelines

- **Management dashboard** — dense but breathable; tables are first-class; cmd-K global search; subtle nav, content is the stage. No colored nav "hero" bands.
- **Owner / investor portal** — reads like a statement, not an app: management tokens with larger display type, abundant whitespace, printable layouts. Owners never see internal ops-language. (Investor portal visually reuses the Dev OS engineering palette.)
- **Development OS** — engineering-dense cabinets, Space Grotesk + IBM Plex, amber accent, steel/lime accents; `DrawingViewer` + estimator/coordination tooling.
- **Guest portal** — warm boutique-hotel feel, airy lightened palette, large radii, single primary CTA per screen, concierge chat feels like private messaging.
- **Platform Admin OS** — the dark cool-blue operator console: carbon surfaces, terse dry copy, super-admin tooling; the only intrinsically dark surface.
- **Staff field PWA** — mobile-first, big tap targets (≥48px), single column, primary action at thumb-reach; subtle offline banner.

---

## 11. Accessibility

- WCAG 2.2 AA minimum, AAA on long-form reading (statements). Contrast verified per palette.
- Never rely on color alone — every colored status carries an icon or label (`a11y.css`).
- Focus rings are part of the design (`--line-strong` outline, 2px offset). Radix primitives carry ARIA; `aria-live="polite"` regions for streaming AI.
- `prefers-reduced-motion` respected system-wide.

---

## 12. PDF Export Design (statements, POs, reports)

- Follows the owner-portal typographic system — product display serif + tabular numbers.
- Letterhead: Arconique mark top-left, document type top-right; footer carries statement ID, page count, and the statement hash (tamper-evidence for forwarding).
- Hairline table lines (0.5pt). Signature block (Finance Manager + Director + date + hash). `DRAFT — NOT FOR DISTRIBUTION` watermark only when draft.

---

## 13. "Do-Not" Rules (binding)

- **No `style={{…}}` in production.** Tokens + classes only. New token → `tokens.css` Layer B + `@theme inline` alias.
- **No new palette / 5th font / ad-hoc CSS var.** Five product palettes, the documented typefaces — that's the set.
- **No raw hex at the callsite.** Even fallbacks live in `tokens.css`.
- **No gradients as decoration** beyond the brand-controlled hero-KPI gradients.
- **No default shadcn look.** If a component reads as stock, it's not done.
- **No startup/SaaS tropes** (auto-advancing testimonial carousels, "trusted by 10,000+", gradient blobs).
- **No toy AI UI** (pulsating rings, rainbow auras, "AI ✨" sparkles). The assistant is a serious instrument.
- **No dense colored cards.** Data surfaces are neutral; color is for signaling.
- **No black boxes.** The platform dark surface uses carbon `#0E1116`, never true black.
- **No animated loading skeletons on trust-critical surfaces.** Statements show stable placeholders.
- **No carousels / horizontal-scroll tables on admin.** Use stack/card view on mobile.
- **No success fireworks.** Success is quiet.
- **No emoji in management, owner, development, platform, or field surfaces.** Guest may use a single brand-approved emoji per greeting, if at all.

---

## 14. Implementation Notes

- **Source of truth:** `src/styles/tokens.css` (tokens) → `src/styles/components/*.css` (component CSS, imported by `src/app/globals.css`) → Tailwind v4 `@theme inline` (utilities) → `src/components/ui/*` + `src/components/dashboard/*` (primitives).
- **Tailwind v4** consumes tokens via the `@theme inline` block; no separate config palette.
- **Two primitive families** (Layer A `ui/*`, Layer B handoff `dashboard/primitives.tsx` + `ui/primitives/*`) coexist intentionally; new handoff-ported pages prefer the Layer B family.
- The functional/build contract (10 P0 blocks, competitor-parity, RBAC + org-scope on every query, primitives-first, single nav source, mobile first-class) lives in **`docs/DESIGN-SYSTEM-BUILD-PROMPT.md`** and governs every design+functional PR.

---

## 15. Review & Governance

- Any change to `src/styles/tokens.css`, the `@theme inline` bridge, or a top-level primitive requires design review.
- Additions to the icon set, motion presets, or chart palette require the same.
- A change that introduces a hex literal at a callsite, a new font, or a `style={{…}}` in production is a design-system violation, not a feature.
- Each quarter, run a "design debt" pass auditing surfaces for drift (incl. Layer A → Layer B migration progress and remaining inline-style callsites).
