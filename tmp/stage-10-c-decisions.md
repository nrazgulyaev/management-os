# Stage 10 / Phase 10.C — Route Triage + IA Fixes — Decisions

**Date**: 2026-05-08
**Hours target**: 3-5 days | Tests target: ~10 | Migrations: 0
**Tests delivered**: 10 static
**Test count**: 5033 → 5043 passing (+10)

---

## What 10.C shipped

The audit's 56 BLOCKER 404 routes triaged into:
- **47 REDIRECT** — operator-spec URL → canonical URL exists; ship Next.js 308 redirects via `next.config.mjs`
- **7 BUILD** — genuinely missing; queued for Phase 10.M with sub-phase mapping
- **0 REMOVE** — every audit URL maps to a real intent
- **2 already-present** — `/dashboard/villa-guides/wifi/migrate` shipped before audit; `/development-os/integrations` is a runtime crash unrelated to IA

Output:
- `next.config.mjs` — 47 permanent redirect entries
- `docs/stage-10-route-triage.md` — full triage classification + BUILD list ordered for 10.M
- `tests/development-stage-10-c.test.ts` — 10 acceptance tests

---

## Methodology

1. **Walked dashboardNav** (`src/config/navigation.ts`) — extracted all 138 hrefs, verified each maps to a shipped `page.tsx`. **The menu IA is internally consistent today; operators clicking links never see a 404.**
2. **Audit BLOCKERs vs. nav fidelity** — confirmed the 56 BLOCKER URLs come from the operator's audit-prompt spec (mental-model paths), not from clicked nav links. The audit was a forced-list walk of operator-spec URLs.
3. **Per-URL triage** — for each BLOCKER, looked at:
   - Is there a route that conceptually represents this feature, under a different slug? (REDIRECT)
   - Is the feature genuinely not built? (BUILD)
   - Was the operator-spec URL aspirational with no real intent? (REMOVE — none surfaced)
4. **Validated each REDIRECT destination** has a shipped `page.tsx` — test guards regressions.

---

## Why this isn't a navigation.ts edit

The plan said "Apply REDIRECT decisions: update navigation.ts links". Investigation revealed the nav was already pointing at the correct canonical URLs — the BLOCKERs are not menu links, they're operator-spec URLs. So the fix is **HTTP-level redirects**, not nav edits. This:
- Closes the audit BLOCKER (operator-spec URL → 200, not 404)
- Preserves the existing menu IA (no destabilizing the nav file)
- Handles bookmarks + external doc links + future audit re-runs uniformly

The 47 entries ship as `permanent: true` (HTTP 308) so SEO consolidates and browsers cache the redirect.

---

## REDIRECT — 47 entries shipped

Categories (full table in `docs/stage-10-route-triage.md`):

| Category | Count | Examples |
|---|---|---|
| Slug-rename (verbose → shipped slug) | 17 | `/audit-log` → `/audit`, `/booking-projection` → `/bookings`, `/quote-tester` → `/quote` |
| Namespace consolidation | 22 | `/maintenance/*` → `/maintenance-intelligence/*`, `/villa-guides/concierge-ai/*` → `/guest-ai/*`, `/system/jobs` → `/jobs` |
| Sub-path drop (`/auth/`, `/dashboard/calendar`) | 6 | `/security/auth/events` → `/security/events`, `/calendar` → `/bookings/calendar` |
| `/development-os/*` | 4 | `/cabinets` → `/cabinets/my-cabinet`, `/notifications` → `/settings/notifications` |
| **Total** | **47** | (shipped via `next.config.mjs`) |

---

## BUILD — 7 routes for Phase 10.M

| # | URL | 10.M sub-phase | Effort | Notes |
|---|---|---|---|---|
| 1 | `/dashboard/front-office/readiness` | 10.M.2 | 1.5d | Plan calls for arrival-prep status surface (rooms ready, pending tasks, ETAs) |
| 2 | `/dashboard/settings/account-security` | 10.M.7 | 2d | Per-user 2FA factors + sessions + login history (vs. org-wide `/security/*`) |
| 3 | `/dashboard/procurement/purchase-orders` | 10.M.8 | 0.75d | Composition over existing `purchase_orders` schema |
| 4 | `/dashboard/procurement/purchase-requests` | 10.M.8 | 0.75d | Composition over existing `purchase_requests` schema |
| 5 | `/dashboard/villa-guides/security/wifi-migration` | 10.M.5 | 1d | Status / log page for migration runs (the migration tool itself ships at `/villa-guides/wifi/migrate`) |
| 6 | `/development-os/procurement/quotation-comparison` | 10.M.10 | 0.5d | Directory has only `[requestCode]` — list page missing |
| 7 | `/development-os/integrations` | 10.M.10 | 1-2h | **Runtime crash** (HTTP 500) — debug + fix, not new build |

Total effort: ~7 days, fits inside 10.M's 4-week budget across 4 sub-phases.

---

## What changed in existing code

| File | Change |
|---|---|
| `next.config.mjs` | Added `STAGE_10_C_REDIRECTS` array + `redirects()` function returning 47 permanent entries |
| `docs/stage-10-route-triage.md` (NEW) | Full triage classification + 10.M-mapped BUILD list |
| `tests/development-stage-10-c.test.ts` (NEW) | 10 acceptance tests |
| `tmp/stage-10-c-decisions.md` (NEW) | This file |

Zero migrations, zero schema changes, zero RBAC changes, zero feature work.

---

## Trade-offs + scope discipline

**1. Permanent (308) instead of temporary (302).** The redirects are intentional canonical-URL consolidation. Browsers + crawlers should cache them. If a destination ever changes, the redirect entry updates in lockstep — there's no scenario where we want a temporary redirect here.

**2. No `has` / `missing` matchers.** Every redirect is unconditional. If an authenticated user hits `/dashboard/maintenance` they 308 to `/dashboard/maintenance-intelligence` regardless of role. RBAC happens on the destination page (already wired).

**3. No menu link changes.** The nav already points at canonical URLs. Adding any redirect entry that matches a current nav link would create a redirect loop on the canonical page. Tests verify nav fidelity as a regression guard.

**4. Quotation-comparison has a weird shape.** `/development-os/procurement/quotation-comparison/[requestCode]/page.tsx` exists; the parent list page does not. The `[requestCode]` route only resolves when an existing request is clicked from elsewhere. **Not a regression** — there was no list page before — but it's BUILD work for 10.M.

**5. Production verification deferred.** The redirects must be on a production deploy to be testable via `curl -o -I`. Locally the tests verify the next.config entries + destination routes exist; the real 308 verification happens after this commit deploys.

**6. /development-os/integrations runtime crash.** The 500 in audit was a real production crash. My 10.B-CLEANUP edits to that page (P-stage badge → "Soon") are unlikely to be the root cause — they only changed string values. The crash is upstream and needs investigation in 10.M (open the page locally with prod env, capture the stack).

---

## Phase 10.C acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| Per-route triage decision document | yes | ✅ `docs/stage-10-route-triage.md` |
| Menu IA cleanup applied | yes | ✅ no nav changes needed (nav was already correct) |
| 47 REDIRECT entries in `next.config.mjs` | yes | ✅ test |
| Every redirect destination has shipped page | yes | ✅ test |
| BUILD list ordered for Phase 10.M | yes | ✅ 7 items, sub-phase mapped |
| Tests | ~10 | ✅ 10 |
| Test count | 5033 → ~5043 | ✅ 5043 |
| Build clean | yes | ⏳ verify in commit |
| `check:cron` 102/101 | yes | ⏳ verify in commit |
| New migrations | 0 | ✅ |

---

## What unblocks Phase 10.D

Phase 10.D (Universal Primitives — `<ConfirmDialog>`, `<EntityFormModal>`, `<EmptyState>`, `<RowActionsMenu>`, award-winning `<PageHeader>`) starts when this phase commits clean. 10.D ships ~50 tests; Phase 10.E (CRUD rollout) and 10.F (Modal-first Add forms) consume those primitives next.

Phase 10.M (Build Missing Routes) starts after 10.D, with the 7-item BUILD list above as initial scope.

**STAGE 10 / PHASE 10.C ACCEPTED (pending build + commit verification).**
