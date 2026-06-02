# cleanup-A · PR 6 — Investors cabinet data wiring

**Goal.** Wire `getFund`, `getLpsWithPositions`, `getLastDistribution`,
`runWaterfall` in `src/features/investors/queries.ts`. Also add
`getCapitalCall(id)` and `getDistribution(id)` — they're referenced by the
investor detail routes but currently missing.

## Files

- Edit: `src/features/investors/queries.ts`
- Read for context: `src/features/investors/waterfall-calculator.ts` (pure),
  `src/features/investors/capital-call-issuer.ts`,
  `src/features/investors/irr-tracker.ts`,
  `src/lib/db/schema/dev-finance.ts`,
  `src/lib/db/schema/development.ts` (for fund + company structures),
  `src/components/investors/{lp-table,distribution-detail,capital-call-detail}.tsx`

## Reference migrations

- `0037_development_os_stage_2_3_investor_capital.sql` — `funds`, `lps`, `lp_positions`, `capital_calls`
- `0048_development_os_stage_4_b_1_companies_waterfall.sql` — `waterfall_runs`, `waterfall_params`
- `0049_development_os_stage_4_b_2_capital_residual.sql` — `distributions`, residual capital tracking
- `0098_md_5_investor_copilot.sql` — investor agent run rows (read-only here)
- `0106_auth_investor_1_grants.sql` — LP access grants

## Per-function contract

### `getFund(id)`

Single SELECT on `funds` for `id`, scoped to org. Map:

```ts
{ id, code, name, vintage, holdYears: holding_period_years }
```

Return `null` if not found.

### `getLpsWithPositions(fundId)`

JOIN `lps` ↔ `lp_positions` for `fund_id = fundId`, scoped to org. For each LP
return one `LpTableRow`:

- `lpId`, `lpName`, `lpType` (`'individual' | 'entity'`), `country`
- `committedIdr`, `calledIdr`, `distributedIdr` (sums from positions + distributions)
- `currentNavIdr` — pass through `irr-tracker.ts` `currentNav({ positions })`
- `moic`, `dpi`, `tvpi`, `irr` — same helper
- `lastCallAt` from `capital_calls`, `lastDistributionAt` from `distributions`

Order by `lp_name asc`. Cap 200 (funds rarely have more LPs).

### `getLastDistribution(fundId)`

Latest row from `distributions` for the fund, ordered by `period_end desc`.

```ts
{ id, totalProceedsIdr, period: `${period_start}..${period_end}` }
```

Return `null` if none yet.

### `runWaterfall(fundId, proceedsIdr)`

This is a thin loader that wraps the **pure** `runWaterfallPure` in
`waterfall-calculator.ts`. Today it returns the pure-calc result with empty LPs.
Wire it to:

1. Load `waterfall_params` row for the fund (mgmt fee, pref return, catch-up, carry split). If none, fall back to fund-level defaults from `funds`.
2. Load all `lp_positions` for the fund. Map each to the LP shape expected by `runWaterfallPure` (`committedIdr`, `calledIdr`, etc.).
3. Compute `holdYears = today.year - fund.vintage` (integer, min 1).
4. Call `runWaterfallPure({ params, proceedsIdr, holdYears, lps })`.
5. Return its output unchanged.

Do **not** persist the run here — that's a separate action that calls this and
inserts a `waterfall_runs` row.

### NEW: `getCapitalCall(id)`

Single SELECT on `capital_calls` joined with `funds` and the issuing user.
Include the per-LP allocation breakdown by JOINing `capital_call_allocations`.

Return shape (define the interface in the file):

```ts
interface CapitalCallDetail {
  id: string;
  fundId: string;
  fundCode: string;
  callNumber: number;
  totalIdr: number;
  issuedAt: string;
  dueAt: string;
  status: 'draft' | 'issued' | 'partially_received' | 'received' | 'cancelled';
  allocations: Array<{
    lpId: string;
    lpName: string;
    proRataPct: number;       // 0..100
    allocatedIdr: number;
    receivedIdr: number;
    receivedAt: string | null;
  }>;
}
```

### NEW: `getDistribution(id)`

Analogous shape, sourced from `distributions` + `distribution_allocations`.

## Acceptance

- LP table renders with MOIC/DPI/TVPI/IRR matching `irr-tracker.ts` outputs against the same data.
- `runWaterfall(fund, 1_000_000_000)` against a seeded fund returns the same numbers as running `runWaterfallPure` directly with the same params + LPs (regression-test by writing a unit test for this equivalence).
- Capital-call detail page renders with allocations.
- `pnpm typecheck && pnpm lint` clean.

## Commit message

```
feat(investors): wire fund, LP positions, waterfall loader, call/dist detail

Replaces Phase 2.4 dev-03 read stubs with real Drizzle queries against
funds, lps, lp_positions, capital_calls(+allocations), distributions(+allocations),
waterfall_params. runWaterfall now loads params + positions and delegates to
the pure canonical calculator. Adds getCapitalCall / getDistribution which
were missing.

Refs: cleanup-A
```
