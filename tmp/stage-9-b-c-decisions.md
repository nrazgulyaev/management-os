# Stage 9 / Phases 9.B + 9.C — Stripe-ready UI shells — Decisions

**Date**: 2026-05-08
**Hours target**: 1.5 days | Tests target: ~13 | Migrations: 0
**Tests delivered**: 13 static
**Test count**: 4987 → 5000 passing (+13)

---

## Why "shells" + how Stage 9.A flips them on

9.A (live Stripe products) is deferred per operator instruction. 9.B + 9.C ship the UI + endpoints that work in sandbox today and against live the moment STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY land on Vercel. **No code change at flip-time.**

The flip-on path:
1. Operator signs up for a live Stripe account.
2. Creates the 6 products (Internal, Trial, Basic, Standard, Pro, Enterprise) in Stripe dashboard. Stage 7.B's seed already declares the plan rows; the new step is pasting the Stripe `price_…` IDs into `subscription_plans.stripe_monthly_price_id` / `stripe_annual_price_id`.
3. Adds the 3 env vars to Vercel: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`.
4. Registers the production webhook endpoint in Stripe dashboard pointing at `/api/webhooks/billing/stripe` (Stage 7.D bridge — already shipped).
5. Re-deploys.

That's it. The two endpoints below detect the env vars at request time; the moment they're present the Stripe Checkout / Customer Portal calls go live.

---

## 9.B — Plan upgrade

### `/api/billing/checkout` (POST)

Body: `{ plan_code, billing_cycle? }`. Resolves the plan, validates a Stripe price ID is mapped, looks up the org's existing `stripe_customer_id` (so we don't create duplicate Stripe customers per org), and creates a Stripe Checkout Session in `mode: 'subscription'`. Returns `{ ok, sessionUrl }`.

Failure paths:
- `503 stripe_not_configured` — Stage 9.A hasn't flipped yet. Surfaced to UI as a clear "Live billing is being activated — contact support" message.
- `400 plan_not_purchasable` — plan exists but no Stripe price mapped (common for `internal` / `trial` tiers).
- `400 plan_not_found` — unknown plan_code.
- `401 not_signed_in` / `500 no_org_context` — auth / org context.
- `502 stripe_returned_no_url` — defensive, never expected.

Metadata sent to Stripe (so the existing webhook bridge can resolve everything):
- `client_reference_id = org.id`
- `metadata[organization_id]` / `metadata[plan_code]` / `metadata[billing_cycle]` / `metadata[triggered_by_app_user_id]`
- `subscription_data[trial_period_days]` if `plan.trialPeriodDays > 0`
- `allow_promotion_codes: true` (operator can paste a Stripe promo code at checkout)

Mode auto-detected from key prefix: `sk_live_` → `'live'`, otherwise `'test'`. The StripeCredentials.mode field is required by the existing payment-processors type.

### `/dashboard/billing/upgrade` page

Lists every public + active plan from `subscription_plans` ordered by `tierRank`. Highlights the org's current plan with a "Current" badge. Per-row state machine:
- **Internal plan**: shows "Internal — by invitation" badge, no button.
- **Plan with no Stripe price ID**: shows "Stripe price not yet configured" badge, no button.
- **Current plan**: shows "Manage subscription →" link to `/api/billing/portal`.
- **Other plan**: shows `<UpgradeButton>` that posts to `/api/billing/checkout`.

Surfaces three context banners from query string:
- `?locked=<flag_code>` — set by `pageGate` redirects from cabinet gating. Tells the operator which feature triggered the upgrade prompt.
- `?checkout=cancelled` — operator cancelled the Stripe Checkout flow.
- `?reason=no_customer` — bounced from `/api/billing/portal` when the org has no Stripe customer record yet.

### `<UpgradeButton>` (client)

`fetch('/api/billing/checkout', { method: 'POST', body: { plan_code, billing_cycle: 'monthly' } })`. On success: `window.location.href = sessionUrl` (hard navigation to Stripe Checkout, off-origin). On `stripe_not_configured`: explicit operator-friendly message pointing at support. On `plan_not_purchasable`: explicit "price ID not mapped" message.

---

## 9.C — Customer Portal

### `/api/billing/portal` (GET)

Looks up the caller's org's `stripe_customer_id` from `org_subscriptions`. If absent, JSON 404 `no_stripe_customer` for API clients OR 303 redirect to `/dashboard/billing/upgrade?reason=no_customer` for browser clients (so the no-subscription path surfaces the upgrade page).

If present: creates a Customer Portal session via the new `StripeClient.createBillingPortalSession({ customer, return_url })` helper (added to the existing client at `src/lib/payment-processors/providers/stripe/client.ts:109`). Returns 303 redirect to the Stripe-hosted portal for browser clients OR `{ ok, portalUrl }` JSON for API clients.

Same `stripe_not_configured` 503 path as checkout.

### `/dashboard/settings` — Subscription section

New section between "Audit" and "Identity" with two cards:
1. **Manage subscription** — links to `/api/billing/portal`. Customer arrives at Stripe-hosted UI for payment method updates, invoice viewing, plan change, cancellation.
2. **Change plan** — links to `/dashboard/billing/upgrade`. Same destination as the cabinet-gating bypass redirect.

---

## What changed in existing code

Three small additions:
1. **`src/lib/payment-processors/providers/stripe/client.ts`** — added `createBillingPortalSession({ customer, return_url })` method. Same `requestWithRetry`-wrapped POST as `createCheckoutSession`. 16 lines.
2. **`src/app/(dashboard)/dashboard/settings/page.tsx`** — added the Subscription section. ~30 lines.

No schema changes. No migrations. No new cron.

---

## Trade-offs + scope discipline

**1. No Stripe customer creation upfront.** The flow assumes Stripe's Checkout Session creates the customer record on first checkout. If you want to pre-create customers at sign-up, that's a small follow-up (Stripe `POST /v1/customers` then `customer: 'cus_…'` on every Checkout Session) — adds ~20 lines but isn't required for the happy path.

**2. No webhook handling for `customer.subscription.updated` / `invoice.paid` / `invoice.payment_failed` / `customer.subscription.deleted`.** Stage 7.D's `applyStripeWebhook` (in `src/lib/billing/stripe-subscription-bridge.ts`) already handles all of these. The endpoint at `/api/webhooks/billing/stripe` calls into that bridge. Stage 9.B + 9.C don't change anything here.

**3. No Stripe Tax + no annual / quarterly billing UI yet.** The endpoint accepts `billing_cycle: 'annual'` and uses `stripe_annual_price_id` if present, but the UI defaults to `'monthly'`. Adding a billing-cycle toggle in `<UpgradeButton>` is a 5-line follow-up; held for after the first paying customer asks for annual.

**4. No "downgrade with proration" UI.** Stripe handles proration automatically when a Customer Portal user switches plans. Operator sees "Manage subscription → Stripe portal" — that's the canonical path for downgrades. Building a custom proration calculator is unnecessary.

**5. No team-seat metering.** Plans are flat-rate per org. Per-seat pricing is a Stage 10+ feature.

**6. The build + 13 static tests + dryrun-checked patterns prove the wiring; live Stripe sandbox testing is the post-9.A operator step.** Without live keys I can't `curl /api/billing/checkout` and observe the redirect — that's verified the moment 9.A flips.

---

## Phase 9.B + 9.C acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| `/api/billing/checkout` endpoint | yes | ✅ |
| `/api/billing/portal` endpoint | yes | ✅ |
| `/dashboard/billing/upgrade` page | yes | ✅ |
| `StripeClient.createBillingPortalSession` helper | yes | ✅ |
| Manage Subscription link on /dashboard/settings | yes | ✅ |
| 503 fallback when STRIPE_SECRET_KEY missing | yes | ✅ |
| Tests | ~13 | 13 |
| Test count | 4987 → ~5000 | 5000 (+13) |
| Build clean + cron 102/101 | yes | ✅ |
| New migrations | 0 | ✅ |

**STAGE 9 / PHASES 9.B + 9.C ACCEPTED (live activation gated on Stage 9.A operator-side work).**

---

## Stage 9 status

**All 10 phases delivered:**
- 0 (provisioning fix) — applied to prod ✅
- 9.A (Stripe live products) — **deferred (operator), UI ready** ⏸
- 9.B (upgrade page) — shipped today
- 9.C (Customer Portal) — shipped today
- 9.D (team management UI) — shipped + applied
- 9.E (role assignment UI) — shipped
- 9.F (per-tenant AI config) — shipped + applied
- 9.F follow-up (eligibility + custom prompt wired into runAgentAction) — shipped
- 9.G (tenant isolation tests + Stage 5.J fix) — shipped + applied
- 9.H (customer onboarding playbook) — shipped
- 9.I (slow-query optimization) — shipped

**Ready for Stage 10 (or first paying customer pending 9.A activation).**
