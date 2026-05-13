# Sprint 3c — closure

**Date:** 2026-05-13
**Branch:** `main`
**Scope:** Close the Sprint-3b carry-over — the webhook bridge now
syncs `organizations.products_enabled` from
`subscription.metadata.products_enabled`, and users redirected away
from a now-inaccessible product see a soft-toast explanation on the
destination.

---

## Commits (2 new on local `main`, plus this closure)

```
f58a682  feat(billing): webhook bridge syncs org.products_enabled + soft-toast banner
b386db3  test(sprint-3c): bridge products_enabled sync acceptance + extract pure helper
```

---

## The bug Sprint 3c fixes

Sprint 3b's checkout endpoint stamped `products_enabled` onto every
Stripe Checkout Session's `subscription_data.metadata`, but the
webhook bridge (`stripe-subscription-bridge.ts`) never read it. A
customer who paid for **Bundle Pro** got:

| Surface | After Sprint 3b alone | After Sprint 3c |
|---|---|---|
| `org_subscriptions.plan_code` | `standard` ✅ | `standard` ✅ |
| `organizations.products_enabled` | unchanged (e.g. `['mgmt']` from trial signup) ❌ | `['mgmt','dev']` ✅ |
| Mgmt OS workspace visible? | Yes | Yes |
| Dev OS workspace visible? | **No** ❌ | Yes ✅ |
| Cabinet gating (Bundle features) | Correct (driven by `plan_code`) | Correct (driven by `plan_code`) |

The mismatch meant Bundle customers had the right *gating* but the
wrong *visibility* — Dev OS workspace was hidden from the switcher
and `enforceProductAccess('dev')` redirected them away. Sprint 3c
closes the loop.

---

## What landed

### Task 2 — webhook bridge products_enabled sync

`src/lib/billing/stripe-subscription-bridge.ts` (+99 lines):

- **`applyProductsEnabledFromSubscription({...})`** — reads
  `subscription.metadata.products_enabled`, validates against the
  `ProductSlug` enum, compares to current `organizations.products_enabled`,
  applies an `UPDATE` if the multiset differs, emits one of two audit
  events:
  - `billing.products_enabled.changed` — with `before` + `after` diff
  - `billing.products_enabled.missing` — when metadata is absent (so
    operators can spot legacy / direct-API subscriptions)
- **Idempotent** — equal multisets short-circuit; same metadata
  replayed is a no-op.
- **Never throws** — audit failures swallowed; main FSM mutation
  must not fail because of audit/bridge side-effects.

Hooked into:
- `customer.subscription.created` — sync runs **before** the FSM
  transition so gating is in place by the time the activation audit
  fires
- `customer.subscription.updated` — sync runs before the
  `plan_changed` audit so Bundle ↔ standalone moves flip product
  visibility immediately
- `customer.subscription.deleted` — **intentionally untouched**
  (Sprint-3c spec §2.2). Customer keeps access until period_end via
  the existing FSM; we don't yank products mid-cycle.

`src/lib/billing/stripe-subscription-bridge-pure.ts` (new):
The pure `parseProductsEnabledMetadata(raw)` helper, factored out
of the bridge so tests can import it without crossing the
`server-only` barrier (mirrors `lifecycle-pure.ts` / `lifecycle.ts`).

### Task 3 — graceful degradation toast

`src/features/auth/products-access.ts` — `enforceProductAccess()`
redirect now stamps `?from=<product>&reason=<…>`:

```ts
// Old:  redirect(PRODUCT_HOME[alt])
// New:  redirect(`${PRODUCT_HOME[alt]}?from=${product}&reason=…`)
```

`src/components/layout/product-access-changed-banner.tsx` (new):
Server-component banner that reads `from` + `reason`, renders a
warning-weak callout with a "See plans" deep-link to
`/dashboard/billing/upgrade`. Returns `null` when `from` is absent
(no-op on direct nav).

Mounted on:
- `src/app/(dashboard)/dashboard/page.tsx` (Mgmt OS apex)
- `src/app/(development-app)/development-os/page.tsx` (Dev OS apex)

Both pages gain a `searchParams` parameter to read the query params.

**Workspace switcher itself is unchanged** — Stage 10.H already filters
by `enabledProducts` correctly. Sprint 3c is purely about: (a) keeping
`enabledProducts` in sync with paid reality (Task 2), and (b) telling
the user what just happened when they get redirected (Task 3).

### Task 4 — Sprint 3c acceptance tests

`tests/sprint-3c-bridge-products-sync.test.ts` (19 tests):

- 4 behavioural tests on `parseProductsEnabledMetadata` (null /
  empty / parse / drop-unknown semantics)
- 5 source-inspection tests on the bridge wiring (imports, helper
  existence, .created + .updated + .deleted hooks, audit emission,
  idempotency)
- 1 test on `enforceProductAccess` carrying `from` + `reason` on redirect
- 4 tests on the banner component + apex mounts
- 3 end-to-end tests verifying the marketing-mapping module resolves
  Bundle Pro → `['mgmt','dev']`, Mgmt-only Pro → `['mgmt']`,
  Dev-only Scale → `['dev']` (the precise bug Sprint 3c fixes,
  asserted at the boundary)

---

## Acceptance gates

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` on Sprint-3c files | clean |
| `npm test` | **6063 / 6063** passing (6044 baseline + 19 Sprint-3c) |
| `npm run build` | succeeds; webhook handler + both apex pages emit |

## Test count delta

| Sprint | Total |
|---|---|
| Pre-Sprint-1 baseline | 5964 |
| After Sprint 1 | 5984 |
| After Sprint 2 | 6013 |
| After Sprint 3a | 6030 |
| After Sprint 3b | 6044 |
| **After Sprint 3c** | **6063** |

---

## Manual smoke recipe (operator-side)

The harness blocks auto-starting `npm run dev` for live curl tests.
After Sprint 3c lands, the operator can validate the full flow with
Stripe CLI:

```bash
# 1) Make sure the test-mode Stripe products exist (Sprint 3b).
npm run stripe:provision:apply

# 2) Forward Stripe webhooks to localhost.
stripe listen --forward-to localhost:3000/api/webhooks/billing/stripe

# 3) Simulate a Bundle Pro subscription.
#    The real customer flow triggers this via Checkout, but for a
#    direct test we can fire the event by hand. Stripe CLI's
#    `trigger` doesn't let us set metadata easily, so use:
#
#    a) Use Stripe Dashboard (test mode) → Customers → create a
#       customer + subscription against the bundle-pro Price.
#       Set subscription metadata: products_enabled=mgmt,dev,
#                                    packaging_key=bundle-pro,
#                                    plan_code=standard
#    b) Verify the org_subscriptions + organizations rows update.
#    c) Verify the audit_events table has a
#       `billing.products_enabled.changed` row.

# 4) Test the soft-toast.
#    a) Sign in as a user whose org has products_enabled=['mgmt'].
#    b) Visit /development-os.
#    c) Should redirect to /dashboard?from=dev&reason=product_not_enabled
#    d) The toast banner should appear above the greeting.
```

---

## What's still NOT wired (Sprint 3d+ candidates)

1. **No reverse-lookup via product metadata.** If a subscription
   arrives without `subscription.metadata.products_enabled` (legacy
   subscriptions, or any subscription created via the Stripe
   Dashboard / API without explicit metadata), the bridge emits
   `billing.products_enabled.missing` and leaves the org unchanged.
   Sprint 3c spec §2.1 mentioned a fallback to read
   `subscription.items[].price.product.metadata.products_enabled` —
   deferred because (a) the webhook payload doesn't expand product
   metadata by default, requiring an extra Stripe API call, and (b)
   the Sprint 3b checkout flow now always stamps the field, so the
   missing-metadata case is just legacy / out-of-band subscriptions.
   Easy follow-up if it becomes a real concern.

2. **Workspace switcher mid-session refresh.** The switcher only
   refreshes when the layout re-renders (typically on next
   navigation). A user who's actively in `/development-os` when
   their Bundle gets downgraded won't see the workspace disappear
   until they navigate. `enforceProductAccess` redirects them on
   the next click — the toast then surfaces. No real-time push
   needed for billing events, but worth flagging.

3. **Granular cancel UX.** When `customer.subscription.deleted`
   fires, products_enabled stays as-is (deliberate — keep access
   until period_end). At period_end, an external cron transitions
   the FSM to `cancelled` / `archived`; at that point we still
   don't clear `products_enabled`. Operator decision needed: do we
   want a "products_enabled snapshot at cancel" so the org reverts
   to its pre-paid state on full cancellation, or do we accept that
   archived orgs keep their last products_enabled until reactivation
   (current behavior)?

---

## Halt

Local `main` now carries **21 unpushed commits**:
- Stage 10.7.0 (1)
- Sprint 1 (6)
- Sprint 2 (5)
- Sprint 3a (4)
- Sprint 3b (6)
- Sprint 3c (3 — including this closure)

Operator can push the full stack when ready.
