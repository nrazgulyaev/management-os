# `force-dynamic` sweep — 2026-05-07

**Trigger**: Vercel build crash on `/dashboard/shares` (toISOString in PgDateString.mapFromDriverValue) caused by Next.js attempting to statically prerender an org-scoped DB-querying page.

**Method**: Categorize every `page.tsx` in `(dashboard)`, `(development-app)`, `(investor-portal)`, `(auth)`, `(public)` trees. Add `export const dynamic = "force-dynamic"` to:
- All async pages in `(dashboard)`, `(development-app)`, `(investor-portal)` (org-scoped trees — never statically prerender).
- Pages in `(auth)` / `(public)` only when they import server-side helpers (DB / current-user / permissions).

Pure synchronous shells (forms that delegate to a client component) and pure redirects are left alone — they don't run server-side code at prerender.

## Numbers

| Bucket | Count |
|---|---|
| Already had `force-dynamic` | 496 |
| Added in this sweep | **17** |
| Sync presentational shells (no DB, no async) — skipped | 8 |
| `(auth)` / `(public)` pages with no server-side helpers — skipped | 11 |
| **Total inspected** | **532** |

## Pages that got `force-dynamic` added

| Path | Reason |
|---|---|
| `src/app/(dashboard)/dashboard/page.tsx` | async + `getLiveDashboardCounts()` |
| `src/app/(dashboard)/dashboard/bookings/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/bookings/[id]/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/bookings/[id]/edit/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/owners/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/owners/[id]/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/owners/[id]/edit/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/projects/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/projects/[slug]/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/projects/[slug]/edit/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/villas/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/villas/[id]/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/villas/[id]/edit/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/villas/new/page.tsx` | async + DB query |
| `src/app/(dashboard)/dashboard/shares/page.tsx` | **Task 1 — original crash site** |
| `src/app/(dashboard)/dashboard/shares/new/page.tsx` | async + DB query |
| `src/app/(development-app)/development-os/page.tsx` | async + DB query |
| `src/app/(development-app)/development-os/projects/[slug]/page.tsx` | async + DB query |

## Pages explicitly skipped (sync presentational shells)

| Path | Why |
|---|---|
| `src/app/(dashboard)/dashboard/ai/page.tsx` | sync — only static principles list + client AI grid |
| `src/app/(dashboard)/dashboard/channels/new/page.tsx` | sync shell — delegates to `<ChannelForm>` client component |
| `src/app/(dashboard)/dashboard/documents/new/page.tsx` | sync shell — delegates to `<DocumentForm>` |
| `src/app/(dashboard)/dashboard/guests/new/page.tsx` | sync shell — delegates to `<GuestForm>` |
| `src/app/(dashboard)/dashboard/owners/new/page.tsx` | sync shell — delegates to `<OwnerForm>` |
| `src/app/(dashboard)/dashboard/projects/new/page.tsx` | sync shell — delegates to `<ProjectForm>` |
| `src/app/(development-app)/development-os/inventory/page.tsx` | pure `redirect()` |
| `src/app/(development-app)/development-os/procurement/page.tsx` | pure `redirect()` |

## Pages skipped — `(auth)` / `(public)` static-by-design

| Path | Why |
|---|---|
| `src/app/(auth)/login/page.tsx` | only reads `isSupabaseAuthConfigured()` (env-check), no DB |
| `src/app/(public)/page.tsx` | marketing landing |
| `src/app/(public)/case-studies/page.tsx` | marketing |
| `src/app/(public)/contact/page.tsx` | marketing |
| `src/app/(public)/development/page.tsx` | marketing |
| `src/app/(public)/guest-experience/page.tsx` | marketing |
| `src/app/(public)/investor-reporting/page.tsx` | marketing |
| `src/app/(public)/operations/page.tsx` | marketing |
| `src/app/(public)/owner-portal/page.tsx` | marketing |
| `src/app/(public)/portfolio/page.tsx` | marketing |
| `src/app/(public)/villa-management/page.tsx` | marketing |

## Test prevention

A new test file `tests/build/force-dynamic-coverage.test.ts` will fail the suite if any future `(dashboard)` / `(development-app)` / `(investor-portal)` async page is added without `force-dynamic`. See Task 4.
