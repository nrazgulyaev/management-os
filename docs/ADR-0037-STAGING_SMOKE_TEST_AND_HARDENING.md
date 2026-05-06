# ADR-0037 — Staging Smoke Test & Production Hardening Fix Pass (Prompt 114)

## Status
Accepted.  Implemented across:

- `src/features/smoke-tests/route-inventory.ts` (new) +
  `src/features/smoke-tests/index.ts`
- `src/features/system/storage-overview.ts` (new)
- `src/lib/deployment/production-gates.ts` (extended with three new
  gates)
- `src/app/(dashboard)/dashboard/system/storage/page.tsx` (new)
- `src/app/(dashboard)/dashboard/system/health/page.tsx` (expanded
  with module-grouped tracked tables)
- `scripts/{check-cron-auth,smoke-routes,staging-readiness-report}.ts`
  (new); `scripts/check-storage-config.ts` (extended);
  `scripts/preflight-deploy.ts` (wires the new checks)
- `package.json` (new npm scripts: `check:cron-auth`, `smoke:routes`,
  `staging:report`)
- `docs/STAGING-LAUNCH-CHECKLIST.md` (new),
  `docs/SMOKE-TEST-ROUTE-MATRIX.md` (new), this ADR
- `tests/p114-staging-smoke-hardening.test.ts` (new)

Two existing dashboards were converted to the
`safeCount` / `safeList` resilience pattern from P112:

- `src/app/(dashboard)/dashboard/integrations/calendar-feeds/new/page.tsx`
- `src/app/(dashboard)/dashboard/settings/users/[id]/page.tsx`

## Context

After Prompt 113 the platform was production-ready in principle —
every env var was registered, production gates fired in
`staging`/`production`, and a single command (`npm run preflight:deploy`)
gave operators a pass/fail signal.  Two structural gaps remained
before a confident staging launch:

1. **Route smoke coverage was implicit.**  The platform exposed
   ~340 page + route endpoints across nine audience classes (public,
   internal, owner, guest, field, vendor, dev-os, auth, api-cron,
   api-public, api-token).  Nothing told an operator "these are the
   routes; here's how each should respond without auth."  A future
   refactor could silently drop a redirect-to-login or open a cron
   route without anyone noticing until it shipped.
2. **Demo / mock leak hardening was incomplete.**  The P113 production
   gates caught `ARCONIQUE_FORCE_MOCK=1` and demanded
   `NOTIFICATIONS_DRY_RUN` be explicit, but did not catch:
   - `ALLOW_DEMO_SECURITY_FALLBACKS=1` — would let production use the
     deterministic dev encryption key;
   - a bare `DEMO_MODE` env var someone left over from local debug;
   - an unset `AI_DRY_RUN` (silent default flip when env eventually
     changes).
3. **Cron auth had no automated invariant test.**  The pure decision
   function existed, but a future refactor could remove the production
   gate, the localhost guard, or the bearer comparison without any
   static signal.
4. **Staging launch had no consolidated readiness output.**  An
   operator running `npm run preflight:deploy` got pass/fail; what
   they actually needed before approving a launch was a single Markdown
   document listing env state, gate state, route counts, migration
   counts, and any failed-check output — attachable to a launch ticket.
5. **Two admin dashboards still queried the DB directly without the
   P112 resilience helpers.**  `calendar-feeds/new` and
   `settings/users/[id]` would crash on a fresh staging where the
   `bookingChannels` / `appUsers` tables hadn't been migrated yet.
6. **`/dashboard/system/health` only tracked 15 tables across 3
   informal groupings.**  An operator couldn't tell at a glance which
   subsystem was missing migrations.

Prompt 114 closes all six without changing business logic.

## Decision

### 1. Route smoke-test inventory

`src/features/smoke-tests/route-inventory.ts` is a pure file-walk that
discovers every `page.tsx` / `route.ts` under `src/app/**` and yields
typed `RouteEntry[]` with:

- `path` (with `:param` placeholders for dynamic segments),
- `audience` derived from the route group / segment,
- `expectedStatus` (`200` / `302` / `401` / `404` / `200_or_404`),
- `description`, `kind`, `parameterised`, `file`.

`scripts/smoke-routes.ts` runs the discovery and asserts ≥ 80 routes
total + every required audience non-empty + every cron route expects
401.  It prints a per-audience breakdown.  Wired into
`npm run preflight:deploy`.

The full list is the authoritative inventory for the smoke-test
matrix in `docs/SMOKE-TEST-ROUTE-MATRIX.md`.

### 2. Cron auth verification

`scripts/check-cron-auth.ts` does two things in series:

1. Walks `src/app/api/cron/*` and confirms each `route.ts` calls
   `handleCronJobRequest` or `handleCronRunAllRequest` (the only
   two paths that go through `verifyCronAuthFromRequest`).
2. Source-greps `src/features/jobs/auth.ts` for the load-bearing
   invariants: `isProduction()` short-circuit, bearer comparison,
   localhost guard, typed rejection reason.

The full pure-decision matrix for `verifyCronAuth` lives in
`tests/p114-staging-smoke-hardening.test.ts` where each env
permutation can run in a fresh module instance.  Wired into
`npm run preflight:deploy`.

### 3. Storage hardening

`src/features/system/storage-overview.ts` defines a
`BucketDescriptor[]` with explicit `privacy: "private" | "public"`,
max-size, cleanup-cron, and EXIF-strip flags for every bucket the
platform expects.  The new
`/dashboard/system/storage` page renders the descriptors and links to
the live health page where one exists (currently:
`guest-request-attachments` → `/dashboard/guest-ai/storage`).

`scripts/check-storage-config.ts` was extended to:

- assert every documented bucket has a privacy classification,
  allowed MIME, and max size in the doc table;
- forbid public bucket name tokens (`public-attachments`,
  `public-uploads`) from appearing in `src/`.

### 4. Production gates — three new

| Gate | Severity in production | Catches |
|---|---|---|
| `assertNoBareDemoModeInProduction` | critical | a bare `DEMO_MODE=1` env left over from debug |
| `assertNoDemoSecurityFallbacksInProduction` | critical | `ALLOW_DEMO_SECURITY_FALLBACKS=1` shipping to production |
| `assertAiModeExplicit` | warning (unset) / critical (`AI_DRY_RUN=0` with no `ANTHROPIC_API_KEY`) | silent flip from dry-run to live calls |

`getProductionGateReport` now runs eight gates instead of five.  The
deployment dashboard renders all of them.

### 5. System health — module-grouped

`/dashboard/system/health` now groups its tracked tables into ten
module groups (Identity & access, Owners & villas, Bookings, Direct
booking, Finance & statements, Operations, Guest experience,
Notifications, Jobs & cron, Security baseline).  Each group renders
as its own section with a per-group "ready / incomplete" badge so an
operator can spot which subsystem is missing migrations without
scanning a single 50-row table.

### 6. Staging readiness report

`scripts/staging-readiness-report.ts` (npm run `staging:report`)
aggregates env validation + production gates + route inventory +
every static check + migration count + cron summary into one Markdown
document at `tmp/staging-readiness-report.md`.  Designed for an
operator to attach to a launch ticket and share with QA.  Returns
exit 0 only when everything is green.

### 7. Two dashboards adopted `safeList`

- `integrations/calendar-feeds/new/page.tsx` — wraps the booking
  channels query in `safeList("listBookingChannels", …)`.
- `settings/users/[id]/page.tsx` — wraps `appUsers` and `userRoles`
  reads in `safeList("getUserById", …)` / `safeList("getUserRoles", …)`.

### 8. Two new docs

| Doc | Purpose |
|---|---|
| `STAGING-LAUNCH-CHECKLIST.md` | Pass/fail checklist an operator works through before declaring staging promotable.  Eight phases: prerequisites → static gate → staging env → migrations/RLS → cron → storage → demo/mock leak → manual smoke → post-launch. |
| `SMOKE-TEST-ROUTE-MATRIX.md` | Human-readable companion to the route inventory.  Audience classes, expected unauth status per class, how to run static + live smoke checks, what to do when a smoke check fails. |

Plus this ADR.

## Consequences

### Positive

- Operators get one Markdown report (`npm run staging:report`) they
  can attach to a launch ticket.
- Future refactors that drop the cron production gate, change a
  redirect-to-login, or silently open a route fail in CI via
  `smoke:routes` / `check:cron-auth`.
- Two admin dashboards no longer crash on a fresh staging.
- Operators can see at a glance which subsystem is missing migrations
  on `/dashboard/system/health`.
- Three additional production gates close common foot-guns
  (`DEMO_MODE`, `ALLOW_DEMO_SECURITY_FALLBACKS`, unset `AI_DRY_RUN`).
- The smoke route matrix gives QA a concrete, audience-grouped list
  of URLs to walk through before sign-off.

### Negative / risks

- The route inventory is a static walk — it cannot verify that a
  page actually returns the documented status.  The status column is
  a *contract* the layout / middleware must uphold; if a future
  layout drops auth without anyone noticing, the inventory still
  reports 302 even though the live behaviour would be 200.  Live HTTP
  smoke is intentionally deferred to operator-driven testing.
- `scripts/staging-readiness-report.ts` invokes other scripts via
  `spawnSync`.  On a slow CI runner this adds 5–15 seconds.
- `assertAiModeExplicit` warns rather than fatals when `AI_DRY_RUN`
  is unset — chosen because today the helper defaults to dry-run
  (safe).  A future change that flips the default to live would need
  to upgrade this gate to critical.
- The two dashboards now show "Migration pending" badges instead of
  crashing — a behaviour change visible to operators on a fresh
  environment.

### Out of scope (deferred)

- Live HTTP smoke runner (would require a running Next.js server).
- Per-audience access tests with a synthetic auth context.
- A `tmp/` retention policy — the staging report file is left for the
  operator to archive manually.
- Removing the legacy `src/lib/env.ts` flat module in favour of the
  registry-only path; both coexist deliberately.

## Recommended next prompt

**Prompt 115 — Staging Deploy & Production Cutover**: actually deploy
to a staging Supabase + Vercel project, run the full
`STAGING-LAUNCH-CHECKLIST.md` end-to-end, walk every flow in the
smoke matrix, fix every issue surfaced by the manual checks, and
produce a "go / no-go" memo for the production cutover.  No new
business features.
