# Stage 8 / Phase 0 — Audit-bot setup — COMPLETE

**Date**: 2026-05-07
**Status**: ✅ COMPLETE — auth-enabled sweep works against production.

---

## What was provisioned

| Resource | Value |
|---|---|
| Supabase Auth user | `audit-bot@arconique.com` |
| Auth user UUID | `1985f315-f563-41c2-b786-932fc48a91e0` |
| App user role | `super_admin` (linked via `assign_user_role()` SQL fn) |
| Password storage | `.env.audit.local` (gitignored, mode 0600) |

The user can log in to https://management-os-fawn.vercel.app/login and reaches `/dashboard`. Subsequent navigation to any protected route renders fully (no redirect to /login).

## Tooling delivered

### `scripts/create-audit-bot.ts` (new)

Idempotent provisioner:
- Calls Supabase Admin API to create or rotate-password the `audit-bot@arconique.com` user.
- Generates a fresh 24-byte URL-safe password each run.
- Writes credentials to `.env.audit.local` (mode 0600, gitignored).
- Prints next-step `bootstrap-admin.ts` invocation for super_admin linkage.

Usage:
```bash
node --env-file=.env.production.local --import tsx scripts/create-audit-bot.ts
```

### `scripts/audit-production-pages.ts` (extended)

New `--auth` flag triggers automated `/login` form submission before the sweep:
- Reads `AUDIT_BOT_EMAIL` + `AUDIT_BOT_PASSWORD` from env (load via `node --env-file=.env.audit.local`).
- Navigates to `/login`, fills `input[name="email"]` + `input[name="password"]`, clicks submit.
- Waits for redirect away from `/login` (or fails fast if login submission stalls).
- Session cookies persist in the browser context for all subsequent page audits.

Usage:
```bash
node --env-file=.env.audit.local --import tsx scripts/audit-production-pages.ts --auth
```

The `--auth` flag composes with all existing flags: `--urls=`, `--out=`, `--concurrency=`, `--timeout=`, etc. The `AUDIT_COOKIE` path (manual cookie injection) still works for paths that don't go through `/login`.

## Verification — auth-enabled smoke sweep

5 protected routes, concurrency=1, 30s timeout:

```
[audit] login OK as audit-bot@arconique.com → /dashboard
[  1/5] USABLE     200 /dashboard
[  2/5] USABLE     200 /dashboard/shares
[  3/5] USABLE     200 /development-os
[  4/5] USABLE     200 /development-os/banking
[  5/5] USABLE     200 /development-os/marketing/connections
[audit] verdict breakdown: USABLE 5
```

Every page returned 200 with full title/H1 detection — none redirected back to `/login`. Login session is stable across the full route navigation.

## Reconciliation with the original Phase 0 plan

The plan specified `UPDATE app_users SET role = 'super_admin'`. That SQL doesn't match the schema — RBAC is in the join table `app_user_roles` (with `role_key` + `scope`), populated by the `public.assign_user_role()` PL/pgSQL function. The existing `scripts/bootstrap-admin.ts` handles this correctly (it calls `assign_user_role(user_id, 'super_admin', NULL, NULL)`), so the actual flow used:

1. `scripts/create-audit-bot.ts` — Supabase Admin API → creates auth user.
2. `scripts/bootstrap-admin.ts` — links auth user → `app_users` row + `super_admin` grant.

The plan also specified "Add to Vercel environment variables" for `AUDIT_BOT_EMAIL`/`AUDIT_BOT_PASSWORD`. Not done in this session (no Vercel CLI auth available). For local audit-script runs, `.env.audit.local` is sufficient. If CI-driven audit runs land later, add the vars to Vercel manually.

## Phase 8.A addendum — three new bugs surfaced via dogfooding

The user-supplied addendum identifies three additional production bugs (8.A.5, 8.A.6, 8.A.7) to fold into Phase 8.A scope. Documented here for the next phase, NOT investigated in Phase 0:

- **8.A.5 — `/dashboard/villa-guides/wifi/migrate`** — 500 on sweep action; suspected `STAY_LINK_KMS_SECRET` issue.
- **8.A.6 — `/development-os/boq/new`** — server-side 500.
- **8.A.7 — PWA icon 404 + service worker clone error** — cosmetic batch.

These shift Phase 8.A from ~10 → ~15 tests target.

---

## Halt + report

Phase 0 deliverables:
- ✅ `scripts/create-audit-bot.ts` (committed)
- ✅ `scripts/audit-production-pages.ts` extended (committed)
- ✅ `.env.audit.local` (NOT committed — gitignored)
- ✅ Auth verified on 5 representative routes
- ✅ This completion doc

**Do NOT proceed to Phase 8.A without explicit go-ahead.**
