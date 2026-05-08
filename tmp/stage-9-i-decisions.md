# Stage 9 / Phase 9.I — Slow-query optimization — Decisions

**Date**: 2026-05-08
**Hours target**: 1 day | Tests target: ~5 | Migrations: 0
**Tests delivered**: 7 static
**Test count**: 4980 → 4987 passing (+7)

---

## Targets (from Stage 8.C audit)

| Page | Symptom | Slow function |
|---|---|---|
| `/dashboard/direct-bookings` | hangs >60s | `getDirectBookingMetrics` + `getDepositMetrics` + `getReconciliationMetrics` (3 metrics in parallel) |
| `/dashboard/pricing` | hangs >60s | `getPricingHubMetrics` |

8.C surfaced these via curl-timing + Playwright. 8.E's `trace()` helper instruments them at runtime so future hangs identify the offender via `[perf] page=… q=… ms=…` logs.

---

## Patterns fixed

### Pattern 1: Multi-aggregate via `FILTER` (collapse status group-bys + boolean counts)

`getDirectBookingMetrics` was 7 parallel queries, all hitting the same two tables (`direct_booking_holds`, `direct_booking_requests`) with different status filters. Even parallelized, on Vercel cold-start with a tight pg connection pool, 7 simultaneous queries can saturate it.

**Before**: 7 round-trips.
**After**: 2 round-trips. Each table is read once with a single aggregate row carrying every needed COUNT via `COUNT(*) FILTER (WHERE …)`.

### Pattern 2: Push reduce-to-scalar into SQL (`SUM` instead of fetch + JS sum)

`getDepositMetrics` and `getReconciliationMetrics` both had the same pattern:
1. A status group-by COUNT query.
2. A SECOND query that fetched **every paid / posted row** (just `amount_minor` + `currency`) and summed them in JS.

The second query is the smoking gun — every paid row crosses the wire so JS can sum them. The aggregate belongs in the storage engine.

**Before** (`getDepositMetrics`): 2 round-trips + JS reduce loop.
**After**: 1 round-trip with `SUM(amount_minor) FILTER (WHERE status IN ('paid','manually_marked_paid'))::text`. No rows, no JS reduce.

**Before** (`getReconciliationMetrics`): 3 round-trips + JS reduce loop.
**After**: 2 round-trips. The status counts + balance sum collapse into one aggregate; the JOIN-NOT-EXISTS unposted query stays separate (it's a different table shape).

### Pattern 3: Push set operations into SQL (`NOT EXISTS` instead of `Array.filter`)

`getPricingHubMetrics` had three reductions all running in JS:
- `villasMissingRuleSet`: fetch ALL villas + ALL active rule-sets, then `Array.filter(v => !ruleSetVillas.some(rs => rs.scopeType === 'global' || rs.villaId === v.id))`.
- `stopSellNights`: fetch every active stop-sell rule, then `reduce` summing `(endsOn - startsOn + 1)` days.
- Status counts were group-by, OK.

**Before**: 6 round-trips + 3 JS reductions, two of which fetched full row sets.
**After**: 3 round-trips, all reductions in SQL:
- `pricingRuleSets` aggregate (active / paused via FILTER).
- A composite query with three subselects: `pricing_quote_logs` count, `channel_push_events` count, `pricing_stop_sell_rules` SUM-of-days. Single round-trip.
- A `villas` count with `NOT EXISTS` subquery checking for an active rule-set covering each villa.

`pricingRuleSets` is read twice (once for the status aggregate, once inside the NOT EXISTS subquery), but as separate parallel queries — the first scans the table once, the second uses the table again with a different access path. Postgres treats them as independent reads; no contention.

---

## Local dryrun verification

All 5 new aggregate queries executed cleanly against the local PG18 dryrun DB (with the seed data):

```
 missing                                                  -> 0
 active | expiring_soon                                   -> 2 | 2
 submitted | approved_today | rejected_today | total | converted -> 1 | 0 | 0 | 3 | 0
 pending | paid | total_minor                             -> 1 | 0 | 86400
 pending | posted | total_balance                         -> 1 | 1 | 201600
```

No SQL errors. The `pricing_quote_logs` + `channel_push_events` + `pricing_stop_sell_rules` composite query works (the dryrun DB has zero rows so all three branches return 0/0/0, but the query itself parses and runs).

---

## What this does NOT do

**1. No new indexes.** I considered but did not add a migration for:
- `pricing_quote_logs (public_quote, created_at desc)` — would speed the 24h public-quotes count.
- `channel_push_events (status)` — would speed the simulated-pushes count.
- `direct_booking_requests (status, reviewed_at desc)` — would speed the today-aggregates.
- `direct_booking_finance_links (status, balance_due_minor)` — would speed the SUM aggregate.

These are real wins on a production DB with millions of rows. Pre-customer they're empty/small so the gains are minimal, and adding indexes is cheap-ish but not free (write amplification + index-page cache pressure). **Decision: defer to a Stage 10 indexing sprint informed by real production query plans (`EXPLAIN ANALYZE`) once the tables grow.** The optimizations shipped here are query-shape changes that are net wins regardless of table size.

**2. No materialized views.** The hub metrics are real-time; staleness would surprise operators. The query-shape changes alone bring the worst paths from "fetch every row" to "aggregate in storage", which is the main lever.

**3. No caching layer.** Same reason — real-time. A 30-second TTL on `getPricingHubMetrics` would be safe but adds infrastructure for a small win post-optimization.

**4. No live production verification.** Static + dryrun green. Real verification: after deploy, watch the 8.E `[perf]` logs in Vercel runtime — `page=/dashboard/pricing q=getPricingHubMetrics ms=…` should drop dramatically. If it doesn't, the next layer of optimization is the indexes above.

---

## Phase 9.I acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| `getDirectBookingMetrics` round-trips | ≤2 | ✅ 2 |
| `getDepositMetrics` round-trips | 1 | ✅ 1 |
| `getReconciliationMetrics` round-trips | ≤2 | ✅ 2 |
| `getPricingHubMetrics` round-trips | ≤3 | ✅ 3 |
| All 5 new aggregates execute cleanly against local PG | yes | ✅ |
| Tests guarding the new shapes | ~5 | 7 |
| Test count | 4980 → ~4985 | 4987 (+7) |
| Build clean + cron 102/101 | yes | ✅ |
| New migrations | 0 | ✅ |

**STAGE 9 / PHASE 9.I ACCEPTED.**

Live verification: after the deploy lands, observe the 8.E perf logs:

```
# Sample log lines that should appear in Vercel runtime logs after a real hit:
[perf] page=/dashboard/direct-bookings q=getDirectBookingMetrics ms=180 ok
[perf] page=/dashboard/direct-bookings q=getDepositMetrics ms=85 ok
[perf] page=/dashboard/direct-bookings q=getReconciliationMetrics ms=140 ok
[perf] page=/dashboard/pricing q=getPricingHubMetrics ms=210 ok
```

Compare to pre-optimization baseline (>30000ms / hang). A 100x improvement on the slowest queries is the expected outcome; if any individual query is still >3s after deploy, that's the signal to add the deferred indexes.
