# Staging Launch Checklist — Arconique Management OS

A pass/fail checklist an operator works through before declaring a
staging environment "promotable" to production.  Designed to surface
the most common foot-guns introduced between local development and a
real Supabase + Vercel deployment.

Run order matters.  Stop at the first failure, fix, and re-run.

## 0 · Prerequisites

- [ ] Repo is on the branch you intend to ship.
- [ ] Local working tree is clean (`git status` empty).
- [ ] You have credentials for the staging Supabase project and Vercel
      project.

## 1 · Static gate (no DB, no live services)

Run from the repo root:

```bash
npm run preflight:deploy
```

This runs every static check + the standard quality gate:

- [ ] `check:env` — every required env var is set or documented.
- [ ] `check:storage` — buckets in code match `STORAGE-BUCKETS-CHECKLIST.md`.
- [ ] `check:cron` — every `/api/cron/*` route maps to a known job key.
- [ ] `check:cron-auth` — every cron route is auth-gated via the
      shared handler, and the auth helper retains its production gate.
- [ ] `check:migrations` — no duplicate prefixes, no obvious secrets,
      every base table has `ENABLE` + `FORCE` RLS.
- [ ] `smoke:routes` — ≥ 80 routes inventoried, every audience class
      populated, cron routes expect 401 without a secret.
- [ ] `typecheck`, `lint`, `test`, `build` all pass.

If any step fails, stop and fix.  Do not continue.

## 2 · Staging environment validation

With staging env vars loaded (e.g. `vercel env pull` then
`source .env.staging`):

- [ ] `npm run check:env` reports `mode=staging`, fatal=0.
- [ ] `npm run staging:report` runs cleanly and writes
      `tmp/staging-readiness-report.md`.  Skim the report — every
      "fatal" must be empty before promotion.
- [ ] `/dashboard/system/deployment` loads (you may need to log in
      as an operator) and shows green for env + gates.
- [ ] `/dashboard/system/health` loads and shows every module group
      green or with an explicit "migration pending" badge.
- [ ] `/dashboard/system/storage` lists every bucket with
      privacy=private.

## 3 · Database, migrations, RLS

- [ ] `npm run db:migrate` runs cleanly against staging.
- [ ] In Supabase Studio, every base table (excluding the
      `pg_` / `auth.` schemas and the documented allowlist) has RLS
      `ENABLED` and `FORCED`.
- [ ] `auth.users` has at least one operator row, MFA-enabled.
- [ ] `roles` + `permissions` reference data is present (auto-seeded
      by migration 0000).

## 4 · Cron + jobs

- [ ] `vercel.json` has a cron entry for every job key documented in
      `VERCEL-CRON-CHECKLIST.md`.
- [ ] `CRON_SECRET` is set on Vercel for the staging deployment and
      matches the value Vercel uses for the cron Authorization header.
- [ ] Visit any `/api/cron/<job>` URL with no Authorization header —
      response is 401.
- [ ] Visit `/dashboard/jobs` — the catalog shows every job with a
      `last_run` row populated by recent activity (or "never run yet"
      on a brand-new staging).

## 5 · Storage

- [ ] In Supabase Studio → Storage, both buckets
      (`task-attachments`, `guest-request-attachments`) exist and are
      **private**.
- [ ] RLS policy on `storage.objects` allows only the service role to
      read/write.  Anon role cannot list, get, or upload.
- [ ] `/dashboard/guest-ai/storage` reports
      `bucketExists: ok`, `bucketPrivate: ok`, `signedUploadWorks: ok`,
      `signedDownloadWorks: ok`.

## 6 · Demo / mock leak hardening

- [ ] `ARCONIQUE_FORCE_MOCK` is **unset** (or `0`) on staging /
      production.
- [ ] `NEXT_PUBLIC_ENABLE_DEMO_MODE` is **unset** (or `0`) on staging /
      production.
- [ ] `ALLOW_DEV_CRON_WITHOUT_SECRET` is **unset** on staging /
      production (it never short-circuits in production anyway, but
      keep the env clean).
- [ ] `NOTIFICATIONS_DRY_RUN` is **explicit** (`0` or `1`).  Default
      production should be `0` once notification providers are wired.
- [ ] `AI_DRY_RUN` is **explicit**.  Set `1` until Anthropic billing /
      rate limits are configured.
- [ ] No demo owners / villas / bookings / guests exist in the
      staging DB.  The production-minimal seed strategy
      (`docs/PRODUCTION-SEED-STRATEGY.md`) applies to staging too.

## 7 · Smoke test (manual UI)

Walk these flows in the staging environment:

- [ ] **Login** as an operator (admin, internal-only).
- [ ] **Login** as an owner (token / supabase-auth) and verify the
      owner portal loads, statements + revenue render.
- [ ] **Open** a guest stay link and verify the stay landing page +
      WiFi card.
- [ ] **Submit** a guest service request and verify the operator
      sees it in `/dashboard/front-office/requests`.
- [ ] **Trigger** a manual cron run from `/dashboard/jobs` and verify
      the job-run row is created.
- [ ] **Visit** `/dashboard/finance/transparency` and verify a
      statement rebuild succeeds.

## 8 · Post-launch

- [ ] Vercel build logs are clean.
- [ ] Sentry / Logtail (if wired) shows no unexpected errors in the
      first hour after deploy.
- [ ] `/dashboard/system/health` continues to render green after
      30 minutes of idle traffic.

## When this checklist fails

Refer to the relevant doc:

- Env / secrets — `docs/ENVIRONMENT-VARIABLES.md`
- Storage — `docs/STORAGE-BUCKETS-CHECKLIST.md`
- Cron — `docs/VERCEL-CRON-CHECKLIST.md`
- Supabase project setup — `docs/SUPABASE-PROVISIONING-CHECKLIST.md`
- Seed strategy — `docs/PRODUCTION-SEED-STRATEGY.md`
- Deployment runbook — `docs/DEPLOYMENT-RUNBOOK.md`

For the route-level smoke matrix see
`docs/SMOKE-TEST-ROUTE-MATRIX.md`.
