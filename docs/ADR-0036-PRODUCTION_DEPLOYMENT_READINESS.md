# ADR-0036 — Production Deployment Readiness & Environment Setup (Prompt 113)

## Status
Accepted.  Implemented across:

- `src/lib/env/{registry,validation,report}.ts`
- `src/lib/deployment/production-gates.ts`
- `src/lib/observability/{logger,request-id}.ts`
- `scripts/{check-env,check-storage-config,check-cron-config,check-migrations,preflight-deploy,seed-production-minimal}.ts`
- `/dashboard/system/deployment` route
- Six new docs (`DEPLOYMENT-RUNBOOK`, `ENVIRONMENT-VARIABLES`,
  `SUPABASE-PROVISIONING-CHECKLIST`, `STORAGE-BUCKETS-CHECKLIST`,
  `VERCEL-CRON-CHECKLIST`, `PRODUCTION-SEED-STRATEGY`).

## Context

After Prompt 112 the platform was demo-ready.  Two structural gaps
remained before a real staging or production deploy:

1. **Env validation was ad-hoc.**  Each module imported
   `src/lib/env.ts` and checked individual values; there was no
   single source of truth for "every env var the app reads" and no
   strict mode that fails fatal in production for missing
   secrets.
2. **No preflight.**  Operators could `git push main` and ship a
   build that crashed on missing `CRON_SECRET` or shipped to
   production with `ARCONIQUE_FORCE_MOCK=1` still set.  The cron
   routes had no static check that every `app/api/cron/*` directory
   matched a job key and a checklist row.
3. **No deployment dashboard.**  Operators had to read the codebase
   to know which env vars to set.

Prompt 113 closes all three without changing business logic.

## Decision

### 1. Typed env registry + strict validator

`src/lib/env/registry.ts` is the canonical inventory.  Every env var
the codebase reads has an entry with:

- `key`, `category` (`core` / `supabase` / `security` /
  `notifications` / `ai` / `payments` / `demo`),
- `public` flag (`true` only for `NEXT_PUBLIC_*`),
- `requirement` (`always` / `production` / `optional` /
  `conditional`),
- optional `conditionalOn` gate (e.g. `NOTIFICATIONS_DRY_RUN=0`),
- optional `mustBeStrong` flag — placeholder-shaped values fail
  fatal in production.

`src/lib/env/validation.ts` produces an
`EnvReadinessReport` with per-key status (`ok` /
`missing` / `warning` / `fatal` / `not_required`), a redacted value,
and a per-key message.  `validateEnv("production")` is the strict
mode.

Cross-cutting checks:

- Service-role-style names in `NEXT_PUBLIC_*` always fail fatal.
- `NOTIFICATIONS_DRY_RUN` must be explicit (`0` or `1`) in
  production.
- `ARCONIQUE_FORCE_MOCK=1` in production is fatal.
- Weak `mustBeStrong` values (placeholder words, < 16 chars) are
  fatal in production, warning in dev.

### 2. Production gates

`src/lib/deployment/production-gates.ts` complements the env
validator with cross-cutting checks that aren't tied to a single
env key:

- `assertNoDemoModeInProduction()`
- `assertNoDevCronBypassInProduction()`
- `assertSecuritySecretsPresentInProduction()`
- `assertNotificationModeExplicit()`
- `assertBootstrapSecretStrong()`

Each returns a structured `GateResult` (info / warning / critical).
`getProductionGateReport()` runs all of them.  In `development` /
`test` modes the gates short-circuit to `ok` — dev stays painless.

### 3. Observability baseline

`src/lib/observability/logger.ts` emits one JSON line per event with
a known list of redacted field names (`password`, `secret`,
`tokenHash`, `providerSessionId`, `webhookPayload`,
`Authorization`, etc.).  `src/lib/observability/request-id.ts`
resolves a request id from `x-request-id` / `x-vercel-id` headers
and falls back to `randomUUID()`.

The logger is intentionally provider-agnostic — Sentry / Logtail can
plug in later without rewriting the call sites.

### 4. Preflight scripts

Five new scripts under `scripts/`, all wired in `package.json`:

| Script | Command | Purpose |
|---|---|---|
| `check-env.ts` | `npm run check:env` | Run the env validator.  Exit 1 on fatal. |
| `check-storage-config.ts` | `npm run check:storage` | Source-grep every bucket constant in `src/` and verify it's documented in the storage checklist. |
| `check-cron-config.ts` | `npm run check:cron` | Walk `src/app/api/cron/*`; verify each route uses `handleCronJobRequest`, the job key is in `KNOWN_JOBS`, and the route + key appear in the cron checklist. |
| `check-migrations.ts` | `npm run check:migrations` | Walk `drizzle/*.sql`; verify no duplicate migration prefixes, no obvious secrets, and every base table has `ENABLE` + `FORCE` RLS (modulo the same allowlist as the P111 RLS coverage test). |
| `preflight-deploy.ts` | `npm run preflight:deploy` | Run all four checks above + `typecheck` / `lint` / `test` / `build`.  No DB required. |

A separate `npm run seed:production:minimal` is a documented stub
today — it prints what production should contain and exits 0.  When
we automate the production-only inserts, we'll replace the body.

### 5. Deployment dashboard

`/dashboard/system/deployment` is the operator-facing readiness
view.  It surfaces:

- env mode + counts (fatal / warning / ok),
- the env readiness table (redacted values only),
- production gate results,
- migration count + last filename,
- bucket privacy summary,
- cron route count + `CRON_SECRET` status,
- demo-flag visibility (`ARCONIQUE_FORCE_MOCK`,
  `NEXT_PUBLIC_ENABLE_DEMO_MODE`),
- a fixed footer pointing operators to `npm run preflight:deploy`.

Permission gate: the dashboard layout already enforces internal-only
access.  Investor / owner / field / vendor / agent cannot reach it.

### 6. Six new docs

| Doc | Purpose |
|---|---|
| `ENVIRONMENT-VARIABLES.md` | Canonical list of every env var, organised by category, kept in sync with the registry. |
| `DEPLOYMENT-RUNBOOK.md` | End-to-end runbook (domains, route groups, pre-deploy checklist, Vercel deploy steps, post-deploy smoke test, rollback). |
| `SUPABASE-PROVISIONING-CHECKLIST.md` | First-time provisioning: project create, connection strings, auth config, migrations, seed strategy, RLS verification, storage buckets, secret lockdown, backups, smoke tests. |
| `STORAGE-BUCKETS-CHECKLIST.md` | Bucket table (privacy, allowed MIME, max size, signed-URL policy, cleanup job, access model).  Ships with `task-attachments` + `guest-request-attachments`. |
| `VERCEL-CRON-CHECKLIST.md` | Every cron route + job key + suggested schedule + required env + idempotency notes + `vercel.json` example. |
| `PRODUCTION-SEED-STRATEGY.md` | Three seed modes (demo / staging / production minimal); MUST / MUST NOT lists; rebuild guidance. |

Plus this ADR (`ADR-0036`).

## Consequences

### Positive

- A single command (`npm run preflight:deploy`) gives operators a
  pass/fail signal before promoting a build.
- Production gates catch the most common foot-guns
  (`ARCONIQUE_FORCE_MOCK=1`, missing `CRON_SECRET`, weak
  `ADMIN_BOOTSTRAP_SECRET`, `NOTIFICATIONS_DRY_RUN` left implicit).
- Operators have a single view of readiness at
  `/dashboard/system/deployment`.
- Every env var is documented in one place; the registry test
  enforces that every key is documented.
- Local dev stays painless — the strict validator only fires fatal
  in `staging` / `production`.
- Static checks fail fast in CI without needing a live DB.

### Negative / risks

- The validator is a static check — it cannot verify that a key
  actually grants access to its target service.  A wrong-but-
  formatted `SUPABASE_SERVICE_ROLE_KEY` will pass `npm run
  check:env` but fail at runtime.
- The `seed:production:minimal` stub prints what it would do but
  doesn't actually insert anything.  Operators must trust that
  migrations + admin bootstrap cover production reference data
  (which is true today).
- The deployment dashboard reads `process.env` server-side; values
  reflect the build-time env when rendered statically.  We force
  `dynamic = "force-dynamic"` so the page reflects the running
  environment.
- The logger writes JSON lines to stdout; Vercel ingests them but
  has no native structured-search UI today.  Hook up Sentry or
  Logtail later for query / alerting.
- Production gates only run on `staging` / `production` modes — a
  developer can still run with `ARCONIQUE_FORCE_MOCK=1` locally,
  which is the intended behaviour.

### Out of scope (deferred)

- Sentry / Logtail integration.
- An automated production minimal seed applier (the stub remains).
- A live env-validation step inside the Vercel build pipeline (we
  document `npm run preflight:deploy` as the gate, but don't wire
  it into the build itself yet).
- Per-env feature flags (would require a new table + admin route).

## Recommended next prompt

**Prompt 114 — Staging Smoke Test & Production Hardening Fix Pass**:
run the new deployment readiness tools against the local / staging
environment, fix every warning that blocks staging, finish
`safeCount` / `safeList` adoption on the remaining dashboards,
verify all cron routes deny unauthorised requests, verify storage
bucket health pages, and produce a staging launch checklist.  No new
business features.
