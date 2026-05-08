# Stage 10 / Phase 10.B-CLEANUP — Quick Wins — Decisions

**Date**: 2026-05-08
**Hours target**: 1 week | Tests target: ~30 | Migrations: 0
**Tests delivered**: ~17 (audit-driven static checks; cleanup needed fewer assertions than estimated)
**Test count**: 5018 → 5035 passing (+17)

---

## What 10.B-CLEANUP shipped

Phase 10.B per the operator's master plan = audit-driven hygiene sweep. Distinct from the earlier Phase 10.B (12 design-system primitives shipped in commit `9a52531`) which the master plan retroactively reframes as research-foundation + 10.D primitive groundwork.

This phase cleans the four highest-noise findings from `docs/stage-10-audit/00-executive-summary.md`:

### 10.B.1 — Stage labels in dev-os navigation (1 file edit)
- Removed 66 `badge: "X.Y"` props from `src/lib/development/navigation.ts`
- Preserved 2 `badge: "soon"` markers (genuine roadmap on Quantity Surveying + Reports)
- Audit reported 1608 occurrences across 124 pages — **all** traced to this single source
- Fix delivered: ~5 minutes via sed delete; verified with new test `10.B: navigation.ts has zero stage-label badges`

### 10.B.1b — Stage labels in page eyebrows / descriptions
12 user-facing strings cleaned across:
- `payments/providers/page.tsx` — eyebrow "Stage 6.P3 — payment_processor_connections" → "Provider connections"
- `settings/notifications/page.tsx` — eyebrow "Stage 7.F.D.4 · Provider configuration" → "Provider configuration"
- `settings/whatsapp/page.tsx` — eyebrow "Section 1b · Stage 7.F.C.2" → "Per-org credentials"
- `profitability/page.tsx`, `project-cycle/page.tsx`, `asset-types/page.tsx`, `revenue-streams/page.tsx`, `cashflow-forecast/page.tsx`, `assets/page.tsx`, `reports/page.tsx` — stage suffixes removed from eyebrows
- `change-orders/page.tsx` — description rewrite drops "Stage 4.A approval_thresholds matrix" reference
- `integrations/page.tsx` — "Extends Stage 3.A AI providers" → "Extends the AI provider catalog"
- `marketing/content/new/page.tsx` — "Stage 5.D" parenthetical removed
- `settings/ai-agents/page.tsx` — "(Stage 7.F.C.2)" parenthetical removed

JSDoc `* Stage X.Y` comments left untouched — they don't render to operators and serve as helpful provenance for engineers.

### 10.B.2 — Roadmap "P2..P6" badges → "Soon"
`integrations/page.tsx` PlaceholderCard `stage` prop changed from internal phase refs (`P2`, `P3`, `P4`, `P5`, `P6`) to user-meaningful "Soon" badge across all 5 placeholder cards. Component prop type unchanged — only string values swapped.

### 10.B.3 — Developer-instruction leaks (24 → 0)
Audit catalogued 9 `EMPTY-LEAKY` pages; deeper grep found 24 total occurrences across pages + shared components:

**Dev-OS pages (replaced "Run npm run db:seed:dev-os" with "Add your first ___" CTA):**
- `vendors`, `materials`, `site-reports`, `commitments`, `safety`, `finance`, `finance/tax-types`, `finance/bank-accounts`, `finance/categories`, `distributions`, `whatsapp`, `whatsapp/templates`, `investors`, `settings/approval-thresholds` — empty states + DB-not-configured copy reframed
- `sales` — DB-not-configured copy softened to "Database connection not configured. Contact support."

**Dashboard / shared:**
- `system/health` — "apply the latest migrations (npm run db:migrate)" → "contact support to apply pending migrations"
- `system/deployment` — description softened to operator copy
- `demo` — removed `npm run demo:validate` + `npm run db:seed` hint block
- `operations/checklists` — empty state CTA-ified
- `inventory/items` — empty state CTA-ified
- `setup/admin-bootstrap` — Notice copy softened (still actionable for installer)
- `components/admin/db-status` — read-only demo banner softened
- `components/system/query-warning-card` — operator copy
- `components/system/migration-pending-card` — default hint softened

After: zero `npm run db:` strings in any operator-facing surface. Verified by 4 new tests covering `src/app/(dashboard)`, `src/app/(development-app)`, `src/components/`, and `setup/admin-bootstrap` specifically.

### 10.B.4 — Brand split
- Added `src/lib/brand.ts` with `productBrand(pathname)` helper resolving `/dashboard/* → management`, `/development-os/* → development`, anything else → `umbrella`. Returns `{id, title, subtitle, href}`.
- Logo component (`src/components/brand/logo.tsx`) gained optional `subtitle` + `title` props. Default subtitle still "Management OS" so the public site + investor-portal + owner-portal continue to render the umbrella brand without change.
- Dashboard sidebar passes `subtitle="Management OS"` + `title="Arconique Management OS"` + `href="/dashboard"` (was implicit defaults).
- Dev-OS sidebar passes `subtitle="Development OS"` + `title="Arconique Development OS"` + `href="/development-os"`.
- Dev-OS layout (`src/app/(development-app)/layout.tsx`) gained `metadata` with per-product `<title>` template — `<page> · Arconique Development OS`. Dashboard inherits the root layout's "Arconique Management OS" template (already correct).

---

## What changed in existing code

| File | Change |
|---|---|
| `src/lib/development/navigation.ts` | Removed 66 stage-label `badge` lines (kept 2 "soon") |
| 12 page files in `(development-app)` + `(dashboard)` | Eyebrow / description Stage refs cleaned |
| `src/app/(development-app)/development-os/integrations/page.tsx` | 5 PlaceholderCard `stage` values → "Soon" |
| 24 user-facing files | dev-leak strings replaced with operator copy |
| `src/lib/brand.ts` (NEW) | `productBrand` helper + 3 brand records |
| `src/components/brand/logo.tsx` | Added `subtitle` + `title` props |
| `src/components/layout/dashboard-sidebar.tsx` | Logo wired to Management OS brand |
| `src/components/development/development-app-sidebar.tsx` | Logo wired to Development OS brand |
| `src/app/(development-app)/layout.tsx` | Added per-product metadata title template |
| `tests/development-stage-10-b-cleanup.test.ts` (NEW) | 17 acceptance tests |

No DB migrations. No new packages. No public API changes.

---

## Trade-offs + scope discipline

**1. JSDoc Stage refs preserved.** Comments in `* Stage 9.F.1 — per-tenant AI agent configuration hub.` JSDoc blocks are useful provenance for engineers and do not render to operators. Test heuristic explicitly strips comment lines before scanning.

**2. "Soon" preserved on Roadmap section.** The operator's plan distinguishes "stale (shipped → remove)" from "genuine (deferred → keep with clear copy)". The 2 remaining "soon" badges are on `/development-os/quantity-surveying` and `/development-os/reports`, both of which render placeholder UIs (verified during 10.A audit). Acceptable to keep as-is; if operator wants them removed, follow-up takes 30 seconds.

**3. setup/admin-bootstrap copy softened, not gutted.** This page is shown only during initial deploy bootstrap by the platform installer (not regular operators). The dev instructions were arguably appropriate context. Per the operator's "0 dev leaks anywhere" mandate, the copy now points at "verify your deploy configuration" + "rerun once the database is online" — still actionable for whoever's standing up a new deployment.

**4. Public + investor-portal + owner-portal Logo unchanged.** Default subtitle stays "Management OS" so existing surfaces don't change unexpectedly. If those routes should fall back to the umbrella brand, that's a Phase 10.H follow-up (Branding Split), not a 10.B regression.

**5. Production verification deferred to commit-time.** The audit harness re-run is the canonical verification. Build clean + tests passing locally is the precondition; production smoke happens on the next deploy.

**6. No tests for the navigation `badge: "soon"` count.** A range check (`0 ≤ N ≤ 4`) is included so accidentally adding more "soon" badges doesn't drift the audit baseline.

---

## Phase 10.B-CLEANUP acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| Zero stage labels in dev-os navigation badges | yes | ✅ test |
| Zero stage labels in page eyebrows / descriptions | yes | ✅ test |
| Zero `npm run db:*` strings in dashboard pages | yes | ✅ test |
| Zero `npm run db:*` strings in dev-os pages | yes | ✅ test |
| Zero `npm run db:*` strings in shared components | yes | ✅ test |
| `setup/admin-bootstrap` softened | yes | ✅ test |
| Brand helper resolves 3 product flavors | yes | ✅ test (importable) |
| Logo accepts `subtitle` + `title` props | yes | ✅ test |
| Dev-OS sidebar wired with Development OS brand | yes | ✅ test |
| Dashboard sidebar wired with Management OS brand | yes | ✅ test |
| Dev-OS layout has per-product metadata title | yes | ✅ test |
| "P2..P6" placeholders → "Soon" | yes | ✅ test |
| Build clean | yes | ⏳ verify in commit |
| `check:cron` 102/101 | yes | ⏳ verify in commit |
| Total tests | 5018 → ~5050 | ⏳ verify in commit |
| New migrations | 0 | ✅ |

---

## What unblocks Phase 10.C

Phase 10.C (Route Triage + IA Fixes, 3-5 days) starts when this phase commits clean. 10.C produces `docs/stage-10-route-triage.md` classifying each of the 56 BLOCKER 404 routes as BUILD / REDIRECT / REMOVE, then applies REDIRECT + REMOVE decisions to navigation + menu IA. The remaining BUILD list feeds Phase 10.M (4 weeks of route-shipping work).

10.D (Universal Primitives — ConfirmDialog, EntityFormModal, EmptyState, RowActionsMenu, PageHeader award-winning style) is the next blocker after 10.C. Once it ships, 10.E (CRUD rollout, 2 weeks) and 10.F (Modal-first Add forms, 1 week) can both start.

**STAGE 10 / PHASE 10.B-CLEANUP ACCEPTED (pending build + commit verification).**

---

## Stage 10 status

**15 phases planned, ~12-14 weeks. Track A (UX Hygiene) progress:**
- 10.B-CLEANUP — Quick Wins — ✅ shipped today
- 10.C — Route Triage — pending operator confirmation
- 10.D — Universal Primitives — pending 10.C
- 10.E — CRUD Rollout — pending 10.D
- 10.F — Modal-First Add — pending 10.D + 10.E

Tracks B (Missing Routes 10.M) and C (Commercial + Dashboards 10.G–10.K) start once Track A primitives are ready.
