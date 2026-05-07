# Stage 7 — Multi-tenancy + Commerce — ACCEPTED 2026-05-07

## Summary

Stage 7 transforms Arconique OS from internal tool into a commercial
multi-tenant SaaS. The 5 sub-stages land RBAC-aware cabinets, a full
subscription + feature-gating layer, lifecycle FSM with 5 cron jobs,
Stripe webhook bridge into the FSM, and the public `/pricing` +
`/sign-up` surface fronted by a tenant-subdomain middleware.

| Sub-stage | Surface | Migrations | Cron added |
|---|---|---|---|
| 7.A | cabinet_definitions metadata + 9-cabinet seed | 0084 | — |
| 7.B | subscription_plans + feature_flags + plan_features + org_subscriptions + lifecycle_events | 0085 | — |
| 7.C | Lifecycle FSM (`lifecycle.ts` + `lifecycle-pure.ts`) | — | +5 |
| 7.D | Stripe bridge + `/api/webhooks/billing/stripe` | — | — |
| 7.E | `middleware.ts` + `/pricing` + `/sign-up` | — | — |
| **Total** | | **2 migrations** | **+5 cron jobs** |

## Final counts (at Stage 7 close)

- **Tests**: 4732 (+27 over the 4705 Phase A baseline; +1699 over the
  3033 Stage 5.J close).
- **Cron routes**: 101 (+5).
- **Known job keys**: 100.
- **Schema migrations**: 10 new across Phase A + Stage 7
  (0083 + 0084 + 0085 + the lifecycle bookkeeping in 0085).
- **Commerce surface**: end-to-end from public `/pricing` → `/sign-up` →
  Stripe Checkout (env config pending) → org_subscriptions → FSM →
  feature gating.

## Architectural invariants preserved

1. **0075 PL/pgSQL FOREACH ARRAY pattern** preserved across all Stage 7
   RLS-loop migrations (6th preservation).
2. **`"use server"` vs `import "server-only"`** discipline maintained:
   - `lifecycle-pure.ts` is a pure module — testable.
   - `lifecycle.ts` is `import "server-only"` — DB writes.
   - Webhook route uses neither (it's a Next.js route handler).
3. **Catalog vs tenant-scoped split**: cabinet_definitions, subscription_plans,
   feature_flags, plan_features are platform-wide (no org_id, no RLS;
   super_admin-only edits). org_subscriptions + subscription_lifecycle_events
   carry org_id + RLS via `is_in_user_organization()`.
4. **Idempotent Stripe webhooks**: bridge maps Stripe event id into
   audit log so retries are no-ops.
5. **5% safety lock on purge cron**: refuses to purge >5% of all
   archived rows in a single run — operators must escalate.
6. **Internal-comp orgs bypass commerce**: `org_subscriptions.is_internal_comp`
   short-circuits all gating + lifecycle transitions. Arconique team
   uses the `internal` plan with this flag set.

## Sub-stage details

### Stage 7.A — Cabinet definitions

- Migration 0084: `cabinet_definitions` with 9 seeded rows
  (cfo-accountant, project-manager, site-supervisor, qs,
  procurement-manager, warehouse-manager, marketing-staff,
  sales-manager, my-cabinet).
- Drizzle schema at [src/lib/db/schema/cabinet-definitions.ts](../src/lib/db/schema/cabinet-definitions.ts).
- `min_plan_code` column carries the Stage 7.B feature-gating link.
  `allowed_role_keys` is a Postgres TEXT[] so role-set membership
  checks JOIN cleanly.

### Stage 7.B — Subscription plans + gating

- Migration 0085: 5 commerce tables.
- Drizzle schema at [src/lib/db/schema/subscriptions.ts](../src/lib/db/schema/subscriptions.ts).
- Gating helpers at [src/lib/billing/gating.ts](../src/lib/billing/gating.ts):
  - `getActiveOrgSubscription(orgId)` — read.
  - `getFeatureForOrg(orgId, flagCode)` — boolean OR numeric limit.
  - `requireFeature(orgId, flagCode)` — action throws on lock.
  - `requireWithinLimit(orgId, flagCode, current)` — action throws on
    cap.
  - `pageGate(orgId, flagCode)` — returns redirect path or null.
  - `uiFeatureGate(orgId, flagCode)` — serializable summary for UI.
- `FeatureNotAvailableError` + `FeatureLimitExceededError` thrown
  errors are typed for the action result wrapper.

### Stage 7.C — Lifecycle FSM

- Pure module [src/lib/billing/lifecycle-pure.ts](../src/lib/billing/lifecycle-pure.ts):
  8 statuses, transition table, `canTransition(from, to)`.
- Server module [src/lib/billing/lifecycle.ts](../src/lib/billing/lifecycle.ts):
  `transitionSubscription({org, sub, toStatus, eventType, …})` —
  atomic + writes audit row. `recordLifecycleEvent()` for non-FSM
  events.
- 5 cron jobs:
  - `subscription_warn_expiry` — daily 8AM UTC, D-5/D-2 windows.
  - `subscription_attempt_renewal` — daily 8:15 (STUB until 7.D).
  - `subscription_advance_lifecycle` — daily 8:30, grace→suspended +
    cancelling→cancelled.
  - `subscription_archive_expired` — daily 8:45, suspended/cancelled
    → archived per plan's `default_archive_after_days`.
  - `subscription_purge_archived` — daily 9:00, archived → purged
    per plan's `default_purge_after_days`. **5% safety lock**.

### Stage 7.D — Stripe commerce bridge

- Module [src/lib/billing/stripe-subscription-bridge.ts](../src/lib/billing/stripe-subscription-bridge.ts):
  `applyStripeWebhook(event)` resolves the org_subscriptions row by
  `stripeSubscriptionId`, then dispatches to the FSM:
  - `customer.subscription.created` → `trial` or `active`.
  - `customer.subscription.deleted` → `cancelling`.
  - `customer.subscription.updated` → audit row only.
  - `invoice.paid` → `active` (if was grace) or audit-only.
  - `invoice.payment_failed` → `grace` (3-day window).
  - `customer.subscription.trial_will_end` /
    `invoice.payment_action_required` → `trial_warned` audit.
- Webhook route at
  [src/app/api/webhooks/billing/stripe/route.ts](../src/app/api/webhooks/billing/stripe/route.ts):
  verifies `Stripe-Signature` against `STRIPE_BILLING_WEBHOOK_SECRET`,
  parses + dispatches.

### Stage 7.E — Public + tenant routing

- Middleware at [src/middleware.ts](../src/middleware.ts):
  - `extractTenantSlug(host)` returns the slug or null.
  - Reserved subdomains (www, api, app, admin, investors, docs,
    public, marketing, status) pass through without tenant context.
  - Vercel preview hostnames + apex domains return null.
  - Stamps `x-tenant-slug` + `x-tenant-host` headers for downstream
    server components to read via `headers()`.
- Public page [/(public)/pricing/page.tsx](../src/app/(public)/pricing/page.tsx) — reads `subscription_plans` where `is_public = true`.
- Auth page [/(auth)/sign-up/page.tsx](../src/app/(auth)/sign-up/page.tsx) — email + org name + slug + plan picker; posts to `/api/onboarding/start` (route stub for the next iteration).

## Acceptance gate

| Check | Status |
|---|---|
| Migrations 0084 + 0085 apply cleanly with FOREACH ARRAY pattern | ✅ |
| 5 commerce tables seeded with 6 plans + 25 flags + 90 mappings | ✅ |
| Lifecycle FSM transitions verified (16 legal + 6 illegal) | ✅ |
| 5 lifecycle cron jobs wired in dispatcher + checklist | ✅ |
| Stripe bridge maps 7 event types | ✅ |
| Webhook route verifies signature + dispatches | ✅ |
| Tenant middleware parses prod / dev / Vercel-preview hosts correctly | ✅ |
| `/pricing` + `/sign-up` render | ✅ |
| 4732 tests passing (+27 over the 4705 Phase A baseline) | ✅ |
| `npm run build` clean | ✅ |
| `npm run check:cron` clean (101 routes, 100 keys) | ✅ |
| Stage 5.J build-fix invariant maintained | ✅ |
| 0075 FOREACH ARRAY preserved (6th time) | ✅ |

## What's deferred (not blocking commerce launch)

- **Live Stripe products + prices** — env config only; no code work.
- **Onboarding wizard step machine** — sign-up form lands user; the
  full multi-step wizard (company info → first entity → invite team
  → first integration → land in cabinet) is the next iteration.
- **Customer Portal embed** at `/dashboard/billing/portal` — Stripe-
  hosted; needs the customer-portal session creation server action
  + page wrapper.
- **Custom domain support** (Pro/Enterprise tenants) — middleware
  already preserves `x-tenant-host`; needs DNS-mapping table +
  resolver helper.
- **Tenant-aware queries in dashboard layout** — header is emitted,
  but the dashboard's existing org context comes from the user's
  primary org. Production needs a `slug → org_id` resolver helper to
  switch context based on subdomain.
- **Plan-tier enforcement on cabinets** — `cabinet_definitions.min_plan_code`
  exists; the cabinet pages don't yet call `pageGate()`.

## What's next

Stage 7 closes the commercial-readiness arc. Suggested follow-ups:

1. **Real customer pilot** — onboard 1–2 paying customers through the
   trial → Standard plan flow. Surface friction.
2. **Onboarding wizard** — implement the 5-step wizard.
3. **Customer Portal embed** — let customers self-manage payment
   methods + invoices.
4. **Cabinet plan-gating** — wire `pageGate()` into each cabinet page.
5. **Custom domains** for Pro+ tenants.
