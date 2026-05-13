# Stage 10.6.A CHECKPOINT 4 — UI modernization gap doc

**Date**: 2026-05-13
**Inputs**: 6 reference screenshots (doctor, logistics, recruiting, health metrics, PPC dashboard, crypto/finance) + current Arconique design system (`src/app/globals.css` + `src/components/ui/primitives/`).
**Output**: distilled token spec + per-surface gap audit + Stage 10.6.C application priority list.

---

## 1. Distilled token spec (from references)

### 1.1 Common across all 6 references

| Token | Reference value | Current Arconique |
|---|---|---|
| **Card radius** | `rounded-3xl` (24px) on every card | `rounded-md` (6px) — too tight |
| **Card padding** | 24-32px (p-6 to p-8) | p-4 to p-5 — too cramped |
| **Card gap** | 24-40px between cards (gap-6 to gap-10) | gap-3 to gap-4 — too dense |
| **Hero KPI font** | 56-80pt | 28px (text-display) — half the visual impact |
| **Background** | Cream/off-white (NOT pure white) | ✅ canvas: #f8f5f0 — already correct |
| **Status pills** | `rounded-full`, color-coded fill | ✅ Badge primitive supports it |
| **Avatar treatment** | Circle + gradient ring around active | Plain circles — gap |
| **Greeting block** | "Good day, Dr. Anderson! 👋" — friendly | Cabinets have title + description — colder |
| **Side panel** | 3-column: nav + main + side panel (chat / detail / activity) | Most pages 1- or 2-column — gap |
| **Color emphasis** | Solid-colored OR gradient cards for primary KPI | Mostly white-on-canvas with semantic accent borders |
| **Trend indicator** | Pill with arrow + % (green up / red down) | DashboardKpi has `delta` prop — usable, needs polish |
| **Search bar** | Prominent in header, full-width-ish | Not standardized in PageHeader |

### 1.2 Reference-specific patterns worth borrowing

- **Doctor (Dr. Anderson)** — green gradient hero KPI block + black contrast block + 3-column with chat side panel. Pattern fits **Owner cabinet** + **Front Office cabinet** (could have a guest-conversation side panel).
- **Logistics (Shipment Track)** — coral accent on map embed + 4-column dense KPI strip + vendor card with truck imagery. Pattern fits **Site Supervisor cabinet** (project map embed) + **Procurement cabinet** (vendor cards).
- **Recruiting (Awsmd)** — muted mauve cards + Round 1/2/3 progress chips + sidebar settings + multi-section detail layout. Pattern fits **Sales cabinet** (lead pipeline progression: lead → qualified → negotiation → contract).
- **Health metrics (Metrics.IQ)** — orange gradient hero card with portrait imagery + dark health card + mixed dark/light card rhythm. Pattern fits **Marketing cabinet** (campaign hero with imagery) + **CFO cabinet** (mixed dark accent for cash position vs light cards for line items).
- **PPC dashboard** — pastel pills (mint/lavender/pink) + draggable card grid. Pattern fits **Executive Business** + customizable dashboards (operator-flagged "I want to rearrange tiles").
- **Crypto/finance** — chunky lavender + green cards with HUGE numbers (80pt) + market forecast timeline. Pattern fits **CFO/Accountant cabinet** (cash forecast timeline) + **Owner cabinet** (portfolio value timeline).

### 1.3 Token additions needed in `globals.css`

```css
/* New radii — bigger to match reference vibe */
--r-2xl: 20px;  /* was --r-lg */
--r-3xl: 24px;  /* NEW — reference standard */
--r-4xl: 32px;  /* NEW — hero cards */

/* New shadows — softer, larger spread for floating cards */
--shadow-soft-card: 0 2px 12px -4px rgba(15, 17, 16, 0.06), 0 0 0 1px var(--line-soft);
--shadow-elevated-card: 0 8px 32px -12px rgba(15, 17, 16, 0.12), 0 0 0 1px var(--line-soft);

/* Gradient utility — for hero KPI cards */
--gradient-emerald-soft: linear-gradient(135deg, #dce6df 0%, #c8d8cd 100%);
--gradient-gold-soft: linear-gradient(135deg, #f1e7d1 0%, #e6d9b8 100%);
--gradient-coral-soft: linear-gradient(135deg, #f0d9d2 0%, #e8c5bb 100%);
--gradient-ink-deep: linear-gradient(135deg, #141716 0%, #0c0e0d 100%);

/* Friendly typography scale */
--text-greeting: 32px / 1.1;  /* "Good day, X" */
--text-hero-kpi: 56px / 1.0;  /* primary metric */
--text-hero-kpi-xl: 72px / 0.95;  /* CFO cash position, owner net worth */
--text-section-title: 24px / 1.2;  /* "Active Patients" */
```

These additions are **additive** — they don't break existing usage. Stage 10.6.C.1 cabinet polish applies them to hero blocks; existing primitives stay backward-compatible.

---

## 2. Per-surface gap audit

### 2.1 Cabinet dashboards (10 cabinets — Stage 10.5.A shipped, populated by 10.6.B.1 seed)

**Current state**: Each cabinet renders `<PageHeaderHero>` + 4× `<DashboardKpi>` + 2/3-1/3 split body. Functional, populated, but visually closer to a CMS admin than the reference vibe.

**Gap vs references**:
- KPI font size 28px vs 56-80pt → 50% less visual impact
- Card padding p-4 vs p-6/p-8 → cramped
- No greeting block ("Good morning, [Name]!")
- No gradient hero card on primary metric
- Pure white cards on cream → could use one accent-colored hero per cabinet
- No side panel column (3-col → currently 2-col)

**Stage 10.6.C.1 priority**: HIGH. 10 cabinets × ~2-3h each = 1 week's work. Operator-visible win because cabinets are now populated (10.6.B.1) and operator-bookmarked.

### 2.2 List pages (~50 pages — most migrated to Modal-First in 10.6.B.4)

**Current state**: Most list pages use `<PageHeader>` (older primitive) + Table or card grid. Modal-First Add CTAs landed in PRs 2-9.

**Gap**:
- `PageHeader` (legacy) doesn't match the reference "big title + filter pills + search" pattern
- Tables use thin rows (no breathing room) vs reference card-grid look
- No filter sidebar pattern (most list pages have inline filter chips at best)
- Empty states (`<NoItemsYet>`) functional but plain — references show gradient + illustration

**Stage 10.6.C.2 priority**: MEDIUM-HIGH. Operator visits these every day, but sound functionality is more valuable than polish here. Apply pattern incrementally.

### 2.3 Detail pages (entity views — villas, projects, owners, bookings, etc.)

**Current state**: Mixed quality. Some have `<PageHeader>` + sectioned tabs (good). Some are flat single-column (poor). Forms inline on detail pages are old pattern.

**Gap**:
- No standard "detail hero" pattern (entity name + status + primary actions)
- Form modals (Stage 10.D.2 EntityFormModal) styled differently from inline forms — inconsistency
- No standard "side panel" for related entity quick-actions

**Stage 10.6.C.3 priority**: MEDIUM. Less operator-frequented than lists but high-impact when used (signing a contract, checking out a guest).

### 2.4 Public pages (/, /products/*, /pricing, /sign-up, /sign-in)

**Current state**: Functional. /products/management-os and /products/development-os shipped in earlier stages. Brand voice present.

**Gap vs award-winning references**:
- Hero impact below industry standard
- Feature grids could use the gradient-card pattern
- /pricing tier cards plain — references use gradient highlighting on featured tier
- /sign-up form is utilitarian — needs the modern card-with-illustration treatment

**Stage 10.6.C.4 priority**: HIGH for conversion. First-impression matters more here than internal pages.

### 2.5 Owner portal (/owner/*)

**Current state**: Read-mostly. Owner cabinet shipped in 10.5.A.1. Owner stays + statements pages plain.

**Gap**:
- Owner-facing UI should feel premium (these are paying owners viewing their assets)
- Hero portfolio block + villa cards with imagery would match reference vibe
- Statement detail pages could use the timeline pattern from crypto reference

**Stage 10.6.C.1 (cabinet polish) covers the dashboard. Other owner pages defer to 10.6.C.3.**

### 2.6 Mobile-specific surfaces (field worker / guest)

**Current state**: `<MobileTaskCard>`, `<PhotoCapture>`, `<VoiceNote>`, `<GeoCheckIn>` primitives shipped. Touch targets ≥44px.

**Gap**: Not measured this checkpoint — requires real device testing. Flagged as carry-over for operator (see § 4 below).

---

## 3. Stage 10.6.C application priority

Per the master plan's Phase 10.6.C (4 sub-phases × ~1 week each):

| Sub-phase | Surface | Effort | Operator-visible payoff |
|---|---|---|---|
| **10.6.C.1** | 10 cabinet dashboards visual polish | 1 week | HIGH — operator's daily view |
| **10.6.C.2** | ~50 list pages modernization | 1 week | MEDIUM — repeated touch points |
| **10.6.C.3** | Detail pages + form modal restyle | 1 week | MEDIUM — high-stakes flows |
| **10.6.C.4** | Public pages + auth polish | 3-5 days | HIGH for conversion (beta launch) |

**Recommended sequencing**: Run 10.6.C.1 first (biggest visible win), then 10.6.C.4 (unblock soft launch), then C.2 + C.3 in parallel if a designer-hand-off happens.

---

## 4. What I could not do this checkpoint (deferrals)

- **Mobile responsiveness sweep at 375×667**: requires real device testing or Playwright with viewport emulation against a running dev server. I can statically check for `md:` / `sm:` breakpoints in component files, but that doesn't catch real layout breakage. Recommend operator runs a manual mobile sweep on the same 30 pages the audit harness covers (~30 min) and pastes findings.
- **Accessibility (WCAG AA) verification**: no axe / pa11y run this session. Recommend 10.6.C.1 includes a Lighthouse + axe pass per cabinet.
- **Lighthouse score baseline**: not run. Recommend operator captures `lighthouse --output=json` for the 7 key pages (homepage, signup, owner cabinet, CFO cabinet, projects list, villa detail, /products/management-os) before 10.6.C.1 starts so we have a before/after delta.

---

## 5. Token migration safety notes

Before applying new radii / shadows / gradients in 10.6.C.1:

1. **Don't break existing primitives**. Add `--r-3xl` and `--r-4xl` as NEW tokens; existing `--r-md` / `--r-lg` consumers stay on the old radii. Migrate per-component.
2. **Preserve dark mode**. Every token addition needs a `.dark` override.
3. **Test in storybook-ish way**: spin up `/dashboard` in dev, swap one cabinet to the new tokens, screenshot, compare side-by-side with reference. Iterate before mass-applying.
4. **Don't over-color**. References use ONE gradient hero per dashboard, not five. Restraint preserves the editorial vibe.

---

## 6. Open questions for operator

1. **Greeting personalization** — should "Good morning, [first name]!" pull from `getCurrentUserContext().appUser.fullName`? Localize per language? Default avatar if no profile photo set?
2. **Dark mode parity** — references are all light mode. Should 10.6.C.1 preserve dark-mode parity for every cabinet, or treat dark as a deferred separate pass?
3. **Custom dashboard layouts** — the PPC dashboard reference shows draggable tiles. Operator previously hinted at wanting tile rearrange. Is this a 10.6.C.1 scope item, or 10.6.F+ work?
4. **Imagery in cabinets** — references show portrait photos in some cards (Marketing campaigns, Health metrics). Where would Arconique source imagery? Villa hero shots? Owner portraits? Stock placeholder?

---

**Status**: Token spec distilled, 5 cabinet patterns mapped to references, application priority set. Ready to feed into Phase 10.6.C planning.

Stage 10.6.C.1 launch readiness: ✅ this doc + reference screenshots + token additions to `globals.css` is sufficient scope to begin.
