# Arconique Management OS — Technical Architecture

**Status:** v0 Blueprint
**Last revised:** 2026-04-24

This document is the engineering contract for the platform. It defines the stack, runtime shape, folder layout, API approach, data flow, AI architecture, PWA strategy, and the path to native mobile.

---

## 1. Architectural Principles

1. **API-first monolith.** One Next.js app serves all surfaces (public site, admin, owner, guest, staff). Server logic is written as if it were a separate API so mobile clients can call it later without refactor.
2. **Server components by default, client where needed.** Finance tables, dashboards, reports: server components + server actions. Interactive modals, drag-drop task boards, chat: client components.
3. **One canonical domain model.** The database schema is the source of truth. Zod schemas are derived from (or aligned to) the DB. No DTO divergence.
4. **Strict permission layer.** Every read and every write goes through a policy that checks `(user, action, resource)`. Enforced at two layers: RLS in Postgres (hard boundary) and application-level guards (UX + pre-filter).
5. **Event-sourced edges, state-based core.** Finance entries and access events are append-only. Operational state (villa status, task status) is mutable but changes emit events to an audit stream.
6. **No direct third-party calls in route handlers.** All external services (Airbnb, WhatsApp, Hostaway, lock APIs) sit behind `services/<integration>/adapter.ts` with typed interfaces and swappable implementations.
7. **AI runs in the user's permission scope.** The AI gateway calls the retrieval layer with the user's session; the LLM only sees retrieved, permission-filtered snippets with citations.
8. **PWA-ready from v1.** We do not add PWA later. Service worker, install prompt, offline shell, and background sync are in the v1 shell.

---

## 2. Target Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 15+ (App Router)** | SSR/RSC, server actions, streaming, built-in caching, Turbopack |
| UI runtime | **React 19** | Concurrent rendering, Actions, `use()`, Server Components stable |
| Language | **TypeScript 5.5+ (strict)** | Type safety across the stack |
| Styling | **Tailwind CSS v4** | Native CSS layers, variant-first, fast |
| Design primitives | **Radix UI** + **shadcn/ui** (customized, not stock) | Headless + accessible + fully themeable |
| Motion | **Framer Motion** (scoped) + view-transitions API | Controlled, tasteful motion |
| Charts | **Visx** or **Recharts** for dashboards; custom SVG for hero metrics | Avoid generic chart-library feel |
| Forms | **React Hook Form** + **Zod** | Schema-driven validation, DX |
| Data / ORM | **Drizzle ORM** (primary recommendation) or Prisma | Drizzle: SQL-close, better for RLS and migrations |
| Database | **PostgreSQL 16+** via **Supabase** | RLS, triggers, JSONB, realtime |
| Auth | **Supabase Auth** + custom claims | Email, magic link, OAuth, SSO-ready |
| Storage | **Supabase Storage** | S3-compatible, signed URLs |
| Realtime | **Supabase Realtime** (Postgres changes) + SSE for AI streams | Task updates, inbox, status board |
| Queue / Jobs | **pg-boss** (Postgres-native) or **Inngest** | Scheduled monthly close, statement gen, reminders |
| Email | **Resend** or **Amazon SES** | Transactional, owner statements |
| PDF | **React-PDF** (server) + Puppeteer fallback for complex reports | Statements, POs, certificates |
| Observability | **Sentry** (FE+BE), **Axiom** or **Logtail** for logs, **OpenTelemetry** for traces | One pane of glass |
| Infra | **Vercel** (web) + **Supabase** (DB/Auth/Storage) + **Fly.io** or AWS ECS for PDF/RTSP worker | Managed, fast |
| CI/CD | **GitHub Actions** | Lint, typecheck, test, migrate, deploy |
| Testing | **Vitest** (unit), **Playwright** (e2e), **Storybook** (components) | 80% coverage on finance + permissions |
| Feature flags | **ConfigCat** or self-hosted flags table | Staged rollout of AI & integrations |
| AI gateway | Provider-agnostic: Anthropic Claude (primary), OpenAI (fallback), Vertex (IDN residency option) | Abstract behind `lib/ai/provider.ts` |

> **Decision rule:** prefer managed services in Year 1 (Vercel + Supabase). Revisit self-hosting on Indonesia-residency requirements when Supabase Singapore region is confirmed for primary data.

---

## 3. Top-Level Runtime Topology

```
                          ┌──────────────────────────────────────┐
                          │        Browsers / PWA / Mobile       │
                          │  (public, admin, owner, guest, staff)│
                          └──────────────┬───────────────────────┘
                                         │ HTTPS (RSC, Server Actions, REST, SSE)
                          ┌──────────────▼───────────────────────┐
                          │       Next.js App on Vercel          │
                          │  – App Router routes & RSC           │
                          │  – Server Actions                     │
                          │  – Route Handlers (REST/SSE)          │
                          │  – Middleware (auth, tenant, locale)  │
                          └──────┬────────────┬──────────┬───────┘
                                 │            │          │
                 ┌───────────────▼─┐   ┌──────▼──────┐  ┌▼──────────────┐
                 │ Supabase Postgres│   │Supabase Auth│  │Supabase Storage│
                 │ (RLS, triggers,  │   │             │  │ (docs, photos) │
                 │  pg-boss queue)  │   └─────────────┘  └────────────────┘
                 └──────┬───────────┘
                        │  (Postgres NOTIFY, Realtime)
                        ▼
                 ┌───────────────┐
                 │ Realtime SSE  │──► browsers (task board, inbox)
                 └───────────────┘

             ┌────────────────── Side services ──────────────────┐
             │ PDF worker (Fly.io)                               │
             │ RTSP/camera proxy (Fly.io)                        │
             │ AI gateway (Vercel Function, streaming)           │
             │ Integration adapters (Vercel Functions)           │
             │ Scheduled jobs (pg-boss in Postgres)              │
             └───────────────────────────────────────────────────┘
```

---

## 4. Folder Structure

Monorepo-light, single deployable. Use `pnpm` workspaces only if we break out the mobile worker later.

```
management/
├── docs/                           # this folder (product + tech docs)
├── public/                         # static assets; PWA manifest, icons
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (marketing)/            # public site — brand surface
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # home
│   │   │   ├── villa-management/page.tsx
│   │   │   ├── owner-portal/page.tsx
│   │   │   ├── investor-reporting/page.tsx
│   │   │   ├── guest-experience/page.tsx
│   │   │   ├── operations/page.tsx
│   │   │   ├── portfolio/page.tsx
│   │   │   ├── case-studies/[slug]/page.tsx
│   │   │   └── contact/page.tsx
│   │   │
│   │   ├── (auth)/                 # sign-in, sign-up, magic link, reset
│   │   │   ├── sign-in/page.tsx
│   │   │   ├── sign-up/page.tsx
│   │   │   └── callback/route.ts
│   │   │
│   │   ├── app/                    # admin dashboard (internal staff)
│   │   │   ├── layout.tsx          # nav shell, tenant switcher
│   │   │   ├── page.tsx            # portfolio overview
│   │   │   ├── projects/...
│   │   │   ├── villas/...
│   │   │   ├── bookings/...
│   │   │   ├── guests/...
│   │   │   ├── channels/...
│   │   │   ├── finance/
│   │   │   │   ├── revenue/
│   │   │   │   ├── expenses/
│   │   │   │   ├── taxes/
│   │   │   │   ├── fees/
│   │   │   │   ├── reserves/
│   │   │   │   ├── payouts/
│   │   │   │   └── statements/
│   │   │   ├── owners/...
│   │   │   ├── shares/...
│   │   │   ├── operations/
│   │   │   │   ├── status-board/
│   │   │   │   ├── housekeeping/
│   │   │   │   ├── maintenance/
│   │   │   │   ├── preventive/
│   │   │   │   └── tasks/
│   │   │   ├── inventory/...
│   │   │   ├── procurement/...
│   │   │   ├── suppliers/...
│   │   │   ├── documents/...
│   │   │   ├── crm/...
│   │   │   ├── inbox/...
│   │   │   ├── access/...          # smart access
│   │   │   ├── cameras/...
│   │   │   ├── reports/...
│   │   │   ├── ai/...
│   │   │   ├── settings/...
│   │   │   └── audit/...
│   │   │
│   │   ├── owner/                  # investor/owner portal
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # portfolio dashboard
│   │   │   ├── villas/[id]/...
│   │   │   ├── statements/...
│   │   │   ├── documents/...
│   │   │   ├── approvals/...
│   │   │   └── assistant/page.tsx  # AI Investor Assistant
│   │   │
│   │   ├── stay/                   # guest portal (tokenized)
│   │   │   └── [token]/
│   │   │       ├── page.tsx
│   │   │       ├── check-in/page.tsx
│   │   │       ├── guide/page.tsx
│   │   │       ├── services/page.tsx
│   │   │       └── concierge/page.tsx
│   │   │
│   │   ├── field/                  # staff mobile PWA surface
│   │   │   ├── layout.tsx          # mobile shell
│   │   │   ├── page.tsx            # today's tasks
│   │   │   ├── tasks/[id]/page.tsx
│   │   │   ├── checklist/[id]/page.tsx
│   │   │   ├── maintenance/[id]/page.tsx
│   │   │   ├── inventory/page.tsx
│   │   │   └── purchase-request/page.tsx
│   │   │
│   │   ├── api/                    # REST + SSE route handlers
│   │   │   ├── v1/
│   │   │   │   ├── bookings/...
│   │   │   │   ├── villas/...
│   │   │   │   ├── finance/...
│   │   │   │   ├── tasks/...
│   │   │   │   ├── inventory/...
│   │   │   │   ├── integrations/hostaway/webhook/route.ts
│   │   │   │   ├── integrations/whatsapp/webhook/route.ts
│   │   │   │   ├── integrations/stripe/webhook/route.ts
│   │   │   │   └── ai/chat/route.ts  # SSE
│   │   │   └── health/route.ts
│   │   │
│   │   └── (legal)/privacy/page.tsx, terms/page.tsx
│   │
│   ├── components/                 # shared UI components
│   │   ├── ui/                     # shadcn primitives, themed
│   │   ├── charts/
│   │   ├── finance/                # money formatters, ledger table
│   │   ├── ops/                    # status badges, task cards
│   │   ├── motion/                 # reusable motion presets
│   │   ├── layout/                 # shells, nav, footer
│   │   └── ai/                     # chat UI, suggestion chips
│   │
│   ├── features/                   # feature-scoped modules
│   │   ├── finance/
│   │   │   ├── domain.ts
│   │   │   ├── services/
│   │   │   ├── statements.ts
│   │   │   ├── allocations.ts
│   │   │   └── currency.ts
│   │   ├── bookings/
│   │   ├── operations/
│   │   ├── inventory/
│   │   ├── access/
│   │   ├── crm/
│   │   ├── inbox/
│   │   ├── cameras/
│   │   └── ai/
│   │
│   ├── lib/                        # cross-cutting infra
│   │   ├── db/                     # Drizzle client, schema, migrations, rls
│   │   ├── auth/                   # Supabase client, session helpers
│   │   ├── permissions/            # policy engine
│   │   ├── ai/                     # provider, retrieval, prompts, guards
│   │   ├── integrations/           # adapters + webhooks
│   │   ├── pdf/                    # templates, renderers
│   │   ├── currency/               # FX, formatting
│   │   ├── date/                   # Bali tz, period helpers
│   │   ├── i18n/                   # en, id
│   │   ├── realtime/
│   │   ├── queue/                  # pg-boss wrappers
│   │   ├── storage/
│   │   ├── audit/
│   │   └── telemetry/
│   │
│   ├── server/                     # server-only code, entry points
│   │   ├── actions/                # server actions per feature
│   │   ├── handlers/               # REST handlers
│   │   └── webhooks/
│   │
│   ├── styles/                     # global css, tokens
│   ├── config/                     # app config, flags, env schema
│   └── types/                      # shared types
│
├── prisma/  OR  drizzle/           # schema + migrations
├── tests/                          # e2e + integration
├── .env.example
├── next.config.mjs
├── tailwind.config.ts
└── package.json
```

---

## 5. Frontend Approach

### 5.1 Rendering strategy
- **Public marketing pages:** static or ISR, streamed from the edge, aggressive caching.
- **Admin dashboard:** dynamic RSC with short-TTL cache + `revalidateTag` on writes.
- **Owner portal:** RSC with per-user cache keys; statements are precomputed and stored.
- **Guest portal:** RSC with signed token; cached per booking.
- **Staff field:** heavy client, optimistic updates, background sync.

### 5.2 Data fetching
- Server components fetch via feature `services/*.ts` functions that call Drizzle + enforce permissions.
- Client components use **TanStack Query** only where needed (live task board, inbox, chat).
- Mutations use **server actions** with Zod validation and typed error returns (no thrown errors across the RSC boundary for expected validation).

### 5.3 State management
- **URL state** first (filters, pagination, period selection).
- **Server state** via RSC + query.
- **Local UI state** via React state / `useReducer`.
- No Redux, no Zustand unless a specific complex flow demands it (field offline queue).

### 5.4 Theming
- Dark / light via `next-themes` + Tailwind v4 CSS variables.
- Tokens defined once in `styles/tokens.css`. Two themes: **Arc Editorial Light**, **Arc Editorial Dark**.
- Never hard-code colors in components; always reference tokens.

### 5.5 Accessibility
- WCAG 2.2 AA baseline.
- All interactive elements keyboard-navigable; Radix primitives handle most of it.
- `prefers-reduced-motion` respected in motion presets.
- Focus rings are part of the design, not an afterthought.

---

## 6. Backend Approach

### 6.1 Layers
```
Route / Server Action / Webhook  (thin)
        │
        ▼
  Feature service  (features/*/services)  ← business logic lives here
        │
        ▼
  Domain model + Drizzle queries
        │
        ▼
  PostgreSQL (RLS)
```

Business rules never leak into route handlers. Route handlers authenticate, validate input, call the service, format the response.

### 6.2 Permissions policy engine

`lib/permissions/` exports:
```ts
can(session, 'finance.statement.read', { ownerId, villaId })
```
Evaluates against role → permission matrix + ABAC scope (project, villa, owner). Application layer uses it to show/hide and pre-filter; RLS enforces the hard boundary at DB level. Two-layer defense is mandatory.

### 6.3 API strategy

Three API modes, all first-class:

1. **RSC + Server Actions** (primary, same-origin, cookie auth). Used by our own web app.
2. **REST under `/api/v1/*`** (JSON, bearer-token auth via PAT or OAuth). Used by webhooks, integrations, future mobile.
3. **SSE streams** for AI chat and live notifications.

Contracts:
- All REST endpoints are documented with **OpenAPI** auto-generated from Zod schemas (`zod-to-openapi`).
- Versioned: `/api/v1`, `/api/v2` when breaking.
- Idempotency header required on all mutating requests (`Idempotency-Key`).
- Pagination: cursor-based by default (`limit`, `cursor`).
- Error envelope: `{ error: { code, message, details?, requestId } }`.

### 6.4 Data flow — canonical write example (creating a booking)

1. POST `/api/v1/bookings` or server action `createBooking(input)`.
2. Zod validates input.
3. Auth resolves session; `can(session, 'bookings.create', { villaId })` → ok.
4. Service `features/bookings/services/createBooking.ts`:
   - Opens DB transaction.
   - Checks villa availability (lock row).
   - Creates `bookings` row.
   - Creates `guests` row (or attaches existing).
   - Creates `revenue_lines` (nightly + cleaning + upsells).
   - Creates `fee_lines` (OTA commission, payment fee) — computed from channel config.
   - Emits audit event.
   - Enqueues pg-boss jobs: `send_confirmation_email`, `generate_guest_token`, `push_to_channel_manager_if_direct`.
   - Commits.
5. Response returns the created booking + revenue snapshot.
6. Realtime broadcast to status board.
7. On checkout date, a scheduled job recognizes revenue into the monthly ledger.

### 6.5 Monthly close pipeline

A scheduled pipeline (`queue/monthly-close.ts`) runs on configurable day of month:
1. Freeze prior month (no more writes to that period without approval).
2. Apply allocation rules → shared cost splits.
3. Compute per-villa P&L.
4. Apply management fee + reserve contributions.
5. Generate statement drafts.
6. Notify Finance Manager for review.
7. On approval → PDF generation → storage → owner notification → publish in portal.
8. Immutable hash of statement stored; future edits create amendment statements, never silent rewrites.

### 6.6 Webhooks & integrations

- Each integration has a dedicated webhook route `/api/v1/integrations/<name>/webhook`.
- Signature verification required.
- Webhook handler does the minimum: validate → enqueue → 200.
- Real processing happens in a worker.

---

## 7. Database Architecture (high level)

Detailed schema lives in `DATABASE_SCHEMA.md`. Architecture notes:

- **Schema:** `public` for application; `audit` for immutable logs; `integrations` for external sync state; `ai` for AI logs.
- **IDs:** UUIDv7 (time-sortable) throughout.
- **Timestamps:** `created_at`, `updated_at`, `deleted_at` (soft delete where appropriate).
- **Money:** stored as BIGINT minor units (rupiah, cents) + currency code; never float.
- **Multi-currency:** every money row carries `amount_minor`, `currency`, `fx_rate_to_base`, `base_amount_minor` (IDR).
- **Time:** stored UTC, displayed in `Asia/Makassar` (WITA) for Bali operations; per-user override possible.
- **RLS:** on every tenant-scoped table; policies codified under `lib/db/rls/*.sql`, version-controlled.
- **Extensions:** `uuid-ossp`, `pgcrypto`, `pg_trgm`, `pgaudit`, `pg_stat_statements`.
- **Full-text search:** `pg_trgm` + `tsvector` columns for bookings, guests, documents.
- **Vector search:** `pgvector` for AI retrieval (embeddings of documents, policies, guest messages).

---

## 8. AI Architecture

The AI system is a permission-aware RAG + tool-use layer. It does not run free.

### 8.1 Components
```
User ──► Assistant UI ──► AI Gateway (/api/v1/ai/chat)
                                │
                                ▼
                         ┌───────────────┐
                         │  Orchestrator │  (LangGraph-style, custom small)
                         └──┬────────┬───┘
                            │        │
              ┌─────────────▼─┐    ┌─▼──────────────┐
              │   Retrieval   │    │     Tools      │
              │  (RLS-aware)  │    │ (actions w/RBAC)│
              └──┬────────────┘    └─┬──────────────┘
                 │                   │
            pgvector + SQL     Domain services
                 │                   │
                 └────────┬──────────┘
                          ▼
                    LLM provider  (Claude / OpenAI / Vertex)
                          │
                          ▼
                  Streamed response
                          │
                          ▼
                   Audit + citations
```

### 8.2 Hard rules
- Every AI turn runs inside the requesting user's auth context. Retrieval calls use the **same DB client** with RLS. There is no "service role" for AI reads.
- The orchestrator builds a *grounding set* only from retrieved rows. The system prompt forbids answering finance/ops questions without citations.
- Tools (write-capable actions) are gated by `can()` before execution and require explicit user confirmation for anything beyond read-only.
- Every AI request, tool call, and response is logged in `ai.assistant_events` with prompts, retrieved IDs, citations, latency, provider, token count.
- The retrieval step can refuse: if `result.isEmpty && question.isFinance`, the assistant must say *"I don't have access to that data"*. Fabrication is a P0 bug.

### 8.3 Providers
- Primary: Anthropic Claude (strong reasoning, structured output).
- Fallback: OpenAI (GPT class) via feature flag.
- Residency-sensitive deployments: Vertex AI (Singapore) for owners who require it.

### 8.4 Embeddings
- Use OpenAI `text-embedding-3-large` or Cohere embed v3.
- Embedded sources: villa guides, house rules, policies, historical statements narratives, maintenance playbooks, supplier catalogs.
- Guest messages and invoice text embedded for semantic search (separate namespaces).

### 8.5 Prompts & guardrails
- Per-assistant system prompts live in `lib/ai/prompts/<assistant>.md`, versioned.
- Each prompt explicitly states scope, forbidden data, tone, citation format, and escalation path.
- Output constrained via structured output schemas for high-risk flows (finance explanations, owner responses).

---

## 9. PWA Strategy

Baseline from v1:
- Web App Manifest for all surfaces with distinct install IDs (admin, owner, guest, field).
- Service worker via **`@serwist/next`** (maintained fork of next-pwa), per-surface caching strategies:
  - Marketing: stale-while-revalidate, long cache.
  - Admin / Owner: network-first, no offline writes.
  - Guest: network-first with short cache for stay page.
  - Field: **cache-first shell + IndexedDB queue** for task completions (offline-capable).
- Push notifications via Web Push (VAPID) from v3 for owner statements and v4 for task assignments.

### Field (staff) PWA specifics
- Offline queue in IndexedDB: task completions, photo uploads, inventory use.
- Background sync: flushes when connection returns; uploads photos to Supabase Storage with resumable uploads (TUS or chunked).
- Installable with "Add to Home Screen"; distinct icon; mobile-optimized auth (PIN code after first magic link).

---

## 10. Future Mobile Strategy (v10)

Our API-first posture means native apps are not a rewrite — they consume `/api/v1`.

- **Framework:** React Native via Expo, or native Swift/Kotlin if we need deep camera/lock SDKs.
- **Shared:** Zod schemas, types, permission constants published as an internal package.
- **Auth:** Supabase JS works on React Native; token exchange identical.
- **Priority surfaces:**
  1. Field (staff) — already PWA, may stay PWA unless hardware integration needed.
  2. Guest — native push, Apple Wallet boarding-pass-style stay card.
  3. Owner — native biometric auth; investor-grade look.
- **Realtime:** same SSE / WebSocket endpoints.

Until v10, **we do not build native**. PWA covers it.

---

## 11. Environments & Release

| Env | Purpose | Data |
|---|---|---|
| `local` | dev | seeded fake data |
| `preview` | PR previews on Vercel | ephemeral DB branch (Supabase branching) |
| `staging` | pre-prod | anonymized prod snapshot, refreshed weekly |
| `production` | live | real data |

Release process:
1. PR → CI (lint, typecheck, unit, integration, e2e smoke).
2. Migration review (Drizzle migration files required in PR; reviewed separately).
3. Merge → auto-deploy staging.
4. QA smoke.
5. Tag release → production deploy.
6. Post-deploy health check + Sentry release tag + feature-flag staged rollout.

---

## 12. Observability & SRE

- **Logs:** structured JSON via pino, shipped to Axiom/Logtail. Request ID propagated across server actions, jobs, integrations.
- **Traces:** OpenTelemetry traces for server actions and integration calls.
- **Metrics:** business metrics (statements generated, payouts sent, task SLA) exported to an internal metrics table + dashboards.
- **Alerts:** Sentry (errors), PagerDuty-equivalent for P1 incidents (payment webhook failures, statement generation failures).
- **SLOs:** admin p95 < 600ms, owner portal p95 < 800ms, guest portal p95 < 500ms, AI first token < 1.5s, field write success > 99.5% including offline retries.

---

## 13. Security Architecture

- **Auth:** Supabase Auth; sessions in HTTP-only cookies; refresh token rotation.
- **MFA:** TOTP from v2 for Super Admin, Director, Finance Manager. Universal MFA from v3.
- **Authorization:** RBAC + ABAC as described. RLS is non-negotiable and CI-tested.
- **Secrets:** Vercel/Supabase secret managers; no secret in code.
- **Environment isolation:** separate Supabase projects for staging and production.
- **Encryption:** TLS everywhere, at-rest by provider; document hashes stored for tamper-detection.
- **PII minimization:** guest data tokenized for analytics.
- **Audit:** append-only `audit.events` with actor, action, resource, before/after (diffed), request ID. Retention ≥ 7 years for financial events.
- **Rate limiting:** per-IP and per-user on `/api/v1` via Vercel KV or Upstash.
- **CSP:** strict, nonce-based. No inline scripts beyond framework shim.
- **Backup:** Supabase PITR + daily logical dumps to private S3 bucket, encrypted.

---

## 14. Internationalization

- **Languages at v1:** English (default), Bahasa Indonesia.
- **Approach:** `next-intl` with message catalogs; locale by subpath or user preference.
- **Currencies:** IDR (base), USD (display toggle for investors); all financial values stored in base + display-converted at render.
- **Timezones:** store UTC, render in `Asia/Makassar` unless user overrides.
- **Number / date format:** driven by locale + explicit overrides; owners can pick "USD / en-US" or "IDR / id-ID" independently.

---

## 15. Non-Functional Requirements

- **Uptime target:** 99.9% monthly.
- **Data durability:** 99.999999999% (Supabase + offsite backup).
- **Max page weight** (marketing): 250 KB JS, LCP < 2.0s on 4G.
- **Max admin page weight:** 500 KB JS post-cache.
- **Contrast:** AA minimum, AAA on report surfaces.
- **Browser support:** last 2 versions of Chrome, Safari, Firefox, Edge; iOS Safari 16+.

---

## 16. Build / Tooling

- **Package manager:** `pnpm`.
- **Monorepo:** single root for now; workspace later for mobile.
- **Linting:** ESLint + `@typescript-eslint` + `eslint-plugin-boundaries` to enforce feature isolation.
- **Formatting:** Prettier + Tailwind class sorter.
- **Git hooks:** `lint-staged` + `commitlint` (Conventional Commits).
- **Type generation:** Drizzle → TypeScript types; Zod is the single source for runtime validation.
- **CI matrix:** Node 20 LTS; test against Postgres 16.

---

## 17. Decisions Deferred to v1+

- Drizzle vs Prisma (recommend Drizzle; revisit after first migration pass).
- pg-boss vs Inngest (start pg-boss; move to Inngest if job volume explodes).
- Self-hosted Supabase vs managed (managed through v8 minimum).
- GraphQL layer (not planned; REST + RSC is enough).

All deferrals require an ADR (`docs/adr/NNN-*.md`) when decided.
