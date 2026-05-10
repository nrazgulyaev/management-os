# 01 — Mgmt OS / Projects

This file contains 1 sample report demonstrating the format. CHECKPOINT
2 will populate the remaining Projects sub-pages
(`/dashboard/projects/[slug]`, `/dashboard/projects/[slug]/edit`,
`/dashboard/projects/[slug]/villas`, etc.).

---

## `/dashboard/projects`

**Status**: 🟡 Half-built
**Severity**: P1 (contradicts Stage 10.F.1 "Modal-First Add" closure)
**Source file**: `src/app/(dashboard)/dashboard/projects/page.tsx`

### Production navigation signal
- HTTP status: `200`
- Console errors: `0`
- Network errors: `0`
- Has H1 / Main / Table / Form: `yes / yes / no / no`
- CTA buttons detected: `1` (the `+ New project` link)
- Verdict from prior run: **`USABLE (200)`** ← **harness false negative**

### Layout signal
- Uses Stage 10.D primitives: **none** (no `<EntityFormModal>`, no
  `<DashboardKpi>`, no `<PageHeaderHero>`, no `<RowActionsMenu>`)
- Uses legacy patterns:
  - `<PageHeader>` instead of `<PageHeaderHero>`
  - Inline `<Link href="/dashboard/projects/new">` instead of modal trigger
  - Custom card grid instead of `<RowActionsMenu>` per-row affordances
- Mobile responsive: yes (Stage 10.E grid is responsive)

### Functionality signal
- **Add**: 🔴 **Navigates to `/dashboard/projects/new`** (per `page.tsx:38`)
  — operator's flag is correct, contradicts Stage 10.F.1's claim that
  Modal-First Add ships on this surface.
- **Edit per row**: navigates to `/dashboard/projects/{slug}` (full-page route)
- **Archive per row**: archive button uses Archive verb, not Delete
  — likely intentional (projects are heavyweight; soft-archive is
  safer). Should be confirmed in CHECKPOINT 2.
- **Cancel button (in modal)**: N/A (no modal)
- **Form validation**: presumably works on `/new` route (not audited at this checkpoint)

### Demo data signal
- Quantity: needs production check — operator's screenshots suggest
  multiple realistic projects exist
- Realism: realistic (Indonesian villa-development context)
- Cross-references intact: yes — projects link to villas, owners, transactions
- Date sensibility: production check needed

### UI/UX vs reference screenshots
- Matches medical/recruitment/wallet vibe: **No**
- Big numbers: no (projects show small inline counts, not display-tier KPIs)
- Status pills: partial (badges present but not the rounded-full
  color-coded reference style)
- Modern card layout: partial
- **Gap**: cards are dense, project names are not the visual hook
  the reference's "Round 1 / Round 2" recruitment cards are.

### Integrations
- External services: none direct
- API key UI: n/a

### Bugs found
- **Bug 1** (P1): Add button uses full-page route instead of modal,
  violating Stage 10.F's "Modal-First Add" pattern. Stage 10.F.1
  closure doc claimed this surface was migrated; reality is `Link
  href="/dashboard/projects/new"` at line 38 of `page.tsx`.
  Reproduction: visit `/dashboard/projects` → click `+ New project`
  → URL changes to `/dashboard/projects/new` (full-page form, not modal).

### Operator-flagged behaviors
> "/dashboard/projects — Add navigates to /new (should be modal),
> Archive used instead of Delete (verify intentional)"

- **Modal vs /new**: Reproduced via file analysis. Confirmed P1.
- **Archive vs Delete**: Likely intentional (projects have downstream
  villas/bookings/transactions; soft-archive prevents data loss). The
  audit should document the policy and confirm with operator at
  CHECKPOINT 2 whether Delete should also be exposed for empty/zero-cost
  projects.

### Recommended action for Phase 10.6.B-F
- **Priority**: P1
- **Target sub-phase**: 10.6.B (critical fixes — restore the
  Modal-First Add invariant on every list page)
- **Effort estimate**: ~3h (extract project form into a `<EntityFormModal>`
  + replace the `<Link>` with a modal trigger, keep `/new` as a
  deep-link fallback)
- **Dependencies**: existing `<EntityFormModal>` primitive (Stage 10.D)
- **Carry-over candidate**: no — pattern compliance is a 10.6.B must

### Screenshots
- Production state: needs CHECKPOINT 2 capture
- Reference comparison: recruitment-pipeline screenshot's "Create" button
  in the top-right opens an inline modal, never navigates away.
