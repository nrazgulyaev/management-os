# Arconique Management OS — Design System

**Status:** v0 Blueprint
**Last revised:** 2026-04-24

This is the design contract for the platform. It defines how Arconique Management OS looks, feels, and moves — across the marketing site, admin dashboard, owner portal, guest portal, and staff field PWA. The system is premium, editorial, calm, and investment-grade. It is explicitly not a generic SaaS dashboard.

---

## 1. Design Philosophy

1. **Editorial, not industrial.** Fewer elements, more whitespace, stronger typography. The product reads like a private-wealth quarterly, not a CRM.
2. **Calm over alarm.** Status is communicated through hierarchy and tone — red is earned, not decorative.
3. **Restraint as signal.** We use one accent color at a time, one chart style per context, and one motion language across surfaces.
4. **Data is the hero.** Numbers are large, typography is refined, columns align, tables breathe.
5. **Surface-appropriate density.** Marketing is airy and cinematic; admin is efficient but never crowded; owner portal is statement-grade; guest portal is boutique-hotel-app; field is one-thumb-operable with large hit targets.
6. **Motion explains, it does not entertain.** Transitions clarify change; nothing bounces for decoration.
7. **Brand-owned primitives.** We start from Radix + shadcn, but we rename, restyle, and wrap them. The product never reads as "stock shadcn".
8. **Everything works dark and light.** Tokens first; components never hard-code color.

---

## 2. Brand Foundation

### 2.1 Voice & tone
- **Voice:** precise, warm, adult, confident. Never corporate-jargony, never cutesy.
- **Tone per surface:**
  - Marketing — editorial and aspirational.
  - Admin — succinct and efficient.
  - Owner — formal and respectful.
  - Guest — warm and boutique.
  - Field — direct and instructive.

### 2.2 Naming conventions
- Buttons name the action, not the feature: "Generate statement" not "Generate".
- Empty states speak to the user: "No statements yet. Your first statement will appear after month-end close."
- Errors explain consequence + recovery.

---

## 3. Color System

All colors are CSS variables defined in `styles/tokens.css`. Components always reference tokens, never hex values.

### 3.1 Palette philosophy
A warm neutral base (bone, sand, graphite, ink) punctuated by a single deep accent. No rainbow chart palettes; data color is a controlled sequence.

### 3.2 Base tokens (light theme)

| Token | Purpose | Value |
|---|---|---|
| `--bg-canvas` | Page background | `#F8F5F0` (Bone 50) |
| `--bg-surface` | Cards, panels | `#FFFFFF` |
| `--bg-muted` | Subtle fills | `#F1ECE4` |
| `--bg-inset` | Table stripes, inputs | `#EEE7DC` |
| `--line-soft` | 1px dividers | `#E4DCCE` |
| `--line-strong` | Focus, table headers | `#B9AD98` |
| `--text-primary` | Headlines, body | `#0F1110` (Ink 900) |
| `--text-secondary` | Labels, captions | `#4A4A46` (Ink 600) |
| `--text-tertiary` | Hints, meta | `#7A7670` (Ink 400) |
| `--text-inverse` | On dark | `#F6F3ED` |
| `--accent` | Brand accent | `#0E3B2E` (Arc Emerald) |
| `--accent-weak` | Muted accent surface | `#DCE6DF` |
| `--gold` | Premium highlight, badges | `#B08A3E` (Arc Gold) |
| `--gold-weak` | Soft gold surface | `#F1E7D1` |

### 3.3 Base tokens (dark theme)

| Token | Value |
|---|---|
| `--bg-canvas` | `#0C0E0D` (Arc Obsidian) |
| `--bg-surface` | `#141716` |
| `--bg-muted` | `#1A1D1B` |
| `--bg-inset` | `#1E2220` |
| `--line-soft` | `#262A28` |
| `--line-strong` | `#3A3F3C` |
| `--text-primary` | `#F4F1EB` |
| `--text-secondary` | `#C4BEB3` |
| `--text-tertiary` | `#8A857B` |
| `--accent` | `#4FB592` (Arc Emerald Light) |
| `--accent-weak` | `#15332A` |
| `--gold` | `#D6B567` |
| `--gold-weak` | `#2A2313` |

### 3.4 Semantic tokens
These resolve to base tokens and are the only colors components touch.

| Token | Use |
|---|---|
| `--success` | Neutral green `#2E7D64` (light) / `#4FB592` (dark) |
| `--warning` | Amber `#A06A1A` / `#D0A14C` |
| `--danger` | Terracotta `#A43E2F` / `#D46A57` (used sparingly) |
| `--info` | Slate `#2E4A5C` / `#8FB0C2` |
| `--neutral` | Stone `#7A7670` / `#A9A49A` |

Rule: Only one `--danger` element on screen at a time. If everything is urgent, nothing is.

### 3.5 Data visualization palette
A sequential, brand-aligned set. Never `chart.js` defaults.

- **Sequence A (categorical, max 6):** Emerald `#0E3B2E`, Gold `#B08A3E`, Stone `#6B6760`, Sage `#6E8A7A`, Terracotta `#9E5A49`, Ink `#2A2D2B`.
- **Sequence B (quantitative, 5 steps, Emerald ramp):** `#D9E7DE → #A5C9B5 → #6FAA8B → #3F8C67 → #0E3B2E`.
- **Divergent:** Terracotta ↔ Emerald for gains/losses, centered at neutral bone.

Rules:
- Never use red/green traffic-light pairs. Use Emerald / Terracotta instead.
- Never use more than 6 categorical colors in one chart.
- Revenue positive: Emerald. Expense: Stone. Reserve: Gold. Net payout: Ink.

---

## 4. Typography

### 4.1 Typefaces

| Role | Primary | Fallback |
|---|---|---|
| Display (editorial headers, hero) | **GT Super Display** (or **Domaine Display**, or **Saol Display**) | `'Iowan Old Style', Georgia, serif` |
| Text (body, UI) | **Söhne** (or **Inter Tight** / **Geist**) | `system-ui, sans-serif` |
| Data / Numeric (tables, statements) | **Söhne Mono** (or **JetBrains Mono**, or tabular Söhne) | `ui-monospace, SFMono-Regular` |

The display serif is the signature. Body sans is neutral and precise. The mono/tabular face is used for numbers to align decimals.

> If GT Super / Söhne licenses are not procured at launch, use **Source Serif 4** (display) + **Geist** (text) + **Geist Mono** (numeric) as an open alternative. The design system is typeface-agnostic at the token level.

### 4.2 Type scale

A modular scale with explicit semantic names (not t-shirt sizes).

| Token | Font | Size / line-height (px) | Use |
|---|---|---|---|
| `text-hero` | Display 500 | 72 / 76 | Marketing hero |
| `text-display` | Display 500 | 56 / 62 | Section heroes, statement totals |
| `text-h1` | Display 500 | 40 / 48 | Page titles |
| `text-h2` | Display 500 | 32 / 40 | Section titles |
| `text-h3` | Sans 600 | 24 / 32 | Subsection |
| `text-h4` | Sans 600 | 20 / 28 | Card headers |
| `text-body-lg` | Sans 400 | 18 / 28 | Editorial body |
| `text-body` | Sans 400 | 16 / 24 | Default |
| `text-body-sm` | Sans 400 | 14 / 20 | Secondary |
| `text-label` | Sans 500 | 12 / 16 | Uppercase labels (letter-spacing 0.06em) |
| `text-caption` | Sans 400 | 12 / 16 | Meta |
| `text-num-xl` | Mono tabular 500 | 48 / 52 | KPI hero numbers |
| `text-num-lg` | Mono tabular 500 | 32 / 36 | Card KPIs |
| `text-num` | Mono tabular 500 | 16 / 20 | Table cells |

Rules:
- Page titles always use display serif. Section titles may use sans-600 in data-dense admin pages.
- Numbers in tables and statements use the tabular/mono face for alignment.
- No all-caps except `text-label`.

### 4.3 Rhythm

- Vertical rhythm based on 8px grid (4px micro).
- Line lengths capped at ~64ch for body, 48ch for editorial.
- Paragraph spacing `1.25em`; section spacing uses surface spacing tokens (see below), not typographic padding.

---

## 5. Spacing, Grid, Radii, Elevation

### 5.1 Space scale (rem)
`0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16` (rem). Named tokens map:
`space-1 … space-16` aligned to an 8px base.

### 5.2 Grid
- Marketing: 12-col, 1440 max, 96px gutters desktop / 24 mobile; editorial asymmetric layouts allowed.
- Admin: 12-col, 1600 max, 32px gutters; content max width varies by module (tables may be full width).
- Owner: centered 1120 max, generous margins; statement pages approach magazine spreads.
- Guest: single-column 480 max on mobile, 720 on desktop.
- Field: single-column 480 max; tap targets ≥ 48px; edge-to-edge with 16px safe margin.

### 5.3 Radius
- `--r-xs: 4px` — inputs, chips
- `--r-sm: 8px` — buttons, tabs
- `--r-md: 12px` — cards
- `--r-lg: 20px` — hero cards, modals
- `--r-xl: 32px` — marketing media blocks
- `--r-full: 9999px` — avatars, pill toggles

### 5.4 Elevation
Shadows are **soft and low**; never default material shadows.

| Token | Effect |
|---|---|
| `--shadow-flat` | `0 0 0 1px var(--line-soft)` (default card) |
| `--shadow-rest` | `0 1px 2px rgba(15,17,16,0.04), 0 0 0 1px var(--line-soft)` |
| `--shadow-raised` | `0 6px 20px -8px rgba(15,17,16,0.10), 0 0 0 1px var(--line-soft)` |
| `--shadow-floating` | `0 20px 60px -20px rgba(15,17,16,0.22), 0 0 0 1px var(--line-soft)` |

Glass (used rarely, only on dark backgrounds with imagery behind): `backdrop-filter: blur(18px) saturate(120%); background: rgba(20,23,22,0.55); border: 1px solid rgba(255,255,255,0.06)`. Never on light theme.

---

## 6. Iconography & Imagery

### 6.1 Icons
- **Library:** Lucide as base, replaced/augmented with custom icons for hospitality concepts (turnover, linen, pool, checklist).
- **Stroke:** 1.5px; corner radius `2px`; no filled icons in admin (filled reserved for status markers).
- **Size tokens:** 14, 16, 20, 24.
- Icons always share color with their label unless indicating a meaningful status.

### 6.2 Photography
- Editorial, warm, architectural. Never stock-agency-tropical-beach.
- Vertical hero ratios on mobile; cinematic 21:9 on marketing desktop heroes.
- Treatment: slight warm grade, minimal saturation. No vignette, no fake film grain.
- Alt text mandatory; empty alt only for purely decorative patterns.

### 6.3 Illustration
- Minimal. Line illustrations in `--line-strong` with an occasional gold accent.
- No 3D shiny SaaS gradient blobs. No robot mascots.

---

## 7. Layout Primitives

- **Shell (admin/owner/field):** persistent left nav (desktop) / bottom nav (mobile), top bar with breadcrumb + search + assistant shortcut + user menu.
- **Page container:** header (title + meta + primary action), subtitle with context chips, then content.
- **Section:** title + optional description + content.
- **Card:** `bg-surface`, `r-md`, `shadow-flat`. Optional header and footer.
- **Panel:** Card variant with tinted surface for elevated content (stats, callouts).
- **Drawer:** right-docked on desktop (`420–640px`), full-screen sheet on mobile.
- **Modal:** centered, max `640px`, reserved for destructive confirmations or short flows.
- **Split views:** list + detail (`320px` / `1fr`) for inbox, bookings, tasks.
- **Board views:** kanban for CRM pipeline and task triage.

---

## 8. Component Library (shape & behavior)

We build on Radix primitives and shadcn scaffolding, then restyle with tokens. Every component exists in **light + dark**, **touch + desktop**.

### 8.1 Buttons
- **Variants:** `primary` (filled accent), `secondary` (outline), `ghost` (text-only), `subtle` (muted surface), `destructive` (sparingly, terracotta).
- **Sizes:** `sm` (32), `md` (40), `lg` (48 — default mobile).
- Loading state shows a small left-hand spinner; never replaces text.
- Icon-only buttons require `aria-label`.

### 8.2 Inputs & forms
- Label sits above input, not floating inside.
- Help text and error share a single slot under the input.
- Error uses `--danger` text + left border; does not repaint the input fully.
- Required fields marked with a small hairline asterisk — never red.
- Currency inputs show the currency code as a prefix, tabular font.
- Date pickers: calendar with visible range for booking-like inputs.

### 8.3 Tables (data)
- **Type:** tabular; numbers right-aligned, mono font.
- Sticky header.
- Row hover uses `--bg-inset`.
- Selection via checkbox column; batch action bar appears as a top-docked toolbar.
- Inline expansion for drilldown (chevron row-prefix).
- Empty and loading states baked-in.
- Pagination uses cursor by default; page numbers only for small sets.
- Export CSV / PDF buttons in table header.

### 8.4 Statement table (special)
- Ultra-wide column layout on desktop, two-column stacked on mobile.
- Section dividers with small-caps labels.
- Totals in display serif, one size up.
- Each line expandable into its source transactions.

### 8.5 Status badges
- Pill shape, `r-full`, height 20, text-label size.
- Backgrounds use `--*-weak` tokens; text uses the strong token.
- Only one critical badge per card.

### 8.6 Villa status board card
- Large villa photo (16:10), villa code overlay, status chip on photo.
- Footer with next action ("Cleaning due 14:00") and assignee avatar.
- Drag into a new status column updates state (with confirmation for irreversible moves).

### 8.7 Task card (field)
- Title + villa chip + time.
- Checklist progress bar.
- Large primary action at bottom ("Start" / "Submit photos").
- Offline indicator when applicable.

### 8.8 Charts
- Line, area, bar, stacked bar, donut (rarely), and a custom "revenue rail" for monthly strip charts.
- Axis lines thin, grid barely visible.
- Tooltips use `shadow-raised`, sans body, mono numbers, currency prefix.
- Legends are captions, not boxes.
- Zero baseline clearly marked for variance charts.

### 8.9 KPI card
- Big `text-num-xl` number at top, caption above in `text-label`, delta chip below ("+4.2% MoM").
- Optional sparkline underneath — never on by default; only when it adds meaning.

### 8.10 Maps
- Mapbox light (custom Arconique style) for portfolio page and villa detail.
- Markers are small ink dots with 1px accent ring; active marker uses gold.

### 8.11 Avatars
- Initials only if no photo. Background derived from a deterministic hash on name, but constrained to neutrals + gold.

### 8.12 Dialogs & confirmations
- Destructive confirmation uses a two-step pattern: select action → confirmation with exact names and numbers shown.
- AI tool confirmations show the structured payload as a read-only card + confirm button.

### 8.13 Toasts / notifications
- Single toast at a time (queue collapses).
- Positioned top-right on desktop, bottom on mobile.
- Success is quiet (no big green check animation).

### 8.14 AI chat
- Panel or full page.
- User messages right-aligned, assistant left.
- Citations rendered as small badges linked to source.
- No pulsing gradient avatar. The assistant is presented as a subtle mark, not a mascot.
- Input has a single prompt line with enter-to-send; shift+enter newline.
- Suggestion chips below the input, one row, horizontal-scroll on mobile.

### 8.15 Empty states
- Short headline, one sentence, one primary action.
- Never a cartoon illustration.

### 8.16 Forms for money
- Always show currency, big number in tabular.
- Breakdown beneath shows allocated portions.
- On submit, confirmation modal restates amount in words for large sums.

---

## 9. Motion System

Motion is produced via **Framer Motion** with a small set of **presets** in `components/motion/`. Components never import Framer directly; they import a preset.

### 9.1 Principles
- Duration 150–400ms for interactions; 500–900ms for section reveals.
- Easing: custom `easeSoft [0.22, 1, 0.36, 1]` and `easeEditorial [0.2, 0.8, 0.2, 1]`.
- Always respect `prefers-reduced-motion` — presets become no-ops.
- No spring physics on data tables. Springs only on object-to-object transitions (card to detail).

### 9.2 Motion vocabulary
- **Fade-rise:** 12px rise + fade. For cards appearing on scroll.
- **Stagger:** 40ms stagger on list items, max 8 staggered children (beyond that, no stagger).
- **Share-layout:** on navigation within the same object (villa card → villa detail), share layout ids for a ~240ms transition.
- **Scroll-linked reveals:** opacity + slight translate, bound to viewport; never parallax that moves more than 10% of container height.
- **Subtle parallax:** marketing heroes only. Background image moves 5–8% slower than foreground. Never on admin/owner surfaces.
- **Number counters:** only in KPI hero cards; respect reduced motion; stop within 600ms.

### 9.3 Page transitions
- Use View Transitions API for full-page transitions where supported; fall back to a minimal fade.
- Same-section transitions are instant; cross-section transitions get a 180ms fade.

### 9.4 Micro-interactions
- Button press: 2px translateY + shadow relax, 120ms.
- Switch toggle: physical spring, 220ms.
- Tab change: bar slides under new tab.
- Table row expand: smooth height, 200ms with easeSoft.

### 9.5 AI streaming
- Tokens render with a soft mask gradient revealing text; cursor pulse reduced to low-opacity bar.
- No typewriter characters-clicking effects.

### 9.6 Parallax usage (strict)
- Allowed: marketing home, case studies, portfolio deep pages.
- Forbidden: admin, owner portal (except owner home hero image if used subtly), guest portal (other than hero image), field.
- Parallax speed cap: 10%.
- Pauses when motion-reduced is set.

---

## 10. Surface-Specific Guidelines

### 10.1 Public marketing site
- Editorial layouts, large imagery, restrained copy.
- Generous negative space; hero sections up to full-viewport height.
- Only one animated hero per page.
- Trust signals (logos, quotes) rendered as still editorial elements, not as carousels.

### 10.2 Admin dashboard
- Dense but breathable. Two-column + side nav layout.
- Portfolio overview is one page — three-row hierarchy: key metrics strip, operational pulse, financial pulse.
- Tables are first-class citizens; every list is a proper data table.
- Inline search (cmd-K) global; contextual filters as pill groups above tables.
- No colored navigation "hero" bands. The navigation is subtle; content is the stage.

### 10.3 Owner / investor portal
- The design reads like a statement, not an app.
- Display serif titles, tabular numbers, abundant whitespace.
- Each statement page is designed to be **printable** — layout holds on A4 when exported.
- No operational clutter; owners should not see internal ops-language.
- Villa hero image tasteful and large; financial rail of the villa presented as an editorial spread.

### 10.4 Guest portal
- Warm, hospitable, boutique-hotel feel.
- Large photos, villa name in display serif.
- Single primary CTA per screen ("Request towels", "Book a chef").
- Concierge chat feels like a private messaging app, not customer support.

### 10.5 Staff field PWA
- Mobile-only visually, though it may open on desktop.
- Dark theme by default (reduces battery, glare outdoors).
- Big tap targets; single-column; primary action always at thumb-reach bottom.
- Offline banner is subtle gold bar across top when applicable.
- Photo capture flow optimized for portrait; shows next checklist item immediately after capture.

---

## 11. Accessibility

- WCAG 2.2 AA minimum, AAA on long-form reading content (statements, case studies).
- Color contrast verified in both themes; data colors checked for color-blindness.
- Never rely on color alone: every colored status has an icon or label.
- Keyboard: every interactive element reachable in logical order; focus rings are part of the design, using `--line-strong` outline `2px` offset `2px`.
- Screen readers: Radix primitives maintain ARIA; custom components inherit patterns.
- Motion: `prefers-reduced-motion` respected system-wide.
- Language attributes on content; direction-aware layouts (future RTL prep, not enabled).
- Live regions for streaming AI responses (`aria-live="polite"`).

---

## 12. Iconography of Status (system)

| Status | Icon | Color token |
|---|---|---|
| `Occupied` | solid circle | `--text-primary` |
| `Checkout Pending` | half-filled circle | `--neutral` |
| `Cleaning In Progress` | brush | `--info` |
| `Supervisor Inspection` | magnifier | `--warning` |
| `Ready for Check-in` | ring with dot | `--success` |
| `Maintenance Blocked` | wrench | `--warning` |
| `Owner Stay` | key | `--gold` |
| `Out of Service` | hashed fill | `--danger` |

These are defined once and reused on the status board, villa card, field app, and owner portal. Consistency of the signifier is part of the trust.

---

## 13. PDF Export Design (statements, POs, reports)

- Follows the owner-portal typographic system — same display serif, same tabular numbers.
- Letterhead: small Arconique mark top-left, document type top-right, footer with statement ID and page count.
- Table lines are hairline, 0.5pt.
- Signature block at the end with Finance Manager + Director names + date + hash.
- Every page carries the statement hash in the footer (tamper-evidence for forwarding).
- No watermarks unless draft ("DRAFT — NOT FOR DISTRIBUTION").

---

## 14. Internationalization in Design

- Text containers flexible for +30% Bahasa Indonesia expansion.
- Numbers formatted per locale but display currency chosen by user (IDR or USD).
- Dates: editorial long-form in marketing and owner portal ("14 March 2026"); compact in admin ("14 Mar").

---

## 15. "Do-Not" Rules (binding)

- **No gradients** as decoration. Only brand-controlled subtle gradients on marketing heroes (two-stop, low contrast).
- **No default shadcn blue.** We ship a custom theme. If a component looks default, it's not done.
- **No startup/SaaS tropes:** no rotating testimonial carousels with auto-advance, no "trusted by 10,000+ teams" meters, no abstract gradient blobs.
- **No toy AI UI:** no pulsating rings, no rainbow auras, no "AI ✨" sparkles. The assistant is a serious instrument.
- **No dense colored cards.** Data surfaces are neutral; color is for signaling.
- **No black boxes.** Dark theme uses `#0C0E0D` with warm tint, never true black.
- **No red badges for scores or counts in navigation.** Use small dots for unread, not count bubbles unless necessary (inbox, approvals).
- **No stock illustrations.** If we need an illustration, we draw it.
- **No carousels on admin.** Tables, lists, or grids — never carousels.
- **No animated loading skeletons on trust-critical surfaces.** Statements show stable placeholder lines without shimmer.
- **No surprise autoplay video.** Marketing videos start muted, require intent to play.
- **No "chat bubble" mascots** or floating action buttons with character avatars.
- **No horizontal scrolling tables on mobile.** Adopt a card/stack view for mobile tables.
- **No success-state fireworks.** Success is quiet.
- **No animated status ticks longer than 500ms.**
- **No emoji in admin, owner, or field surfaces.** Guest surface may use a single brand-approved emoji per greeting, if at all.

---

## 16. Implementation Notes

- Tokens in `styles/tokens.css` generated from a small TS source-of-truth (so TS constants stay in sync for chart components).
- Tailwind v4 theme references tokens directly via `@theme` block.
- shadcn components copied into `components/ui/` and rewritten to consume tokens. Removed unused variants.
- Icon system distributed as a typed `<Icon name="…">` component; tree-shakable SVG sprites.
- Storybook per component with "do / don't" examples.
- Visual regression via Playwright + percy/Chromatic on key pages.
- Design tokens consumable by PDF templates (same JSON source).

---

## 17. Review & Governance

- A design change touching `styles/tokens.css` or any top-level component requires design review.
- Additions to icon set, motion presets, and chart palette require the same.
- Each quarter, run a "design debt" pass that audits surfaces for drift from the system.
