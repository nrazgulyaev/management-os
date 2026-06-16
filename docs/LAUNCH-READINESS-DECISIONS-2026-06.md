# Launch-readiness — decisions for the founder (2026-06)

The E2E static-trace surfaced these items that are **not pure bugs** — each needs a business/product call before code. The deterministic defects were already fixed (#282); these are the judgment ones. Roughly ranked by money/launch impact.

## Money / finance
1. **Two owner-statement generators, different formulas.** `statement-generation.ts` computes `net = gross − channelFee − expense − tax − reserve − operatorFee` (tax 11%, reserve 3% hardcoded, FX snapshotted). `statement-generator.ts` sums `gross + fees + expenses + taxes + reserves + mgmtFee` relying on source rows being pre-signed. **Q: which is canonical?** Should both reconcile to the same "net to owner"? (The manual one's net was money-verified via read-only replay earlier, but the two coexisting is a latent inconsistency.)
2. **Manual generator never sets `net_to_owner_usd_minor`.** Populating it needs an FX call (the other generator snapshots IDR↔USD). **Q: which FX source/rate for the USD column?** (period_month is now stamped, so statements reach the owner portal; only the USD figure is missing.)
3. **Payout line currency can differ from its batch.** `createPayoutLineAction` doesn't validate a line's currency against the batch; `listPayoutBatches` sums mixed-currency `amountMinor` into one bigint shown under the batch currency (e.g. IDR minor + USD minor as one USD figure = wrong total). **Q: reject mismatched currency at line creation, or group/convert per currency?**
4. **Payout BATCH lifecycle is backend-only.** No `setPayoutBatchStatus` action — a batch can never leave `draft`; `approvedBy`/`approvedAt`/`paidAt` never written; the approved/paid badges are unreachable. The LINE lifecycle works. **Q: build the batch approve→pay flow, or is line-level enough?**

## Booking / guest
5. **Booking status has no server-side state-machine guard.** `setBookingStatusAction` accepts any enum value; visibility is only enforced client-side, so a direct call could move a booking to `checked_out` from `cancelled`/`no_show`/`inquiry`. **Q: add a server transition guard (which transitions are legal)?**
6. **Guest Services page skips the verification gate.** Every sibling token page runs `rateLimitStayTokenAccess` + `canAccessStayWithoutVerification`; the Services page does not, so an unverified token can browse the catalogue and reach the request form. **Q: should Services be gated like the rest?** (Changing it alters access behavior.)
7. **Tokens issued with no email AND no phone → dead-end.** In production the guest can never receive a code; the form shows a graceful "contact your host" but there's no verify path. **Q: block issuing such tokens, or add a concierge-issue flow?**
8. **"Reopen → pending" payout-line affordance is dead.** The client shows a Reopen button but `PAYOUT_LINE_TRANSITIONS` has no valid target to `pending`, so the server always rejects it. **Q: remove the button, or make reopen-to-pending a real transition?**

## Onboarding / infra
9. **Two provisioning paths differ.** `/api/onboarding/start` (route.ts) grants `super_admin` + `admin` cabinet via `provision_app_user` and writes trial dates to `org_subscriptions`; `signupAction` now also grants the cabinet role (#280) but sets `trialStatus='active'` on the org row instead. Structurally different tenants. **Q: unify on which canonical shape?**
10. **`requireOrgId()` unauth fallback to `ARCONIQUE_DEFAULT`.** When there's no session, it returns the seed org id (to keep unauth smoke/probe pages from 500-ing). Real logged-in tenants always have a NOT-NULL org so this never mis-scopes them, and middleware redirects unauth traffic to /login — but it's a documented hazard if any org-scoped query is ever reachable unauthenticated. **Q: keep (protects probes) or harden to throw + fix the probe paths?**
11. **`statement_timeout` still operator-pending** (per DB-STATEMENT-TIMEOUT-1). The empty-tenant first render runs all 12 cabinet rollups; they're org-scoped + `.catch`-guarded so they degrade to empty, but without a DB `statement_timeout` a pathological slow query could still stall toward the function timeout. **Action: set a `statement_timeout` on the app DB role** (durable fix for the "empty tenant hangs" class).

## Cosmetic (low, optional)
- Empty-but-live tenant shows a "mock" SourceBadge (villas/projects pages default `?? 'mock'` on empty arrays).
- `route.ts` builds `/login?onboarded=1&email=…` but the login form never prefills the email.
- `saveOnboardingProgressAction` fires inside `startTransition` without surfacing failures (progress may silently not save).
