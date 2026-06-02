# Phase 2.5 cleanup-A — Wire deferred query functions

This batch closes the data-wiring gap left across Phase 2.2-2.4. The cabinet
code (components, actions, services, state machines) is already merged to
`main` and uses **real Drizzle** for writes. What's still stubbed are the
**read paths** — the `queries.ts` modules in six cabinets return empty arrays
/ null / `{ ok: true, eventId: "stub" }`.

The Drizzle schema and SQL migrations are **already in main** (last migration
is `0111_daily_digest_subscriptions_and_notifications.sql`). No new tables are
required — every query below targets tables that already exist.

## Scope summary

| # | Cabinet | File | Functions to wire |
|---|---|---|---|
| 1 | Mgmt · Channels         | `src/features/channels/queries.ts`     | `getChannelGridData`, `pushRate` |
| 2 | Mgmt · Front office     | `src/features/front-office/queries.ts` | `getTodayBoard`, `getRegistry`, `getTurnovers` (keep `getCheckinFlowState` as-is — it's a bookmark loader, not stubbed) |
| 3 | Mgmt · Concierge        | `src/features/concierge/queries.ts`    | `getInbox`, `getThread`, `getJourney`, `getCompOffered`, `postStaffMessage` |
| 4 | Dev · Site reports      | `src/features/site-reports/queries.ts` | `getSiteDays`, `getIncident`, `getWeeklyReport`, `submitSiteFrame` |
| 5 | Dev · Sales             | `src/features/sales/queries.ts`        | `getPipelineLanes`, `getPipelineCards`, `transitionLead`, `getFunnelStages` |
| 6 | Dev · Investors         | `src/features/investors/queries.ts`    | `getFund`, `getLpsWithPositions`, `getLastDistribution`, `runWaterfall` (wrap pure calc), plus add `getCapitalCall` / `getDistribution` referenced by routes |

**Explicitly out of scope:**
- `src/features/dynamic-pricing/channel-push-stub.ts` — this stays a stub; it's
  the outbound channel-manager integration and will ship in a separate PR when
  Cloudbeds/Channex/etc. credentials are wired. Do **not** touch it.
- `src/features/dynamic-pricing/queries.ts` — does not exist; that cabinet's
  reads live in `services.ts` and are already Drizzle-backed.
- AI agent stubs in `src/features/ai-agents/{channels,concierge,front-office,investors,pricing}/*.ts` — those are deliberate placeholders for prompt execution and are not part of cleanup-A.

## Rules of work

1. **Don't change function signatures.** The cabinet routes already call these
   with specific arg shapes; we are only swapping the implementation body.
2. **`getDb()` returns `Database | null`.** Every query MUST handle the null
   case and return an empty-but-typed result (the same shape it already
   returns today). This keeps preview / no-Postgres envs from crashing.
3. **`requirePermission(…)` is `actions.ts`-only.** Pure queries don't gate on
   permission; the route's RSC boundary already does.
4. **Project scoping.** Every multi-tenant read MUST filter by `organizationId`
   (Mgmt) or `(organizationId, projectId)` (Dev). Use the helpers in
   `src/lib/db/scope.ts` — do **not** hand-roll the joins. If you find yourself
   writing `eq(table.organizationId, …)` by hand, you're skipping a helper.
5. **No `JSON.stringify` in SELECT mappings.** All JSON columns are already
   typed (`json('payload').$type<Foo>()`). Cast at the schema, not the query.
6. **One file at a time, one PR per cabinet.** No mega-PRs. Same cadence as
   Phase 2.4 — six small reviewable PRs.

## PR sequence

Run in this order (each PR's prompt is independent — they touch different
files — but reviewing them serially keeps regressions contained):

1. `01-channels.md`
2. `02-front-office.md`
3. `03-concierge.md`
4. `04-site-reports.md`
5. `05-sales.md`
6. `06-investors.md`

Per-PR validation (always):
- `pnpm typecheck` clean
- `pnpm lint` clean (no new ignores)
- `pnpm test -- features/<cabinet>` if a test file exists in that cabinet
- Manual smoke: open the cabinet's route locally, confirm it renders with
  real data and degrades gracefully when DB is empty (no fixtures yet)
