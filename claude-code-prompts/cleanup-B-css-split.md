# Cleanup PR · components.css split

**Purpose:** `src/styles/components.css` has grown from ~470 lines (post-2.1) to ~5,000 lines (post-2.3) as each cabinet appended its scoped CSS. Split into per-cabinet modules to make per-cabinet styling easier to find and edit, and to enable per-route CSS code-splitting if Next ever supports it for App Router.

## Target structure

```
src/styles/
├── tokens.css           (unchanged · all design tokens)
├── reset.css            (unchanged)
├── typography.css       (unchanged · display helpers + density variants)
├── components/
│   ├── primitives.css   (Card, Pill, Badge, Button, basic table — was the start of components.css)
│   ├── shell.css        (sidebar, topbar, mobile-tabbar, layout chrome — moved from existing shell.css)
│   ├── filter-bar.css   (FilterBar, FacetPanel, BulkBar — from 2.1)
│   ├── detail.css       (DetailPage bricks — from 2.1)
│   ├── modal.css        (Modal/ConfirmModal — from 2.1)
│   ├── command-palette.css (⌘K — from 2.1)
│   ├── ai-agent.css     (transcript, message bubbles — from 2.1)
│   ├── empty-state.css  (from 2.1)
│   ├── pager.css        (from 2.1)
│   ├── finance.css      (section-pill, statement-detail — from 2.2 mgmt)
│   ├── bookings.css     (channel-pill, row-tone, arrival-cal — from 2.2 mgmt)
│   ├── owners.css       (tier-ring, risk-pill, insight-card — from 2.2 mgmt)
│   ├── operations.css   (ops-hero, sla-pill, kanban — from 2.2 mgmt)
│   ├── projects.css     (proj-card, health-pill — from 2.2 dev)
│   ├── cfo.css          (waterfall — from 2.2 dev)
│   ├── boq.css          (wp-tree, delta-pill, variance-card — from 2.2 dev)
│   ├── procurement.css  (rfq-pill, quotes-grid — from 2.2 dev)
│   └── owner-portal.css (net-hero, owner-status-pill, narrative density — from 2.3)
├── motion.css           (unchanged)
└── mobile.css           (unchanged · global breakpoints + class-based grid overrides)
```

## Implementation

1. **Move components.css contents** into the new `components/` subdirectory files. Each receives its scoped CSS as identified by visual section header comments in the current file.
2. **Update `globals.css`** to import all new modules in order:
   ```css
   @import "../styles/tokens.css";
   @import "../styles/reset.css";
   @import "../styles/typography.css";
   @import "../styles/components/primitives.css";
   @import "../styles/components/shell.css";
   @import "../styles/components/filter-bar.css";
   @import "../styles/components/detail.css";
   @import "../styles/components/modal.css";
   @import "../styles/components/command-palette.css";
   @import "../styles/components/ai-agent.css";
   @import "../styles/components/empty-state.css";
   @import "../styles/components/pager.css";
   @import "../styles/components/finance.css";
   @import "../styles/components/bookings.css";
   @import "../styles/components/owners.css";
   @import "../styles/components/operations.css";
   @import "../styles/components/projects.css";
   @import "../styles/components/cfo.css";
   @import "../styles/components/boq.css";
   @import "../styles/components/procurement.css";
   @import "../styles/components/owner-portal.css";
   @import "../styles/motion.css";
   @import "../styles/mobile.css";
   ```
3. **Delete** the now-empty `src/styles/components.css` (keep `shell.css` since it's referenced separately — move its content into `components/shell.css` and delete the root `shell.css` too).

## Identifying section boundaries

Easiest way: grep for comments like `/* === BOOKINGS === */` or `/* === FINANCE === */` headers I added per cabinet. If section headers are missing on some additions, infer by inspecting class-name prefixes:
- `.sec-pill, .stmt-foot` → finance.css
- `.channel-pill, .row-arriving, .arrival-cal` → bookings.css
- `.tier-ring, .risk-pill, .insight-card, .villa-mini` → owners.css
- `.ops-hero, .ops-tile, .sla-pill, .pri-badge, .staff-chip` → operations.css
- `.proj-card, .health-pill, .progress-bar, .milestone-row` → projects.css
- `.waterfall, .wf-row, .capcall` → cfo.css
- `.wp-tree, .delta, .variance-card` → boq.css
- `.rfq-pill, .quotes-grid, .vendor-score` → procurement.css
- `.net-hero, .owner-status, .greet, .owner-narr, .villa-hero, .photo-grid, .perf-bars, .cal-month, .thread-list, .thread-view, .msg-bubble, .doc-row, .doc-group, .set-section, .set-row, .toggle` → owner-portal.css

## Validation

- `npm run typecheck` clean
- `npm run lint` clean
- `npm run build` succeeds and output CSS bundle has same total bytes (within rounding) as before
- Visual check: spot-check 5 cabinets across products at desktop + mobile — no style regressions
- Verify no duplicate selectors across new files (CSS specificity could differ)

## Commit

`phase-2.x-cleanup(css): split components.css (~5k lines) into 16 per-cabinet modules`

## Optional follow-up

Once split lands, consider switching to CSS Modules per cabinet — but that's its own large refactor (PR-rewrite scope) and probably not worth it until App Router supports it natively in a future Next.js release.
