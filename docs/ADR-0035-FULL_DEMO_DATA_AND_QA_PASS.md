# ADR-0035 — Full Demo Data Rebuild + End-to-End QA Pass (Prompt 112)

## Status
Accepted. Implemented across `src/features/demo-data/*`,
`scripts/demo-rebuild.ts`, `scripts/validate-demo-data.ts`,
`src/components/system/{migration-pending-card,empty-state-card,query-warning-card}.tsx`,
the `/dashboard/demo` walkthrough route, additional `safeCount`/`safeList`
adoption across high-risk admin dashboards, the
[QA walkthrough doc](./QA-DEMO-WALKTHROUGH.md), and `npm run demo:rebuild`
+ `npm run demo:validate` scripts.

## Context
After eleven prompts of feature work, the platform was complete in
business logic but uneven in operator experience:

1. The seed (`drizzle/seed.sql`, ~5k lines) covered ~90% of tables but
   the coverage was scattered through ad-hoc append blocks. There was
   no canonical inventory describing what is seeded where, what
   minimum row counts to expect, or how the cross-module fixtures
   relate.
2. Several admin pages crashed when a recently-added migration had
   not been applied (`Failed query: select count(*) from
   "guest_stay_security_events"`). Prompt 111 introduced
   `safeCount` / `safeList` but only the new P111 routes used them.
3. There was no single demo launchpad — operators had to remember
   ~30 routes to walk a demo end-to-end.
4. There was no automated check that owner-facing seed contains no
   real-looking PII / no banned internal token leaks.
5. There was no script to refresh derived projections (owner-visible
   events, owner-booking summaries, owner-revenue source mix,
   statement transparency) after a fresh seed — operators had to
   manually click "Rebuild" buttons in the admin UI.

Prompt 112 closes all of these without changing business logic.

## Decision

### 1. Demo-data architecture
A new `src/features/demo-data/` module is the canonical TypeScript
inventory:

| File | Purpose |
|---|---|
| `demo-ids.ts` | Stable UUIDs for every cross-referenced fixture (projects, villas, owners, holds, requests, finance links, guest-status snapshots, owner-booking summaries). |
| `demo-dates.ts` | Anchored demo timeline (2026 Q2 + Q3). Shifting the demo forward is one constant change. |
| `constants.ts` | `DEMO_MIN_ROW_COUNTS`, `BANNED_PROJECTION_TOKENS`, `PII_PATTERNS`, demo email-domain rule (`@example.test`), demo guest-label list, doc-only token placeholders. |
| `seed-summary.ts` | Module-by-module summary of what `drizzle/seed.sql` inserts. Drives the validator. |
| `validate-demo-data.ts` | Pure validator: takes count + projection-fetch callbacks, returns a structured report with row-count checks + projection scan findings. |
| `demo-scenarios.ts` | Declarative list of 9 walkthrough scenarios (owner / guest / direct booking / field / vendor / finance / operations / pricing / security & jobs). Both the `/dashboard/demo` page and the QA doc consume this list. |

Why TS instead of more SQL? The seed already covers row inserts. The
TS layer documents *what's there* and lets the validator + walkthrough
route reason about it without re-reading the SQL.

### 2. Demo data design principles
- **Stable UUIDs.** Every cross-referenced fixture has a deterministic
  UUID exported from `demo-ids.ts`. Re-running `npm run db:seed` does
  not break links from `owner_booking_summaries.statement_id` →
  `owner_statements.id`.
- **`@example.test` domain.** RFC 6761 reserves `.test` for testing.
  All demo emails use this domain (or `.demo` subdomains for
  intentionally-fake vendor handles).
- **Masked guest labels only.** Owner-facing seed never inserts a
  full guest name, email, or phone. Guest labels follow the
  first-name + last-initial pattern (`Emma W.`).
- **Token plaintext is never persisted.** Direct-booking holds and
  guest-stay tokens store SHA-256 hashes only; the QA doc shows how
  to mint a live raw token.
- **Idempotent inserts.** Every seed block uses `ON CONFLICT DO
  NOTHING` or `INSERT … ON CONFLICT DO UPDATE`, guarded by
  `IF EXISTS (SELECT 1 FROM information_schema.tables …)` so a partial
  / older database runs the seed without errors.

### 3. Seed idempotency strategy
Pre-existing pattern, formalised here:
- Each module's seed block opens with `DO $$ BEGIN IF NOT EXISTS
  (SELECT 1 FROM information_schema.tables WHERE table_name = 'X')
  THEN RAISE NOTICE 'X table not present — skipping'; RETURN; END IF;
  …`.
- Inserts use stable UUIDs (`'1eda…'` namespace prefix) so re-runs
  produce no row churn.
- Conditional inserts that depend on rows that may not yet exist
  (e.g. `direct_booking_finance_links` referencing a request)
  guard with `IF EXISTS (SELECT 1 FROM direct_booking_requests
  WHERE id = '…')`.

### 4. Projection rebuild strategy
`scripts/demo-rebuild.ts` runs four projection rebuilds in sequence,
each via a direct import of the existing server function:
- `rebuildOwnerVisibleEventsForAllOwners` (Prompt 102)
- `rebuildOwnerBookingSummariesForAllOwners` (Prompt 108)
- `rebuildOwnerRevenueSourceMonthlyForAllOwners` (Prompt 108)
- `rebuildAllStatementTransparency` (Prompt 110)

Wired as `npm run demo:rebuild` (uses `--env-file=.env.local` like the
existing migrate / seed scripts). Failures on any one step are logged
but do not abort the rest — a missing optional projection never
blocks a fresh demo environment.

### 5. Demo validation script
`scripts/validate-demo-data.ts` (`npm run demo:validate`):
- Counts every table in `expectedMinCounts()`. Missing-relation
  errors are surfaced as failures with a clean message.
- Scans the most exposure-prone owner / public projection tables
  (`owner_booking_summaries`, `owner_booking_revenue_breakdowns`,
  `statement_explanation_snapshots`,
  `direct_booking_guest_status_snapshots`,
  `direct_booking_guest_notifications`) for:
  - `BANNED_PROJECTION_TOKENS` (revenue_line_id, finance_link_id,
    statement_period_id, providerSessionId, webhookPayload,
    tokenHash, etc.),
  - real-looking emails (anything `@<not-example.test>`),
  - real-looking phones (`+` followed by ≥ 7 digits),
  - long base64-ish blobs (likely tokens or hashes).
- Exits with code 0 (OK), 1 (FAILED), or 2 (DB unavailable).

### 6. Dashboard resilience strategy
Three reusable components in `src/components/system/`:

- `MigrationPendingCard` — shown when a recently-added table isn't
  present yet. Bundles the table name with a `npm run db:migrate`
  hint.
- `EmptyStateCard` — polished empty state with optional CTA. Used
  when a query succeeded but returned zero rows.
- `QueryWarningCard` — translates a `SafeReadResult` into either a
  `MigrationPendingCard`, a "database unavailable" notice, or a
  generic warning, while always letting the page render its
  fallback view.

Adoption pass: Prompt 112 wired `safeCount` / `safeList` +
`QueryWarningCard` into the listed high-risk dashboards (`/guest-stays/security`,
`/guest-ai/storage`, `/maintenance-intelligence`, `/utilities`,
`/pricing`, `/jobs`). Mutation paths still throw — surfacing real
errors on writes is intentional. Read paths degrade gracefully.

The remaining ~12 admin dashboards already use `if (!db) return …`
guards — they're not crash-prone, just less polished. Future prompts
can adopt the same pattern incrementally.

### 7. Demo walkthrough route
`/dashboard/demo` renders the 9-scenario launchpad declaratively from
`demo-scenarios.ts`. Each card lists:
- the category (owner portal / guest stay / direct booking / field /
  vendor / finance / operations / pricing / security & jobs),
- what to verify ("expect"),
- the live links (with `requires live token` badges where the
  fixture cannot pre-mint a raw token),
- caveats (per-card),
- env hints (per-card, when relevant).

Wired into navigation under System.

### 8. QA walkthrough doc
[`docs/QA-DEMO-WALKTHROUGH.md`](./QA-DEMO-WALKTHROUGH.md) is the
screenshot-ready checklist. It covers:
- Local startup (install / env / migrate / seed / rebuild / validate
  / dev).
- Required env table.
- Demo users.
- 12 walkthrough sections (admin, owner, guest, direct booking,
  field, vendor, finance, operations, pricing, security/system,
  expected limitations, expected validation outcomes).

Pair with `/dashboard/demo` for click-through.

## Consequences

### Positive
- A single command (`npm run demo:validate`) gives operators a
  pass/fail signal on the demo before showing it to anyone.
- A single command (`npm run demo:rebuild`) refreshes every derived
  projection — operators no longer click rebuild buttons in the
  admin UI to set up a clean demo.
- Failed-query crashes on the listed dashboards are replaced with a
  polished "Migration pending" card; environment readiness is
  always one click away on `/dashboard/system/health`.
- `/dashboard/demo` is the single launchpad; operators can hand the
  URL to anyone evaluating the platform.
- The seed is now self-documenting via `seed-summary.ts` — adding
  a new module just means appending a `DemoSeedModule` entry +
  adjusting the row-count floor.

### Negative / risks
- The validator depends on the seed actually running successfully.
  In an environment where `npm run db:seed` partially failed, the
  validator will report the missing rows but cannot fix them.
- Token-bound demo flows (guest stay, direct booking public status
  page, vendor portal) still require operators to mint a live token
  — the QA doc walks through this but it's not zero-touch.
- The resilience adoption is partial. Eight high-risk dashboards
  now use `safeCount` / `safeList`; the remaining ~12 are not yet
  hardened. This is intentional — surface area too large for a
  single prompt — and future prompts (especially Prompt 113
  production deployment) can address each remaining route.
- The PDF renderer still loads the snapshot best-effort; if the
  renderer crashes on a malformed snapshot we fall back to the
  deterministic explanation but log the error. Acceptable for demo
  use; production should monitor PDF render failures.

### Out of scope (deferred)
- A single tsx-based seed runner that imports business logic to
  insert data (instead of raw SQL). The current SQL seed is
  battle-tested; switching to TS-only seeding is a separate
  decision.
- A demo-mode bypass for MFA + login throttle on `localhost`.
  Today's flow lets enrolment succeed but does not gate sign-in;
  Prompt 113 will tighten this.
- Snapshots of every dashboard for a screenshot-driven regression
  suite. Manual click-through via the QA doc is the current bar.
- Resilience adoption for the remaining ~12 admin dashboards —
  they already have `if (!db) return` guards but no
  `MigrationPendingCard` polish.

## Recommended next prompt
**Prompt 113 — Production Deployment Readiness & Environment Setup**:
prepare the Management OS for staging/production deployment: env
validation, Supabase migration checklist, storage bucket provisioning
checklist, Vercel cron config, domain/subdomain routing, security env
gates, production seed strategy, monitoring/logging baseline, and
deployment runbook. No new business features.
