# Sprint 2 — closure

**Date:** 2026-05-13
**Branch:** `main`
**Commits:**

```
91807e6  refactor(platform): rename (subscription-app)/subscriptions to (platform-app)/platform
f1c5f19  feat(middleware): per-product subdomain routing
307ca60  feat(landing): per-product apex landings + product-aware login
0d527fa  docs(sprint-2): local dev hostname setup + .env.example callout
```

(Plus this closure doc.)

---

## Renamed paths summary

| Before                                                | After                                              |
| ----------------------------------------------------- | -------------------------------------------------- |
| `src/app/(subscription-app)/layout.tsx`               | `src/app/(platform-app)/layout.tsx`                |
| `src/app/(subscription-app)/subscriptions/page.tsx`   | `src/app/(platform-app)/platform/page.tsx`         |
| `src/app/(subscription-app)/subscriptions/organizations/page.tsx` | `src/app/(platform-app)/platform/organizations/page.tsx` |
| `src/app/(subscription-app)/subscriptions/[orgCode]/page.tsx` | `src/app/(platform-app)/platform/[orgCode]/page.tsx` |
| `src/app/(subscription-app)/subscriptions/revenue/page.tsx` | `src/app/(platform-app)/platform/revenue/page.tsx` |
| `src/app/(subscription-app)/subscriptions/usage/page.tsx` | `src/app/(platform-app)/platform/usage/page.tsx` |
| `src/app/(subscription-app)/subscriptions/audit/page.tsx` | `src/app/(platform-app)/platform/audit/page.tsx` |
| Workspace name `"SubscriptionOS"` (key `"subscription"`, href `/subscriptions`) | `"Platform Admin OS"` (key `"platform"`, href `/platform`) |
| `redirect("/login?next=/subscriptions")`              | `redirect("/login?next=/platform")`                |
| `reason=subscription-os-requires-super-admin`         | `reason=platform-os-requires-super-admin`          |
| 11 `revalidatePath("/subscriptions/…")` calls         | `revalidatePath("/platform/…")`                    |

**Intentionally NOT renamed** (kept stable to avoid noise + per Sprint 2 spec):

- `src/lib/subscription-os/{actions,queries}.ts` — backend lib, not URL-facing
- `src/components/subscription-os/*` — leaf components, not URL-facing
- `db/schema/subscriptions.ts`, `orgSubscriptions` table, `subscription-os-architecture.md` — historical
- All Stripe / billing / lifecycle code — unrelated to the workspace rename
- Historical docs (`STAGE-10-6-COMPLETE.md`, `stage-10-6-a-audit/*`, `docs/audits/2026-05-13-copy-a-baseline.md`)

## Acceptance gates

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` on Sprint-2 files | clean |
| `npm test` | **6013 / 6013** passing (5984 baseline + 15 routing + 14 landing/login). Net +29 tests, +14 from Sprint 1 baseline. |
| `npm run build` | succeeds. `/` is now `ƒ` (dynamic; consumes `headers()`). `/platform` builds where `/subscriptions` used to. Middleware bundle: 34.2 kB → **34.7 kB**. |

## Test count delta

| Sprint baseline | After Sprint 2 |
|---|---|
| 5984 | 6013 (+29) |

New test files:

- `tests/sprint-2-product-subdomain-routing.test.ts` — 15 tests
- `tests/sprint-2-product-landing-and-login.test.ts` — 14 tests

Updated:

- `tests/development-stage-7.test.ts` — `admin.arconique.com` now resolves as tenant slug `"admin"` (was `null` reserved); documented inline.
- `tests/development-stage-10-6-e-{1,2,2-5}.test.ts` — paths/labels migrated to `(platform-app)/platform/*`.

## Edge cases discovered during implementation

1. **`admin` subdomain semantics.** Removing `admin` from the
   reserved-subdomains set meant the Stage 7.E test asserting
   `extractTenantSlug("admin.arconique.com") === null` now returns
   `"admin"`. Updated in the same change with a inline note pointing
   at Sprint 2. The change is deliberate per the spec — operators
   can now register a tenant whose slug happens to be "admin".

2. **`(public)/page.tsx` vs new `(product-landing)/page.tsx`.** The
   spec recommended one shared `(product-landing)/page.tsx` route
   group, but Next.js would throw a route collision because
   `(public)/page.tsx` already owns `/`. Resolved by keeping the
   single apex file and adding a server-side header check at the
   top: if `x-product` is set → render `<ProductLanding>` (or
   `redirect("/platform")` for platform); else render the umbrella
   marketing.

3. **`signInWithPassword` parsed.data shape.** `credSchema.parse()`
   now returns an object with `email`, `password`, AND `product`
   (optional). Passing the whole `parsed.data` to Supabase's
   `signInWithPassword({email, password})` was already fine
   structurally but introduces a stray `product` field. Tightened
   the call site to pass only `{email, password}` explicitly.

4. **Recharts tooltip typing (carried in from Sprint 1).** Not a
   Sprint 2 issue, but the build's `Dynamic server usage` notices on
   `/dashboard/ai`, `/development-os/inventory`, etc. persist —
   these are Stage 10.6.B.2-fix's intentional `try/catch` resilience
   path during static-generation pre-render and are not blocking.

5. **`subscription-os-architecture.md` decision-doc collision.** The
   doc originally locked `/subscriptions` as the "permanent" URL.
   Solution: added a Sprint 2 addendum at the top noting the URL
   structure has moved to `/platform`; original section preserved
   below as historical rationale. The acceptance test now asserts
   `/platform` is referenced in the doc.

## Manual smoke-test recipe (not auto-run)

The harness blocked auto-starting `npm run dev` for background curl
smoke tests. The 29 Sprint-2 source-inspection acceptance tests
already verify the routing logic against the actual middleware
source; the live recipe is for the operator to run when convenient:

```bash
# 1) start dev server (handles its own pkill of stale processes)
npm run dev

# 2) in a separate terminal, smoke the four product subdomains
# Mgmt OS dashboard renders (expect 200 + x-product: management)
curl -sI -H "Host: management.localhost" http://localhost:3000/dashboard

# Mgmt OS rejects /development-os and redirects to /
curl -sI -H "Host: management.localhost" http://localhost:3000/development-os
# expect: 307, Location: /

# Dev OS allows /development-os
curl -sI -H "Host: development.localhost" http://localhost:3000/development-os

# Dev OS redirects /dashboard back to /
curl -sI -H "Host: development.localhost" http://localhost:3000/dashboard

# Platform subdomain redirects /dashboard to /, then /platform/* gates on super_admin
curl -sI -H "Host: platform.localhost" http://localhost:3000/dashboard
curl -sI -H "Host: platform.localhost" http://localhost:3000/platform/organizations

# Per-tenant slug still works (Stage 7.E preservation)
curl -sI -H "Host: acme.localhost" http://localhost:3000/dashboard
# expect: x-tenant-slug: acme
```

## What's next (Sprint 3)

Public sales content for `subscription.arconique.com`. The
allowedPrefixes table for that subdomain currently leans on the
existing `(public)/*` marketing pages (`/pricing`, `/contact`,
`/portfolio`, etc.). Sprint 3 decides which of those move into a
dedicated sales surface vs. stay under `(public)/` and which new
pages (sales pitch, signup flow, Stripe checkout) need to ship.

## Halt

Not proceeding to Sprint 3 without owner review. Stack of 5 commits
sits on local `main`, plus `9009cb9` (Stage 10.7.0) and the
Sprint-1 stack still unpushed.
