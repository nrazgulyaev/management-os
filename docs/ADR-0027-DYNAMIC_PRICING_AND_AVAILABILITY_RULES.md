# ADR-0027 — Dynamic Pricing & Availability Rules (Prompt 104)

## Status
Accepted. Implemented in migration `0026_dynamic_pricing_availability_rules.sql`,
the `src/features/dynamic-pricing/*` module, the `/dashboard/pricing/*`
admin surface, the upgraded public `/api/v1/quote`, and the villa
availability + bookings rate-plans pages.

## Context
The legacy `rate_plans / rate_plan_seasons / rate_plan_overrides`
trio worked for static catalog pricing — one nightly rate, an optional
season multiplier, and per-night overrides. It does not support:

- weekday patterns (Friday/Saturday premiums, Sunday discounts),
- demand-based modifiers (occupancy bands),
- last-minute / far-future windows,
- channel-specific markups (Airbnb / Booking.com),
- min-stay rules with weekday masks,
- stop-sell (manual or rule-based),
- a deterministic explainer for *why* a given night quoted what it
  did.

Rebuilding `rate_plans` would break the existing owner-stay estimator
and the v9C public quote contract. So we layer a parallel **dynamic
pricing rule engine** above it.

## Decision

### 1. New tables (nine), all internal-only RLS
- `pricing_rule_sets` — top of the engine; scope = global / project /
  villa, currency, base rate, optional min/max clamps, priority.
- Six rule-dimension tables: day-of-week, occupancy, close-out,
  channel, min-stay, stop-sell. Each is a child of
  `pricing_rule_sets` with a check-constraint on the modifier type
  (`percent | fixed`, plus `stop_sell` for close-out).
- `pricing_quote_logs` for observability — IP and user-agent are
  stored hashed only.
- `channel_push_events` for the outbound channel-manager STUB.

The existing `rate_plans` family is **not** touched. The public quote
API runs both engines and returns the dynamic answer when a rule set
applies, falling back to the legacy answer otherwise.

### 2. Precedence model
`getApplicablePricingRuleSet(villaId)` returns the first match in:

1. `scope_type = 'villa' AND villa_id = <id>` (lowest `priority` wins)
2. `scope_type = 'project' AND project_id = <villa.project_id>`
3. `scope_type = 'global'`

There is no implicit fallback to `rate_plans` inside the engine — the
public API does that explicitly so downstream callers see the legacy
shape unchanged.

### 3. Modifier order
Each `quoteNight` walks a fixed pipeline so the explainer is
deterministic:

1. **base** rate from the rule set
2. **manual override** (if set; short-circuits 2–6 below)
3. **day-of-week** modifier (`percent` or `fixed`)
4. **occupancy** band modifier
5. **close-out** modifier (or `stop_sell` short-circuit)
6. **channel** modifier
7. **min/max clamp**

Stop-sell rules and external availability blocks short-circuit
availability before any pricing math runs.

### 4. Public vs admin explanation
- Admin lines list every modifier step with `before / after / delta`
  in minor units.
- Public summary collapses internal reasons. Owner stays /
  maintenance / guest bookings / internal holds all surface as
  "Unavailable". `stop_sell` and `min_los` are the only specific
  reasons that ride to the public.
- The public response intentionally **does not** carry rule-set IDs,
  modifier IDs, or the per-modifier breakdown. Source-grep tests pin
  this contract.

### 5. Stop-sell behaviour
Two tiers:

- **External**: bookings, owner stays, calendar blocks → marked
  unavailable in `availability-pure`.
- **Engine**: `pricing_stop_sell_rules` (manual or rule-based) and
  `pricing_close_out_rules` rows of type `stop_sell` → short-circuit
  availability inside `quoteNight`.

A stop-sell rule can be channel-scoped (e.g., "no Airbnb between X
and Y") so we can implement channel strategy without freezing the
direct surface.

### 6. Channel push stub
`simulateChannelPushForRatePlan` records what we WOULD push to a
channel manager (rate / availability / stop-sell / min-stay update).
It does NOT call any real OTA API. Each event lives in
`channel_push_events` with `status='simulated'` and a JSONB payload
that includes the per-night cells from the dynamic calendar.

### 7. Permissions
Five new keys + a new role:

- `revenue_manager` (new role) holds `dynamic_pricing.{read,write,manage}`,
  `pricing_quote.read`, `pricing_channel_push.simulate`.
- `booking_manager`, `operations_manager`, `property_manager`,
  `finance_manager`, `accountant` get `read` + `pricing_quote.read`.
- `investor_owner` / `investor_viewer` and all field roles excluded.

### 8. Public /api/v1/quote
The legacy response shape is preserved field-for-field. We add new
keys (additive, not breaking):

- `pricingMode`: `"dynamic"` when a rule set drove the answer;
  `"rate_plan"` when we fell back.
- `available / reason / totalMinor / averageNightlyMinor / currency /
  nights / nightly[] / summary` — the dynamic snapshot.

Public callers reading the legacy `grossAmountMinor`,
`grossAmountFormatted`, `nightlyBreakdown` continue to work unchanged.

### 9. What is deferred
- Real channel-manager push to Airbnb / Booking.com (the stub records
  the would-be payload).
- PriceLabs integration.
- Direct-booking checkout (Prompt 105).
- Owner-portal nightly-rate preview behind a preference flag.
- Rate-set inheritance (project rules + villa override).
- Deeper analytics: revenue forecast, win/loss reasons, channel mix.

## Consequences
- The whole engine is testable as pure functions. The 21-test suite
  covers every modifier dimension, the public/admin label divergence,
  the rule-set precedence, and the source-level privacy contract.
- Admin operators who can't configure the new engine can keep using
  `rate_plans` as before. The hub at `/dashboard/pricing` calls out
  villas missing a dynamic rule set so the migration is intentional.
- The owner portal stays untouched — there is no owner-side surface
  for the engine, by design.

## Roll-out
- Migration `0026` is forward-only.
- Seed adds 2 rule sets (global Bali baseline + Enso S5 villa-specific),
  the documented modifier set across all six rule dimensions, 3 quote
  logs, and 2 simulated channel-push events.
- Permissions update is additive — existing roles unchanged.
