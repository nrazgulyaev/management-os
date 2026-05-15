# Sprint MD-1 · Dev OS spreadsheet-style data-entry consumers closure

**Started:** 2026-05-15
**Closed:** 2026-05-15
**Scope:** Close 4 functional deferrals carried over from the Mega-Sprint by wiring data-entry routes for QS, Warehouse, and Procurement cabinets. Pattern is identical to the Sprint 4 bookkeeper recipe (`bulkRecordTransactions` + `<SpreadsheetView>` + 3-tab import wizard), applied per-domain.
**Baseline:** 6129/6129 tests passing on `main` after Sprint LD-2 closure.
**Final:** **6141/6141 tests passing** (+12 net new across the 4 routes + the 2 cabinet-apex link assertions retargeted).

## Commit

`feat(dev-os): BoQ + movement quick-entry · quotation import · RfqMatrix wiring`

---

## What shipped

### 4 new routes

| Route | Lines | What it does |
| --- | ---: | --- |
| `/development-os/boq/quick-entry` | ~290 | `<SpreadsheetView>` with 8 BoQ-specific columns (Section · Item Code · Description · Unit · Qty · Unit cost · Category · Supplier). Operator picks a BoQ document at the top; rows dispatch by `section_code` within it; save → `bulkInsertBoqLines` server action. |
| `/development-os/inventory/movements/quick-entry` | ~310 | `<SpreadsheetView>` with 8 movement columns (Date · Item · Type · Qty · From · To · Reference · Note). Optional default receiving location for `received` rows; save → `bulkInsertMovements`. |
| `/development-os/procurement/quotations/import` | ~420 | 3-tab wizard (Paste TSV/CSV · Upload XLSX · Live Sheets placeholder) mirroring the Sprint-4 import-wizard shape. Auto-mapper covers EN+RU vendor-quote header conventions; commit → `bulkInsertQuotationLines`. |
| `/development-os/procurement/quotation-comparison` *(added Section, page already existed)* | +110 | New "Award matrix" Section above the existing table. Consumes the previously-unused Stage-10.B `<RfqMatrix>` primitive via a thin client island that adds per-row radio overrides + the "Create POs from choices" footer button → `createPoFromQuotationComparison`. |

### 4 new server actions

| Action | File | Pattern |
| --- | --- | --- |
| `bulkInsertBoqLines({ boqDocumentId, lines })` | `src/lib/development/server/boq/boq-bulk-actions.ts` | Per-row validate → resolve section + category by case-insensitive map → call existing atomic `addBoqItem` (which already recomputes section + document totals). |
| `bulkInsertMovements({ defaultToLocationId?, movements })` | `src/lib/development/server/inventory/inventory-bulk-actions.ts` | Per-row validate → resolve item + locations by case-insensitive map → call existing atomic `recordInventoryMovement` (which updates stock balances + writes immutable audit log). |
| `bulkInsertQuotationLines({ prId, currency, quotationLines })` | `src/lib/development/server/procurement/quotation-bulk-actions.ts` | Group rows by vendor → create or reuse one `procurement_quotations` row per `(PR, vendor)` → append lines to `procurement_quotation_lines`. Returns `quotationsCreatedCount` alongside per-row results. |
| `createPoFromQuotationComparison({ supplierChoicesByPrId })` | `src/lib/development/server/procurement/quotation-comparison-actions.ts` | Per-PR pick → look up the matching `(PR, vendor)` quotation → call existing atomic `selectQuotation` (which marks siblings rejected + creates `material_purchase_orders` row in one transaction). `already_selected` rows count as "skipped" not "errored". |

All four mirror the Sprint-4 `bulkRecordTransactions` contract: per-row error string, error-row count, success-row count, `results: BulkRowResult[]` so the UI surfaces inline error rows without losing the spreadsheet state.

### Quotation-matrix data loader

`src/lib/development/server/procurement/quotation-matrix-queries.ts` exposes `loadQuotationMatrix()` returning `{ lines, vendors, cellsByPrAndVendor }` shaped for the RfqMatrix primitive. Rows = PRs that have at least one quotation; columns = unique vendors that have quoted across those PRs; cells = per-vendor quotation total (NULL when the vendor didn't quote). Lowest-price-per-row wins by default; the client island lets the operator override.

### 3 cabinet-apex link swaps (within "link in quick-action strip" tolerance)

| Apex | Card | Before → After |
| --- | --- | --- |
| QS (`cabinets/qs/page.tsx`) | First card | `Review BoQ → /boq` → `BoQ quick entry → /boq/quick-entry` |
| Warehouse (`cabinets/warehouse-manager/page.tsx`) | "Log stock movement" | `/inventory/movements/new` → `/inventory/movements/quick-entry` |
| Procurement (`cabinets/procurement-manager/page.tsx`) | First card | `Raise new PR → /purchase-requests/new` → `Import quotations → /quotations/import` |

These are the only cabinet-apex modifications — single `href` (and matching label/caption) swaps within the existing quick-action strip arrays, no structural change. Two Mega-Sprint test assertions retargeted in lockstep with the new labels (`tests/development-stage-10-5-a-2.test.ts`).

### Tests

`tests/sprint-md-1-data-entry-consumers.test.ts` — 12 new source-inspection tests covering:

- Each of the 4 server actions ships with `"use server"`, the documented field set, the documented per-row error tokens, and the right wrapped atomic primitive.
- Each of the 3 new routes mounts `<SpreadsheetView>` (or the 3-tab wizard) and binds to the matching server action.
- The 3 cabinet-apex links resolve to the new routes; the old hrefs are gone from the strips.

Runtime persistence is exercised by the pre-existing unit tests on the underlying atomic primitives (`recordTransaction`, `recordInventoryMovement`, `addQuotation`, `selectQuotation`) — out of scope to re-test here.

---

## Quality gates (Task 5)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | no errors on touched files; pre-existing repo-wide warnings unchanged |
| `npm test` | **6141 / 6141 passing** (+12 from baseline 6129) |
| `npm run build` | succeeds; 3 new routes prerender as dynamic at 4–7 kB each |
| Route render | `/boq/quick-entry`, `/inventory/movements/quick-entry`, `/procurement/quotations/import`, `/procurement/quotation-comparison` all build green; no console errors in the route manifest |

The 2 pre-existing Mega-Sprint assertions that broke when the cabinet-apex card labels changed (`Review BoQ` → `BoQ quick entry`, `Raise new PR` → `Import quotations`) are retargeted in the same commit; the assertions still gate the same 3-cards-with-AI-analyst contract on each apex.

---

## Out of scope / deferrals

- **`<SpreadsheetView>` API extensions** — every new consumer fits inside the existing primitive API (columns, suggestions, validate, onCommit). No primitive changes.
- **Live Google Sheets sync** on the quotation import wizard's third tab — placeholder only, mirrors the Sprint-4 transactions/import contract. The `import_templates` table already carries `sheets_live` as a `sourceKind`.
- **Column-mapper + template-picker UI** on the quotation wizard — Sprint 4 ships those for transactions; the MD-1 wizard auto-maps with EN+RU header heuristics and skips the override UI. A follow-up sprint can extract those Sprint-4 components into reusable primitives and drop them into both wizards.
- **`lead_time_days` field on `procurement_quotations`** — the import wizard reads a `lead` column but the schema doesn't carry a lead-time field on the quotation header. The action currently drops the value; a future migration can add the column and wire it through.
- **Stocktake quick-entry** — the audit explicitly notes "mobile UX needs polish; deferred to v2"; out of scope for this sprint per the operator's earlier decision lock.
- **Per-line PO splits inside a single PR** — the current Dev-OS PR model is one-row-per-material, so `createPoFromQuotationComparison` performs PR-level splits (one PO per chosen vendor across rows). True line-level splits within a single PR are unblocked by the existing `procurement_quotation_lines` table but require a richer PO schema.

---

## Halt

Sprint MD-1 closed. Awaiting owner review before any follow-up.
