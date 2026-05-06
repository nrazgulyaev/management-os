# Manual investor portal verification checklist

This checklist exercises the **runtime** investor portal access control
that the static-source test harness in
`tests/development-stage-2-3-c-access-control.test.ts` cannot verify
end-to-end. Run it once per deployment of the portal to a new
environment.

The static tests guarantee the migration's RLS policies, helper
functions, and code-level scope checks are present. This checklist
verifies they actually enforce the intended boundary when a real
authenticated session is in play.

## Prerequisites

1. Migrate + seed the target DB:
   ```
   npm run db:migrate
   npm run db:seed:dev-os
   ```
2. Create the demo Supabase auth users (one-time per environment).
   Either via the Supabase Dashboard → Authentication → Users → "Add
   user" with `Auto Confirm User` checked, or via the admin SDK from
   a one-off script:
   ```
   andrey.demo@example.com    / demo-password-123
   singapore.demo@example.com / demo-password-456
   ```
3. Link each auth user to the seeded `app_users` row:
   ```sql
   UPDATE app_users
      SET auth_user_id = '<andrey supabase user id>',
          status       = 'active'
    WHERE email = 'andrey.demo@example.com';

   UPDATE app_users
      SET auth_user_id = '<singapore supabase user id>',
          status       = 'active'
    WHERE email = 'singapore.demo@example.com';
   ```

> Status starts at `invited` from the seed; you must set it to `active`
> once the auth user exists. The `is_investor_user()` SQL function
> requires `status='active'`.

## Walk-through tests (do all of these)

### 1) Investor A (Andrey Petrov, INV-002, RUB) sees only own data

- [ ] Sign in at `/investor-portal/login` as `andrey.demo@example.com`.
- [ ] Lands on `/investor-portal/dashboard`. Banner shows "Welcome
      back, Andrey Petrov" (or RU translation if reporting_language=ru).
- [ ] Dashboard metrics show ONE commitment (COM-002), not multiple.
- [ ] `/investor-portal/commitments` shows exactly one row: COM-002.
- [ ] Click COM-002 → detail loads with drawdowns + wallet activity.
- [ ] Wallet ledger shows `drawdown_received` rows AND the
      `capital_return` line from sample distribution #1 (Andrey's
      Eternal Villas commitment received an allocation).
- [ ] `/investor-portal/distributions` shows distribution #1 only.

### 2) Cross-investor URL forgery — A cannot see B's data

While still signed in as Andrey:

- [ ] Visit `/investor-portal/commitments/<COM-001-uuid>` (Arconique
      Holdings BVI's commitment). Expect: 404 (the page calls
      `getMyCommitment(id)` which returns null when the commitment
      isn't in Andrey's scope).
- [ ] Visit `/investor-portal/commitments/<COM-006-uuid>` (Crypto DAO).
      Expect: 404.
- [ ] Visit `/investor-portal/wallet/<COM-003-uuid>` (Singapore Family
      Office's wallet). Expect: 404.

### 3) Investor B (Singapore Family Office, INV-003, USD)

Sign out, then sign in as `singapore.demo@example.com`:

- [ ] Dashboard shows TWO commitments (COM-003 Eternal + COM-004 Enso).
- [ ] Total committed ≈ $1.7M USD across both.
- [ ] `/investor-portal/distributions` shows distribution #1 (Singapore
      received an allocation in the Eternal capital return).
- [ ] Wallet ledger for COM-003 shows the executed distribution credit.
- [ ] Wallet ledger for COM-004 shows only `drawdown_received` rows
      (no distribution there).

### 4) Internal staff (control)

Sign out, then sign in as a user with the `director` or `super_admin`
role:

- [ ] `/development-os/investors` shows all 5 investors.
- [ ] `/development-os/distributions/<distribution #1>` shows ALL
      allocations (Arconique GP + Andrey + Singapore + Made Wijaya),
      not just one.
- [ ] `/development-os/finance` shows full bank ledger including
      ACC-IDR-OPS, ACC-USD-MAIN, ACC-USDT-1.

### 5) Direct DB verification (RLS at the data layer)

Connect with the Supabase pooler URL and pretend to be Andrey by
setting the JWT claim. **This requires the service role key — only do
it in a non-prod environment.**

```sql
-- Set the session to act as Andrey's auth user
SELECT set_config('request.jwt.claims',
                  jsonb_build_object('sub', '<andrey-auth-user-id>')::text,
                  true);

-- Should return EXACTLY 1 row (Andrey's commitment)
SELECT count(*) FROM capital_commitments;

-- Should return ZERO rows (bank accounts are excluded)
SELECT count(*) FROM dev_bank_accounts;

-- Should return ZERO rows (other investors' commitments)
SELECT id, investor_code FROM investors;
-- ... but wait, this should return 1 row (Andrey himself)

-- Privilege escalation guard
UPDATE app_users SET investor_id = '<some other investor id>'
  WHERE email = 'andrey.demo@example.com';
-- EXPECTED: error from protect_app_users_investor_id_trg
```

### 6) Privilege escalation rejected

Stay logged in as Andrey and try to call any internal write action via
the API (e.g. POST to `/api/cron/dev-os-overdue-drawdown` without the
CRON_SECRET, or attempting to access `/development-os/investors`).

- [ ] `/development-os/*` URLs redirect to the standard auth page or
      show a permission denied state — investor users do not have any
      internal role keys.

## If any step fails

Halt the deployment and investigate. The most common failure modes:

1. **`status != 'active'`** — `is_investor_user()` requires it; the
   seed creates users with `status='invited'`.
2. **`auth_user_id` not set** — the seed inserts NULL; you must update
   it after creating the Supabase auth user.
3. **Role not assigned** — verify `user_roles` row exists with role
   key `investor_viewer`.
4. **`is_internal_user()` returns true for the investor** — should not
   happen; if it does, check that the test user doesn't also have an
   internal role assigned.

When all steps pass, the portal is ready for real-investor onboarding.
