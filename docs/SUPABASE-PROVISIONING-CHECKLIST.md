# Supabase Provisioning Checklist — Arconique Management OS

Step-by-step checklist for provisioning a fresh Supabase project for
staging or production.  Run through every section in order; do not
skip the smoke tests at the end.

## 1. Create the Supabase project

1. Sign in to [supabase.com](https://supabase.com).
2. Create a project in the region closest to your users (Singapore /
   Sydney for Bali tenants).
3. Choose a strong database password — store it in 1Password.
4. Wait for provisioning to finish before proceeding.

## 2. Copy connection strings

Go to `Project Settings → Database → Connection string`.

- **Pooled** (`pgbouncer`, port 6543) → `DATABASE_URL`.
- **Direct** (port 5432) → `DIRECT_URL`. Used by `scripts/migrate.ts`
  + `scripts/seed.ts`.

Set both in your deployment platform (Vercel) and in `.env.local` for
local development.

## 3. Configure Supabase Auth

`Project Settings → Auth → URL configuration`:

- **Site URL** = `https://management.arconique.com` (or your chosen
  app domain).
- **Redirect URLs** = same domain + `https://localhost:3000` for dev.
- **Allowed origins** = same list.

`Project Settings → Auth → Providers`:

- Enable **Email** provider.
- Decide on public sign-ups (default: **disabled** in production —
  internal users are minted via `/setup/admin-bootstrap`).
- Set the password policy to require ≥ 12 chars + 1 number + 1 letter.

`Project Settings → Auth → Email templates`:

- Update the magic-link / invite / recovery templates to match
  Arconique branding.  Keep a sender address you control.

## 4. Apply migrations

```bash
DATABASE_URL=...   # pooled
DIRECT_URL=...     # direct
npm run db:migrate
```

Migrations are sequentially numbered (`0000…0033`) and idempotent.
`scripts/migrate.ts` reads from the direct URL.

## 5. Seed strategy

| Environment | Command | What gets inserted |
|---|---|---|
| Local development | `npm run db:seed` | Full demo seed (`drizzle/seed.sql`) — owners, villas, bookings, etc. |
| Staging | `npm run db:seed` (optional) | Same demo seed; useful for screenshots. |
| **Production** | `npm run seed:production:minimal` (stub today) | **No demo data.**  Roles + permissions + notification templates + booking-channel registry only.  See `docs/PRODUCTION-SEED-STRATEGY.md`. |

⚠️ **Never run `npm run db:seed` against production.**  The stub
script + the production gates exist to keep this from happening by
accident.

## 6. Verify RLS

Run the existing test file (`tests/p111-rls-coverage.test.ts`) which
walks every migration and asserts each table has both
`ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` (modulo a
small allowlist).

```bash
npx tsx --test tests/p111-rls-coverage.test.ts
```

In Supabase Studio, sample-check a few tables:

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'owner_statements', 'auth_mfa_factors', 'direct_booking_finance_links'
);
```

All three should return `true / true`.

## 7. Provision storage buckets

See [`docs/STORAGE-BUCKETS-CHECKLIST.md`](./STORAGE-BUCKETS-CHECKLIST.md).
You must create:

- `task-attachments` (private, ≤ 12 MiB / file).
- `guest-request-attachments` (private, ≤ 8 MiB / file, with the
  cleanup cron enabled).

Do **not** create any public bucket without an explicit reason.

## 8. Lock down secrets

- `SUPABASE_SERVICE_ROLE_KEY` is server-only.  Confirm it does NOT
  appear in any `NEXT_PUBLIC_*` env var (the env validator
  enforces this).
- Generate the deployment-time secrets with `openssl rand -hex 48`:
  `SECURITY_ENCRYPTION_SECRET`, `STAY_LINK_KMS_SECRET`,
  `CRON_SECRET`, `ADMIN_BOOTSTRAP_SECRET`.

## 9. Verify backups

Supabase Pro tier includes daily logical backups + 7-day PITR.
Confirm in `Project Settings → Database → Backups` that backups are
enabled.  See [`docs/RUNBOOK-BACKUP-RESTORE.md`](./RUNBOOK-BACKUP-RESTORE.md)
for the restore drill.

## 10. Smoke test

After deploy, click through:

1. `/setup/admin-bootstrap` — mint the first super_admin.  Use the
   `ADMIN_BOOTSTRAP_SECRET` you set.
2. Sign in as the super_admin → `/dashboard` should load.
3. `/dashboard/system/health` — every tracked table should be
   `present`, every required env key should be `ready`.
4. `/dashboard/system/deployment` — every production gate should be
   green; env readiness should show 0 fatal.
5. `/dashboard/finance/statements` — should be empty (no demo data
   in production), but the page should render.
6. Hit `/api/cron/notifications-deliver` without the `Authorization`
   header — should return `401`.  Hit it again with the header —
   should return `200`.
