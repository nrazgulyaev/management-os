# ADR-0013 — Owner Stays, Relocation Candidates & Basic Rate Quote (v9B)

Status: Accepted · 2026-04-27

## Context

V9A landed `villa_calendar_blocks` as the master availability primitive,
including the `owner_stay` block_type. V9B layers on:

- The owner-portal **request flow** (owner → admin approval → calendar block).
- A **per-policy** allowance / blackout / compensation model so the same
  product works for hybrid + pooled + individual ownership models.
- A **relocation engine** that finds safe swap targets when an owner stay
  overlaps an existing guest booking.
- A **basic rate-plan** (base + seasons + per-night overrides) so the
  owner-stay estimator can quantify revenue impact, and so v9C+ direct
  booking and dynamic pricing have a primitive to plug into.

Hard guardrails:

- Owners never see guest data, relocation candidates, or rate-plan internals.
- Owner stays do **not** count as rental revenue.
- No automatic relocation — admin approves every move.
- No bank reconciliation, no PriceLabs, no payment processing in v9B.
- No statement materialisation in v9B (estimator persists the snapshot;
  finance bridge lands in v9C).

## Decisions

### 1. `villa_calendar_blocks` stays the single source of truth

An approved owner stay is materialised as a calendar block:

```
block_type   = 'owner_stay'
source_type  = 'owner_stay_request'
source_id    = owner_stay_requests.id
owner_visible = true
guest_visible = false
status       = 'active'
```

The V9A conflict detector treats `owner_stay` as blocking by default.
Cancelling or rejecting an owner stay flips the associated block to
`status='cancelled'` so the partial unique index `(source_type, source_id) WHERE status='active'` lets a future request reuse the same `source_id`.

### 2. Request lifecycle

```
requested
  ├─ availability_check
  │    └─ requires_relocation   (overlapping guest booking found)
  ├─ pending_admin_approval     (any other conflict OR policy.requiresApproval)
  ├─ approved                   (owner_stay block created)
  ├─ rejected
  ├─ cancelled                  (owner-self-cancel allowed pre-approval)
  └─ completed                  (post-stay state — finance bridge in v9C)
```

The action layer routes status based on:
1. Conflict containing a `guest_booking` block → `requires_relocation`
   (when the policy permits) else `pending_admin_approval`.
2. Other conflict → `pending_admin_approval`.
3. Policy `requires_approval = true` → `pending_admin_approval`.
4. Else → `requested` (still needs admin approve in v9B; we don't
   auto-approve to keep the audit trail clean).

### 3. Owner-stay policy resolution

Cascade: **villa beats project beats global**. The active row with the
highest specificity wins. NULL columns mean "any". The matcher
(`pickApplicablePolicy`) is pure and tested.

Each policy carries:

- `free_nights_per_year` + `free_nights_apply_to_peak`
- `requires_approval`, `allow_displacing_guest_bookings`,
  `relocation_allowed`
- `operational_cost_model` ∈ none / actual_costs / fixed_per_stay /
  fixed_per_night
- `compensation_model` ∈ none / fixed_per_night /
  management_fee_on_expected_gross / percent_of_expected_gross
- `blackout_dates` — JSON array of dates or `{start,end}` ranges
- `peak_season_rules` — `{ ranges: [{start,end}] }`

### 4. Estimator: quote × policy × allowance

`estimateOwnerStay({ policy, quote, alreadyAppliedThisYear })` is a pure
function. It:

1. Counts blackout nights and peak nights from the policy.
2. Allocates the owner's free-night allowance against eligible nights
   (peak excluded by default).
3. Charges only the `billableNights` against the owner's compensation +
   operational cost.
4. Always emits warnings (e.g. "actual costs settle on the statement"
   when `operational_cost_model = 'actual_costs'`).

Output is persisted on `owner_stay_requests` so the snapshot at request
time is auditable. Owner UI renders only the headline numbers:
`allowance_nights_applied`, `billable_nights`, `estimated_total_owner_charge_minor`.

### 5. Rate-plan primitive

```
rate_plans
  └─ rate_plan_seasons   (date-range, multiplier OR fixed nightly, min/max LOS, stop_sell)
  └─ rate_plan_overrides (per-night, source ∈ manual|pricelabs|channel|import)
```

`quoteForRangePure` resolution per night:

1. **override** wins
2. else **earliest active season** containing that date wins
3. else **base nightly rate**

Rules:

- `checkOut` is exclusive — back-to-back is not a conflict.
- `stop_sell` on ANY night → quote returns `available=false, reason='stop_sell'`.
- `min_los` from any matching season/override is collected; if `nights < min_los`,
  the quote returns `available=false, reason='min_los_violation'`.
- Output is **deterministic** for identical inputs — no `Date.now`,
  no `Math.random`. Same inputs → same output (verified by test).

The DB-aware `quoteForRange(villaId, checkIn, checkOut)` looks up the
most-specific active plan (villa beats project beats global), pulls its
seasons + overrides, and feeds the pure helper.

### 6. Relocation candidate engine

Internal-only. Owners must never read this surface; RLS keeps
`booking_relocation_candidates` internal-only.

Pure rules in `relocation-rules.ts`:

A booking can be relocated only to a villa that:
1. Is in the **same equivalence group**.
2. Has **same or better quality_rank** (lower number = better).
3. Is `status='active'`.
4. Has **no overlapping active block** during the booking window.
5. Is not the source villa itself.

Score is bounded `[0, 1]`; equivalent rank = 0.8, upgrade gives a small
bonus. `guest_impact_level` is `'none'` for upgrades, `'low'` for
equivalents — downgrades are filtered out before being persisted.

Apply path (`applyRelocationCandidate`) re-validates against live state,
re-points the booking, re-syncs its calendar block via the V9A helper,
and expires sibling candidates for the same booking. Audit-logged.

### 7. RLS

- `owner_stay_requests` — owners can SELECT + INSERT their own rows
  (status = 'requested' on insert) + UPDATE only to set status =
  'cancelled' on still-pending rows. Internal users have full access.
- `owner_stay_policies`, `villa_equivalence_*`, `booking_relocation_candidates`,
  `rate_plans*` — internal-only.
- All eight tables have FORCE ROW LEVEL SECURITY.

### 8. Permissions

Eight new keys: `owner_stay.{read,write,approve,relocate}`,
`pricing.{read,write}`, `relocation.{read,manage}`. `investor_owner` and
`investor_viewer` get `owner_stay.read`; `investor_owner` additionally
gets `owner_stay.write`. Field-only roles (housekeeper / technician /
security) get **none** of the v9B admin keys.

## Trade-offs accepted

- **Allowance consumption is calendar-tail biased** — billable nights
  come from the END of the breakdown. A more user-friendly model lets
  the owner pick which nights consume the allowance. v9B keeps it
  simple; v9C can add the picker.
- **Estimator currency is rate-plan currency**, no FX. Multi-currency
  estimation lands with v9C-finance-bridge.
- **No auto-relocation**. Every move is admin-approved. Aligns with the
  product principle that owner stays don't surprise guests.
- **Discovery is on-demand, not scheduled**. Operators click "Discover
  relocations" on the request detail; we don't run a background job.
  Avoids rediscovering candidates after every booking change.
- **Statement materialisation deferred**. The estimate snapshot is on
  the request row, but `revenue_lines` / `expense_lines` are not yet
  written. v9C-finance-bridge will hook into the closed-period flow.

## Out of scope (deferred)

- PriceLabs / channel manager rate push — v9B has the override `source`
  enum ready, just no integration code.
- Payment processing for owner charges.
- Owner inbox notifications when admin decides — the notification queue
  exists but a v9B-specific template/trigger lands with v9C.
- A `/owner/calendar` route showing approved owner stays + a
  generic-availability projection. The data is ready
  (`listOwnerSafeCalendarBlocks` from V9A) — the route lands later.
- Bank reconciliation.

## Operational runbook

- **Apply migration**: `npm run db:migrate` (idempotent re-run safe).
- **Seed sample data**: `npm run db:seed` adds 2 policies, 2 rate plans
  with seasons + overrides, 1 equivalence group with 3 villas, 3 sample
  requests (available / requires-relocation / rejected) and 1 relocation
  candidate.
- **Quote a stay**: `quoteForRange({ villaId, checkIn, checkOut })`
  returns the deterministic breakdown + total. Try on
  `/dashboard/villas/[id]/availability` for the rate-card preview.
- **Owner request flow**: sign in as owner-grant'd app_user → `/owner/stays/new`.
  The form posts through `createOwnerStayRequestAction`, which estimates
  the stay and routes to the appropriate status.
- **Admin approve**: `/dashboard/owner-stays/requests/[id]` →
  Discover relocations → Approve candidate(s) → Apply → Approve owner
  stay. The approval materialises the calendar block.
- **Configure a policy**: `/dashboard/owner-stays/policies/new` (permission:
  `owner_stay.approve`). Villa beats project beats global.
- **Configure rate plans**: `/dashboard/bookings/rates/new` (permission:
  `pricing.write`). Add seasons under
  `/dashboard/bookings/rates/[id]/seasons` and overrides under
  `/dashboard/bookings/rates/[id]/overrides`.

## Audit & safety checklist

- ✅ Owners cannot SELECT relocation candidates (RLS internal-only).
- ✅ Owners cannot SELECT raw rate-plan rows (internal-only); they reach
  rates only via the safe `quoteForRange` service when they ever do.
- ✅ Owner UI never renders `bookingId` / `bookingCode` / guest names
  on conflicts or relocation status.
- ✅ Owner stay does NOT write to `revenue_lines`. Estimate persists
  on the request row only.
- ✅ Every admin mutation calls `recordAuditEvent`.
