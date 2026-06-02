# Phase 2 data-wiring — Claude Code handoff (corrected)

**This REPLACES the earlier `cleanup-a-handoff` package.**

That batch was based on a wrong reading of the repo — most tables it referenced
don't exist in `main`. Claude Code wouldn't execute it. See
`docs/audits/2026-05-28-cleanup-a-handoff-scope-correction.md` in the repo for
the full breakdown.

## The real work

Per `docs/audits/2026-05-27-phase-2-data-wiring-scope.md` (the prior audit
that was the actual source of truth, which the cancelled batch didn't read):

- **20 net-new tables**
- **2 ALTERs** (statements, documents)
- **17 agent cron registrations** (agents exist as code stubs; no triggers)
- **Seed** at `db/seed/phase-2-data.ts`
- **~15.5 senior-eng days** of work, **3 PRs** in FK-dependency order

## What's inside

```
prompts/
  README.md         Read this first
  00-context.md     Conventions all 3 PRs assume
  01-mgmt.md        PR 1 — Mgmt slice (4 tables + statements ALTER + 4 agents)
  02-dev.md         PR 2 — Dev slice  (12 tables + cashflow view + 11 agents)
  03-owner.md       PR 3 — Owner slice (4 tables + documents ALTER + 6 wired fns + 1 agent + PDF bundle)
```

## How to ship

1. Drop `prompts/*.md` into the repo's `.claude/prompts/phase-2-data-wiring/`.
2. Read `00-context.md` to align on conventions.
3. Run `01-mgmt.md`, then `02-dev.md`, then `03-owner.md`. Sequential because of FK
   dependencies (PR 1's `statements.dispute_thread_id` references PR 3's
   `owner_threads`; the constraint is deferred and backfilled in PR 3).
4. Each PR validates with: `db:generate` → `db:migrate` (fresh DB) → `db:seed`
   → `typecheck` + `lint` → `smoke:routes`.

## What's NOT in here

- **Route refactor** (Packet B). The 6 dead `queries.ts` stubs from the
  cancelled batch stay untouched. After this batch lands, cabinet routes can
  be migrated from `services.ts` to those forward-looking `queries.ts`
  surfaces — but that's a separate batch.
- **Bookings / channels / pricing schema** — already exists.
- **Things that exist under a different name** — `projects`, `boq_items` (renamed
  from `boq_lines`), `cashflow_forecasts` (reuses `monthly_projections JSONB`),
  `audit_events` (reused as-is).
