# Deployment Runbook — Arconique Management OS

End-to-end runbook for promoting a build from local → staging → production.
Pair with [`SUPABASE-PROVISIONING-CHECKLIST.md`](./SUPABASE-PROVISIONING-CHECKLIST.md),
[`STORAGE-BUCKETS-CHECKLIST.md`](./STORAGE-BUCKETS-CHECKLIST.md),
[`VERCEL-CRON-CHECKLIST.md`](./VERCEL-CRON-CHECKLIST.md),
[`PRODUCTION-SEED-STRATEGY.md`](./PRODUCTION-SEED-STRATEGY.md), and
[`RUNBOOK-BACKUP-RESTORE.md`](./RUNBOOK-BACKUP-RESTORE.md).

## Domains

Suggested domain layout:

| Domain | Hosts | Notes |
|---|---|---|
| `arconique.com` | Marketing site (separate Next deployment or static). | Outside this repo. |
| `management.arconique.com` | Management OS (this repo). | Initial single-domain deployment.  All route groups (`/dashboard`, `/owner`, `/stay`, `/field`, `/vendor`, `/book`, `/api`) live here. |
| `app.arconique.com` | Optional alias for `management.arconique.com`. | Useful when you eventually split owner / guest portals onto subdomains. |
| `owner.arconique.com` | Optional CNAME → `/owner` route group. | Add later if you want owners to land on a friendly subdomain. |
| `stay.arconique.com` | Optional CNAME → `/stay` route group. | Same idea for guests. |
| `vendor.arconique.com` | Optional CNAME → `/vendor` route group. | Same idea for vendors. |
| `api.arconique.com` | Optional split for `/api` if you outgrow Vercel hobby. | Not required initially. |

For initial production launch, use **`management.arconique.com`**
exclusively.  Set `APP_BASE_URL=https://management.arconique.com` in
the Vercel project's environment variables.

## Route groups

The repo uses Next App Router groups:

- `(dashboard)` → `/dashboard/*` — internal admin (auth required).
- `(owner)` → `/owner/*` — investor-owner portal (auth + ownership-share required).
- `(public)` → `/book/*`, `/stay/*`, `/owner-portal`, `/login`,
  `/setup/*`, `/villa-management`, `/portfolio`, etc.
- `(field)` → `/field/*` — field staff app (auth required).
- `(vendor)` → `/vendor/service/*` — token-bound vendor portal.
- `(auth)` → `/login`, `/setup/admin-bootstrap`, `/setup/mfa/*`.

All groups deploy as a single Vercel project today.

## HTTPS + cookies

- HTTPS is **required**.  Vercel handles certs automatically.  Local
  dev runs over HTTP at `http://localhost:3000`.
- Auth cookies are `Secure` + `SameSite=Lax`.  If you split owner /
  guest portals onto subdomains, you must scope the auth cookie to
  `.arconique.com`.

## CORS

The two public quote endpoints (`POST /api/v1/holds`,
`GET /api/v1/quote`) currently allow all origins for read access.  If
you restrict them, document the change here so the marketing site
stays unblocked.

## Pre-deploy checklist

```bash
# 1. Pull the candidate branch.
git checkout main && git pull

# 2. Run the static preflight.  Fails on env / migration / cron / storage
#    issues, then runs typecheck / lint / test / build.
npm run preflight:deploy

# 3. Snapshot the production DB before you touch it.
#    See RUNBOOK-BACKUP-RESTORE.md.

# 4. Apply migrations + (production) re-verify env in Vercel.
#    Migrations are idempotent and use IF NOT EXISTS, but a snapshot
#    is cheap insurance.
DATABASE_URL=… DIRECT_URL=… npm run db:migrate
```

## Vercel deploy

1. Push the candidate branch — Vercel auto-builds preview.
2. Verify the preview URL by hitting `/dashboard/system/deployment`:
   - All env vars green (no fatal).
   - All production gates green.
   - Migration count + last migration filename match what you
     expect.
3. Promote the preview to production via the Vercel dashboard.
4. Watch logs for the first 5 minutes — every cron route should
   start logging "lock acquired" / "lock released" lines on its
   schedule.

## Post-deploy smoke test

In order:

1. Hit the home page — expect `200`.
2. Sign in as a super_admin → `/dashboard` loads.
3. `/dashboard/system/health` — every tracked table `present`,
   every required env key `ready`.
4. `/dashboard/system/deployment` — env mode is `production`,
   0 fatal, 0 warning (or only docs-tier warnings).
5. `curl -I https://<host>/api/cron/notifications-deliver` —
   expect `401` (no `Authorization` header).
6. Same URL with `Authorization: Bearer $CRON_SECRET` → expect
   `200` and a job-run row in
   `/dashboard/jobs/runs`.
7. Mint a stay token via the admin booking flow, paste into
   `/stay/<token>` — Wi-Fi reveal works.
8. `/owner/statements` (signed in as a demo owner) — page loads
   even when empty.
9. Trigger one notification end-to-end (e.g. mark a deposit paid);
   verify the in-app notification appears in
   `/dashboard/notifications/inbox`.

If any step fails, **roll back** before debugging in production.

## Rollback procedure

Vercel keeps every deployment immutable.  To roll back:

1. Open the Vercel dashboard → `Deployments`.
2. Find the previous green deployment.
3. Click `⋯ → Promote to Production`.
4. Wait for DNS / edge propagation (~30 seconds).
5. Sanity-check `/dashboard/system/deployment`.

If the rollback is due to a database migration regression, restore
the snapshot you took in step 3 of the pre-deploy checklist.  See
[`RUNBOOK-BACKUP-RESTORE.md`](./RUNBOOK-BACKUP-RESTORE.md).

## Monitoring (baseline)

The codebase ships with a structured logger
(`src/lib/observability/logger.ts`) that emits one JSON line per
event with redacted secret fields.  Hooking up Sentry / Logtail later
is a future ergonomic improvement; for now the logs land in Vercel's
log stream.

What to monitor:

- **Failed cron auth** — `401` on `/api/cron/*` is benign, but a
  spike means CRON_SECRET drifted.
- **Job failures** — `job_runs.status = 'failed'` rows.  Surfaces on
  `/dashboard/jobs`.
- **Payment webhook failures** — N/A today (no real PSP).
- **Storage metadata strip failures** — `guest_request_attachments`
  cleanup job logs these.
- **Security events** — `auth_security_events` rows with severity
  `critical`.

What NOT to log:

- Tokens (raw guest stay token, hold token, recovery code).
- Passwords / TOTP secrets / payment provider session ids.
- Webhook payloads.
- Raw guest contact info (email / phone / IP).
- Service-role API keys.

The logger redacts these field names automatically; never bypass it.

## Cross-references

- [ENVIRONMENT-VARIABLES](./ENVIRONMENT-VARIABLES.md)
- [SUPABASE-PROVISIONING-CHECKLIST](./SUPABASE-PROVISIONING-CHECKLIST.md)
- [STORAGE-BUCKETS-CHECKLIST](./STORAGE-BUCKETS-CHECKLIST.md)
- [VERCEL-CRON-CHECKLIST](./VERCEL-CRON-CHECKLIST.md)
- [PRODUCTION-SEED-STRATEGY](./PRODUCTION-SEED-STRATEGY.md)
- [RUNBOOK-BACKUP-RESTORE](./RUNBOOK-BACKUP-RESTORE.md)
- [QA-DEMO-WALKTHROUGH](./QA-DEMO-WALKTHROUGH.md)
- [ADR-0036 — Production Deployment Readiness](./ADR-0036-PRODUCTION_DEPLOYMENT_READINESS.md)
