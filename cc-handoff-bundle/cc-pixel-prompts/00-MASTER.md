# 00 — MASTER pixel-fidelity contract (read first, every screen)

> You are implementing Arconique screens in the **live repo** `nrazgulyaev/management-os@main`
> (Next 15 App Router · React 19 · TypeScript · Tailwind v4 · Layer-B design tokens).
> For each screen you are given a **mockup HTML file** in the design project. That mockup is the
> **pixel source of truth**. Your job: reproduce it **pixel-for-pixel** using the repo's real
> tokens and primitives — not a free reinterpretation.
>
> This file is the global contract. Every per-screen prompt assumes you have read it.
> Do not restate it; obey it.

---

## 0. The two fidelities (both are mandatory)

| Fidelity | Means | How |
|---|---|---|
| **Pixel fidelity** → the mockup | Same layout, spacing, type scale, color, radius, shadow, density, states | Match the mockup visually via the verify loop in §6 |
| **System fidelity** → the repo | Use real tokens + real primitives, no inline styles, no new palette | Map every block to an existing primitive (§3), every value to a token (§2) |

When the two conflict (a mockup value isn't in the token scale), **add the token to Layer B first**
(`src/styles/tokens.css` under the right `[data-product]`), then use it. Never inline a raw hex/px to
"get the pixel." Pixel-perfect **through** the system, never around it.

---

## 1. Product scoping — pick the right palette

Every page lives under a `[data-product]` root set by middleware (`x-product` header → subdomain).
The mockups already declare it. Match it:

| Mockup / route | `data-product` | Display font | Accent |
|---|---|---|---|
| `cabinets/mgmt-*`, `/dashboard/**` | `management` | Newsreader | terra `#C4583C` |
| `cabinets/owner-*`, `/owner/**` | `owner` (inherits mgmt palette) | Newsreader | terra `#C4583C` |
| `cabinets/dev-*`, `/development-os/**` | `development` | Space Grotesk | amber `#FF6B35` |
| `cabinets/super-admin/*`, `/platform/**` | platform (dark cool-blue, see platform prompts) | Inter/Space Grotesk | `#5B9DFF` |

Owner ≠ a new palette. Owner = Mgmt tokens with **calmer density and a bigger type scale**
(see `.kpi-narrative`, `.section-heading h1 { font-size:44px }` in §3). Do not invent owner colors.

---

## 2. Token tables — the ONLY allowed values

These are the real Layer-B tokens from `src/styles/tokens.css`. Reference them as `var(--…)` (or the
Tailwind aliases below). If you type a hex that is not in these tables, you are doing it wrong.

### Management OS + Owner Portal — `[data-product="management"]`, `[data-product="owner"]`
```
Surfaces   --cream #F4EFE6  --cream-deep #ECE5D5  --cream-warm #FAF7F1  --paper #FFFCF7
Ink        --ink #14201C  --ink-2 #2A3934  --ink-3 #4A5A55  --ink-4 #7E8A85
Brand      --forest #1F3A33  --forest-deep #122621  --forest-fade #2E4F47
           --terra #C4583C  --terra-soft #E48A6E  --gold #BC9A5C  --gold-soft #DCC691  --sage #88A89A
Lines      --line #DAD2C0  --line-soft #E5DECC  --line-strong #C2B89E
Semantic   --ok #4F7A5D  --warn #C58A2E  --danger #B14132  --info #3D5A7A
Pastels    --mint #D8E8D6 / -deep #B6D3B2 · --peach #F6D9CB / -deep #EDB89F
           --butter #F5E9B8 / -deep #E8D77E · --sky #D4E2EC / -deep #A8C1D4
Accent     --accent=terra · --accent-deep #A44627 · --on-accent #FAF7F1
           --inverted-bg=forest · --inverted-fg #FAF7F1
Radii      --r-xs 4 · --r-sm 8 · --r-md 12 · --r-card 18 · --r-card-lg 22 · --r-hero 28 · --r-pill 999
Shadow     --shadow-card · --shadow-soft · --shadow-pop  (exact values in tokens.css — use the var)
Type       display Newsreader · sans Inter · mono JetBrains Mono
```

### Development OS — `[data-product="development"]`
```
Surfaces   --bg #F1ECE0  --bg-2 #F8F4EA  --bg-3 #FFFCF4  --panel #FFFFFF
           (aliases: --paper=panel, --cream=bg, --cream-warm=bg-2)
Lines      --line #E5DECC  --line-2 #D8CFB7  --line-3 #BAAF92  --line-soft #ECE6D5
Ink        --ink #14130E  --ink-2 #3D3B33  --ink-3 #6E6B5E  --ink-4 #95917F  --carbon #14130E
           --concrete #2A2A26 / -2 #4A4A42 / -3 #6E6E64
Brand      --amber #FF6B35  --amber-soft #FFB088  --amber-deep #D8541F
           --steel #3D5A7A  --steel-soft #7E9DBF  --lime #C9DC4A
Semantic   --ok #4F8A5D  --warn #C58A2E  --danger #C2474E  --info=steel
Pastels    --pastel-peach #F6D2BC · -sky #C9DCEA · -butter #F0DE96 · -mint #CBDFC8 · -cream #ECE5D5 · -rose #EFC6BD
Accent     --accent=amber · --accent-deep=amber-deep · --on-accent=carbon
           --inverted-bg=carbon · --inverted-bg-deep #050402 · --inverted-fg #FFFFFF
Radii      --r-xs 4 · --r-sm 8 · --r-md 10 · --r-card 14 · --r-card-lg 18 · --r-hero 22 · --r-pill 999
Type       display Space Grotesk · sans Inter · mono IBM Plex Mono
```

### Tailwind utilities already exposed (`@theme inline`)
`text-ink-2/3/4 · border-line · bg-line · text-terra(+variants) · bg-paper · bg-cream · bg-cream-warm ·
bg-forest · bg-amber · bg-carbon · text-ok` etc. (full list: `_audit/2026-05-27-phase-2-0-state.md`).
Prefer these utilities; reach for `var(--…)` only when no utility exists. **Need a value with no token
→ add the token, then alias it in `@theme inline`** — same pattern as the existing bridges.

---

## 3. Primitive map — every block already has a component

The mockups are built from a fixed primitive vocabulary (CSS in `cabinets/chrome.css`, React in the
repo). **Do not hand-roll these.** Reuse the component; pass props. Mapping:

| Mockup markup | CSS class | Repo React primitive | Path |
|---|---|---|---|
| Stat tile | `.kpi` / `.kpi-lg` / `.kpi-narrative` (owner) | `<Kpi>` | `src/components/dashboard/primitives.tsx` |
| Section title block | `.section-heading` (h2 38px, owner h1 44px) | `<SectionHeading>` | same |
| White panel | `.card` (mgmt r-card, dev r-card-lg) + `.card-pad`/`-lg` | `<Card padding="none\|tight\|default\|lg" overflowHidden>` | same |
| Inverted hero band | `.card-inverted` | `<Card>` + inverted prop / class | same |
| Status pill | `.badge` (+`-ok/-warn/-danger/-info/-accent/-gold/-ink/-soft`) | `<HandoffBadge>` (was `Badge`) | same |
| Filter chip | `.chip` (+`-dot/-ink/-active`) | chip in `filter-bar.tsx` | `src/components/dashboard/` |
| Live dot | `.pulse-dot` | `<Pulse>` | primitives.tsx |
| Avatar | `.avatar` (+`-lg/-sm`) | avatar primitive | — |
| Data table | `table.data` (th mono 10.5px upper; `td.num` tabular right) | `<SortableHeader>` + table | `src/components/dashboard/sortable-header.tsx` |
| Airy table | `table.guests` (mgmt/owner, 14px rows) | same, guest variant | — |
| Page header + crumb | `.page-header` (h1 34px, crumb mono upper) | `Detail*` header brick | `src/components/dashboard/detail/*` |
| List+filter page | `.filter-bar` + table + `.pagination` | `<ListPage>` + `<FilterBar>` + `<FacetPanel>` + `<BulkBar>` | `src/components/dashboard/{list-page,filter-bar,facet-panel,bulk-bar}.tsx` |
| Empty state | `.empty` (5 variants) | `<EmptyState variant=…>` | `src/components/ui/empty-state.tsx` |
| Pagination | `.pagination` | `<PagerNumbered\|PagerLoadmore\|PagerCursor>` | `src/components/ui/pager-*.tsx` |
| Modal | `.modal` (480px, r-card-lg) | `<Modal>` / `<ConfirmModal>` / `<DestructiveConfirmModal>` | `src/components/ui/modal.tsx` |
| Command palette | `.cmdk` (540px) | `<CommandPalette>` (FlexSearch) | `src/features/command-palette` |
| Detail layout | `.detail-shell` (1fr 280px) + `.detail-tabs` | `Detail*` bricks + `useDetailForm` + `<InlineEdit>` | `src/components/dashboard/detail/*`, `ui/inline-edit.tsx` |
| Form field | `.field`/`.input`/`.select`/`.textarea`/`.check`/`.radio`/`.toggle` | form primitives | — |
| Sidebar | `.sidebar` `.sb-item` `.sb-group` (264px rail) | app shell | — |
| Topbar | `.topbar` `.tb-search` (280px) `.tb-bell` `.tb-user` | app shell | — |
| Mobile tab bar | `.mobile-tabbar` | `<MobileTabbar>` (HF-12 fixed) | `src/components/dashboard/mobile-tabbar.tsx` |
| AI agent UI | agent cards/transcript | `<AgentCard\|AgentCatalog\|AgentMessage\|AgentTranscript\|AgentComposer\|AgentOutputCard\|AgentRunsList\|AgentConfigCard>` | `src/components/ai-agents/*` |

**Phase 2.4 primitives** (channels/pricing/site/investors): `ChannelGrid`, `PricingCurve`,
`StoryboardLog`, `PipelineBoard`, `WaterfallChart` — see `ds-2.4-primitives.html` and the per-screen prompt.

If a mockup block has **no** matching primitive, that's a real gap → build it as a **new primitive in
`src/components/…` first** (primitives-first rule), then use it. Never inline a one-off.

### Exact primitive values you must hit (from chrome.css — don't eyeball)
- **Button** `.btn`: padding `11px 18px`, radius `999px`, font 14/500. `-lg` `14px 22px`/15px. `-sm` `7px 14px`/13px. Primary = `--ink` bg + `--inverted-fg`. Accent = `--accent` bg + `--on-accent`.
- **KPI** `.kpi`: pad `16px 18px`, radius 14, label mono 10.5px upper, value mono **26px**/500 tabular, sub 12px `--ink-3`. `-lg` value 36px. Owner `.kpi-narrative`: pad 28, value **Newsreader 44px**/400.
- **Card**: mgmt `--paper` + `--line-soft` + radius `--r-card`(18). dev `--panel` + `--line` + `--r-card-lg`(14). pad 20 / pad-lg 28.
- **Badge**: pad `2px 8px`, pill, mono 11px upper `.08em`; semantic = `color-mix 12% bg / 35% border`.
- **Table** `table.data`: cell `10px 14px`, th mono 10.5px upper `.14em` `--ink-3` on `--cream`/`--bg-2`; `td.num` right + tabular. Airy `table.guests`: cell `14px 18px`, 14px, owner `18px 22px`.
- **Sidebar**: 264px col, `.sb-item` `7px 18px`/13.5px, active = `--cream-warm` bg + 2px `--accent` left border.
- **Topbar**: sticky, `12px 28px`, blur 10, search 280px pill, bell 32px, user with 1px left divider.
- **Modal**: 480px, `--r-card-lg`, header `18/22/14` with Newsreader 19px h3, footer on `--cream-warm` right-aligned.
- **Section heading** h2: Newsreader **38px**/-.02em (dev 500/-.025em); owner 44px. Eyebrow = `.label` mono 11px upper `.16em`.
- **App shell**: grid `264px 1fr`. Content pad `22px 28px`.

---

## 4. Routes — bind to the real tree

Target the real routes from `feature-gaps/_ground-truth-2026-05-29.md` (GitHub-verified). Each
per-screen prompt names them. Nav source of truth:
- Mgmt: `src/config/navigation/management.ts` (`MGMT_DASHBOARD_NAV`, 14 groups).
- Dev: `src/config/navigation/development.ts`.
- Mobile tabs: `MGMT_PRIMARY_MOBILE_TABS` = `/dashboard`, `/dashboard/bookings`, `/dashboard/guests`, `/dashboard/finance` (+More).
- `src/config/dashboard-nav.ts` is a **deprecated shim** — do not edit; edit the real nav files.

**Most cabinets already exist and are live-wired** (mgmt `/dashboard/**` = 299 files, dev = 58 roots,
owner = 21 pages). So you are almost always doing a **redesign of an existing page**, not a greenfield
build. Read the existing route, keep its data wiring, restyle to match the mockup.

---

## 5. Hard rules (from CLAUDE.md — non-negotiable)

1. **Primitives-first.** New pattern → design-system/component first, then the page. Never inline a one-off.
2. **No `style={{…}}`** in production. Classes/utilities only. (The mockups use inline styles for speed — you must translate them to classes/tokens, NOT copy the inline style.)
3. **No new palette / no 4th font / no ad-hoc CSS var.** New token → `tokens.css` (Layer B) → alias in `@theme inline`.
4. **Don't pollute Layer A `:root`.** Layer-B var names stay scoped under `[data-product]`.
5. **Mobile is first-class.** Every screen must pass at ≤900px (sidebar → `<MobileTabbar>`) and ≤600px. Mockup has a mobile pass — match it.
6. **Detail pages / modals / AI-agent pages / list+filter pages all go through the single template** (`Detail*`, `Modal`, `Agent*`, `ListPage`). Not ad-hoc.
7. **Tone of copy:** Mgmt = warm hospitality · Dev = engineering-grade · Owner = calm investor narrative. Keep the mockup's exact strings unless they're obvious lorem.
8. **Don't recreate any real third-party product's UI.** These designs are original Arconique.

---

## 6. The pixel-verify loop (this is how you actually hit pixel-perfect)

Prose specs don't get you pixel-perfect — a screenshot diff does. For every screen:

1. **Open the mockup** in the design project (the per-screen prompt gives the exact path, e.g.
   `cabinets/mgmt-p1/bookings.html`). Note each sub-screen (the mockup's TOC lists them).
2. **Implement** the route using primitives + tokens.
3. **Screenshot your build** at the mockup's reference width (desktop **1366px**, mobile **390px**) with
   the same data shown in the mockup (seed/fixture if needed).
4. **Diff against the mockup** sub-screen. Walk this checklist:
   - [ ] Page header: crumb (mono upper), h1 size/font, actions cluster — match.
   - [ ] Vertical rhythm: section gaps, card padding, KPI row height — match the token scale.
   - [ ] Type: every size/weight/family pulled from a token, not eyeballed.
   - [ ] Color: surfaces, ink levels, accent, borders — only token hexes (§2).
   - [ ] Radius + shadow: cards/modals/buttons use the product's `--r-*` + `--shadow-*`.
   - [ ] Tables: header style, row height, numeric right-align + tabular figures.
   - [ ] Badges/chips/pulse/avatars — exact primitive variant.
   - [ ] States present in mockup: hover, empty, loading, error, selected, disabled.
   - [ ] Mobile pass at 390px matches the mobile mockup.
5. **Iterate** until the diff is visually indistinguishable at 100% zoom. Then move on.

If your environment can run Playwright, automate steps 3–4 (capture → side-by-side). Otherwise eyeball
at 1:1 against the mockup open beside your build.

---

## 7. Definition of done (per screen)

- [ ] All sub-screens in the mockup are implemented (list, detail, modal, empty, mobile…).
- [ ] Zero `style={{…}}`; all values are tokens/utilities; any new token added to Layer B + `@theme`.
- [ ] Every block uses the mapped primitive; new patterns landed as new primitives first.
- [ ] Route bound to the real path + real nav entry; existing data wiring preserved.
- [ ] Verify-loop checklist passes desktop **and** mobile.
- [ ] `typecheck` + `lint` + smoke clean.
- [ ] One PR per cabinet (or per the per-screen prompt's slicing). Commit message names the cabinet + phase.

---

## 8. How to use the per-screen prompts

Each file in this folder (`management/…`, `development/…`, `owner/…`, `platform/…`, plus
`foundations.md`, `templates.md`, `auth.md`, `mobile.md`) gives, for one design:
- the **mockup path** (pixel source of truth),
- the **route(s)** it maps to,
- the **sub-screens** inside that mockup,
- **primitive mapping + gotchas** specific to it,
- a **per-screen acceptance checklist**.

Paste **this master + the one per-screen prompt** into Claude Code together. Do one cabinet per session.
