# ADR-0002 — Backend Foundation (Version 2)

**Status:** Accepted
**Date:** 2026-04-25
**Scope:** Version 2 — Core Data Model. Database schema, ORM, Supabase wiring, services layer, admin CRUD foundation. No finance engine, no AI runtime, no external integrations.

This ADR covers the concrete decisions taken when adding the first real backend foundation to the Next.js demo build.

---

## 1. Decisions

| Concern | Decision | Rationale |
|---|---|---|
| Database | **Supabase Postgres** (managed) | Aligns with `TECHNICAL_ARCHITECTURE.md`. Singapore region preferred for IDN data residency. |
| ORM | **Drizzle ORM 0.45.2** | SQL-close, TS-strong, plays well with Postgres/RLS. `drizzle-zod` deferred (not needed yet). |
| Driver | **postgres.js 3.4** | Lightweight, supports Supabase's pooler/direct URLs cleanly. `pg` was the alternative. |
| Auth | **Supabase Auth** via `@supabase/ssr` | Cookie-based SSR session, server actions for sign-in/out. |
| Validation | **Zod 3** | Already in repo for env. Single tool for runtime validation across server actions and tests. |
| Migration tooling | Hand-authored single SQL file (`drizzle/0000_initial.sql`) applied via `scripts/migrate.ts` | Deterministic, reviewable, no `drizzle-kit` interactive prompts in CI. v3 will graduate to `drizzle-kit generate` for incremental diffs. |
| Seed tooling | Single SQL file `drizzle/seed.sql` applied via `scripts/seed.ts` | Idempotent (`ON CONFLICT`), readable, easy to amend. |
| Tests | `node:test` + `tsx --test` | No new test runner; matches Next.js footprint. |
| Date utils | **date-fns 4** | Used for `differenceInCalendarDays` in booking actions. |
| Service layer | `src/features/<domain>/services.ts` returning typed lists with `source: "db" | "mock"` | Lets every UI render whether or not the backend is wired. |
| Forms | React 19 `useActionState` + Zod parse on the server | Avoids client-side state libraries. Errors round-trip via the action result. |
| RLS | Enabled + forced on every tenant table; explicit policies; service-role used for trusted writes | Defense-in-depth; UI never reads via service-role. |

---

## 2. Why Drizzle (and not Prisma)

- **Schema-as-TypeScript** with no separate codegen step — we get types directly from the schema.
- **SQL-close**: easier to audit RLS-impacted queries; fewer abstractions hiding `auth.uid()` semantics.
- **Smaller runtime footprint** than Prisma's engine; matters for serverless cold-starts on Vercel.
- **First-class postgres.js support** with native `RETURNING` and transaction APIs.
- Prisma remains a fallback if we later need its richer migration tooling.

---

## 3. Supabase provisioning (expected)

1. Create a Supabase project in the Singapore region (`ap-southeast-1`).
2. Project Settings → API:
   - `NEXT_PUBLIC_SUPABASE_URL` ← Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` ← service-role key (server-only — never expose)
3. Settings → Database → connection strings:
   - **Connection pooling (transaction)** for `DATABASE_URL` (port 6543).
   - **Direct connection** for `DIRECT_URL` (port 5432) — used by migrations and `drizzle-kit`.
4. Copy `.env.example` → `.env.local`, paste values, never commit `.env.local`.

---

## 4. Required env vars

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      # server-only
DATABASE_URL                   # pooled
DIRECT_URL                     # direct (migrations / drizzle-kit)
ARCONIQUE_FORCE_MOCK           # optional: set to "1" to force mock fallback
```

`src/lib/env.ts` parses these lazily and exposes:
- `isDbConfigured()` — true when `DATABASE_URL` is present and `ARCONIQUE_FORCE_MOCK !== "1"`.
- `isSupabaseAuthConfigured()` — true when public URL + anon key are present.
- `isSupabaseAdminConfigured()` — true when public URL + service-role key are present.

The app must always render. When env is missing, services return mock data and admin CRUD pages display a "read-only demo" banner. **No silent secrets are required.**

---

## 5. Migration & seed workflow

```bash
# 1) Configure
cp .env.example .env.local   # then paste real values

# 2) Install
npm install

# 3) Apply schema (one-time per environment)
npm run db:migrate

# 4) Optionally apply demo data (idempotent)
npm run db:seed

# 5) Develop
npm run dev
```

Future-state (v3+) when schema gets churn:
- `npm run db:generate` produces incremental SQL files from schema diffs.
- `scripts/migrate.ts` will switch to a directory-walking applier.

---

## 6. Database schema (this version)

Tables created (`drizzle/0000_initial.sql`, types in `src/lib/db/schema/*`):

- **Identity** — `app_users`, `roles`, `permissions`, `user_roles`, `role_permissions`
- **Projects · Villas** — `projects`, `villas`, `villa_status_events`
- **Ownership** — `owners`, `ownership_shares`, `payout_methods`
- **Bookings** — `booking_channels`, `guests`, `bookings`
- **Documents** — `documents`
- **Audit** — `audit_events`

Notes:
- Money is stored as `numeric(14,2)` for v2 booking demo. The full canonical "BIGINT minor units + currency + FX snapshot" model from `DATABASE_SCHEMA.md` arrives with the finance engine in v3.
- All `*_at` timestamps are `timestamptz` with `now()` defaults; an `updated_at` trigger maintains modifications across mutable tables.
- Check constraints enforce enum-like values on `status`, `management_status`, `model`, `type`, `visibility`. Cheaper than Postgres enums for the rate of change expected over the next few versions.

---

## 7. RLS strategy

`drizzle/0000_initial.sql` enables and **forces** RLS on every tenant table. A single helper, `public.is_internal_user()`, returns true for any active `app_users` row whose `auth_user_id` matches `auth.uid()` and who holds at least one staff/director role. Each tenant table currently has one policy: `internal_read` allowing `SELECT` for internal users.

Writes today flow through server actions that connect with the **service-role key**, which bypasses RLS by design. The admin CRUD UI never holds the service role; admin actions run server-side only.

What's intentionally deferred to later versions:

- **Owner / investor scoped policies** on projects, villas, ownership_shares, bookings (PII redacted), payout_methods, documents — joined through `ownership_shares` active on the period. Lands with v3 (Finance & Investor Reporting) when the owner portal reads from the DB.
- **Guest token policies** on bookings, villa_guides, upsells, threads — keyed by signed booking token. Lands with v6 (Guest Portal & Concierge).
- **Per-action UPDATE / INSERT policies** for internal users to allow direct DB writes from authenticated sessions (replacing service-role wherever possible). Lands incrementally from v3.
- **Append-only audit_events policy** preventing UPDATE / DELETE except via service-role. Easy to add — left out only because no role currently writes audit directly.

This is conservative on purpose: tables ship "deny by default" rather than "permissive then tighten later".

---

## 8. Services & graceful fallback

Every feature exports a typed service module under `src/features/<domain>/services.ts`. Each function:

1. Calls `getDb()`.
2. If `null` (env missing or `ARCONIQUE_FORCE_MOCK=1`), returns a normalised projection of the existing mock data (still typed identically).
3. If a Drizzle client is available, runs the real query.

Result rows always carry `source: "db" | "mock"` so the UI can render a `SourceBadge` and the admin pages show an honest "read-only demo" notice when offline. There is no hidden "happy path that secretly hits mocks in production" — `ARCONIQUE_FORCE_MOCK` must be explicitly set to override a real DB.

Server actions (`createProject`, `createVilla`, `createOwner`, `createBooking`) require a real DB and return a typed error envelope when not configured. Each successful insert calls `recordAuditEvent` to append a row to `audit_events`.

---

## 9. What is implemented now

- Drizzle schemas (identity, projects, villas, status events, ownership, shares, payout methods, channels, guests, bookings, documents, audit).
- SQL migration applying DDL, triggers, RLS enable/force, and a baseline read policy.
- Idempotent seed covering 3 projects, 10 villas, 3 owners, 5 ownership shares, 3 payout methods, 7 channels, 5 guests, 5 bookings, 3 documents.
- Supabase clients (browser, server, admin/service-role).
- Drizzle DB client with global pooling and graceful "no env → null" path.
- Service modules with mock fallback for projects, villas, owners + ownership shares, channels, guests, bookings, documents, audit, current user.
- Server actions with Zod validation and audit hooks for **projects**, **villas**, **owners**, **bookings**.
- Admin CRUD: `/dashboard/projects` (list/new/[slug]), `/dashboard/villas` (list/new/[id]), `/dashboard/owners` (list/new/[id]), `/dashboard/shares` (list), `/dashboard/bookings` (list/new/[id]), `/dashboard/channels` (list), `/dashboard/guests` (list).
- `/login` wired to a Supabase password sign-in server action with a clear demo-mode message when env is missing.
- Light tests (`node:test`) for schema barrel, project slug validation, booking date check, owner schema sanity.

## 10. What is intentionally deferred

| Deferral | Lands in |
|---|---|
| Real finance engine: revenue lines, fee lines, allocation rules, statements, payouts, taxes, reserves, FX snapshots | v3 |
| Owner-scoped RLS + delegate viewer scoping | v3 |
| Operations write paths: tasks, checklists, maintenance tickets, preventive schedules | v4 |
| Inventory & procurement | v5 |
| Guest tokens + concierge | v6 |
| AI runtime, retrieval, tool execution, audit-log dashboard | v7 |
| Channel managers (Hostaway, Airbnb, Booking, Agoda, Expedia), WhatsApp/Telegram/SMS, smart locks, cameras, PriceLabs, Xero, payments | v8 |
| Soft-delete / status-based delete UI for projects, villas, owners | v3 (after RLS owner policies) |
| pgtap test suite for the role matrix | v3 |
| Drizzle-kit incremental migrations (`drizzle/migrations/*`) replacing the hand-authored single file | v3 |

---

## 11. Known issues / to-watch

- **`npm audit`** reports two moderate dev-only vulnerabilities:
  1. `drizzle-kit` ships an old `@esbuild-kit/core-utils` chain. Affects only the dev/CLI tooling used by `drizzle-kit generate`; never executed at runtime. Tracked upstream.
  2. Next.js's transitive `postcss <8.5.10`. Resolving requires either a Next.js minor bump or downgrade — not justified for v2.
  Production runtime is unaffected. Will revisit at v3.
- The schema file is hand-authored. When we generate via `drizzle-kit generate` we will produce a parallel migration file and document the cut-over to the directory-based applier in ADR-0003.
- Supabase Realtime is provisioned with the project but unused until v4.
- `ARCONIQUE_FORCE_MOCK=1` is the only sanctioned way to ignore a configured DB; do not branch on `process.env.NODE_ENV`.

---

## 12. Cross-reference

- Product canon: [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md), [`USER_ROLES_AND_PERMISSIONS.md`](./USER_ROLES_AND_PERMISSIONS.md)
- Architecture: [`TECHNICAL_ARCHITECTURE.md`](./TECHNICAL_ARCHITECTURE.md)
- Roadmap: [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md)
- Stack baseline: [`ADR-0001-STACK_DECISIONS.md`](./ADR-0001-STACK_DECISIONS.md)
