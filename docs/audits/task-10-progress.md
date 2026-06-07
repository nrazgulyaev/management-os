# TASK-10 — smoke test + Storybook + visual regression (progress)

Per `_handoff/CLAUDE-CODE-TASKS.md` → Task 10. Run after the management-cabinet
redesign sweep (PRs #82–#97) to confirm routing is intact and to scaffold
visual regression.

## Status

| Step | Spec item | Status |
|---|---|---|
| Route map regenerated | (1) `npm run docs:route-map` | ✅ `docs/MANAGEMENT_OS_ROUTE_MAP.md` — 832 routes |
| Route inventory smoke | (2) `npm run smoke:routes` (≥80) | ✅ **832 discovered, 785 fetchable, 0 fatal** |
| Typecheck | part of preflight | ✅ `tsc --noEmit` clean |
| Lint | part of preflight | ⚠️ only the 2 known pre-existing `.rows` errors in `(development-app)`/`(platform-app)` pages (SHAPE-BUG-SWEEP-1 baseline) — none new |
| Full preflight | (3) `npm run preflight:deploy` | ⏸ env-blocked in sandbox — `check:env` / `check:migrations` need `DATABASE_URL`; `build` needs network for `next/font`. Code-quality steps above all pass; run the full gate in CI. |
| Storybook | (4) optional | ⏸ not installed; deferred (heavy dep). Components (`Kpi`, `Card`, `Badge`, `Sidebar`, `Topbar`) are exercised by the live cabinets + the visual suite below. |
| Visual regression | (5) Playwright public-landing screenshots @ 1280/768/390 | ✅ spec + config added (baselines generated on a reference machine — see below) |

## Visual regression

- Config: `playwright.visual.config.ts` (testDir `tests/visual`, 3 viewport
  projects: desktop 1280 / tablet 768 / mobile 390).
- Spec: `tests/visual/public-landings.spec.ts` — 12 public landings × 3
  viewports = **36 screenshots** (`--list` verified).
- Scripts: `npm run test:visual` (compare), `npm run test:visual:update`
  (generate/refresh baselines).
- Baselines (`tests/visual/public-landings.spec.ts-snapshots/`) are **not**
  committed from the sandbox — they're rendering-environment specific and the
  prod build needs network for fonts. Generate on the reference machine / CI;
  see `tests/visual/README.md`.

## Task 8 note (stub cabinets)

The **management** side of Task 8 is complete — every Mgmt OS cabinet the
2026-05-17 audit listed as "already built" has since been redesigned onto the
shared design system (`.page-header` + `.kpi` + `card`/`table.data`, real
queries) in PRs #84–#97. The genuine remainder is **development-os** product
surface (`/development-os/{communications,knowledge,platform,schedule,settings,
strategic}` not yet created; `cfo`/`warehouse`/`marketing` shipped with partial
mock wiring) — tracked in `docs/audits/task-8-progress.md`, separate product
scope.
