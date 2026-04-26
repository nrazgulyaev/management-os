# ADR-0004 — Finance Engine & Owner Statements (Version 3)

**Status:** Accepted
**Date:** 2026-04-25
**Scope:** v3 finance engine — money model, ledger tables, allocation, statement generation, period locking, owner-scoped reads. No payment processing, no AI runtime, no external integrations.

---

## 1. Decisions

| Concern | Decision | Why |
|---|---|---|
| Money storage | **BIGINT minor units + currency** on every monetary column | Float is forbidden for finance; minor units make rounding deterministic and audit-friendly. |
| Storage fraction digits | Fixed at **2** for every currency (incl. JPY, IDR) | Math is consistent across currencies; UI rounds to the currency's display digits at render time. |
| Display digits | `USD/EUR/GBP/AUD/SGD = 2`, `JPY/IDR = 0` | Matches conventions guests / owners expect on receipts. |
| FX | `fx_rates` table, no inline FX yet | Multi-currency stays explicit; statement generator works in a single statement currency for now. |
| Allocation | **`splitByWeights(amount, weights)`** with deterministic remainder to the largest weight | Pure-bigint, idempotent, unit-tested. |
| Period locking | **DB trigger `fn_prevent_locked_period_mutation()`** on every dated finance table | Hard line at the DB; service-level `assertPeriodOpen()` is a courtesy guard before round-trip. |
| Owner-scoped reads | RLS policies on `owner_statements`, `statement_lines`, `payout_lines` filtered through `current_owner_id()` (auth-user → app_users → email match → owners) | Conservative v3 baseline. v3.5 introduces an explicit `app_users_owners` link table. |
| Hard delete | **Forbidden** for finance rows. Use `voided` / `reversed` status or `finance_adjustments`. | Audit integrity. |
| Statement generator | Single deterministic function · idempotent for `draft` · refuses to overwrite `issued | approved | paid` unless voided | Owners can trust the document. |

---

## 2. Money model

```ts
type Money = { amountMinor: bigint; currency: string };
```

Every helper lives in [`src/lib/money.ts`](../src/lib/money.ts):

| Function | Purpose |
|---|---|
| `formatMoneyMinor(amount, currency)` | Locale-aware render at the currency's display fraction digits. Supports compact ("Rp 1.5M") for big numbers. |
| `parseMoneyToMinor(input)` | Free-form user input → BIGINT minor. Throws on garbage. |
| `addMinor`, `subtractMinor` | BigInt arithmetic. |
| `percentOfMinor(amount, pct)` | Percent computation; returns `{ amount, remainder }`. |
| `splitByWeights(amount, weights)` | Distribute by weight; rounding remainder to the largest weight (deterministic). |
| `calculateNights`, `calculateAdrMinor`, `calculateRevparMinor` | Stay metrics. |

UI input flows through [`<MoneyInput>`](../src/components/finance/money-input.tsx) which posts a hidden BIGINT field so the server action can `z.coerce.bigint()` it directly.

---

## 3. Schema

`src/lib/db/schema/finance.ts` introduces 16 tables (see [`drizzle/0002_finance_engine.sql`](../drizzle/0002_finance_engine.sql)):

- **fx_rates** — daily snapshots used by render-time conversion only (v3 doesn't auto-convert).
- **revenue_lines / fee_lines / expense_lines / tax_lines / reserve_movements / management_fee_lines** — the operational ledger, all date-stamped.
- **expense_allocations / allocation_rules / management_fee_rules** — config + materialised allocations.
- **statement_periods / owner_statements / statement_lines / finance_adjustments** — month-end product.
- **payout_batches / payout_lines** — the payout queue (no real money movement yet).

Indexes on `(villa_id, *_date)` and `(project_id, *_date)` keep statement generation queries cheap. CHECK constraints enforce enums on `status`, `movement_type`, `allocation_scope`, etc.

---

## 4. Period locking

The DDL installs `fn_prevent_locked_period_mutation()` and binds it to `revenue_lines`, `fee_lines`, `expense_lines`, `tax_lines`, `reserve_movements`, `management_fee_lines`, and `finance_adjustments`. The trigger:

1. Resolves the row's effective date column from `TG_TABLE_NAME`.
2. Looks up any `closed | locked` `statement_periods` covering that date.
3. Raises `check_violation` with a precise message if conflict found.

Application-level `assertPeriodOpen()` runs from server actions for a friendlier UI experience, but the DB trigger is the hard line. The lifecycle is `open → closing → closed → locked`. `closed` periods can still be reopened by re-setting status; `locked` is intended to be permanent.

---

## 5. Statement generation logic

`generateOwnerStatement({ ownerId, periodId, villaId?, projectId?, currency? })` in [`statement-generator.ts`](../src/features/finance/statement-generator.ts):

1. Loads `ownership_shares` active during the period range (via `starts_on / ends_on` overlap).
2. Optionally narrows to a specified `villaId` / `projectId`.
3. Determines the management model:
   - villa-only shares → `individual` (or `hybrid` if any share's own model is hybrid).
   - pool-only shares → `pooled`.
   - mix → `hybrid`.
4. Pulls revenue / fee / expense / tax / reserve / management-fee rows scoped to the relevant villas (and project pool for shared expenses).
5. For each source row, allocates by share percent (`allocateBySharePercent`).
6. If no `management_fee_lines` exist for the period, applies the most specific active `management_fee_rules` to compute a synthetic fee line.
7. Sums totals (`gross_revenue`, `total_fees`, `total_expenses`, `total_taxes`, `total_reserves`, `management_fee`, `net_payout`).
8. Computes `occupancy_rate / adr_minor / revpar_minor` from bookings overlapping the period.
9. Persists `owner_statements` (idempotent for `draft` — same `(owner_id, period_id)` overwrites lines but preserves the statement code).
10. Refuses to overwrite `issued | approved | paid` statements; caller must void first.
11. Records `owner_statement.generate` (or `regenerate`) audit events with totals and source villa/project IDs.

The generator is **deterministic for the same inputs**. Re-running it on identical source data yields identical totals and identical line ordering (sort by computed `sort_order`).

---

## 6. Allocation logic

[`allocation.ts`](../src/features/finance/allocation.ts) exposes:

| Function | Use |
|---|---|
| `allocateBySharePercent(amount, shares)` | Generic — pooled or villa-individual. |
| `allocateProjectPoolByOwnershipShares` | Alias for clarity in pool flows. |
| `allocateVillaIndividualByOwnershipShare` | Alias for villa flows. |
| `calculateHybridAllocation(villaAmt, poolAmt, villaShares, poolShares)` | Two-track split for hybrid statements. |
| `validateAllocationTotals(expected, allocations)` | Sanity check used as a precondition guard. |
| `totalSharePercent(shares)` | Used by the `/dashboard/shares` warning UI. |

### Rounding

All allocation arithmetic happens in BigInt. The remainder produced by integer division is added to the owner with the **largest share**, breaking ties by first occurrence. This is deterministic and audit-friendly. The behaviour is documented at function level and covered by tests in [`tests/finance.test.ts`](../tests/finance.test.ts).

---

## 7. Management models

| Model | Inputs | Result |
|---|---|---|
| **Individual** | One villa share. | All villa-attributed rows go 100% to the owner; pool-shared rows ignored unless owner also holds a pool share. |
| **Pooled** | One project pool share, no villa share. | All revenue / fees / shared expenses / etc. for the project are allocated by `share_percent`. |
| **Hybrid** | Both a villa share *and* a pool share. | Villa-specific rows allocated by villa share; `allocation_scope = 'project_pool'` rows allocated by pool share. |

Multiple owners on the same villa are supported; allocation distributes across them by their share percents.

---

## 8. Owner visibility

### App layer
- `listStatementLines(statementId, { ownerVisibleOnly: true })` filters internal rows.
- `/owner/statements/[id]` always passes the `ownerVisibleOnly` flag.

### DB layer (RLS, migration 0002)
- Every finance table is `ENABLE ROW LEVEL SECURITY` and `FORCE`d.
- Internal staff get a baseline `internal_read` policy.
- Owners get a stricter policy via `current_owner_id()`:
  - `owner_statements`: only `(issued | approved | paid)` statements where `owner_id = current_owner_id()`.
  - `statement_lines`: only when both `owner_visible = true` and the parent statement is owner-readable.
  - `payout_lines`: only `(approved | paid)` lines for the owner.
- `current_owner_id()` matches `app_users.email` to `owners.email` for now. v3.5 replaces this with an explicit `app_users_owners` grant table.

Service-role server actions still bypass RLS by design (used by the statement generator).

---

## 9. Admin finance routes

Implemented under `/dashboard/finance/`:

- Overview (`/dashboard/finance`) — live summary, period card, quick actions, recent statements, legacy demo card kept for design reference.
- `revenue/`, `fees/`, `expenses/`, `taxes/`, `reserves/` — list + create.
- `periods/`, `periods/new`, `periods/[id]` — list + create + detail with status transitions (begin closing → close → lock).
- `statements/`, `statements/new`, `statements/[id]` — list + generate + detail with lifecycle transitions.
- `payouts/`, `payouts/new` — batches + unbatched lines.

All pages render server-side, fetch via the typed services in [`services.ts`](../src/features/finance/services.ts), and surface `Demo data` / `Live data` via the existing `<SourceBadge>` and `<DbStatusNotice>`.

---

## 10. Owner portal

- `/owner/statements` — switches to live data when DB is configured; falls back to the curated v1 demo otherwise.
- `/owner/statements/[id]` — owner-audience render through the shared `<StatementDetail>`. Internal-only lines are filtered both by the `ownerVisibleOnly` argument and by RLS.

---

## 11. Seed

`drizzle/seed.sql` adds, conditional on the v3 tables existing:

- Two `statement_periods` (March 2026 closed, April 2026 open).
- One `management_fee_rules` row at 18% gross.
- Five `revenue_lines` covering villa-direct and pool-direct cases.
- Three `fee_lines` (OTA + payment).
- Five `expense_lines` (utilities / cleaning / project_pool security / project_pool garden / villa maintenance).
- Two `tax_lines` (Bali PHR).
- Three `reserve_movements` (renovation + FF&E contributions).
- One empty `payout_batches` row.

The `DO $$ … RETURN; END $$` guard skips the v3 block entirely when migration 0002 has not been applied.

After applying migrations and seed, generate a sample statement from `/dashboard/finance/statements/new` (e.g. owner *Emma Whitmore* + period *March 2026*).

---

## 12. What is implemented now

- 16-table schema with full DDL + indexes + RLS enable/force.
- DB-level period locking trigger.
- Money helpers + finance-specific helpers (allocation, calculations, validation).
- Statement generator with three management models, idempotent drafts, audit events, room metrics.
- Read services for every finance entity + dashboard summary aggregator.
- Server actions with Zod validation, period-lock checks, audit, and permission gates.
- Admin finance UI: 8 list pages + new pages + period & statement detail pages.
- Owner portal switches to live statements when DB is configured; falls back to demo otherwise.
- Owner-scoped RLS on `owner_statements / statement_lines / payout_lines`.
- Tests for money math, allocation, room metrics, statement schema, finance permissions.

## 13. Intentionally deferred

| Item | Lands in |
|---|---|
| Real PDF export of statements | v3.5 (lightweight server-side PDF) |
| Owner email-link replaced by `app_users_owners` grant table | v3.5 |
| `expense_allocations` materialisation per statement (currently inline) | v4 |
| Per-action UPDATE/INSERT/DELETE policies for internal staff | v4 |
| Channel manager / OTA sync (Hostaway / Airbnb / Booking) | v8 |
| Real payment rails (Xendit / Wise / Stripe / crypto) | v8 |
| AI runtime for the Investor Assistant + Finance Analyst | v7 |
| Multi-currency auto-conversion at posting time | v3.5 |
| Reserve balance views and FF&E depreciation schedules | v3.5 |
| `pgtap` matrix tests for finance RLS | v3.5 |

## 14. Limitations

- The owner email-link in `current_owner_id()` is conservative — operators must keep `app_users.email` and `owners.email` in sync until v3.5 introduces the grant table.
- `formatMoneyMinor()` always assumes 2 storage fraction digits; if you import historical IDR data with implicit 0-digit minor units, multiply by 100 first.
- The statement generator does not yet record `expense_allocations` rows; allocations are computed inline. v4 will materialise them so allocation reports are queryable.
- Owners with overlapping shares spanning the period boundary are supported, but proration of the share % across mid-period changes is **not** done; the share % active at the end of the period is used. Document under "known issues" until v3.5.

---

## 15. Cross-reference

- ADR-0001: stack baseline.
- ADR-0002: backend foundation, RLS posture.
- ADR-0003: auth onboarding + admin workflows.
- `IMPLEMENTATION_ROADMAP.md` v3 — Finance & Investor Reporting.
- `DATABASE_SCHEMA.md` §5–9 — canonical finance tables.
- `USER_ROLES_AND_PERMISSIONS.md` — finance role × permission matrix.
