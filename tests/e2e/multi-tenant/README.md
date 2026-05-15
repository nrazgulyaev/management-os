# Multi-tenant isolation tests

End-to-end Playwright suite that validates the TENANT-1 sprint's
promise: two tenants on the same Arconique deployment cannot see or
mutate each other's data.

## Why this is gated by a fixture

To run these tests you need two real Supabase Auth users + two
organization rows in the database. The seed setup is not in the repo
because:

- The Supabase service-role key is environment-specific.
- The auth user emails must not collide with real customers.

When you have the fixture seeded (or want to add it), run:

```
npm run build
PORT=3101 npm start &
PLAYWRIGHT_TENANT_A_EMAIL=tenant-a-admin@arconique.test \
PLAYWRIGHT_TENANT_A_PASSWORD=... \
PLAYWRIGHT_TENANT_B_EMAIL=tenant-b-admin@arconique.test \
PLAYWRIGHT_TENANT_B_PASSWORD=... \
npx playwright test tests/e2e/multi-tenant
```

If the env vars are missing, the suite skips every test with a clear
message instead of failing CI.

## Seed-data script (manual, not in the repo)

The minimum fixture each tenant needs:

```sql
-- Two orgs
INSERT INTO organizations (organization_code, name, organization_type,
                           primary_currency, primary_language, timezone,
                           subscription_tier)
VALUES
  ('TENANT_A_TEST', 'Tenant A Test', 'tenant', 'USD', 'en', 'UTC', 'trial'),
  ('TENANT_B_TEST', 'Tenant B Test', 'tenant', 'USD', 'en', 'UTC', 'trial')
ON CONFLICT (organization_code) DO NOTHING;

-- One super_admin per org, after creating the Supabase Auth users
-- via supabase admin API. Use provision_app_user() from migration 0087:
SELECT public.provision_app_user(
  '<supabase auth user id A>'::uuid,
  'tenant-a-admin@arconique.test',
  'Tenant A Admin',
  (SELECT id FROM organizations WHERE organization_code = 'TENANT_A_TEST'),
  'super_admin',
  'admin'
);
-- repeat for tenant B
```

## What the tests assert

For each entity that's been touched by TENANT-1 (bank accounts, cost
categories, leads, transactions, invoices, vendors, etc.):

1. Login as Tenant A admin.
2. Create a row with a marker (e.g. `TENANT_A_<timestamp>` in the code field).
3. Logout, login as Tenant B admin.
4. Visit the list page for the same entity.
5. Assert the Tenant-A marker row is NOT visible.

A FAIL means cross-tenant leak — the corresponding server action or
list query still has a tenancy hole.
