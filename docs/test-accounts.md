# Test team accounts (TEST-ACCOUNTS-1)

> **INTERNAL DEMO ONLY.** These are seeded test credentials for the operator's
> own team to exercise the platform as each cabinet role. They live on a
> private deployment; if this codebase or these credentials are ever shared
> externally, **rotate the passwords first** via Supabase Admin → Users.

Seeded by `scripts/seed-test-team-accounts.ts` — idempotent, safe to re-run.

```bash
npm run seed:test-team-accounts
npm run seed:test-team-accounts -- --wipe   # delete + recreate
```

## Accounts

| Display name | Email | Password | Cabinet role |
|---|---|---|---|
| Ali (test bookkeeper) | `ali-test@arconique.local` | `ArcAli-2026-bookkeeper` | `cfo_accountant` |
| Sutanti (test QS / cost analyst) | `sutanti-test@arconique.local` | `ArcSutanti-2026-qscost` | `qs_analyst` |
| NG (test site supervisor) | `ng-test@arconique.local` | `ArcNG-2026-sitemanager` | `site_supervisor` |

All three are scoped to the Arconique org (`08e669f9-4298-4cd7-8cf6-c0ac7b092e14`) with `scope='company_wide'` and `is_primary=true`.

**Note on role names**: the sprint spec said "bookkeeper" and "cost_analyst," but the platform's actual cabinet role keys (see `src/lib/development/server/roles/role-helpers.ts` + migration `0066`) are `cfo_accountant` and `qs_analyst`. The seed maps the spec intent to the real keys.

## What each role can test

### Ali — `cfo_accountant`

Primary cabinet: **`/development-os/cabinets/cfo-accountant`**

Test surfaces:
- `/dashboard` (Mgmt OS landing — should load with Mgmt context)
- `/development-os/cfo` — CFO summary cabinet (KPI strip wired live via `getCfoKpis`)
- `/development-os/finance/transactions` — bookkeeper ledger (HF-7/8/9/11 + AI-ACTIVATION-1 widgets: snap receipt, quick entry, vendor selector)
- `/development-os/finance/transactions/quick-entry` — spreadsheet-style entry
- `/dashboard/finance` — statements + payouts
- `/owner/statements/[id]` (impersonated owner) — verify owner-facing statement read

### Sutanti — `qs_analyst`

Primary cabinet: **`/development-os/cabinets/qs`**

Test surfaces:
- `/development-os/cabinets/qs` — BOQ desk
- `/development-os/boq` — BOQ list
- `/development-os/projects/[slug]` — per-project view, cost variance
- `/development-os/quantity-surveying` — cost-control surface
- `/development-os/contracts` — contracts list
- Vendor RFQ comparison (when wired) under procurement

### NG — `site_supervisor`

Primary cabinet: **`/development-os/cabinets/site-supervisor`**

Test surfaces:
- `/development-os/cabinets/site-supervisor` — daily report apex (5 panels wired live: diary, photos, voice, QA, safety)
- `/development-os/site-reports` — list of site reports
- `/development-os/site-reports/[id]` — detail + submit-for-review flow (now guarded by SESSION-RESOLUTION-1 P3)
- `/development-os/operations/site-reports/quick-photo` — mobile-style photo capture
- `/development-os/qa-qc` — quality issues
- `/development-os/safety` — safety incidents
- `/development-os/projects` — project list (read access)

## Verification

After seeding, run the diagnostic for each account to confirm the identity chain resolves:

```bash
EMAIL=ali-test@arconique.local      npm run diagnose:session
EMAIL=sutanti-test@arconique.local  npm run diagnose:session
EMAIL=ng-test@arconique.local       npm run diagnose:session
```

Expected output per account: ✓ all 4 steps (auth → app_users → org → roles) + the test account's role visible in Step 4.

## Permission scope

These accounts have a **cabinet role** (via `app_user_roles`), not generic permissions (via `user_roles` + `role_permissions`). The cabinet role drives:
- Workspace switcher visibility
- Default landing page on sign-in (resolved by `resolveLandingPageForUserId` in `src/lib/development/server/roles/landing-resolver.ts`)
- Cabinet-specific UI gates

If a tester hits a "Permission denied" on a feature they expect to access, the missing piece is likely a fine-grained permission in `role_permissions`, not the cabinet role itself. File that as a separate finding.

## Cleanup

To remove the test accounts entirely:

```bash
npm run seed:test-team-accounts -- --wipe
```

This revokes the role grants (`app_user_roles.is_active = false`), deletes the `app_users` rows, and deletes the Supabase auth users.
