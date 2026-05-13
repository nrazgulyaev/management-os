# Stage 10.6 / Phase 10.6.C.1 — Cabinet visual polish (launch prompt)

**Effort**: ~32h / 5 working days
**Tests target**: ~25 acceptance tests
**Migrations**: 0
**Inputs**: 6 reference screenshots + `tmp/stage-10-6-a-checkpoint-4-ui-gap.md` token spec
**Output**: 10 cabinet dashboards visually match award-winning reference vibe

⛔ **DO NOT LAUNCH UNTIL OPERATOR REPLIES "go 10.6.C.1"**

---

## Goal

The 10 cabinet dashboards (Stage 10.5.A) shipped with `<PageHeaderHero>` + 4× `<DashboardKpi>` + 2/3-1/3 split. They render and (post-10.6.B.1) populate. But visually they're closer to a CMS admin than to the reference screenshots.

Stage 10.6.C.1 applies distilled tokens (rounded-3xl, 56pt KPIs, gradient hero cards, greeting blocks, generous whitespace) so each cabinet feels operator-grade.

---

## Sub-tasks

### 10.6.C.1.0 — Token foundation (~4h)

**File**: `src/app/globals.css`

Add new tokens (additive, doesn't break existing usage):

```css
:root {
  /* Bigger radii for hero cards */
  --r-2xl: 20px;
  --r-3xl: 24px;
  --r-4xl: 32px;

  /* Softer shadows for floating cards */
  --shadow-soft-card: 0 2px 12px -4px rgba(15, 17, 16, 0.06), 0 0 0 1px var(--line-soft);
  --shadow-elevated-card: 0 8px 32px -12px rgba(15, 17, 16, 0.12), 0 0 0 1px var(--line-soft);

  /* Hero card gradients */
  --gradient-emerald-soft: linear-gradient(135deg, #dce6df 0%, #c8d8cd 100%);
  --gradient-gold-soft: linear-gradient(135deg, #f1e7d1 0%, #e6d9b8 100%);
  --gradient-coral-soft: linear-gradient(135deg, #f0d9d2 0%, #e8c5bb 100%);
  --gradient-ink-deep: linear-gradient(135deg, #141716 0%, #0c0e0d 100%);

  /* Friendly typography */
  --text-greeting: 32px / 1.1;
  --text-hero-kpi: 56px / 1.0;
  --text-hero-kpi-xl: 72px / 0.95;
  --text-section-title: 24px / 1.2;
}

.dark {
  --gradient-emerald-soft: linear-gradient(135deg, #15332a 0%, #1a3a30 100%);
  --gradient-gold-soft: linear-gradient(135deg, #2a2313 0%, #332b1a 100%);
  --gradient-coral-soft: linear-gradient(135deg, #2a1614 0%, #331b18 100%);
  --gradient-ink-deep: linear-gradient(135deg, #0c0e0d 0%, #050706 100%);
}
```

Tailwind utility class additions (in same file, `@layer utilities`):
```css
.bg-gradient-emerald-soft { background: var(--gradient-emerald-soft); }
.bg-gradient-gold-soft { background: var(--gradient-gold-soft); }
.bg-gradient-coral-soft { background: var(--gradient-coral-soft); }
.bg-gradient-ink-deep { background: var(--gradient-ink-deep); }
.shadow-soft-card { box-shadow: var(--shadow-soft-card); }
.shadow-elevated-card { box-shadow: var(--shadow-elevated-card); }
```

Tests:
- `tests/development-stage-10-6-c-1-tokens.test.ts` — assert globals.css contains each new token + each `.dark` override

### 10.6.C.1.1 — Primitive enhancements (~6h)

**Files**:
- `src/components/ui/primitives/dashboard-kpi.tsx` — add new `variant` prop: `"hero" | "default"`. Hero variant uses `text-[56px]` instead of `text-[28px]` and supports gradient background prop.
- `src/components/ui/primitives/page-header-hero.tsx` — add optional greeting block (`greetingName?: string` → renders "Good morning, {name}! 👋" with time-of-day awareness)
- NEW: `src/components/ui/primitives/cabinet-greeting-block.tsx` — reusable greeting block. Pulls from `getCurrentUserContext()` for default name. Time-aware ("Good morning" before 12, "Good afternoon" 12-17, "Good evening" 17+). Avatar with gradient ring. Optional badge ("3 alerts today").

Don't break existing DashboardKpi consumers — `variant` defaults to `"default"`, preserves current 28pt size.

Tests:
- `tests/development-stage-10-6-c-1-primitives.test.ts` — assert hero variant renders 56pt; greeting block renders time-appropriate text; avatar gradient ring renders

### 10.6.C.1.2 — Owner cabinet polish (~4h)

**File**: `src/app/(dashboard)/dashboard/owner/page.tsx`

Apply pattern:
- Greeting block at top (replace breadcrumb)
- 1 hero KPI card (gradient-emerald-soft, 72pt for portfolio value) — variant="hero"
- 4 secondary KPI cards (default variant)
- Side panel with alerts feed (3-col layout)
- Portfolio villa cards with imagery (placeholder ok if no villa hero shots yet)

### 10.6.C.1.3 — CFO/Accountant cabinet polish (~4h)

**File**: `src/app/(dashboard)/dashboard/cfo-accountant/page.tsx`

Apply pattern:
- Greeting block
- 1 hero KPI (gradient-ink-deep, 72pt for cash position) — dark contrast block
- 6 secondary KPIs in 2-row grid
- Anomaly side panel (3-col)
- Cashflow forecast card with sparkline (gradient-gold-soft)
- Recent transactions feed

### 10.6.C.1.4 — Project Manager cabinet polish (~4h)

Apply pattern. Hero: budget burn-down or critical-path KPI.

### 10.6.C.1.5 — Remaining 7 cabinets (~8h)

Site Supervisor, QS, Procurement, Marketing, Sales, Warehouse, Front Office.

Each ~1h once the pattern is proven on the first 3. Per-cabinet hero KPI choice should reflect the role's primary metric (e.g., Sales = active leads count; Warehouse = stock-out risk; Front Office = today's arrivals count).

### 10.6.C.1.6 — Cross-cabinet consistency review (~2h)

Walk all 10 cabinets in dev. Verify:
- Greeting block renders correctly with logged-in user
- Hero KPI font sizes match
- Card radii consistent (rounded-3xl everywhere)
- Side panel renders on viewports >1024px
- Mobile (<768px): 3-col → 1-col stacking, side panel below main
- Dark mode parity preserved
- No regression in existing tests

---

## Files to modify

| Path | Change |
|---|---|
| `src/app/globals.css` | Add tokens + utility classes |
| `src/components/ui/primitives/dashboard-kpi.tsx` | Add `variant: "hero" \| "default"` prop |
| `src/components/ui/primitives/page-header-hero.tsx` | Add `greetingName` prop |
| `src/components/ui/primitives/cabinet-greeting-block.tsx` | NEW |
| `src/components/ui/primitives/index.ts` | Export new pieces |
| `src/app/(dashboard)/dashboard/owner/page.tsx` | Apply pattern |
| `src/app/(dashboard)/dashboard/cfo-accountant/page.tsx` | Apply pattern |
| `src/app/(dashboard)/dashboard/project-manager/page.tsx` | Apply pattern |
| `src/app/(dashboard)/dashboard/site-supervisor/page.tsx` | Apply pattern |
| `src/app/(dashboard)/dashboard/qs/page.tsx` | Apply pattern |
| `src/app/(dashboard)/dashboard/procurement-manager/page.tsx` | Apply pattern |
| `src/app/(dashboard)/dashboard/marketing-staff/page.tsx` | Apply pattern |
| `src/app/(dashboard)/dashboard/sales-manager/page.tsx` | Apply pattern |
| `src/app/(dashboard)/dashboard/warehouse-manager/page.tsx` | Apply pattern |
| `src/app/(dashboard)/dashboard/front-office/page.tsx` | Apply pattern |
| `tests/development-stage-10-6-c-1-tokens.test.ts` | NEW |
| `tests/development-stage-10-6-c-1-primitives.test.ts` | NEW |
| `tests/development-stage-10-6-c-1-cabinets.test.ts` | NEW (structural — each cabinet imports greeting block + uses hero variant) |

---

## Acceptance gate

| Check | Verification |
|---|---|
| New tokens added to globals.css | grep + test |
| Dark mode parity for every new token | grep `.dark` block |
| `<DashboardKpi variant="hero">` ships + tested | structural test |
| `<CabinetGreetingBlock>` ships + tested | structural test |
| 10 cabinets use greeting block + 1 hero KPI | structural test (per cabinet) |
| Mobile responsive verified (mobile sweep on 5 cabinets) | operator manual |
| Dark mode visual review (5 cabinets) | operator manual |
| ~25 tests added | count |
| TypeScript clean | `npx tsc --noEmit` |
| Build clean | `npm run build` |
| Visual review against reference screenshots | operator manual |

---

## Halt + report deliverable

After all sub-tasks complete:

1. Commit each sub-task as a separate commit (10.6.C.1.0 → 10.6.C.1.6 = 7 commits)
2. Final report includes:
   - Test count delta
   - Per-cabinet checklist (✅ or ⚠️ deferred)
   - Operator verification checklist:
     - Visit each of the 10 cabinets in dev
     - Compare side-by-side with reference screenshots
     - Confirm vibe matches OR identify specific gaps
     - Mobile spot-check at 375×667 on 5 cabinets
     - Dark mode spot-check on 5 cabinets
3. ⛔ HALT for "go 10.6.C.2"

---

## Open methodology questions (defer-able)

1. **Imagery for villa cards in Owner cabinet**: Use placeholder gradients OR pull from `villas.heroImageUrl` if column exists OR seed with stock photos? Recommend: placeholder gradients for v1, real imagery in 10.6.F.
2. **Greeting personalization name source**: `appUser.fullName` first name only OR full name? Recommend: first name (more intimate, matches "Dr. Anderson!" reference).
3. **Time-of-day greeting localization**: English-only for v1 OR i18n-ready? Recommend: English-only; i18n is a Stage 11+ initiative.
4. **Side panel content per cabinet**: shared "alerts" panel OR per-cabinet specific (chat for Front Office, anomalies for CFO, etc.)? Recommend: per-cabinet specific — matches reference patterns better.

These don't block launch; surface during execution.

---

## Why this sub-phase first

10.6.C.1 has the **highest visible payoff per hour**:
- Cabinets are operator's daily view
- Reference screenshots map cleanly to cabinet pattern
- Now-populated cabinets (10.6.B.1) make the visual upgrade noticeable
- Foundation tokens unblock 10.6.C.2/.3/.4 (lists/details/public all use the same tokens)
- No backend work, no migration, no risky refactors — pure presentational

Risk: minimal. Token additions are additive. Cabinet pattern is already proven (10.5.A); we're polishing visuals, not changing structure.

---

**Ready to launch when operator says "go 10.6.C.1".**
