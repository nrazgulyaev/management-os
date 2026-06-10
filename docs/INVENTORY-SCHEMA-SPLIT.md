# ADR — The two inventory schemas (Management OS vs Development OS)

Status: Accepted (documentation-only; no schema or data change).
Date: 2026-06-10.
Scope: documents an existing, intentional split. Nothing is deleted, merged, or migrated.

## TL;DR

The codebase contains **two independent inventory domains** that look alike but
belong to two different products. They are intentionally separate and must stay
separate until/unless a deliberate data migration unifies them. Both are live.

| | Management OS inventory | Development OS warehouse |
|---|---|---|
| Schema file | `src/lib/db/schema/inventory.ts` | `src/lib/db/schema/dev-os-inventory.ts` |
| Table prefix | `inventory_*`, plus `suppliers`, `purchase_*` | `dev_os_inventory_*` |
| Cabinet | Villa-operations Inventory / Procurement | Construction Warehouse |
| What it tracks | Operational consumables (cleaning, pool, F&B, maintenance) | Construction materials / SKUs received against work packages |
| Origin | migration `0006`, `docs/ADR-0007_INVENTORY_PROCUREMENT_ATTACHMENTS.md` | Stage 4.C.1 (`dev_os_` namespacing introduced to avoid table collision) |

## The two domains

### 1. Management OS — `src/lib/db/schema/inventory.ts`

Tables: `suppliers`, `inventory_locations`, `inventory_categories`,
`inventory_items`, `inventory_stock_levels`, `inventory_movements`,
`task_material_usage`, `purchase_requests`, `purchase_request_lines`,
`purchase_orders`, `purchase_order_lines`, `inventory_counts`,
`inventory_count_lines`.

This is the operational consumables system for running villas: stock levels by
location, movements, supplier-driven procurement (purchase requests → purchase
orders), physical counts, and the **finance material-usage bridge** that turns
material consumption into expense lines.

Importers (Management OS only — 10 files):

- `src/features/inventory/actions.ts`
- `src/features/inventory/services.ts`
- `src/features/inventory/counts-actions.ts`
- `src/features/inventory/counts-services.ts`
- `src/features/procurement/actions.ts`
- `src/features/procurement/services.ts`
- `src/features/finance/material-usage-bridge.ts`
- `src/features/finance/material-usage-bridge-actions.ts`
- `src/features/jobs/material-usage-bridge-job.ts`
- `src/features/jobs/notification-digest-job.ts`

### 2. Development OS — `src/lib/db/schema/dev-os-inventory.ts`

Tables: `dev_os_inventory_items`, `dev_os_inventory_locations`,
`dev_os_inventory_stock_balances`, `dev_os_inventory_movements`.

This is the construction-side warehouse: material SKUs, locations, stock
balances, and movements tied to work packages. It lives entirely inside the
Development OS server layer and the development-app warehouse pages.

Importers / referencers (Development OS only):

- `src/lib/development/server/inventory/inventory-actions.ts`
- `src/lib/development/server/inventory/inventory-bulk-actions.ts`
- `src/lib/development/server/inventory/inventory-queries.ts`
- `src/lib/development/server/warehouse/warehouse-flow-actions.ts`
- `src/lib/development/server/warehouse/warehouse-flow-queries.ts`
- `src/lib/development/server/warehouse/warehouse-inbound-queries.ts`
- `src/lib/development/server/warehouse/warehouse-receipt-actions.ts`
- `src/lib/development/server/warehouse/warehouse-stock-actions.ts`
- `src/app/(development-app)/development-os/inventory/movements/quick-entry/page.tsx`
- `src/lib/db/schema/boq.ts` (schema-level FK only — see below)

The Development-OS procurement side (`material_purchase_orders`,
`material_deliveries`) is defined separately in
`src/lib/db/schema/site-operations.ts`, not in `dev-os-inventory.ts`; it is part
of the same Development OS product and feeds the warehouse via the warehouse
inbound/receipt queries.

## Why they exist as two domains

- **Different products.** Management OS runs occupied villas; Development OS
  builds them. They are separate cabinets with separate users, navigation, and
  data lifecycles.
- **Different semantics.** Management consumables (count cleaning supplies,
  fractional units like 0.5 L of chlorine, supplier procurement, expense
  bridging) do not map onto construction SKUs received against work packages and
  costed through a BOQ.
- **Built at different times.** The Management inventory tables predate the
  Development OS warehouse; the `dev_os_` prefix was introduced specifically to
  avoid a name collision with the existing `inventory_items` table.

## The risk

1. **They look unifiable but are not interchangeable.** A future engineer may
   see two "inventory" schemas and try to merge them or write a query that joins
   `inventory_*` to `dev_os_inventory_*`. The records mean different things; such
   a join is meaningless and would corrupt reporting.
2. **Drift.** Two parallel systems can diverge (e.g. one gains lot/serial
   tracking, the other does not), making a later merge harder.
3. **Search ambiguity.** `grep inventory` returns both; pick the wrong file and
   you wire a Development OS page to Management tables (or vice versa).

## Accidental-mixing audit (2026-06-10)

Performed for this ADR. Result: **clean.**

- The two schema files never import each other. `inventory.ts` contains no
  `dev_os` reference; `dev-os-inventory.ts` references no `inventory_*` table.
- **No application file** imports identifiers from both domains.
- **No query** joins `inventory_*` to `dev_os_inventory_*`.
- The **only** cross-file reference to `dev_os_inventory_items` outside the
  Development OS server/app layer is in `src/lib/db/schema/boq.ts`:
  `boq_items.inventory_item_id -> dev_os_inventory_items.id`. This is **in
  domain** — BOQ is Development OS — and is therefore allowed, not a mix.

No accidental cross-domain reference was found. If one is introduced later, it
will show up as a file that references both `inventoryItems`/`purchaseOrders`
(Management) and `devOsInventory*` (Development), or a join between the two table
families — treat that as a bug.

## Recommendation: keep them separate (do not unify now)

- **Keep the split.** The two domains serve different products with different
  semantics; there is no current need or business case to merge them, and the
  audit shows no leakage to clean up.
- **Enforce the boundary in code review**, not in the database. Reject any new
  import that pulls both table families into one module and any query joining the
  two. The header comments now in both schema files state this rule inline.
- **Revisit only on a concrete trigger** — e.g. a feature that genuinely needs a
  single material catalogue shared across build and operations (handover of a
  finished villa's leftover materials into operations stock). At that point treat
  it as a real project: a versioned migration that maps SKUs, units, and
  locations between the two domains, with a backfill and a deprecation window —
  never an ad-hoc join or a silent schema merge.

## Guardrails (already in place)

- Header comments in `src/lib/db/schema/inventory.ts` and
  `src/lib/db/schema/dev-os-inventory.ts` name the owning product/cabinet,
  describe the parallel-domain relationship, and forbid cross-referencing,
  cross-domain joins, and un-migrated merges.
- This ADR records the domains, the risk, the audit, and the keep-separate call.
