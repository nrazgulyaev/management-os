# Sprint 3a — closure

**Date:** 2026-05-13
**Branch:** `main`
**Commits (newest first):**

```
3d06538  feat(marketing): Sales hub + consolidated /pricing + middleware refinement
f6e8bc0  docs(sprint-3a): content inventory + deviation proposals
```

(Plus this closure doc.)

---

## What landed

| Deliverable | File | LOC | Status |
|---|---|---|---|
| Content inventory audit (Task 1) | `docs/audits/2026-05-13-sprint-3a-content-inventory.md` | 201 | new |
| Sales hub component (Task 3.1) | `src/components/marketing/sales-hub.tsx` | 350 | new |
| Apex subscription branch wiring | `src/app/(public)/page.tsx` | +6 lines | edit |
| Marketing pricing-tiers module (Task 3.4) | `src/lib/marketing/pricing-tiers.ts` | 285 | new |
| Consolidated /pricing page (Task 3.4) | `src/app/(public)/pricing/page.tsx` | 260 | new |
| Middleware allow-list tidy (Task 2) | `src/middleware.ts` | -2, +9 | edit |
| Un-retire /pricing redirect | `next.config.mjs` | -2, +7 | edit |
| New acceptance tests | `tests/sprint-3a-sales-and-pricing.test.ts` | 215 | new |
| Stage tests updated | `tests/development-stage-10-i-2-3-4.test.ts`, `tests/development-stage-7.test.ts` | minor | edit |

## What was SKIPPED, with rationale

| Spec item | Status | Why |
|---|---|---|
| Task 3.2 (`/management-os` Mgmt OS sales detail) | SKIPPED | `(public)/products/management-os/page.tsx` already ships a 290-LOC Mgmt-OS sales detail (Stage 10.I.3). The Sales hub CTAs link there. |
| Task 3.3 (`/development-os` Dev OS sales detail) | SKIPPED | (a) `(public)/products/development-os/page.tsx` already ships a 285-LOC equivalent (Stage 10.I.3). (b) A top-level `(public)/development-os/page.tsx` would collide with `(development-app)/development-os/page.tsx` and break the build. The Sales hub CTAs link to `/products/development-os`. |
| Task 4 (`/signup` placeholder) | SKIPPED | `(public)/signup/page.tsx` already wires a working form to `signupAction` (Stage 10.I.5). Replacing with a placeholder would regress functional code. |

The skip rationale was surfaced in the Task 1 inventory doc
(`docs/audits/2026-05-13-sprint-3a-content-inventory.md`) and the
operator's spec authoring did not appear to be aware of the existing
surface.

## Pricing-tier reconciliation (deferred to Sprint 3b)

Two pricing models now coexist:

| Source | Used by | Tier model |
|---|---|---|
| `src/lib/billing/pricing.ts` (Stage 10.I.4) | `/pricing/management-os`, `/pricing/development-os` via `<PricingPage>` | 3 tiers per product (Starter $99/$199, Pro $299/$499, Enterprise) |
| `src/lib/marketing/pricing-tiers.ts` (Sprint 3a, new) | `/pricing` consolidated page | 4 tiers per product + Bundle column (Starter $79/$149/$199, Pro $199/$349/$499, Scale $499/$799/$1199, Enterprise) |

**Operator decision needed for Sprint 3b** (Stripe wiring sprint):
which is canonical, and what happens to the surface that's
deprecated. Recommendation in the inventory doc: adopt the new
Sprint-3a model + retire the per-product pages once Stripe billing is
live.

## Acceptance gates

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` on Sprint-3a files | clean |
| `npm test` | **6030 / 6030** passing (5984 baseline → +17 Sprint-3a; the two Stage tests that asserted `/pricing` was retired were updated to assert the un-retirement) |
| `npm run build` | succeeds. `/pricing` is now `○` (static prerender). `/pricing/management-os` + `/pricing/development-os` still build, drive from the older Stage-10.I.4 pricing config. Middleware bundle 34.7 → 34.7 kB (no change). |

## Test count delta

5984 → 6013 (Sprint 2) → **6030** (Sprint 3a, +17).

## Manual smoke recipe

The harness blocks auto-starting `npm run dev`. Operator-side recipe:

```bash
npm run dev

# Sales hub apex on subscription subdomain
curl -sI -H "Host: subscription.localhost" http://localhost:3000/
# expect: 200, x-product: subscription

# Consolidated pricing page
curl -sI -H "Host: subscription.localhost" http://localhost:3000/pricing
# expect: 200, x-product: subscription

# Existing /products page reachable on subscription subdomain (now
# in allowedPrefixes)
curl -sI -H "Host: subscription.localhost" http://localhost:3000/products/management-os
# expect: 200, x-product: subscription

# /pricing on apex (no subdomain) → also works (no redirect anymore)
curl -sI http://localhost:3000/pricing
# expect: 200

# Existing /pricing/management-os still works
curl -sI http://localhost:3000/pricing/management-os
# expect: 200

# Per-product Mgmt subdomain rejects /pricing (not in allowedPrefixes)
curl -sI -H "Host: management.localhost" http://localhost:3000/pricing
# expect: 307 → /

# Sales hub renders <SalesHub /> body — eyeball check in browser
open http://subscription.localhost:3000/
```

## Visual quality score (1–5 vs reference)

| Surface | Before Sprint 3a | After Sprint 3a |
|---|---|---|
| `subscription.arconique.com/` apex | 1/5 (Sprint 2 placeholder ProductLanding) | **4/5** — Sales hub with product chooser + capabilities + trial CTA on hero tokens |
| `subscription.arconique.com/pricing` | n/a (was 308 redirect) | **4/5** — 3-column grid with gradient column headers, recommended-tier highlight ring, FAQ band |

Remaining point reserved for: live testimonials / customer logos
(operator-supplied content), actual screenshots in the Sales-hub
capabilities grid (currently icons + copy), and the eventual
post-Stripe-wiring "$X saved" social-proof band on the pricing page.

## Halt

Not proceeding to Sprint 3b (Stripe wiring + signup flow polish)
without operator review. Local `main` now carries:

- 1 pre-Sprint-1 commit (`9009cb9 Stage 10.7.0`)
- 6 Sprint-1 commits
- 5 Sprint-2 commits + 1 closure
- 1 Sprint-3a inventory doc + 1 implementation commit (+ this closure)

…still unpushed to `origin/main`. Operator can push the full stack
when ready.
