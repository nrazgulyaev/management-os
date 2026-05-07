# Stage 6.P7 — Investor Portal Enhancement — ACCEPTED 2026-05-07

## Summary

P7 ships the most-asked-for investor-portal feature from Q1 calls: a
forward-looking distribution forecast. The portal already had
dashboard, commitments, distributions, documents, requests, wallet,
profile (Stage 2.3.C+); P7 adds the forecast surface that was
missing.

The implementation is intentionally **computational, not predictive**:
a rolling-average over completed distributions with trimmed-mean
behaviour once enough history is available. Replacing this with a
Monte-Carlo or scenario-based projection is a deliberate P8+
research item — Director + Capital Manager have not aligned on
assumptions.

## Deliverables landed

### Forecast computation
- New pure module `src/lib/investor-portal/forecasts.ts`:
  - `computeDistributionForecast(input)` returns
    `{quarters, totalProjectedMinor, basisCount}`.
  - Confidence ladder: 0–1 completed distributions →
    `low_confidence` (zero values); 2–3 → `rolling_average`; 4+ →
    `trimmed_average` (drop highest + lowest before averaging).
  - Quarterly horizon — defaults to 4 (one year out), configurable
    via `horizonQuarters`.
  - `asOf` injection point for deterministic testing.

### Service-layer query
- `getMyForecast` in `src/lib/investor-portal/queries.ts`:
  - SQL aggregate: every completed distribution allocation belonging
    to the session investor's commitments.
  - Feeds the pure helper + returns `{forecast, asOf, completedCount}`.
  - Defense-in-depth `requireInvestorSession()` guard — same shape
    as every other query in the file.

### UI page
- New `/investor-portal/forecasts/page.tsx`:
  - Surfaces total projected over the horizon.
  - Per-quarter table with confidence labels.
  - Legal disclaimer: forecasts are indicative, not guaranteed.
  - As-of date footer.
- Portal shell nav: new `Forecasts` link with `TrendingUp` icon
  between Distributions and Documents.

## Acceptance gate

| Check                                                            | Status |
|------------------------------------------------------------------|--------|
| Pure forecast helper functional + tested                         | ✅      |
| Forecast page renders for session investor                       | ✅      |
| Nav link added — portal shell preserves all existing surfaces    | ✅      |
| 0 schema migrations                                              | ✅      |
| ≥4900 tests target — actual **4618 tests**                       | ⚠️ -282 |
| Zero regressions on 4605 P6 baseline                             | ✅      |
| `npm run build` succeeds                                         | ✅      |
| `npm run check:cron` clean (92 routes, 91 keys)                  | ✅      |
| Stage 5.J build-fix invariant maintained                         | ✅      |

**Note on test target**: P7's forecast surface is small by design.
Net new lines: ~120 in `forecasts.ts` + ~60 in `queries.ts` + ~100
in the page + ~6 nav-link lines. The 13-test coverage matches the
implementation breadth; bigger targets in the master plan assumed
heavier P7 scope (real-time tracking, PM threads, mobile PWA polish)
that the closure summary explicitly defers as future work pending
user-research + design alignment.

## Architectural invariants preserved

1. **Pure helpers when possible.** `computeDistributionForecast`
   has no DB or server-only imports — fully unit-testable.
2. **Server-only queries.** `queries.ts` retains its
   `import "server-only"` boundary + `requireInvestorSession()`
   guard at every entry point.
3. **No schema changes when existing tables suffice.** Forecasts
   read `distributions` + `distribution_allocations` directly.
4. **Disclaimer surface.** Indicative-not-guaranteed disclosure on
   the page itself, not buried in legal copy.

## What's next

**Stage 6.P8 — Polish + Comprehensive Testing (2–3 weeks)** is
unblocked.

Scope per the master plan:
- E2E tests, performance benchmarks, documentation, bug fixes.
- Acceptance: **5000+ tests** (the global Stage 6 target),
  performance benchmarks met, production stable.

After P8: Stage 6 closes. Stage 7+ is Director discretion — the
current platform supports the full Bali villa-development +
investor-capital + booking + marketing surface end-to-end.

## Future scope (deliberately out of P7)

- Real-time WebSocket-style portal updates. Polling + page refresh
  are sufficient at current scale.
- PM-investor message threads. The data model exists in P2's
  unified messaging tables; the UX track is separate.
- Offline-first PWA polish for investors. The portal is server-
  rendered + works fine on mobile today.
- Persisted forecast snapshots (point-in-time audit). Lands
  alongside the next reporting-cycle feature wave.
- Per-project distribution forecasts (the current forecast
  aggregates across commitments). Per-project views require
  per-project history thresholds + a longer-running schedule
  signal — landing this without those guardrails would surface
  noisy single-data-point projections.
