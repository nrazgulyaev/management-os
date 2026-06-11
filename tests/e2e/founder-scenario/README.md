# Founder scenario — executable playbook (E2E)

`scenario.spec.ts` is the runnable form of `docs/FOUNDER-E2E-PLAYBOOK.md`: it signs in
as an internal user and walks the management-OS happy path, asserting the **real effect**
of each step (a created row shows up in its list, key surfaces render without an error
boundary, the app icon doesn't 404), not just that a page loaded.

## Why it's skipped by default
Authenticated, DB-mutating flows can't run in the CI sandbox (no DB, no session). The
suite `test.skip`s unless you give it a real environment.

## How to run (against staging or local-with-DB)
```bash
# 1. A running app with a seeded DB (one internal super_admin/director account + at least
#    one project/villa). Locally:  npm run build && PORT=3101 npm run start
#    (with DATABASE_URL + Supabase env set). Or point at staging.
# 2. Provide the base URL + an internal account:
PLAYWRIGHT_BASE_URL=http://localhost:3101 \
PLAYWRIGHT_SCENARIO_EMAIL=you@yourorg.com \
PLAYWRIGHT_SCENARIO_PASSWORD='********' \
npx playwright test --config playwright.config.ts tests/e2e/founder-scenario
```

## What it checks (and what it intentionally does not)
- **Checks**: sign-in reaches a cabinet; new-complex / owners-new / bookings-new render
  with their create controls; a created complex + owner appear in their lists; payroll,
  management P&L, finance and statements surfaces render without an error boundary;
  the settings hub links team/roles; the app icon doesn't 404.
- **Best-effort form fills**: field selectors are label/name-based and wrapped in
  `.catch(() => {})` so a markup shift doesn't hard-fail the *outcome* assertion — the
  truth is the post-create list assertion. Tighten the fills to your live form as needed.
- **Out of scope here** (needs more seed/fixtures or external creds): the full
  guest-portal token walk, cash-payment posting, statement money math, and concierge
  reply — these are documented step-by-step in `docs/FOUNDER-E2E-PLAYBOOK.md` §3–§4 and
  can be added as the seed fixtures grow. PSP capture + SMS/WhatsApp are external deps.

## Marker convention
Each run tags created rows with a unique `E2E<base36-time>` marker so assertions are exact
and re-runs don't collide. Clean up test rows in your seed DB periodically.
