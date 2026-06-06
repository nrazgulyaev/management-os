# Staging environment setup (STAGING-DB-1, Option A — dedicated Supabase project)

Goal: preview deploys hit a **staging** Supabase DB (synthetic data) instead of
production or nothing. This doc is the runbook. It changes **no** infrastructure
by itself — it's steps + the scripts already on this branch.

> ⚠️ **The one rule that matters:** staging credentials go in the Vercel
> **Preview** target **only**. **Never** put a staging `DATABASE_URL` (or any
> staging value) on the **Production** target, and never edit the existing
> Production `DATABASE_URL`. That is the only way this can hurt prod.

---

## What's on this branch (code, already done)

| Artifact | Purpose |
|---|---|
| `npm run db:migrate:staging` | Runs the **existing** migration runner against **`.env.staging.local` only** (never `.env.production.local`). Guarded by `scripts/assert-staging-env.ts`. |
| `npm run seed:staging` | Runs the **synthetic** demo seeds (`scripts/seed-staging.mjs`) against staging only. No prod data copied. |
| `scripts/assert-staging-env.ts` | Refuses to run unless `ARCONIQUE_DB_ENV=staging`; prints the target DB host so you can eyeball it. |
| `.env.staging.local.example` | Template for the 5 Supabase creds (+ the guard var). |

No app code changed — the app already reads `DATABASE_URL`/Supabase keys per
Vercel environment, so a Preview deploy with staging env vars "just works".

---

## Step 1 — Create the staging Supabase project  *(you, Supabase dashboard)*

1. Supabase → **New project** (same org). Name e.g. `arconique-staging`.
   - Free tier is fine for trials, but note: **Free projects auto-pause after
     ~7 days idle** → previews would fail until resumed. A small paid project
     avoids that.
2. Once provisioned, open **Connect** and copy:
   - **Transaction pooler** string (`:6543`) → `DATABASE_URL`
   - **Session pooler** (`:5432`) or **Direct connection** → `DIRECT_URL`
   - Project URL `https://<ref>.supabase.co` → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

## Step 2 — Local staging env file  *(you)*

```bash
cp .env.staging.local.example .env.staging.local
# fill in the 5 values from Step 1. Keep ARCONIQUE_DB_ENV=staging.
```
`.env.staging.local` is gitignored — it will not be committed.

## Step 3 — Apply migrations to staging  *(command from this branch)*

```bash
npm run db:migrate:staging
```
- Loads **only** `.env.staging.local`. The guard prints the target host —
  **confirm it's the staging host** before letting it finish.
- Same idempotent runner as prod (`scripts/migrate.ts`, tracked in
  `_arconique_migrations`). Re-runnable.

## Step 4 — Seed synthetic data  *(command from this branch)*

```bash
npm run seed:staging
```
Runs the demo seeds (arconique-demo, demo-2/3, statements, test-team-accounts,
owner-portal-demo once PR #28 lands). Synthetic only — no prod data.

## Step 5 — Point Vercel **Preview** at staging  *(you, Vercel)*

Add these **5 variables to the `Preview` target only** (see exact CLI commands
below, or use the Vercel dashboard → Settings → Environment Variables → scope
"Preview"):

`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

> Other vars are currently Production-only (e.g. `NEXT_PUBLIC_APP_ENV`,
> `APP_BASE_URL`, `CRON_SECRET`, security secrets). Previews may need some of
> them too for full functionality — add to Preview as needed, but that's beyond
> the DB wiring and out of scope here.

### Prepared `vercel env add` commands — Preview target (run after Step 1)

```bash
# Each prompts for the value — paste the STAGING value from Step 1.
# (Interactive, so the secret never lands in shell history.)
vercel env add DATABASE_URL preview
vercel env add DIRECT_URL preview
vercel env add NEXT_PUBLIC_SUPABASE_URL preview
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
vercel env add SUPABASE_SERVICE_ROLE_KEY preview
```

Verify they landed on the right target (and that Production is untouched):

```bash
vercel env ls | grep -E 'DATABASE_URL|DIRECT_URL|SUPABASE'
# DATABASE_URL etc. should now show BOTH "Production" and "Preview".
# The Production entry's value must remain your prod DB — do not edit it.
```

## Step 6 — Verify

Open a Preview deployment (any PR) and confirm the app connects (login works,
data loads from staging). If it's DB-less, the Preview env vars aren't set.

---

## Risks / guardrails recap
- **Env-target mix-up** is the only real prod risk → staging creds in **Preview**
  only; never touch Production `DATABASE_URL`.
- **Migrate/seed hitting prod** is prevented two ways: the staging scripts load
  only `.env.staging.local`, and the `ARCONIQUE_DB_ENV=staging` guard refuses to
  run otherwise.
- **Isolation:** a separate Supabase project = separate DB/auth/keys. The
  cross-subdomain SSO cookie is prod-only (`VERCEL_ENV==="production"`), so
  preview/staging sessions stay host-scoped and can't bleed into prod.
- **Free-tier auto-pause** → consider a paid staging project if previews must be
  always-on.
