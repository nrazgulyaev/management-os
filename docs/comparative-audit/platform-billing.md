# Comparative Functional Audit — Platform OS + Subscription/Billing + Vendor Portal

Cluster: **Platform-app** (`src/app/(platform-app)/platform/`), **Subscription/onboarding**
(`src/features/signup/`, `src/app/api/onboarding/`, `src/lib/billing/`), **Vendor portal**
(`src/app/(vendor)/`).

App: Next.js 15 / Drizzle multi-tenant SaaS. Date: 2026-07-02.
Scope note: platform helpers are gated by the `PLATFORM_ADMIN_EMAILS` allowlist (intended). Cross-tenant
IDOR was audited in prior waves and is out of scope here.

---

## 1. Status table

### Platform-app pages

| Surface | File | Status | Notes |
|---|---|---|---|
| Organizations list | `platform/organizations/page.tsx` | **WORKS** | Real `listSubscriptionOsOrgs()` with status/search filters. |
| Org detail | `platform/[orgCode]/page.tsx` | WORKS (assumed) | Real org queries; not deep-read. |
| Billing (index + per-org) | `platform/billing/page.tsx`, `billing/[orgCode]/page.tsx` | WORKS | Reads `billing/queries.ts` (real subscription/plan joins). |
| Revenue | `platform/revenue/page.tsx` | **WORKS** | Real MRR/ARR from `getRevenueSnapshot()` (`subscription-os/queries.ts:252`): sums `monthlyPriceMinor` over active subs, ARR = MRR×12. |
| Usage | `platform/usage/page.tsx` | **PARTIAL** | Only per-product org counts + a deep-link to AI-usage. Per-org storage/active-user/metered figures explicitly deferred (page header admits it). No real usage metering. |
| Support inbox | `platform/support/page.tsx`, `support/[threadId]/page.tsx` | **WORKS** | Real `supportThreads`/`supportMessages` (migration 0165), open→pending→closed lifecycle, write actions re-check. SLA timers / AI drafts / saved replies out of v1 scope. |
| System health | `platform/system-health/page.tsx` | **WORKS** | Real SQL: `pg_stat_activity`, `job_runs`, `job_locks`, `notification_deliveries`, `auth_login_attempts`, `agent_runs`. Dispatch/replay/clear-lock wired to real runner + permission-gated. Pause-workers honestly read-only (no runner primitive). |
| Feature flags | `platform/feature-flags/page.tsx` | **PARTIAL** | Index + create/toggle flag, audit-logged. The flag×org (and flag×plan) matrix is a deferred follow-up — so operators can't actually bind a flag to a plan here. |
| Plans | `platform/plans/page.tsx` | WORKS | Real `listPlansWithCounts()` + `PlansEditor`. |
| Users (+detail) | `platform/users/page.tsx`, `users/[id]/page.tsx` | WORKS (assumed) | Real user queries; not deep-read. |
| Audit | `platform/audit/page.tsx` | WORKS (assumed) | Reads `audit_events`; not deep-read. |
| Agents (list/new/detail) | `platform/agents/*` | WORKS (assumed) | Backed by `agent_runs`; surfaced in system-health too. |

### Subscription / billing / onboarding

| Surface | File | Status | Notes |
|---|---|---|---|
| Checkout session creator | `api/billing/checkout/route.ts` | **WORKS** | Real Stripe Checkout, packaging→price resolution, stamps org/plan/products metadata onto session + `subscription_data`. Reuses existing customer. Fails clean `stripe_not_configured` 503. |
| Customer portal redirect | `api/billing/portal/route.ts` | **WORKS** | Delegates upgrade/downgrade/cancel/payment-method/invoices to Stripe Customer Portal — the correct self-serve model. 404→upgrade page when no customer. |
| Webhook bridge | `lib/billing/stripe-subscription-bridge.ts` | **WORKS** | `checkout.session.completed` link handler + all `customer.subscription.*` / `invoice.*` events. Idempotent via `claimStripeEvent` (processing→processed lease, releases on failure so Stripe redelivery re-processes). Syncs `products_enabled`. Recent fixes present and correct. |
| Onboarding endpoint | `api/onboarding/start/route.ts` | **WORKS** | Atomic: preflight uniqueness, Supabase auth user, org insert, `provision_app_user()`, **`orgSubscriptions` row (trial, 14d)**, audit. Auth-user rollback on DB failure. Wired to `/sign-up`. |
| Alternate signup action | `features/signup/actions.ts` | **BROKEN** | Provisions org + user + roles but creates **NO `orgSubscriptions` row**. Wired to the live `/signup` (public group) via `signup-form.tsx`. Result: gating for these orgs always resolves `no_subscription` (fail-open). See DEF-1. |
| Feature/limit enforcement | `lib/billing/gating.ts` | **PARTIAL / cosmetic** | `requireFeature` / `requireWithinLimit` / `pageGate` have **zero call sites** outside their own module. Plan limits (villa count, seats, etc.) are never enforced. See DEF-2. |
| Cabinet gating | `lib/billing/cabinet-gating.ts` | **PARTIAL** | `gateCabinetForCurrentOrg` wired to only **3** dev-OS cabinet pages; fails-open on `no_subscription` by design. Everything else ungated. |
| Trial lifecycle | `cron/subscription-advance-lifecycle-job.ts` | **BROKEN** | Only `grace→suspended` and `cancelling→cancelled`. **No `trial→expired/suspended`** transition; nothing checks `trialEndsAt < now`. Expired trials keep full access. See DEF-3. |
| Renewal cron | `cron/subscription-attempt-renewal-job.ts` | **MOCK (superseded)** | Self-labeled STUB: stamps a false `payment_failed` event on any active, non-Stripe-linked sub past period end. Real driver is the Stripe webhook path; the stub is dead weight and can emit misleading events for manually-provisioned orgs. |
| Suspended-status gate | (none) | **MISSING** | No page/action gates on `status === "suspended"`/`archived`. Suspension is cosmetic — a suspended org retains product access. |

### Vendor portal

| Surface | File | Status | Notes |
|---|---|---|---|
| Vendor request page | `(vendor)/vendor/service/[token]/page.tsx` | WORKS | Token-resolved fulfilment context. |
| Token access | `service-fulfilment/services.ts:379` `getFulfilmentByVendorToken` | **PARTIAL** | Looks up by SHA-hashed token + `status='active'` — good. But **no `expiresAt` check** on read; relies solely on a status flip. See DEF-4. |
| Invoice submission | `service-fulfilment/actions.ts:1408` `createVendorInvoiceFromTokenAction` | **WORKS** | Scope derived from token (`invoiceScopeFromToken` = expiry/revoke gate), optional 25MB doc upload (org-scoped, admin storage), invoice insert `status='received'`, event-log append. Solid. |

---

## 2. Defects (prioritized, file:line)

### P0

**DEF-1 — Second public signup path provisions orgs with NO subscription row (fail-open gating).**
`src/features/signup/actions.ts` (whole action, note line 281 has no `orgSubscriptions` insert; compare `api/onboarding/start/route.ts:281`). Live via `/signup` → `src/components/signup/signup-form.tsx` → `src/app/(public)/signup/page.tsx`. Any org created here has `getActiveOrgSubscription()` return `null` (`gating.ts:63`), so every cabinet/feature gate resolves `no_subscription` and **fails open**. Two divergent signup paths also mean inconsistent org state.
Fix: either delete/redirect the `/signup` path to `/sign-up`, or add the trial `orgSubscriptions` insert to `signupAction`.

**DEF-2 — Plan limits & feature entitlements are entirely cosmetic (never enforced).**
`src/lib/billing/gating.ts:139` `requireFeature`, `:158` `requireWithinLimit`, `:186` `pageGate` — **zero call sites** across `src/features` and `src/app`. No create action anywhere calls `requireWithinLimit` (verified against villa/booking/seat create surfaces). A Trial/Basic org can create unlimited villas/bookings/users; paid-only features are reachable. Entitlement machinery is fully built but unwired.

**DEF-3 — No trial-expiry enforcement; expired trials keep full access.**
`src/lib/development/server/cron/subscription-advance-lifecycle-job.ts:25-66` handles only `grace→suspended` and `cancelling→cancelled`. No transition reads `orgSubscriptions.trialEndsAt`/`organizations.trialEndsAt` to expire a trial. No page/action gates on `trialEndsAt < now`. Combined with DEF-2, a trial never ends functionally.

### P1

**DEF-4 — Vendor token has no expiry enforcement on read.**
`src/features/service-fulfilment/services.ts:385-394` — `getFulfilmentByVendorToken` gates on `status='active'` only, never compares `expiresAt` to now. A token past its intended expiry still opens the request page as long as nothing flipped `status`. (The invoice *submit* path uses `invoiceScopeFromToken`, which the error string claims checks expiry — verify that helper enforces `expiresAt`; the read path definitely does not.)

**DEF-5 — Renewal cron emits false `payment_failed` events for non-Stripe orgs.**
`src/lib/development/server/cron/subscription-attempt-renewal-job.ts:40-52` — self-labeled STUB stamps `payment_failed` on every active, non-internal sub whose period ended, regardless of real payment state. For a manually-provisioned/real tenant not on Stripe, this pollutes lifecycle history and could drive downstream grace/suspend logic on a false signal. Should be gated to no-op (or deleted) now that the Stripe webhook path is authoritative.

### P2

**DEF-6 — Usage metering is aggregate-only (no per-org metered billing signal).**
`platform/usage/page.tsx` — product-mix counts only; per-org storage/active-user/API metrics deferred. No usage is metered into billing. Fine for seat/tier pricing; blocks any usage-based plan.

**DEF-7 — Feature-flag→plan binding not editable in the operator UI.**
`platform/feature-flags/page.tsx:12` — flag×org / flag×plan matrix deferred, so entitlements must be seeded via migration, not managed by operators. (Moot until DEF-2 is fixed, but needed for a real control plane.)

---

## 3. Competitor gap table — Stripe Billing + typical B2B SaaS control-plane (2025-26)

| Capability | Best-in-class (Stripe Billing 2025-26) | This platform | Verdict |
|---|---|---|---|
| Subscription billing (checkout→active) | Checkout + webhook-driven state | Real checkout + idempotent webhook bridge, products_enabled sync | **PARITY** |
| Stripe Customer Portal | Hosted upgrade/downgrade/cancel/PM/invoices | `api/billing/portal` delegates to it | **PARITY** |
| Self-serve upgrade/downgrade + proration | Portal + proration handled by Stripe | Delegated to portal (proration is Stripe-side) | **PARITY** |
| **Entitlement enforcement in-product** | Entitlements API + *your own* gate checks (Stripe explicitly makes gating DIY) | Gate helpers exist but **unwired** (DEF-2) | **GAP (P0)** |
| **Trial lifecycle → expiry lock** | Trial→active/canceled automated | Trial never expires functionally (DEF-3) | **GAP (P0)** |
| **Dunning / failed-payment recovery** | Smart retries + email flows, recovers ~41% | Webhook flips to `grace`; **no retry schedule, no dunning email flow**; cron is a stub | **GAP (P1)** |
| Metered / usage-based billing | Meters API, high-throughput ingestion | Aggregate counts only, no metering (DEF-6) | **GAP (P2)** |
| Stripe Tax | Automated tax calc on subscriptions | Not present | **GAP (P2)** — acceptable pre-scale (ID market) |
| Revenue reporting (MRR/ARR/churn) | Stripe dashboards | Real MRR/ARR/per-tier/conversion snapshot | **PARITY** |
| Control-plane ops (health/support/audit) | Usually 3rd-party (statuspage/Zendesk) | Built-in real system-health + support inbox + audit | **DIFFERENTIATION** |
| Vendor-side invoice intake via signed link | Not a Stripe concept | Token-scoped vendor invoice submission w/ doc upload | **DIFFERENTIATION** |

---

## 4. Recommendations (prioritized)

**P0**
1. **Wire entitlement enforcement (DEF-2).** Call `requireWithinLimit` in every create action that maps to a plan limit (villas, bookings, seats, cabinets) and `pageGate`/`gateCabinet` on gated pages. The machinery is done — this is call-site work.
2. **Fix the divergent signup path (DEF-1).** Collapse `/signup` (public) onto `/sign-up`→`/api/onboarding/start`, or add the trial `orgSubscriptions` insert to `signupAction`. One provisioning path, always with a subscription row.
3. **Enforce trial expiry (DEF-3).** Add a cron transition `trial→suspended/expired` on `trialEndsAt < now` (skip internal-comp), and make `getActiveOrgSubscription`/page gates treat expired as locked. Depends on #1.

**P1**
4. **Real dunning.** On `invoice.payment_failed`, drive a retry/reminder email sequence (Stripe Smart Retries or an in-app schedule) instead of a silent grace flip. Delete/guard the stub renewal cron (DEF-5).
5. **Vendor token expiry (DEF-4).** Add `expiresAt > now()` to `getFulfilmentByVendorToken` and confirm `invoiceScopeFromToken` enforces it.

**P2**
6. **Operator feature-flag→plan matrix (DEF-7)** so entitlements are managed, not migration-seeded.
7. **Per-org usage metering (DEF-6)** if/when usage-based plans are on the roadmap.
8. **Stripe Tax** — defer until multi-jurisdiction scale.

---

## Sources
- [Stripe Entitlements — Documentation](https://docs.stripe.com/billing/entitlements)
- [Stripe Billing features](https://stripe.com/billing/features)
- [Stripe Billing Review 2025 (UsageBox)](https://usagebox.com/articles/stripe-billing-review-2025)
- [Stripe billing meters migration guide](https://docs.stripe.com/billing/subscriptions/usage-based-legacy/migration-guide)
- [Kinde — Dunning strategies for SaaS](https://www.kinde.com/learn/billing/churn/dunning-strategies-for-saas-email-flows-and-retry-logic/)
- [Kinde — Tax & compliance in SaaS billing with Stripe](https://www.kinde.com/learn/billing/tax-and-compliance/how-to-handle-tax-and-compliance-in-saas-billing-with-stripe/)
