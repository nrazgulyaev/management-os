# Env files for CLI scripts

How the seed / migration / preflight scripts find their secrets.

## The convention

We use **two** env files, layered:

| File | Purpose | Committed? |
|---|---|---|
| `.env.production.local` | Production secrets (real prod `DATABASE_URL`, real Stripe keys, etc.) | No |
| `.env.local` | Local-dev secrets — usually a local Postgres `DATABASE_URL` and dry-run flags | No |

Both files are gitignored. Both are optional. Scripts **load both, in
this order**, and `.env.local` wins when a variable is defined in
both. Practical effect:

- If you only have `.env.local`, scripts use it (typical local dev).
- If you only have `.env.production.local`, scripts use it (typical
  production maintenance task).
- If you have both, `.env.local` overrides `.env.production.local`
  (use this when you want to point a script at a local DB even
  though the prod creds are nearby).

## How it works

Every script in `package.json` that needs env vars now uses:

```
node --env-file-if-exists=.env.production.local --env-file-if-exists=.env.local --import tsx scripts/...
```

The `--env-file-if-exists` flag (Node.js 20.12+) silently skips a
file that doesn't exist instead of erroring. So you don't need to
create the other file just to run a script — only the one that has
the values you need.

## When you'd want each file

### `.env.local` — local dev
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/arconique
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
AI_DRY_RUN=1
NOTIFICATIONS_DRY_RUN=1
```

Use this for everyday work. AI calls + emails are no-ops, the DB is
your laptop, nothing touches production.

### `.env.production.local` — production-only tasks
```
DATABASE_URL=postgres://...prod-host.../arconique
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
STRIPE_SECRET_KEY=sk_live_...
```

Use this when you need to run a script against the deployed DB —
e.g. `npm run seed:arconique-demo` against the operator's tenant on
production. Keep this file off your laptop unless you actively
need it.

### Both at once (rare)

If both exist, `.env.local` wins for any duplicated keys. The
intended pattern: `.env.production.local` has the "real" values,
and `.env.local` selectively overrides specific keys (most often
`DATABASE_URL` and the AI/notification dry-run flags) so you can
run a "production-secrets-with-local-DB" hybrid for testing.

## Scripts affected

All scripts that need env vars use the same `--env-file-if-exists`
pair. As of HF-10:

```
db:migrate
db:seed
db:seed:dev-os
demo:rebuild
demo:validate
seed:production:minimal
seed:arconique-demo
stripe:provision
stripe:provision:apply
```

Audit-only scripts (`check:env`, `audit:rsc`, etc.) intentionally
don't load env files — they read whatever's already in the shell.

## Common errors

**`DATABASE_URL is not set`** — neither env file has the variable.
Add it to `.env.local` (local dev) or `.env.production.local`
(prod) and retry.

**Wrong DB hit by accident** — `.env.local` overrides
`.env.production.local`. If you intended a production run, make
sure `.env.local` doesn't define `DATABASE_URL`, OR comment it
out, OR run the script with the env vars inline:

```
DATABASE_URL=postgres://...prod... npx tsx scripts/seed-arconique-demo.ts
```
