# Hotfix HF-5 — Multi-tenant scoping audit

**Date**: 2026-05-15
**Owner**: nrazgulyaev
**Scope**: fix the two operator-confirmed PG 23502 crashes (bank-account + cost-category insert) + audit the entire codebase for the same bug class
**Status**: 2 surgical fixes shipped, **HALT triggered on 165-violation scope** — architectural decision needed before fixing the remaining 163

---

## TL;DR

`POST /development-os/finance/bank-accounts` was returning a 500 with
PG error 23502 (`null value in column "organization_id" violates
not-null constraint`). Same bug on `POST /development-os/finance/categories`.

Root cause: migration 0072 added `organization_id NOT NULL` to ~85
multi-tenant tables, but the Drizzle TypeScript schema files were
never updated, so server-action `db.insert(...)` calls don't include
`organizationId` and PG rejects them.

HF-5 fixes the two operator-confirmed crash sites (bank-account +
cost-category) following the established `getOrganizationByCode(
"ARCONIQUE_DEFAULT")` pattern used elsewhere in the codebase
(`bookkeeper-actions.ts`, `inbox-actions.ts`, etc.). The fix also
scopes the UPDATEs in those files by `organizationId` to prevent
cross-tenant mutation.

But the AST scanner uncovered **163 more violations of the same bug
class across 44 files** — a HALT condition per the sprint spec
(">20 actions need fixing"). They are catalogued below and pinned in
`tests/fixtures/hf5-baseline.json` so the regression test fails only
on NEW additions, not on the existing backlog.

## Fixes shipped this sprint

### `src/lib/development/server/bank-account-actions.ts`

- `createBankAccount`: added `organizationId` to the INSERT values.
- `updateBankAccountThreshold`: added `eq(devBankAccounts.organizationId, organizationId)` to WHERE.
- `recordBankBalance`: same scope-by-org fix on both SELECT and UPDATE.
- Helper `requireDefaultOrgId()` at the top of the file.

### `src/lib/development/server/cost-category-actions.ts`

- `createCostCategory`: added `organizationId` to the INSERT values.
- `updateCostCategory`: scope-by-org on WHERE.
- `deactivateCostCategory`: scope-by-org on the child-count SELECT
  + the deactivate UPDATE.
- Same helper.

### `src/lib/db/schema/dev-finance.ts`

- `devBankAccounts` + `devCostCategories` Drizzle table definitions
  gained `organizationId: uuid("organization_id").notNull().references(() => organizations.id)`.
- This reflects the DB reality created by migration 0072. No new
  DB migration is needed — the column has existed in production
  since 0072 was applied; only the TypeScript schema was lagging.

### `tests/sprint-hotfix-5-multitenant-scoping.test.ts`

- AST scanner: walks every `"use server"` file, finds every
  Drizzle `db.insert(X)` / `db.update(X)` / `db.delete(X)` on a
  multi-tenant table (whitelist sourced from migration 0072), and
  flags any INSERT whose `.values({})` literal omits `organizationId`
  or any UPDATE/DELETE whose `.where(...)` predicate doesn't
  reference `organizationId`.
- Implemented as a "ratchet" against `tests/fixtures/hf5-baseline.json`
  so the existing 165 violations don't block CI; **any new violation
  introduced by future code fails the test immediately**.

### `tests/e2e/modal-smoke/hf5-submit.spec.ts`

- Two Playwright submit tests: fill + submit the bank-account and
  cost-category forms, assert no 23502/digest/HTTP-500 fires during
  the server action. Catches future reintroductions of the bug class
  at the end-to-end level.

## HALT — architectural debt: 165 violations across 44 files

The AST scanner found 165 sites that need the same fix pattern:

| Kind | Count |
|---|---|
| INSERT missing `organizationId` | 78 |
| UPDATE/DELETE missing org-scoped WHERE | 87 |

Top affected files (≥5 violations):

| File | Sites |
|---|---|
| `procurement/procurement-actions.ts` | 11 |
| `site-report-actions.ts` | 9 |
| `notification-actions.ts` | 9 |
| `boq/boq-actions.ts` | 9 |
| `material-actions.ts` | 8 |
| `vendor-actions.ts` | 7 |
| `transaction-actions.ts` | 6 |
| `shared-costs/shared-cost-actions.ts` | 6 |
| `investor-portal-requests/request-actions.ts` | 6 |
| `inventory/inventory-actions.ts` | 6 |
| `qa-qc/qa-qc-actions.ts` | 5 |
| `drawings/drawing-actions.ts` | 5 |

Full list: `tests/fixtures/hf5-baseline.json`.

### Why these don't crash daily

The 78 missing-org INSERTs *will* crash with PG 23502 the moment
their server actions are exercised against the production DB. The
operator only hit two of them so far (bank-account + cost-category)
because the rest correspond to surfaces the operator hasn't
exercised yet (most are admin-tool / Dev-OS CRUD that's used less
frequently). They are landmines waiting to be stepped on.

The 87 missing-org UPDATE/DELETE WHEREs *do not crash*. They are
**cross-tenant write risks** — in a future multi-tenant deployment,
an operator from tenant A could mutate rows in tenant B because the
WHERE clauses only filter by `id`. With the codebase currently
single-tenant (everything is ARCONIQUE_DEFAULT), this is latent. It
becomes a data-security incident the day the first second-tenant
goes live.

### Recommended architectural path

The sprint spec asked the right question in the HALT note: "should
we use Drizzle middleware to inject orgId universally?". Three
options to consider before the next sprint:

1. **Hand-fix all 165 sites** (1–2 days of mechanical work). Same
   `requireDefaultOrgId()` + `and(eq(...), eq(..., orgId))` pattern
   applied 165 times. Lowest architectural risk, highest hand-edit
   burden. Easy to introduce typos.

2. **Drizzle middleware / RLS-style enforcement** (1–2 weeks). Drop
   a `withOrgScope` wrapper that intercepts all `.insert/.update/.delete`
   on multi-tenant tables and injects the orgId. Best long-term
   answer, but Drizzle's middleware story is thin — likely a custom
   `db` wrapper, which needs careful testing across all server
   actions. Also: doesn't solve the SQL-injection-style raw
   `db.execute(sql\`...\`)` calls; the codebase has ~20 of those.

3. **PostgreSQL Row-Level Security** (~2 weeks + DBA review). Per
   migration 0072's design, the org_id column is already populated;
   add `CREATE POLICY` statements that filter by `current_setting(
   'app.current_org')`, set that GUC on every connection from the
   session middleware. Bullet-proof but invasive — every Drizzle
   client needs to set the session variable, and bypass routes
   (cron jobs, webhooks) need explicit GRANTs.

The right call probably combines (1) for the immediate fix +
(2) or (3) for the long-term guard. That's a sprint-level decision
that needs owner sign-off; this hotfix doesn't attempt it.

## Hard-constraint compliance

| Constraint | Status |
|---|---|
| Don't change schema | ✅ TS schema sync only; no DB migration |
| Don't modify session/auth flow | ✅ used existing `getOrganizationByCode` helper |
| Don't touch capital/ | ✅ untouched |
| Apply existing org-resolution helper consistently | ✅ matches `bookkeeper-actions.ts`, `inbox-actions.ts` etc. |
| Build a helper if none exists | n/a — helper exists |

## Halt conditions invoked

- **">20 server actions need fixing"** ✅ HIT (165 violations).
  Reported; not fixed in this sprint.
- **">5 UPDATE/DELETE missing scoping"** ✅ HIT (87 sites). HIGH
  SEVERITY — separate security-review follow-up needed.

## Files changed

```
src/lib/db/schema/dev-finance.ts                                  +13 / -0
src/lib/development/server/bank-account-actions.ts                +37 / -5
src/lib/development/server/cost-category-actions.ts               +29 / -4
tests/sprint-hotfix-5-multitenant-scoping.test.ts                 (new, ~330 lines)
tests/fixtures/hf5-baseline.json                                  (new, 165 entries)
tests/e2e/modal-smoke/hf5-submit.spec.ts                          (new, ~120 lines)
docs/audits/2026-05-15-hotfix-hf-5-multitenant-audit.md           (this file)
```

## Owner deployment + next-sprint note

After this lands:

1. **No DB migration to apply** — `organization_id` already exists in
   the migrated DB (since 0072); only the Drizzle TS schema caught up.
2. **Re-verify** the operator's bank-account and cost-category modal
   submits on the fresh deploy. PG 23502 should no longer fire. Other
   inline failures (duplicate code, missing required field) are
   expected and surface in the form's red banner — not a 500.
3. **Schedule an architectural sprint** to drain the 163 remaining
   violations. The ratchet test in `tests/fixtures/hf5-baseline.json`
   makes the cleanup measurable: every fix shrinks the baseline by 1
   and shows up in the test's "fixed since baseline" report.
4. **Treat the 87 missing-org WHERE clauses as a security debt** —
   they don't bite today (single-tenant) but they're loaded guns for
   the day a second tenant ships.
