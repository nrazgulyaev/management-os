# Per-page report template

Copy this format for every page entry. Each per-section markdown file
(e.g., `villas.md`) contains one or more page entries separated by
`---`.

---

## `/dashboard/{path}/{page}`

**Status**: 🔴 Broken | 🟡 Half-built | 🟢 Working | 🆕 Empty
**Severity**: P0 | P1 | P2 | P3
**Source file**: `src/app/(dashboard)/dashboard/{path}/{page}/page.tsx`

### Production navigation signal
- HTTP status: `200` / `4xx` / `5xx`
- Console errors: `0` / `N` (list)
- Network errors: `0` / `N` (list)
- Render time: `Xms`
- Has H1 / Main / Table / Form: `yes/no` per
- CTA buttons detected: `[ "+ Add", "Generate" ]`
- Verdict from `audit-production-results.json`: `USABLE` / `PARTIAL` / `BROKEN` / `MISSING` / `NEEDS-AUTH` / `DEFERRED`

### Layout signal
- Uses Stage 10.D primitives (DashboardKpi / PageHeaderHero /
  EntityFormModal / RowActionsMenu / NoItemsYet): `[list those imported]`
- Uses legacy patterns (PageHeader / MetricCard / EmptyState /
  inline `<Link href="…/new">`): `[list]`
- Mobile responsive: `yes` / `no` / `partial — describe`

### Functionality signal
- **Add**: `Modal opens` | `Navigates to /new` | `Broken: <description>` | `Missing`
- **Edit per row**: `Works (modal pre-fills)` | `Works (full-page route)` | `Broken: <description>` | `Missing`
- **Delete / Archive per row**: `Works` | `Broken: <description>` | `Missing`
- **Cancel button (in modal)**: `Works (closes modal)` | `Broken: <Link nav, modal stays open>` | `N/A`
- **Form validation**: `Works` | `Issues: <description>`
- **Per-row actions menu**: `RowActionsMenu present` | `Inline buttons` | `Missing`

### Demo data signal
- Quantity: `Rich (10+ rows)` | `Minimal (1-3 rows)` | `Empty`
- Realism: `realistic` | `placeholder` | `lorem-ipsum`
- Cross-references intact: `yes` (e.g., bookings → villas → owners) | `no`
- Date sensibility: `recent` | `stale (2023)`

### UI/UX vs reference screenshots
- Matches medical/recruitment/wallet vibe: `Match` | `Partial` | `No`
- Uses big numbers (≥28pt) for KPIs: `yes` | `no` | `n/a`
- Uses status pills (rounded-full, color-coded): `yes` | `no`
- Uses trend indicators (+X% with arrow): `yes` | `no` | `n/a`
- Generous whitespace (≥24px section gaps): `yes` | `no`
- Modern card layout (rounded ≥12px, subtle shadows): `yes` | `no`

### Integrations
- External services this page touches: `[list]`
- API key UI for those services: `[present / missing — where it should live]`

### Bugs found (file-based + production)
- **Bug 1** (severity: P0/P1/P2/P3): description + reproduction steps
- **Bug 2**: ...

### Operator-flagged behaviors
- Quote from operator's manual review: `"…"`
- Reproduction status: `Reproduced` | `Could not reproduce` | `Needs production access`

### Recommended action for Phase 10.6.B-F
- **Priority**: P0 / P1 / P2 / P3
- **Target sub-phase**: 10.6.B (critical) / 10.6.C (UI modernization) / 10.6.D (integrations) / 10.6.E (SubscriptionOS) / 10.6.F (business logic)
- **Effort estimate**: `~Xh` (rough)
- **Dependencies**: `[other pages or schemas this depends on]`
- **Carry-over candidate**: `yes` (defer past 10.6) / `no`

### Screenshots
- Production state: `screenshots/{slug}.png` (when captured by harness)
- Reference comparison: `[describe gap]`
