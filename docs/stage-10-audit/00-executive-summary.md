# Stage 10 Audit — Executive Summary

**Date**: 2026-05-08
**Audit type**: pure documentation phase (no engineering, no production writes)
**Authentication**: founder / super_admin (audit-bot@arconique.com)

---

## Audit scope

- 2 products audited (Development OS + Management OS)
- 266 pages walked via authenticated Playwright
- 266 screenshots captured at `tmp/stage-10-screenshots/`
- 211 issues catalogued (BLOCKER=56, HIGH=60, MEDIUM=94, LOW=1)

### Verdict breakdown
| Verdict | Count | Meaning |
|---|---|---|
| USABLE | 164 | renders cleanly, no leaks detected |
| MISSING | 55 | 404 — route not built (operator's scope listed paths that don't exist) |
| EMPTY-OK | 37 | empty-state copy without an Add CTA |
| EMPTY-LEAKY | 9 | empty state surfaces dev instructions (`npm run db:seed:*`) |
| BROKEN | 1 | server error |

---

## Headline interpretation (raw counts ≠ effort)

The auto-generated counts below need context before they drive estimates. Reading the body of each cross-cutting doc:

### Stage label leakage — **1 file edit, not 124 page edits**

The synthesis script reports "124 pages, 1608 occurrences." Spot-check confirms: every Development OS page shows the **same** set of 13 stage labels (`5.F`, `5.E`, `5.D`, `5.C`, `5.B`, `4.A`, `3.C`, `3.D`, `4.C`, `5.H`, `5.A`, `3.A`, `5.J`). Source: `src/lib/development/navigation.ts` lines 196-329 — every sidebar link carries a `badge: "X.Y"` prop. The fix is **one file**: drop the `badge` props (or replace with operator-meaningful labels). Effort: **0.5 day**, single PR, no rollout risk.

### "Next-wave / coming soon" badges — **also navigation-driven**

123 pages, 131 occurrences. Same root: shared sidebar component shows soft labels next to module groups. Verify per-occurrence whether the badge is accurate (genuinely deferred) vs. stale (already shipped but never relabeled). Effort: **0.5 day**.

### Developer leakage — **9 pages, 1 systemic empty-state pattern**

Every leak is identical: `db:seed:dev-os` instruction surfaced as empty-state copy in dev-os pages (commitments, finance, finance/bank-accounts, finance/categories, finance/tax-types, investors, materials, safety) plus `npm run db:migrate` on `/dashboard/system/health`. Likely a single shared `<EmptyState>` variant or 8-9 copy-pasted blocks. Effort: **1-2 days** to replace each with operator CTA ("Add your first ___" / "Import from CSV").

### Partial CRUD (Add but no Edit/Delete) — **40 pages, 3-5 days for a universal pattern**

40 pages have Add affordance but no Edit or Delete buttons matching by text. Examples (heavy concentration in inventory + bookings + ops surfaces):
- `/dashboard/inventory` + 5 sub-pages — shipped Add, no Edit/Delete
- `/dashboard/operations/housekeeping`, `tasks`, `preventive`, `maintenance`
- `/dashboard/owners`, `/dashboard/shares`, `/dashboard/projects`
- `/dashboard/villa-guides/emergency-contacts`, `/dashboard/villa-guides/sections`, `/dashboard/villa-guides/neighborhood` — already operator-flagged

Heuristic note: **icon-only Edit/Delete buttons without aria-label or visible text are missed**. Hand-verify these 40 in Stage 10.C kickoff. The fix pattern: per-row action menu (kebab → Edit/Archive) + universal `<ConfirmDialog>` shared primitive.

### Modal-vs-page Add forms — **30 pages, 1 week for universal Modal**

30 pages route Add to `/<entity>/new` instead of opening a dialog. The codebase has no shared `<EntityFormModal>` primitive. Stage 10.B shipped `DrillDownPanel` (slide-over) which solves the inverse case (drill from list to detail). The Add direction needs its own primitive (`<EntityFormModal>` or extend Radix Dialog) + per-page conversion. Effort: **1 week** for primitive + 5-8 pivotal page conversions; remaining pages can lag.

### MISSING (404) — **route IA mismatch, not bugs**

55 paths returned 404. Spot-checks confirm: many are operator-mental-model paths that don't exist as shipped routes:
- `/dashboard/calendar` (lives at `/dashboard/bookings/calendar`)
- `/dashboard/audit-log` (doesn't exist; closest is `/dashboard/system/job-runs`)
- `/dashboard/finance/material-usage-bridge` (lives elsewhere or never shipped)
- `/dashboard/front-office/availability/board` (lives at `/dashboard/front-office/today`?)

This isn't an engineering BLOCKER — it's an **information architecture gap**. Either the routes need to ship, or the menu links need to point at existing routes. Per-route triage in Stage 10 master plan.

### Slow pages — **Stage 9.I already optimized**

Audit recorded only 1 page > 10s during the run. Stage 9.I aggregate-perf optimizations covered the worst offenders. No new perf work emerges from Stage 10.A unless interview synthesis surfaces more.

---

## Top critical findings (BLOCKERS — 56)

All BLOCKERS are 404 + 1 BROKEN page. Triage in Stage 10 plan as IA fixes (route or menu, not engineering rebuilds):

1. `/dashboard/audit-log` — 404 not found
2. `/dashboard/calendar` — 404 (route is `/dashboard/bookings/calendar`)
3. `/dashboard/ai/assistants` — 404
4. `/dashboard/direct-bookings/guest-messages` — 404
5. `/dashboard/finance/material-usage-bridge` — 404
6. `/dashboard/finance/statement-transparency` — 404
7. `/dashboard/front-office/availability/board` — 404
8. `/dashboard/front-office/calendar-blocks` — 404
9. `/dashboard/front-office/check-in-out-requests` — 404
10. `/dashboard/front-office/readiness` — 404

(Full list per module in `management-os/{N}-{slug}.md`. The 1 BROKEN page surfaces a server error on render — see `patterns-observed/bad-patterns.md`.)

## Top HIGH-severity findings (60)

Real CRUD-completeness gaps + page-instead-of-modal Add patterns. Top 10:

1. `/dashboard/documents` — Add but no Edit/Delete; Add navigates (page, not modal)
2. `/dashboard/guest-journey/rules` — same pattern
3. `/dashboard/integrations/calendar-events` — same
4. `/dashboard/integrations/calendar-feeds` — same
5. `/dashboard/inventory` — same
6. `/dashboard/inventory/items` — same
7. `/dashboard/inventory/locations` — same
8. `/dashboard/inventory/movements` — same
9. `/dashboard/inventory/suppliers` — same
10. `/dashboard/operations/housekeeping` — same

(Full list per module in `*/{N}-{slug}.md`. Cross-cutting in `cross-cutting/crud-completeness.md` + `cross-cutting/modal-vs-page.md`.)

---

## Systemic patterns

| Pattern | Count | Where it lives | Estimated fix |
|---|---|---|---|
| Stage label leakage | 124 pages, 1608 occurrences | `src/lib/development/navigation.ts` (sidebar badges) | 0.5 day, single file |
| "Next Wave"/"Coming soon" | 123 pages, 131 occurrences | shared sidebar/header (verify per occurrence) | 0.5 day |
| Developer instruction leakage | 9 pages | empty-state copy in 9 dev-os pages | 1-2 days |
| Partial CRUD (Add but no Edit/Delete) | 40 pages | per-page row affordances | 3-5 days |
| Delete without confirmation pattern | (heuristic-incomplete) | needs `<ConfirmDialog>` primitive | 1-2 days for primitive |
| Inline-page Add (should be modal) | 30 pages | per-page Add link → primitive | 1 week (primitive + conversions) |
| Slow pages (TTI > 10s) | 1 | Stage 9.I likely already covered | minimal |
| Broken or missing pages | 55 MISSING + 1 BROKEN | menu IA mismatch, not crashes | per-route triage |

---

## Suggested Stage 10 phasing

(Operator-level estimates — final order decided post-audit review.)

| Phase | Focus | Effort | Issues addressed |
|---|---|---|---|
| 10.B-CLEANUP* | Universal cleanup | 1 week | Stage labels (1 file), dev leaks (9 pages), next-wave badges, broken sidebar IA |
| 10.C-CRUD | CRUD completeness | 1-2 weeks | Partial-CRUD pages (40+) — universal row action menu + ConfirmDialog primitive |
| 10.D-MODAL | Modal-first Add forms | 1 week | EntityFormModal primitive + 30 page conversions |
| 10.E-EMPTY | Empty-state improvements | 3 days | Helpful copy + CTA primitive (replaces dev-leak empty states) |
| 10.F-BRAND | Branding split | 3-5 days | Arconique OS umbrella + per-product naming |
| 10.G-DASH | Specialized dashboards | 2-3 weeks | Per-cabinet polish (consumes Phase 10.B primitives shipped) |
| 10.H-PUB | Public landing + commercial | 1 week | /products/* + pricing + 7-day trial |
| 10.I-ROLE | Role-specific cabinets | 1 week | Re-run audit per non-super-admin role + sidebar adapts |
| 10.J-AI | AI integration polish | 1 week | Provider key UI + per-agent activation |
| 10.K-POLISH | Final polish | 3-5 days | Cross-page consistency, Lighthouse > 90, regression sweep |

\* The Phase 10.B already shipped (Phase 10.A research + 12 design-system primitives committed in `9a52531`) is conceptually distinct from the **10.B-CLEANUP** above. The research-driven 10.B set up role-specific UX primitives; the audit-driven 10.B-CLEANUP fixes existing-product UX hygiene. The operator should rename and rescope as appropriate when issuing the master plan — both are real work, both feel blocked without the other.

**Total**: 6-9 weeks for full Stage 10 from this audit baseline.

---

## Operator decisions needed

1. **Phase order** — cleanup-first sweep (10.B-CLEANUP → 10.C-CRUD → 10.D-MODAL → 10.E-EMPTY) before any role-specific work? Or run role phases in parallel? Stage 10.A research suggested parallel; this audit recommends fixing foundation first.
2. **Vercel Pro upgrade timing** — relevant for 10.H public landing if SSR fan-out grows.
3. **Stripe activation timing** — Phase 9.A still operator-side. 10.H public landing won't ship a working trial without it.
4. **Public landing priority** — 10.H is "1 week" but can be later if no marketing push is queued.
5. **RBAC re-audit per role** — Stage 10.I requires re-running this audit harness as `accountant`, `property_manager`, `investor_owner`, `technician`, etc. and diffing the verdict matrix. Operator confirms which 3-4 roles to re-audit first.

---

## Methodology + caveats

- All pages reached as super_admin via authenticated Playwright. Non-super-admin views differ — out of scope for this run.
- CRUD heuristic uses visible button text. Icon-only buttons without aria-label fall through.
- Modal-vs-page heuristic counts `a[href$="/new"]` (page) and `button[aria-haspopup="dialog"]` (modal). Mixed-pattern pages tagged ambiguous.
- Stage-label regex `\d+\.[A-N](\.\d+)?` may include false positives in version numbers. Spot-checked: all hits in this audit are real navigation badges.
- Dev-leak regex matches `npm run`, `db:seed`, `tsx scripts/`, `.env.`, `drizzle-kit`, `TODO:`, `FIXME:`. All 9 hits confirmed real.
- Empty-state extraction relies on `[data-empty]`, `[class*="empty-state"]`, `No <X>` text. Custom empties missed.
- 55 MISSING paths reflect operator's scope spec including routes that don't exist as shipped — IA mismatch, not engineering bug.

**No production code modified during this phase.**

Per-module detail: [`development-os/`](development-os/), [`management-os/`](management-os/).
Cross-cutting analysis: [`cross-cutting/`](cross-cutting/).
Patterns: [`patterns-observed/`](patterns-observed/).
Raw audit JSON: `tmp/stage-10-audit-results.json`.
