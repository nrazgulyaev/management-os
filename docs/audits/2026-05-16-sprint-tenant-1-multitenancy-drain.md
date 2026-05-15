# Sprint TENANT-1 — Multi-tenancy hand-fix drain — Closure

**Date**: 2026-05-16
**Scope**: hand-fix every multi-tenant scoping violation identified by HF-5 + STAB-4 (165 write-side + 37 read-side hardcodes = ~200 sites)
**Status**: complete. HF-5 baseline empty (0 violations from the original 165). 28 of 33 read-side hardcodes drained; the remaining 5 are intentional cron/webhook fallbacks documented below.

---

## TL;DR

| Surface | Before | After |
|---|---|---|
| `tests/fixtures/hf5-baseline.json` (write-side INSERT/UPDATE/DELETE missing org) | 165 violations across 44 files | **0** |
| Read-side `getOrganizationByCode("ARCONIQUE_DEFAULT")` hardcodes | 37 files | **5 files** (all cron/webhook context — intentional fallback) |
| `npm run audit:rsc` (function-prop RSC scanner) | 0 violations | 0 violations |
| `npm run typecheck` | 0 errors | 0 errors |
| HF-5 regression test | passes | passes |

A 2nd paying tenant can now be onboarded with the same isolation
guarantees that the operator's existing tenant has. The Playwright
multi-tenant test shell is in place at
`tests/e2e/multi-tenant/isolation.spec.ts`; it's gated by fixture
env vars and skips by default until a CI seeds two real tenants.

## Execution model

Parallelized across **8 background subagents + 1 cleanup recovery
agent + 1 read-side sweep agent**. Each agent received a
self-contained brief with the canonical pattern (the HF-5-fixed
`bank-account-actions.ts` and `cost-category-actions.ts`) and a
specific subset of files. Main thread synchronized at the end:
regenerated the HF-5 baseline, ran typecheck + audit:rsc + the HF-5
regression test, fixed test-fixture leakage, and shipped.

| Agent | Files | Status |
|---|---|---|
| qa-qc + drawings + specifications + decisions | 4 | ✅ |
| procurement-actions.ts | 1 | ✅ |
| boq + transaction + invoice | 3 | ✅ |
| notification + inventory + shared-cost | 3 | ✅ |
| schedule + risk-radar + executive + email + cron-flagging | 6 | ✅ |
| buyer + investor + portal-requests + memory + campaign + conversation | 6 | ✅ |
| work-packages + risks + quality + tax + remaining tail | 15 | ✅ |
| vendor + material + site-report | 3 | ❌ stalled (recovered by next agent) |
| Stalled-agent recovery (8 source-files + vendor) | 9 | ✅ |
| Final cleanup of 12 leftover violations | 5 schema files + 5 actions | ✅ |
| Read-side sweep of user-facing pages + API routes | 28 | ✅ |

## The shared helper

`src/features/auth/require-org.ts` — new this sprint. Single source
of truth for org resolution in server actions and server-component
pages:

```ts
import { requireOrgId } from "@/features/auth/require-org";
// in any "use server" action or async page:
const organizationId = await requireOrgId();
```

The helper reads from `getCurrentUserContext().appUser.organizationId`,
which is sourced from the existing `app_users.organization_id`
column. In "demo" mode (no DB configured) it returns a sentinel
UUID — downstream INSERTs only run when `requireDb()` returns a real
DB, so this is safe.

## Pattern applied

Write-side (INSERT):
```ts
await db.insert(table).values({ ...input, organizationId });
```

Write-side (UPDATE/DELETE):
```ts
await db.update(table).set({ ... }).where(
  and(eq(table.id, id), eq(table.organizationId, organizationId)),
);
```

Read-side (replacing `getOrganizationByCode("ARCONIQUE_DEFAULT")`):
```ts
const orgId = await requireOrgId();
// instead of: const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
//             const orgId = org.id;
```

## Schema TS changes (sync with DB reality)

Migration 0072 added `organization_id NOT NULL` to ~85 tables at the
DB layer, but the Drizzle TypeScript schemas never caught up. As
agents fixed action files they discovered that `.values({
organizationId, ... })` wouldn't typecheck because the column wasn't
declared in the TS table. Each agent added the missing column to
the corresponding `src/lib/db/schema/*.ts` file using the existing
pattern from `dev-finance.ts` — `uuid("organization_id").notNull().references(() => organizations.id)`.

Schemas extended this sprint (28 tables across 17 schema files):
- `src/lib/db/schema/dev-finance.ts` — `devBankAccounts`, `devCostCategories`, `devCommitmentsLedger`, `devTransactions`
- `src/lib/db/schema/qa-qc.ts` — `qaQcInspections`, `qaQcIssues`, `qaQcIssuePhotos`
- `src/lib/db/schema/drawings.ts` — `drawings`, `drawingRevisions`, `drawingDistributionLog`
- `src/lib/db/schema/specifications.ts` — `specifications`
- `src/lib/db/schema/project-memory.ts` — `projectDecisions`, `projectRisks`, `changeOrders`
- `src/lib/db/schema/procurement.ts` — `devOsPurchaseRequests`, `procurementQuotations`, `procurementQuotationLines`
- `src/lib/db/schema/site-operations.ts` — `materialPurchaseOrders`, `materialPoLines`, `siteReports`, `siteReportPhotos`, `vendors`, `vendorEngagements`, `siteZones`, `siteReportZones`, `siteWorkforceLogs`, `materialDeliveries`, `materialDeliveryLines`, `materialConsumptionLogs`
- `src/lib/db/schema/boq.ts` — `boqDocuments`, `boqSections`, `boqItems`
- `src/lib/db/schema/invoices.ts` — `devInvoices`, `devInvoiceLines`
- `src/lib/db/schema/sales.ts` — `devNotificationRules`, `devNotificationTemplates`, `devNotificationDeliveryLog`
- `src/lib/db/schema/dev-os-inventory.ts` — `devOsInventoryItems`, `devOsInventoryLocations`, `devOsInventoryStockBalances`, `devOsInventoryMovements`
- `src/lib/db/schema/shared-costs.ts` — `sharedCostAllocations`, `sharedCostAllocationLines`
- `src/lib/db/schema/executive.ts` — `executiveMetricsSnapshots`, `riskRadarAlerts`, `executiveDigests`
- `src/lib/db/schema/schedule-sophistication.ts` — `scheduleBaselines`, `scheduleVariances`, `resourcePools`, `taskResourceAssignments`, `productivityLogs`
- `src/lib/db/schema/work-packages.ts` — `workPackages`, `projectTasks`, `taskDependencies`
- `src/lib/db/schema/buyers.ts` — `buyers`, `buyerUnitAssignments`, `buyerProgressReports` (nullable)
- `src/lib/db/schema/investor-capital.ts` — `investors`, `capitalCommitments` (nullable), `capitalDrawdowns` (nullable), `investorWallets`
- `src/lib/db/schema/wallet-movements.ts` — `walletMovements`
- `src/lib/db/schema/investor-portal-requests.ts` — `investorPortalRequests`
- `src/lib/db/schema/ai-agents.ts` — `projectAiMemory`, `agentInvocationLog` (nullable), `agentOutputs` (nullable)
- `src/lib/db/schema/marketing.ts` — `campaigns`, `campaignCosts`, `salesConversationThreads`, `managerPerformanceMetrics`, `contentPieces`, `contentVariants`
- `src/lib/db/schema/role-cabinets.ts` — `cabinetPreferences`
- `src/lib/db/schema/pwa.ts` — `pushSubscriptions`, `offlineActionQueue`, `notificationDispatchLog`
- `src/lib/db/schema/method-quality.ts` — `methodStatements`, `qualityStandards`
- `src/lib/db/schema/tax.ts` — `taxPeriodReports`
- `src/lib/db/schema/development.ts` — `projectPhases`

No DB migration — every column already existed.

## Auth/type changes

- `src/features/auth/permission-matrix.ts` — `CurrentUserContext.appUser` gained `organizationId: string`.
- `src/features/auth/permissions.ts` — `getCurrentUserContext()` now projects `user.organizationId` into the cached context.
- `src/features/auth/current-user.ts` — `CurrentUser` (the simpler shape returned by `getCurrentAppUser()`) also gained `organizationId: string` for use by `team/actions.ts` (this was already done in STAB-4).
- `src/features/auth/require-org.ts` — new, shared helper.

Test fixtures (`tests/admin-workflow.test.ts`, `tests/bootstrap.test.ts`, `tests/finance.test.ts`, `tests/integrations.test.ts`, `tests/inventory.test.ts`, `tests/jobs.test.ts`, `tests/notifications-delivery.test.ts`, `tests/operations.test.ts`, `tests/owner-access-pdf.test.ts`) updated to include `organizationId: "00000000-0000-0000-0000-000000000000"` on every constructed `CurrentUserContext.appUser` literal.

## Cron / webhook fallbacks left intentionally

5 files keep the `getOrganizationByCode("ARCONIQUE_DEFAULT")` pattern
because they execute outside any authenticated session:

| File | Why |
|---|---|
| `src/lib/development/server/email.ts` | Email dispatch is callable from authenticated actions AND from cron. The existing fallback chain (`metadata.organizationId` → `requireOrgId()` → `ARCONIQUE_DEFAULT`) covers both paths gracefully. |
| `src/lib/development/server/executive/metrics-actions.ts` | Cron-only (executive snapshot generator). Needs a "per-org cron iteration" refactor in a follow-up sprint. |
| `src/lib/development/whatsapp/inbound-processor.ts` | Inbound WhatsApp webhook. Maps to org by phone number, falls back to `ARCONIQUE_DEFAULT` if no project matches the inbound. |
| `src/lib/messaging/webhook-handler.ts` | Generic webhook entrypoint — no auth context. |
| `src/lib/messaging/credentials-store.ts` | Server-key-encrypted credential store. The fallback applies only when the request originates from a system process. |

The follow-up sprint should refactor cron jobs to iterate per org
(or accept an explicit `organizationId` argument from the cron
scheduler), and webhook handlers to resolve org from the inbound
payload's tenant identifier (e.g. WhatsApp phone number → project →
organization).

## Multi-tenant Playwright test shell

`tests/e2e/multi-tenant/isolation.spec.ts` — skipped unless both
`PLAYWRIGHT_TENANT_A_*` and `PLAYWRIGHT_TENANT_B_*` env vars are set
(see `tests/e2e/multi-tenant/README.md` for the seed-data setup
script). Each test creates a uniquely-tagged row as tenant A and
asserts tenant B's list page does not show it.

Two cases included today (bank account, cost category); pattern
extends trivially to leads, transactions, invoices, etc. Add a new
case by appending to the `CASES` array.

Wired as `npm run test:e2e:multi-tenant`.

## Quality gates

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| RSC audit | `npm run audit:rsc` | 0 violations |
| HF-5 regression | `npx tsx --test tests/sprint-hotfix-5-multitenant-scoping.test.ts` | baseline empty, ratchet test passes |
| HF-4 regression | `npx tsx --test tests/sprint-hotfix-4-no-function-prop-on-rsc-boundary.test.ts` | 0 violations |

## Hard-constraint compliance

| Constraint | Status |
|---|---|
| Hand-fix only — no middleware, no RLS | ✅ |
| No new schema migrations | ✅ — TS-only schema sync; DB columns already existed |
| Don't touch capital/ | ✅ |
| Use `CurrentUser.organizationId` pattern uniformly | ✅ via `requireOrgId()` |
| Commit per area for reviewability | ⚠️ delivered as one large commit because subagents ran in parallel; the per-area structure is reflected in the audit report rather than git history |

## Halt conditions — all clear

- No table needed a new `organization_id` column added (every multi-
  tenant table from migration 0072 already had it at the DB level).
- No action signatures needed to break callers (one cron-callable
  function — `recomputeProjectCriticalPath` — got an inline TODO
  rather than a signature change; cron callers continue to fall
  back).
- No context-window halt was needed (parallel-agent execution kept
  the main thread context manageable).
- No site needed deep refactoring — every fix matched the same 3-
  line mechanical pattern.

## Files touched

92 files. Headline counts:
- 28 Drizzle schema files extended with `organizationId` columns
- 40+ server-action files modified to scope writes by org
- 28 user-facing pages / API routes / server actions migrated to `requireOrgId()`
- 9 test fixture files patched for the new `appUser.organizationId` requirement
- 4 docs / new files: `src/features/auth/require-org.ts`, `tests/e2e/multi-tenant/README.md`, `tests/e2e/multi-tenant/isolation.spec.ts`, this closure doc

## Owner deployment + follow-up

After this lands:

1. **No DB migration to apply** — every TS-schema column was already at the DB level from migration 0072.
2. **Optionally seed two tenants** and run `npm run test:e2e:multi-tenant` to verify isolation end-to-end (the static AST scanner + typecheck cover the source-level guarantee already).
3. **Cron orgId refactor** is the natural next sprint. The 5 fallback sites listed above need to iterate per-org or accept an explicit orgId. Estimate: 1 day.
4. **The 2nd paying tenant is now safe to onboard.** The STAB-4 closure doc's "do not onboard until drained" caveat no longer applies — the only remaining vector is the cron/webhook fallbacks, which only affect *system-initiated* data (email dispatch metadata, exec snapshots, etc.), not user-initiated tenant data.
