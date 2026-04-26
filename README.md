# Arconique Management OS

**An AI-powered villa management, hospitality operations, investor reporting, and owner transparency platform for premium Bali villa assets.**

Domain: `management.arconique.com`

This repository implements the blueprint in [`/docs`](./docs/). It contains a Next.js 15 App Router application that surfaces five coordinated experiences on one data core:

- **Public website** — editorial marketing pages.
- **Admin dashboard** — internal operating plane for staff.
- **Owner / investor portal** — family-office-grade reporting.
- **Guest portal** — tokenised boutique-hotel-style stay pages.
- **Staff field PWA** — mobile-first task runner.

**Current build state:** Version 6 — Booking Channels Calendar Sync + Operations Automation + Material-Usage Finance Bridge + Inventory Counts. Builds on v5 with: iCal/ICS-based channel calendar feeds (Airbnb / Booking.com / Vrbo) that import VEVENTs into `channel_calendar_events`; operator-triggered sync detects overlaps and writes `booking_conflicts`; "Create booking" materialises an event into `bookings` with `source_reference = external_uid`; `runBookingAutomationForBooking` mints the standard task chain (turnover cleaning + arrival inspection) idempotently per booking; owner-chargeable `task_material_usage` bridges to `expense_lines` with locked-period guard; full `inventory_counts` workflow (draft → submitted → approved → adjusted) auto-emits `count_correction` movements. New permissions (`integrations.*`, `bookings.sync`, `automation.*`, `inventory.count.*`, `finance.bridge_material_usage`). REST API integrations, payment processing, WhatsApp/Telegram, smart locks, AI runtime, and HEIC photo support remain deferred per ADR-0008.

---

## Requirements

- **Node.js** 20 LTS or newer
- **npm** 10+

## Quick start (no backend)

```bash
cd arconique.com/management
npm install
npm run dev          # → http://localhost:3000
```

Without environment variables the app runs entirely on typed mock data — every admin page renders, server actions return a "DB not configured" message, and `/login` offers demo quick-links into each surface.

## Quick start (with Supabase backend)

```bash
cp .env.example .env.local
# Paste your Supabase project values (see ADR-0002 §3 for where to find them)

npm install
npm run db:migrate    # applies 0000_initial.sql + 0001_admin_workflow_hardening.sql + 0002_finance_engine.sql + 0003_statement_pdfs_owner_linkage_finance_polish.sql
npm run db:seed       # idempotent demo data (incl. v3 finance demo if 0002 has been applied)
npm run dev
```

After migrations and seed, you can generate the first owner statement at
[`/dashboard/finance/statements/new`](http://localhost:3000/dashboard/finance/statements/new)
— pick *Emma Whitmore* + *March 2026*.

Admin CRUD pages now persist; the `SourceBadge` flips from **Demo data** to **Live data**.

## First super-admin (admin bootstrap)

After enabling Supabase Auth and running migrations:

1. Sign up an account in the Supabase dashboard or via `/login`.
2. Open `/setup/admin-bootstrap`.
3. While no super-admin exists yet, the form is open — enter your full name and submit.
4. Subsequent runs require `ADMIN_BOOTSTRAP_SECRET` (generate with `openssl rand -hex 32`) to be set in `.env.local` and pasted in the form.

CLI alternative:

```bash
node --env-file=.env.local --import tsx scripts/bootstrap-admin.ts
# with: AUTH_USER_ID=<uuid> EMAIL=<email> [FULL_NAME=...] [ADMIN_BOOTSTRAP_SECRET=...]
```

Both paths idempotently insert/link `app_users` and grant the `super_admin` role; the action is recorded in `audit_events`. See [`docs/ADR-0003-AUTH_ONBOARDING_AND_ADMIN_WORKFLOWS.md`](./docs/ADR-0003-AUTH_ONBOARDING_AND_ADMIN_WORKFLOWS.md) for the full design.

## Demo mode

Set `NEXT_PUBLIC_ENABLE_DEMO_MODE=1` to surface demo banners and quick-links across the admin surface even when the backend is wired. The flag is independent of mock fallback (`ARCONIQUE_FORCE_MOCK=1`).

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint (next/core-web-vitals + next/typescript) |
| `npm run typecheck` | TypeScript project check |
| `npm run test` | Light `node:test` smoke tests (schema + zod) |
| `npm run db:migrate` | Apply `drizzle/0000_initial.sql` to `DIRECT_URL` |
| `npm run db:seed` | Apply `drizzle/seed.sql` (idempotent demo data) |
| `npm run db:generate` | drizzle-kit diff (used in v3+) |

---

## Environment

`.env.example` lists every variable. Copy it to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only — never expose
DATABASE_URL=                     # pooled (port 6543)
DIRECT_URL=                       # direct (port 5432, used for migrations)
ARCONIQUE_FORCE_MOCK=             # set to "1" to ignore configured DB
```

Helpers live in `src/lib/env.ts` (`isDbConfigured()`, `isSupabaseAuthConfigured()`, `isSupabaseAdminConfigured()`).

---

## Implemented routes

### Public marketing
`/`, `/villa-management`, `/owner-portal`, `/investor-reporting`, `/guest-experience`, `/operations`, `/portfolio`, `/case-studies`, `/contact`.

### Auth
`/login` — Supabase password sign-in (active when env is configured) plus demo quick-links.

### Admin dashboard
- `/dashboard` — command-center overview (mock briefing).
- `/dashboard/projects`, `/dashboard/projects/new`, `/dashboard/projects/[slug]`.
- `/dashboard/villas`, `/dashboard/villas/new`, `/dashboard/villas/[id]`.
- `/dashboard/owners`, `/dashboard/owners/new`, `/dashboard/owners/[id]`.
- `/dashboard/shares`.
- `/dashboard/bookings`, `/dashboard/bookings/new`, `/dashboard/bookings/[id]`.
- `/dashboard/channels`.
- `/dashboard/guests`.
- `/dashboard/finance` — sample owner statement (mock).
- `/dashboard/operations` — live command center (tasks, housekeeping, maintenance, preventive, checklists, service requests, damage reports).
- `/dashboard/inventory` — live stock command (items, stock by location, movements, locations, categories, suppliers, counts).
- `/dashboard/procurement` — live purchase requests + purchase orders with per-line receiving.
- `/dashboard/ai` — AI hub preview (mock).

### Owner portal
`/owner`, `/owner/statements`, `/owner/villas`.

### Guest portal
`/stay/demo`.

### Staff field
`/field` (live tasks for the signed-in app user with mock fallback), `/field/tasks/[id]` (live task detail + mobile-first checklist runner + attachment uploader + material usage form), `/field/inventory` (active items + live stock), `/field/tasks/demo` (UX walkthrough).

### Supabase Storage setup (for photo uploads)

The `/field/tasks/[id]` and `/dashboard/operations/*` upload buttons use Supabase Storage signed uploads. Once-per-project setup:

1. **Supabase Dashboard → Storage → New bucket** named `task-attachments`. Leave "public bucket" **off**.
2. In `.env.local` set `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL`.
3. Restart `next dev`. The uploader reports "Supabase Storage is not configured." when any of these are missing — the rest of the app keeps working.

Allowed mime types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Max 10 MB. File names are sanitised server-side; objects live at `tasks/{taskId}/yyyy-mm/{uuid}-{name}` (and equivalents for checklist items / maintenance tickets).

### Testing v4–v6 workflows

1. `npm run db:migrate && npm run db:seed` — applies migrations through `0007_booking_channels_calendar_sync_automation.sql` and seeds suppliers, items, stock, sample tasks, calendar feeds, automation rules, and a partially-received PO.
2. Sign in via `/setup/admin-bootstrap`.
3. **Field photo workflow**: open a seeded task with a `photo_required` checklist item, mark it `done`, then click "Submit for review" — completion is rejected until you upload a photo via the gallery uploader.
4. **Inventory movement**: `/dashboard/inventory/movements/new` → pick `transfer`, two locations, a quantity. Confirm stock totals update at `/dashboard/inventory/stock`.
5. **Material usage**: open a live task at `/dashboard/operations/tasks/[id]` (or `/field/tasks/[id]`) → "Log material used" → pick item, location, quantity. Records a `consume` movement.
6. **Purchase order receiving**: open the seeded PO `PO-20260420-0001`. Receive the outstanding hand-towel line into Eternal Main Storage; the PO flips to `received`.
7. **Add a calendar feed**: `/dashboard/integrations/calendar-feeds/new` → paste an Airbnb iCal URL (any host that returns `text/calendar`). Click "Sync now" on the feed detail page; events appear and overlap conflicts get logged to `/dashboard/integrations/conflicts`.
8. **Materialise an event into a booking**: from `/dashboard/integrations/calendar-events`, click "Create booking" on any unbooked row. The booking page now shows the automation runs (checkout cleaning + arrival inspection were created automatically).
9. **Run booking automation manually**: open any booking detail page and click "Run automation". Idempotent — re-running surfaces "already executed" reasons rather than duplicate tasks.
10. **Bridge material usage to finance**: `/dashboard/finance/material-usage` → "Bridge pending usage". Owner-chargeable consumption rows become `expense_lines` against the booking's villa, respecting locked statement periods.
11. **Inventory counts**: `/dashboard/inventory/counts/new` → pick a location → fill in counted quantities → submit → approve. Approval auto-emits `count_correction` movements for every non-zero variance.

---

## Architecture

```
src/
├── app/                                    # Next.js App Router (5 surfaces)
├── components/                             # UI primitives + layouts (unchanged from v1)
├── config/                                 # Navigation
├── features/                               # Backend-aware feature modules
│   ├── auth/        (current-user, signIn / signOut server actions)
│   ├── projects/    (services, schema, actions)
│   ├── villas/      (services, schema, actions)
│   ├── owners/      (services, schema, actions, includes ownership shares)
│   ├── bookings/    (services, schema, actions)
│   ├── channels/    (services)
│   ├── guests/      (services)
│   ├── documents/   (services)
│   └── audit/       (server-side append-only writer)
├── lib/
│   ├── db/
│   │   ├── client.ts                       # Drizzle client w/ graceful null
│   │   └── schema/                         # 6 schema files + barrel
│   ├── supabase/
│   │   ├── browser.ts | server.ts | admin.ts
│   ├── env.ts
│   ├── mock/                               # Demo data (still source for fallback)
│   └── utils.ts
└── styles/

drizzle/
├── 0000_initial.sql                        # DDL + RLS enable + baseline policy
└── seed.sql                                # idempotent demo data

scripts/
├── migrate.ts | seed.ts                    # tsx applier helpers

tests/
└── schema.test.ts                          # node:test smoke tests
```

See [`docs/ADR-0001-STACK_DECISIONS.md`](./docs/ADR-0001-STACK_DECISIONS.md) for the original stack and [`docs/ADR-0002-BACKEND_FOUNDATION.md`](./docs/ADR-0002-BACKEND_FOUNDATION.md) for the v2 backend decisions.

---

## What's mock / demo

When `DATABASE_URL` is not configured (or `ARCONIQUE_FORCE_MOCK=1`):

- All admin list pages read from `src/lib/mock/*` and show a **Demo data** badge.
- `/login` accepts no credentials; demo quick-links open each surface unrestricted.
- Server actions for create flows return a typed error explaining how to enable persistence.

When configured:

- Admin list pages read from Postgres (`projects`, `villas`, `owners`, `ownership_shares`, `booking_channels`, `guests`, `bookings`).
- `Create` server actions persist + log an `audit_events` row.
- `/login` performs Supabase password sign-in and redirects to `/dashboard`.
- Marketing pages and the AI hub remain hand-crafted demo content (intentionally).

The platform never silently mixes — every row carries `source: "db" | "mock"` and every page makes the source visible.

---

## Roadmap pointer

This is **Version 2 — Core Data Model**. Up next, per [`docs/IMPLEMENTATION_ROADMAP.md`](./docs/IMPLEMENTATION_ROADMAP.md): **v3 — Finance & Investor Reporting**, where revenue/fee/expense ledgers, allocation rules, statement generation, hash-signed PDFs, and the owner-scoped RLS policies arrive.

---

## Further reading

- Blueprint: [PRODUCT_SPEC](./docs/PRODUCT_SPEC.md) · [TECHNICAL_ARCHITECTURE](./docs/TECHNICAL_ARCHITECTURE.md) · [DATABASE_SCHEMA](./docs/DATABASE_SCHEMA.md) · [USER_ROLES_AND_PERMISSIONS](./docs/USER_ROLES_AND_PERMISSIONS.md) · [AI_ASSISTANTS_STRATEGY](./docs/AI_ASSISTANTS_STRATEGY.md) · [DESIGN_SYSTEM](./docs/DESIGN_SYSTEM.md) · [ROUTES_STRUCTURE](./docs/ROUTES_STRUCTURE.md) · [IMPLEMENTATION_ROADMAP](./docs/IMPLEMENTATION_ROADMAP.md)
- Decisions: [ADR-0001](./docs/ADR-0001-STACK_DECISIONS.md) · [ADR-0002](./docs/ADR-0002-BACKEND_FOUNDATION.md)
- Polish notes: [VERSION_1_POLISH_NOTES](./docs/VERSION_1_POLISH_NOTES.md)
