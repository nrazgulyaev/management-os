# Sprint 3b — closure

**Date:** 2026-05-13
**Branch:** `main`
**Strategy:** Option C — hybrid. DB seed (Stage 7.B `subscription_plans`) stays as
the runtime-gating source of truth; Sprint-3a marketing tiers
(`src/lib/marketing/pricing-tiers.ts`) drive the customer-facing
surface; a new `plan_packaging` table + `marketing-mapping.ts` join
them.

---

## Commits (5 new on local `main`, plus this closure)

```
a410d50  feat(billing): plan_packaging table + Stripe provisioning + retire Stage-10.I.4
2718da9  feat(billing): checkout reads plan_packaging by packaging_key
35297ef  feat(pricing): monthly/annual toggle on /pricing + packaging_key CTAs
d99794a  feat(billing): upgrade page + button read plan_packaging
a56dc41  test(sprint-3b): pricing reconciliation acceptance + .env.example Stripe block
```

---

## Decision lock-in (from operator on 2026-05-13)

| Question | Decision |
|---|---|
| Reconciliation path | **Option C — hybrid** |
| Bundle = real product? | **Yes** — real Stripe SKUs for Bundle Starter/Pro/Scale |
| Starter entry-point | **Sprint 3a prices**: $79 Mgmt / $149 Dev / $199 Bundle |
| Annual billing | **Surface with toggle**, −15% discount |
| Trial flow | **Trial-then-tier** — signup creates `plan_code: trial`; upgrade page handles tier+checkout |

---

## What landed (10 tasks)

| Task | File / surface | LoC |
|---|---|---|
| 1 — Marketing-mapping module | `src/lib/billing/marketing-mapping.ts` (new) | 150 |
| 2 — Migration + Drizzle schema | `drizzle/0096_plan_packaging.sql` (new) + `src/lib/db/schema/subscriptions.ts` extension | 130 + 50 |
| 3 — Stripe provisioning script | `scripts/stripe-provision.ts` (new) + 2 `package.json` scripts | 240 |
| 4 — Retire Stage-10.I.4 surface | deleted 4 files; added 2 redirects in `next.config.mjs` | −880 / +6 |
| 5 — Checkout rewrite | `src/app/api/billing/checkout/route.ts` | rewrite (+50/−45) |
| 6 — Annual toggle UI | `src/components/marketing/pricing-cycle-toggle.tsx` (new) + `/pricing/page.tsx` edits | 100 + 75 |
| 7 — Upgrade page rewrite | `src/app/(dashboard)/dashboard/billing/upgrade/page.tsx` + button | rewrite (+150/−96) |
| 8 — `.env.example` Stripe block | docs in `.env.example` | +40 lines |
| 9 — Sprint-3b acceptance tests | `tests/sprint-3b-pricing-reconciliation.test.ts` (new) | 290 |
| 10 — This closure doc | `docs/audits/2026-05-13-sprint-3b-closure.md` | this file |

## Retired surface (deleted)

- `src/lib/billing/pricing.ts` — Stage-10.I.4 per-product pricing config
- `src/components/marketing/pricing-page.tsx` — shared `<PricingPage>` renderer
- `src/app/(public)/pricing/management-os/page.tsx`
- `src/app/(public)/pricing/development-os/page.tsx`

Both former URLs now 308-redirect to the consolidated `/pricing`.

## Tests updated (no logic changes — only obsolete-assertion refresh)

- `tests/development-stage-10-6-c-4.test.ts` — 7 visual assertions about the deleted `<PricingPage>` collapsed into one component-deleted check
- `tests/development-stage-10-i-2-3-4.test.ts` — 10 retirement assertions added in place of the old config-import-based tests
- `tests/development-stage-7.test.ts` — `/pricing` un-retired by 3a, per-product pages retired by 3b; assertions updated
- `tests/development-stage-8-c.test.ts` — sign-up flow invariant updated to expect `/pricing` only
- `tests/development-stage-9-b-c.test.ts` — checkout + upgrade tests rewritten to assert plan_packaging-based lookups
- `tests/sprint-3a-sales-and-pricing.test.ts` — `/pricing` CTA assertion updated to expect `packaging_key` + `cycle` params
- `tests/p111-rls-coverage.test.ts` — `plan_packaging` added to the platform-catalog allowlist (no RLS on the table itself; same posture as `subscription_plans`)

## Acceptance gates

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` on Sprint-3b files | clean |
| `npm test` | **6044 / 6044** passing (5984 baseline → +22 Sprint-3b + 17 Sprint-3a + 21 net adjusted) |
| `npm run build` | succeeds. `/pricing` is `○` static; `/api/billing/checkout` + `/dashboard/billing/upgrade` are `ƒ` dynamic. |
| `npm run stripe:provision` (dry-run) | not run in this sprint — needs DB available + STRIPE_SECRET_KEY (test) in env. Manual recipe in closure below. |

## How the customer flow lines up now

```
1.  /pricing (subscription.arconique.com OR apex)
    User picks: planKind (mgmt-only|dev-only|bundle) × tierKey
              (starter|pro|scale|enterprise) × cycle (monthly|annual)
    CTA: /signup?packaging_key=<key>&cycle=<cycle>

2.  /signup
    Sign up → org_subscriptions row created with plan_code='trial',
    organizations.products_enabled set per packaging hint (Sprint 3c
    will fully wire this; today the signup form ignores packaging_key
    and creates a trial only).
    Trial period: 14 days. No card.

3.  /dashboard/billing/upgrade (or pageGate lock-banner deep-link)
    User picks a packaging to switch to. Button POSTs:
       { packaging_key, billing_cycle } → /api/billing/checkout
    Checkout resolves packaging_key → plan_packaging row → Stripe
    price ID. Creates Stripe Checkout Session with packaging metadata
    on session AND subscription_data.

4.  Stripe Checkout (external)
    User pays. Stripe fires:
       checkout.session.completed → /api/webhooks/billing/stripe
    Bridge applies the transition. (Sprint 3c follow-up: extend the
    bridge to read subscription.metadata.products_enabled and
    UPDATE organizations.products_enabled atomically so a Bundle
    upgrade flips on both products' cabinets.)
```

## Sprint 3c follow-up (deferred)

The bridge (`src/lib/billing/stripe-subscription-bridge.ts`) reads
`org_subscriptions.plan_code` to drive FSM transitions, but it does
NOT yet read `subscription.metadata.products_enabled` to update
`organizations.products_enabled`. Today a customer who pays for
"Bundle Pro" gets `plan_code: standard` (correct) but
`products_enabled` stays at whatever it was before the upgrade.
Cabinet gating uses `plan_code` for *eligibility* but
`products_enabled` for *visibility* — a Bundle customer would have
the right gating but missing workspaces in the switcher until
Sprint 3c.

Workaround in the meantime: super_admin sets `products_enabled`
manually via the platform-admin OS impersonation tool when a Bundle
customer subscribes.

## Stripe provisioning — operator-side recipe

The harness blocks auto-running the provisioning script (it needs
DB + STRIPE_SECRET_KEY). After Sprint 3b lands:

```bash
# 1) Apply migration 0096 (idempotent — re-running is a no-op).
npm run db:migrate

# 2) Set Stripe TEST keys in .env.local first.
#    Stripe Dashboard → Developers → API keys (test mode).
echo "STRIPE_SECRET_KEY=sk_test_…" >> .env.local
echo "STRIPE_PUBLISHABLE_KEY=pk_test_…" >> .env.local

# 3) Dry-run (default). Prints every Stripe API call without making it.
npm run stripe:provision

# 4) Apply. Creates 9 products + 18 prices in test mode + updates
#    plan_packaging.stripe_* columns.
npm run stripe:provision:apply

# 5) Inspect Stripe Dashboard (test mode) → Products. Verify the 9
#    products and their monthly + annual prices look right.

# 6) Set up the webhook endpoint:
#    Stripe Dashboard → Developers → Webhooks → Add endpoint
#      URL: https://<your-host>/api/webhooks/billing/stripe
#      Events: customer.subscription.*, invoice.paid,
#              invoice.payment_failed, invoice.payment_action_required
#    Paste the signing secret into STRIPE_BILLING_WEBHOOK_SECRET.

# 7) Promote to live: replace sk_test_ with sk_live_ + repeat from
#    step 3. The provisioning script is idempotent — running with
#    live keys creates fresh live products without touching the
#    test products already provisioned (each plan_packaging row only
#    holds ONE set of Stripe IDs at a time; choose test or live).
```

Note: the script writes a single `stripe_product_id` per packaging
row. To run BOTH test and live products against the same DB you'd
need to extend the schema with `stripe_test_*_id` columns. Sprint 3b
deliberately stays simple — one Stripe environment per DB
environment (test DB → test Stripe, prod DB → live Stripe).

## Halt

Not proceeding to Sprint 3c (webhook bridge + signup-flow packaging
hint + Stripe sandbox smoke tests) without operator review. Local
`main` carries 19 unpushed commits total now (Stage 10.7.0 + 6
Sprint-1 + 5 Sprint-2 + 4 Sprint-3a + 5 Sprint-3b + this closure).
Operator can push when ready.
