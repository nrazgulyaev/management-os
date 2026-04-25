# Arconique Management OS

**An AI-powered villa management, hospitality operations, investor reporting, and owner transparency platform for premium Bali villa assets.**

Domain: `management.arconique.com`

This repository implements the blueprint in [`/docs`](./docs/). It contains a Next.js 15 App Router application that surfaces five coordinated experiences on one data core:

- **Public website** — editorial marketing pages.
- **Admin dashboard** — internal operating plane for staff.
- **Owner / investor portal** — family-office-grade reporting.
- **Guest portal** — tokenised boutique-hotel-style stay pages.
- **Staff field PWA** — mobile-first task runner.

**Current build state:** Version 2.5 — Admin Workflow Hardening. Drizzle schema, Supabase-ready clients, services with graceful fallback, full admin CRUD (create / edit / archive) for projects, villas, owners, ownership shares, bookings, channels, guests, documents. Includes admin-bootstrap flow, audit log viewer, settings + users page, share-total validation, and live-DB dashboard counts. The marketing site, owner portal, and AI hub remain demo-grade — wiring continues across v3–v10.

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
npm run db:migrate    # applies drizzle/0000_initial.sql + 0001_admin_workflow_hardening.sql
npm run db:seed       # idempotent demo data
npm run dev
```

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
- `/dashboard/operations`, `/dashboard/inventory` — operational demos (mock).
- `/dashboard/ai` — AI hub preview (mock).

### Owner portal
`/owner`, `/owner/statements`, `/owner/villas`.

### Guest portal
`/stay/demo`.

### Staff field
`/field`, `/field/tasks/demo`.

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
