# Production Seed Strategy — Arconique Management OS

## Three seed modes

| Mode | Trigger | What it inserts |
|---|---|---|
| **Demo seed** | `npm run db:seed` (reads `drizzle/seed.sql`) | Full demo: owners, villas, bookings, direct-booking lifecycle, statements, guest stay, services, vendors, pricing, notifications, login attempts, MFA factors.  ~5k lines.  Used for local dev and staging screenshots. |
| **Staging seed** | `npm run db:seed` (same as demo, optionally followed by `npm run demo:rebuild`) | Same as demo.  Staging is a richly populated replica of production used for visual + integration QA. |
| **Production minimal seed** | `npm run seed:production:minimal` (stub today) | **No demo data.**  Reference data only — roles + permissions + notification templates + booking-channel registry + cron job catalog.  Auto-applied by migrations 0000 + 0001 + 0007 + 0009; the stub script exists to verify nothing else has crept in. |

## What production MUST have

- **Roles + permissions.**  Inserted by `0000_initial.sql`.
- **App users + role grants.**  Mint via `/setup/admin-bootstrap` —
  do NOT seed.
- **Default notification templates.**  Inserted by `0009`,
  `0010`, and the per-prompt template inserts in `seed.sql` for
  templates we want everywhere.  Production should keep these
  template rows present; the stub script will print a list of
  expected `template_key` values you can check against.
- **Default booking channels.**  Inserted by `0007`.
- **Cron job catalog.**  Inserted by the runner on first request
  (or by clicking *Seed default job definitions* on
  `/dashboard/jobs`).

## What production MUST NOT have

- ❌ Demo owners (`Emma Whitmore`, `Takeda`, `Sonoma`).
- ❌ Demo villas (`Eternal S5`, `Enso S2`, `Ahau 02`, etc.).
- ❌ Demo guests, demo bookings, demo direct-booking holds, demo
  service orders, demo MFA factors, demo login attempts, demo
  `auth_security_events`, demo job locks, demo statements, demo
  owner-booking summaries, demo statement source groups.
- ❌ Any row using a `@example.test` or `@arconique.local` email.
- ❌ Any row with a label starting with `Demo` or `DEMO-`.

The stub script + the production gates (Prompt 113) actively block
the most common foot-guns:

- `npm run check:env` fatals on `ARCONIQUE_FORCE_MOCK=1` in
  staging / production.
- `getProductionGateReport()` flags
  `NEXT_PUBLIC_ENABLE_DEMO_MODE=1` in production.
- The `/dashboard/system/deployment` page shows both flags
  prominently.

## The stub script

`npm run seed:production:minimal` currently prints what it would
do and exits with status 0.  Treat it as documentation today:

```bash
DATABASE_URL=postgres://… npm run seed:production:minimal
```

When we are ready to automate the production-only inserts, replace
the body with a thin SQL applier that reads only the
production-safe sections of `drizzle/seed.sql`.  Until then,
production data lives entirely in migrations + admin bootstrap.

## Rebuilding production projections

The four projection layers (owner-visible events / owner-booking
summaries / owner-revenue source mix / statement transparency)
populate themselves on demand:

- The cron jobs registered in `vercel.json` rebuild them nightly.
- Admin pages have explicit Rebuild buttons (`/dashboard/owner-intelligence/bookings`,
  `/dashboard/finance/transparency/rebuild`, etc.).
- `npm run demo:rebuild` is the **demo** equivalent — do NOT run
  it against production.

## Cross-references

- [SUPABASE-PROVISIONING-CHECKLIST](./SUPABASE-PROVISIONING-CHECKLIST.md)
- [DEPLOYMENT-RUNBOOK](./DEPLOYMENT-RUNBOOK.md)
- [QA-DEMO-WALKTHROUGH](./QA-DEMO-WALKTHROUGH.md)
