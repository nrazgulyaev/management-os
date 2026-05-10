# 05 — Cross-cutting / SubscriptionOS gap analysis

**Operator vision** (from launch prompt):
> "SubscriptionOS — separate platform для selling Mgmt + Dev OS access.
> Customer org management. Subscription tracking. Revenue dashboard
> для platform owner (different от Dev OS or Mgmt OS)."

**Goal of this doc**: identify what currently exists for the
platform-owner perspective, identify what's missing, recommend
URL/architecture for the new SubscriptionOS surface.

---

## Current state — what exists today

### Schema (substantial — ~7 tables shipped)

`src/lib/db/schema/subscriptions.ts` exists and contains the full
subscription lifecycle. Plus 6 cron jobs:
- `subscription-warn-expiry-job.ts`
- `subscription-attempt-renewal-job.ts`
- `subscription-advance-lifecycle-job.ts`
- `subscription-archive-expired-job.ts`
- `subscription-purge-archived-job.ts`
- `failed-subscriptions-cleanup-job.ts`

Plus the Stripe bridge: `src/lib/billing/stripe-subscription-bridge.ts`
(Stage 7.D). Plus the trial-conversion helper from Stage 11.A.

### Pages — fragmented across Dev OS

| Page | Surface | Audience |
|---|---|---|
| `/development-os/platform/organizations` | Lists every tenant org. **Currently P0 500 in production.** | Platform admin |
| `/development-os/platform/organizations/[code]` | Per-org detail page | Platform admin |
| `/development-os/platform/branding` | Per-org white-label config. **Currently P0 500.** | Platform admin |
| `/development-os/platform/usage` | Cross-org usage metrics rollup | Platform admin |
| `/development-os/platform/api-docs` | API doc surface | Developers |
| `/dashboard/billing/upgrade` | **Customer-side** plan-upgrade picker (Stripe Checkout). | Customer |
| `/dashboard/billing/portal` | Stripe Customer Portal embed (likely) | Customer |
| `/dashboard/system/health` | System health metrics for the customer's own org | Customer |
| `/dashboard/system/storage` | Customer's own attachment storage health | Customer |
| `/dashboard/system/deployment` | Deployment metadata | Customer |

### What's missing for SubscriptionOS

The platform-owner perspective lacks:

1. **Revenue dashboard** — total MRR / ARR, MRR by plan tier, MRR by
   trial-to-paid conversion, churn rate, expansion revenue.
2. **Customer-by-customer subscription view** — for each tenant org:
   plan tier, billing status (trial / active / grace / suspended),
   MRR contribution, last invoice paid, next renewal date, lifetime
   value.
3. **Trial-funnel metrics** — trials started this period, trial-to-paid
   conversion %, time-to-conversion histogram, expired-without-conversion.
4. **Onboarding metrics** — for active orgs: integrations connected,
   AI agents enabled, first-week activation rate.
5. **Cross-customer health** — churn-risk signals, support-ticket
   volume per org, NPS-style satisfaction (if collected).
6. **Comp / discount management** — issue per-customer comps (free
   plan upgrades for partners, NGOs, internal staff).
7. **Stripe customer / subscription lookup** — search by email,
   reconcile a Stripe customer to an Arconique org.
8. **Refund / cancellation tooling** — per-customer refund issuance,
   immediate cancellation, retention offer flow.

---

## Recommended SubscriptionOS architecture

### URL structure

The launch prompt asks for SubscriptionOS to be DISTINCT from Dev OS
and Mgmt OS. Two viable options:

#### Option A — New `/admin` route group (Recommended)

```
src/app/(admin)/
├── layout.tsx                          # enforcePlatformAdmin() gate
├── admin/
│   ├── page.tsx                        # Revenue dashboard hero
│   ├── customers/
│   │   ├── page.tsx                    # Customer org list (replaces /platform/organizations)
│   │   └── [code]/page.tsx             # Per-customer drill-down
│   ├── subscriptions/
│   │   ├── page.tsx                    # All active subscriptions
│   │   └── [id]/page.tsx
│   ├── revenue/
│   │   ├── page.tsx                    # MRR / ARR / cohort tables
│   │   └── invoices/page.tsx           # All invoices across orgs
│   ├── trials/
│   │   ├── page.tsx                    # Active trials + funnel metrics
│   │   └── conversions/page.tsx
│   ├── comps/
│   │   └── page.tsx                    # Issue free plan upgrades
│   └── stripe/
│       └── page.tsx                    # Stripe customer search + actions
```

**Pros**: clean separation, fits Next.js App Router idiom, makes
permission gating explicit at layout level (one `enforcePlatformAdmin()`
covers the entire route group).

**Cons**: requires migrating the existing `/development-os/platform/*`
pages (or leaving them as redirects).

#### Option B — Reuse `/development-os/platform/*` (Faster, less clean)

Keep the existing path; flesh out with revenue / subscriptions /
trials / comps / stripe sub-pages.

**Pros**: reuses existing layout, less migration.

**Cons**: muddles the mental model. Operator says "different from Dev
OS or Mgmt OS" → `/development-os/platform/*` is technically inside
Dev OS.

**Recommendation**: **Option A** — matches operator vision; one-time
migration cost is small (4-6h to move + redirect existing pages).

### Permission model

- New role: `platform_admin` (sits ABOVE `super_admin` which is
  org-scoped)
- New permission: `subscriptionos.read` + `subscriptionos.write`
- New gate: `enforcePlatformAdmin()` — fails closed; only Arconique
  staff get the role
- The (admin) layout calls `enforcePlatformAdmin()` once; child
  pages don't need per-page gates

### Data sources (mostly already shipped)

The data backing SubscriptionOS already exists in the schema:
- `organizations` (tenant registry — Stage 5.J)
- `subscription_plans` + `org_subscriptions` (Stage 7.B)
- `lifecycle_events` (subscription state changes — Stage 7.C)
- `payment_intents` + Stripe webhook events (Stage 6.P3 + 7.D)
- `dev_os_usage_metrics` (per-org activity rollup — already cron'd)
- `org_ai_agent_config` (per-org AI config — Stage 9.F + 10.5.B)

**No new schema needed for the MVP.** Phase 10.6.E builds the UI
on top of existing tables.

### MVP scope (recommended for Phase 10.6.E)

For a 2-week sub-phase per master plan:

| Sub-phase | Surface | Effort |
|---|---|---|
| 10.6.E.1 | (admin) layout + `enforcePlatformAdmin()` gate + redirect from `/development-os/platform/*` | ~4h |
| 10.6.E.2 | `/admin` revenue dashboard hero (MRR / ARR / trial funnel + 4 KPIs in 10.5.A pattern) | ~8h |
| 10.6.E.3 | `/admin/customers` list + `/admin/customers/[code]` drill-down (plan, status, MRR, integrations, AI agents enabled) | ~12h |
| 10.6.E.4 | `/admin/subscriptions` lifecycle view + per-subscription detail | ~6h |
| 10.6.E.5 | `/admin/trials` funnel view + conversion metrics | ~6h |
| 10.6.E.6 | `/admin/comps` UI for issuing per-org plan upgrades | ~6h |
| 10.6.E.7 | `/admin/stripe` customer-search + reconcile UI | ~4h |
| Tests + decisions doc | | ~6h |

**Total**: ~52h ≈ 1.5-2 weeks ✓ (matches 2-week master-plan estimate).

### Deferred to Phase 10.6.F or later

- NPS / customer-satisfaction surface
- Refund issuance UI (Stripe API supports it; can be done from Stripe dashboard manually for MVP)
- Cohort analysis tables
- Predictive churn-risk scoring (would need ML / heuristic model)
- Customer-success workflow (assignments, follow-ups)

---

## Pre-requisites BEFORE SubscriptionOS launches

These should land in Phase 10.6.B / 10.6.D first:

1. **Fix the 5 platform-side P0 500s** — `/platform/organizations`,
   `/platform/branding`, `/settings/api-keys`, `/settings/data-export`,
   `/settings/webhooks`. Otherwise the admin can't even read the
   data SubscriptionOS displays.
2. **Confirm Stripe bridge end-to-end** — at least 1 successful
   Stripe Checkout → org_subscription transition in production.
   Without a real subscription record, the revenue dashboard renders
   empty.
3. **Confirm `dev_os_usage_metrics` cron is running** — Stage 5.J
   shipped this; the per-org usage page depends on it.

---

## Risk + open questions for operator

1. **Should SubscriptionOS be on a separate subdomain** (e.g.,
   `admin.arconique.com`)? Pros: clean separation of customer /
   internal traffic. Cons: needs DNS + Vercel routing config.
   Recommendation: **start at `/admin` on the same domain** for
   speed; promote to subdomain later if needed.
2. **Should platform-admin use a separate auth flow** (e.g., Google
   SSO restricted to @arconique.com)? Stage 10.5.B's `requirePermission`
   pattern is sufficient for MVP. Add SSO later if compliance demands.
3. **What's the relationship between SubscriptionOS and `/development-os/platform/usage`?**
   The usage page already aggregates per-org metrics. Recommendation:
   keep usage as a sub-tab under `/admin/customers/[code]/usage`,
   redirect old URL.
4. **Comp model semantics** — is a "comp" a discount, a free upgrade,
   or a manually-issued subscription? Operator decision needed.
   Recommendation: comp = override `org_subscriptions.plan_id +
   billing_status='active' + comp_until` (new column).
5. **Multi-currency revenue dashboard** — if customers pay in EUR /
   IDR / USD, MRR aggregation needs an FX rate. Stage 6 cap-finance
   has FX snapshots; reuse.

---

## Verdict

**Foundations are in place** (schema + cron + Stripe bridge +
trial-conversion). The gap is the **platform-owner UI surface** —
~50h of presentation-layer work on top of existing data.

Phase 10.6.E is well-scoped at the launch-prompt 2-week estimate.
Recommend starting with the (admin) layout + revenue-dashboard hero
+ customer list (10.6.E.1-3 = ~24h ≈ 1 week) and shipping that as
a milestone before the rest.
