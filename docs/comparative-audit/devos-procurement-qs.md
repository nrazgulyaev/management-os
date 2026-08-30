# Comparative Functional Audit — Development-OS: QS / BOQ / Procurement / Materials / Commitments / Invoices

**Cluster:** the estimate → commit → buy → invoice chain of Development-OS.
**Date:** 2026-07-02. **Scope note:** warehouse/inventory/CFO/cashflow audited separately — not repeated here. Cross-tenant scoping was NOT re-audited (prior sweeps #273–302 own that). This is a *functional / money-lifecycle* audit.

---

## 1. Status table (WORKS / PARTIAL / MOCK / BROKEN)

| Area | Surface | Status | Evidence (file:line) |
|---|---|---|---|
| **BOQ document** | list / detail / status state-machine / inline line + section CRUD / CSV import+export | **WORKS** | `boq/[code]/_lines-editor.tsx` (inline addBoqSection/addBoqLineInline/editBoqLine/deleteBoqLine); `boq/[code]/_actions.ts:25` (transitionBoqStatus adapter); `boq/[code]/import`, `/export` |
| **BOQ → PR bridge** | generate draft PRs from selected BOQ items (qty/unit/rate inherited, org-scoped) | **WORKS** | `procurement/procurement-actions.ts:683` `generatePurchaseRequestsFromBoqAction` |
| **Quantity Surveying** | landing (redirect) | **WORKS** (redirect) | `quantity-surveying/page.tsx:19` → `/cabinets/qs` |
| **QS variance / cost analysis** | plan-vs-actual per BOQ line, qty-weighted actual rate, worst-drift-first | **WORKS** (real SQL calc, not mock) | `cabinets/qs-variance-queries.ts:58` `getQsVarianceLines` (joins `boq_actuals`, `variance_reviews`) |
| **Procurement PR lifecycle** | create → submit → approve (threshold matrix) → quote → select winner → PO | **WORKS** (atomic, org-scoped, audited) | `procurement-actions.ts:47/118/252/345`; PR detail wired via `request-actions` + `AddQuotationModal` (`purchase-requests/[code]/page.tsx:11,17`) |
| **RFQ / quote comparison** | side-by-side matrix, lowest-price/earliest-delivery flags, vendor scorecard, select | **WORKS** | `procurement/quotation-comparison/[requestCode]/page.tsx`; `selectQuotation` creates PO atomically (`procurement-actions.ts:345`) |
| **Approval thresholds** | operator-configurable matrix CRUD, director-gated | **WORKS** | `procurement-actions.ts:594/619/647` |
| **Quotation bulk import** | paste-grid + CSV parse | **WORKS**; Live Google Sheets tab | **MOCK** | `procurement/quotations/import/import-wizard.tsx:402` `SheetsLivePlaceholder`, `:224` |
| **Material POs** | list / detail / lines / deliveries / receipt-QC / consumption / cancel | **WORKS** | `materials/page.tsx`, `materials/[poCode]/page.tsx`, `getMaterialUtilization` |
| **Material PO → payment/invoice** | pay the vendor PO, retention, AP invoice against PO | **BROKEN / MISSING** | `materials/[poCode]/page.tsx` — Actions = record-delivery + cancel only; **no pay / no invoice / no ledger link** |
| **Commitments ledger (construction)** | approve → mark-paid (manual) → status auto-recompute (open→partial→completed) | **WORKS** | `finance/commitments/_controls.tsx`; `commitments-ledger-actions.ts:49/107` |
| **Commitment ↔ budget** | committed feeds budget-vs-actual "committed" column | **WORKS** (as a report) | `budget.ts:63` `com` CTE filters `dev_commitments_ledger` status IN (open, partially_paid) |
| **PO → commitment ledger** | selecting a quote / issuing a PO reserves money against budget | **BROKEN — the lifecycle break** | `selectQuotation` (`procurement-actions.ts:430`) inserts `material_purchase_orders` but **NEVER** `dev_commitments_ledger`; ledger only fed manually / via vendor engagements |
| **Budget vs Actual** | 3-state budgeted/committed/actual per category + project summary | **WORKS** (real aggregate) | `budget.ts:31` `getBudgetVsActual`, `:183` `getProjectFinancialSummary` |
| **Change orders** | create + state-machine + cost/schedule impact + threshold lookup | **PARTIAL** | `change-orders/change-order-actions.ts:59/102/156` — records cost impact but does **NOT** write budget lines or the commitment ledger (approved CO does not move the budget) |
| **Method statements** | doc CRUD + status | **WORKS**; cost link to BOQ | **MISSING** | `method-statements/[code]/_edit-form.tsx` has no cost/budget/BOQ field (prompt's "cost link" not implemented) |
| **Milestone invoices** | list + generate-PDF / send / void lifecycle (buyer/revenue side) | **WORKS** | `invoices/page.tsx`, `invoices/_controls.tsx`, `invoice-actions.ts` |
| **Installments** | buyer payment plans (revenue side) | **WORKS** | `installments/page.tsx`, `listInstallmentPlans` |
| **Investor commitments/drawdowns** | capital calls (NOT construction payables) | **WORKS** | `commitments/_actions.ts`, `commitment-actions.ts`/`drawdown-actions.ts` |
| **Bulk import** | entity import jobs | **WORKS** | `bulk-import/*` |

**Counts:** WORKS 15 · PARTIAL 2 (change orders; commitments-vs-budget is report-only) · MOCK 1 (live Sheets) · BROKEN/MISSING 3 (PO→payment, PO→commitment ledger, method-statement cost link).

---

## 2. Defects, prioritized (file:line)

**P0 — the money lifecycle is not closed at the PO junction**
1. **`selectQuotation` issues a PO but reserves nothing against budget.** `procurement-actions.ts:430-460` inserts `material_purchase_orders` + `material_po_lines` only. No `dev_commitments_ledger` row, no `categoryId`, no budget link. Consequence: the automated PR→quote→PO chain is **invisible to `getBudgetVsActual`'s "committed" column** (`budget.ts:63`). Committing money via the primary procurement path does **not** encumber budget. The ledger is only populated by hand (`commitments-ledger-actions.ts:49`) or via `vendors/[code]/engagements/new`. The buy-chain and the cost-control chain are two disconnected islands.
2. **Material PO has no payables path.** `materials/[poCode]/page.tsx:266-286` — the only PO actions are "Record delivery" and "Cancel." There is no way to invoice against a PO, mark it paid, or record an `dev_transactions` outflow from it. So a delivered PO never becomes an *actual* cost. `formatUsdMinor` totals are display-only; PO money never reaches budget-vs-actual's "actual" column.

**P1 — control artifacts that don't move money**
3. **Approved change order does not move the budget or commitment.** `change-order-actions.ts:102-149` sets status/approvedAt and stores `costImpactMinor`, but writes **no** `dev_budget_lines` supersession and **no** commitment/transaction. Benchmark parity requires an approved CO to hit the "Committed Costs" / revised-budget column. Today it is a tracked memo only.
4. **No retention / retainage anywhere in the cost chain.** `grep retention|retainage|withhold` over `src/lib/db/schema` returns only `payroll.ts` + `tax.ts`; none in procurement/materials/commitments. POs/subcontracts cannot withhold a % or release it — a hard gap vs every benchmark.

**P2 — smaller functional gaps**
5. **Live Google Sheets quotation import is a placeholder.** `import-wizard.tsx:402` `SheetsLivePlaceholder` (paste + CSV work; live sync stubbed).
6. **Method-statement "cost link" not implemented.** `method-statements/[code]/_edit-form.tsx` has no BOQ/cost/budget field; the prompt's cost linkage does not exist.
7. **PR approval is not role-aware.** `procurement-actions.ts:166-188` computes the threshold decision then `void decision` — approval gating relies on UI only (noted in-code as "Stage 4.B will tighten").

*No mock-money KPIs or dead buttons found in BOQ/procurement/materials list surfaces — totals render real DB bigint minor units.*

---

## 3. Competitor benchmark — gap map

Benchmarked: **Procore Financials, Sage 300 CRE, CMiC, Northspyre, Rabbet.**

| Capability (2025–26 standard) | Benchmark behavior | This app | Verdict |
|---|---|---|---|
| Commitments (PO/subcontract) reserve committed cost | Procore/Sage: PO immediately shows in "Committed Costs" on the budget | PO created but not in commitment ledger | **GAP (P0)** |
| Commitment change orders move committed/revised budget | Procore: approved commitment CO updates Committed Costs column | CO stores impact, moves nothing | **GAP (P1)** |
| Subcontractor / AP invoices against a commitment | Sage: track PO vs invoices; pay only ≤90% (retention) | No PO invoice/payment surface | **GAP (P0)** |
| Retention / retainage withhold + release | Procore sliding-scale, Sage auto 10% hold, lien waivers | Absent from cost chain | **GAP (P1)** |
| Budget vs actual (budgeted/committed/actual) | Core to all | Real 3-state report exists (`budget.ts`) | **PARITY** (once committed/actual are actually fed) |
| Cost-to-complete / anticipated-cost forecast | Northspyre "Anticipated Cost Report"; Rabbet live variance | `remainingBudget`, `outstandingCommitment` computed; no forecast/ETC to completion | **GAP (P1)** |
| RFQ → multi-quote compare → award | Bid leveling / tender | Full: matrix, lowest/earliest flags, vendor scorecard, atomic award→PO | **PARITY / DIFFERENTIATION** |
| BOQ takeoff → auto-generate PRs | Not native in most ERPs | `generatePurchaseRequestsFromBoqAction` | **DIFFERENTIATION** |
| Configurable approval-threshold matrix + submittal gate | Enterprise ERPs | Present + submittal-approval gate before PO | **PARITY / DIFFERENTIATION** |
| WIP / GAAP job-cost audit trail | Sage automated WIP | Audit events yes; no WIP schedule | **GAP (P2)** |

---

## 4. Recommendations (prioritized)

**P0 — close the money loop**
1. On `selectQuotation` PO creation, also insert a `dev_commitments_ledger` row (project + category + vendor + amount, status `open`) so the PO encumbers budget. Requires carrying/deriving a `categoryId` onto the PR/PO (from the BOQ section or a PR field).
2. Add a PO payables surface on `materials/[poCode]`: record a vendor invoice against the PO and a "mark paid" that writes a `dev_transactions` outflow linked to the commitment — reuse the existing `finance/commitments` mark-paid pattern so status auto-recomputes and *actual* lands in budget-vs-actual.

**P1**
3. Make approved change orders write a budget-line supersession (or a delta commitment) so "committed/revised budget" reflects them.
4. Add retention: a withhold-% on PO/commitment + a release action; block payment beyond (1 − retention) of the contract, mirroring Sage's 90% rule.
5. Add cost-to-complete / anticipated final cost = actual + outstanding-commitment + open-CO impact, surfaced per project (Northspyre/Rabbet parity).

**P2**
6. Make PR approval role-aware (consume the `lookupRequiredApproval` decision instead of `void`).
7. Implement the method-statement→BOQ cost link, or drop the claim from the nav.
8. Finish or hide the live Google Sheets quotation import tab.

---

## 5. Headline

The **QS/BOQ/RFQ front half is genuinely strong** (real variance calc, atomic RFQ→award→PO, BOQ→PR automation, configurable approvals — parity-plus vs Procore/Sage). The **cost-control back half is broken at two seams**: (a) issuing a PO does not encumber budget (`selectQuotation` never writes the commitment ledger), and (b) a PO has no invoice/payment path, so it never becomes actual cost. A real 3-state budget-vs-actual report exists but is starved of committed/actual data from the primary buy-chain. Retention and CO→budget propagation are absent. Fixing the two P0 seams converts an impressive front-end into a closed job-cost loop.

**Sources:** [Procore Commitments](https://www.procore.com/financial-management/commitments) · [Procore Retainage on PO/Subcontract](https://v2.support.procore.com/product-manuals/commitments-project/tutorials/enable-retainage-on-a-purchase-order-or-subcontract) · [Procore Change Orders](https://en-ca.support.procore.com/products/online/user-guide/project-level/change-orders) · [Sage 300 CRE Job Cost](https://www.sage.com/na/~/media/BDE789B079174690A3F2DF7CD91CCCF1.pdf) · [Sage 300 subcontractor compliance/90% rule](https://www.accordantco.com/sage-300-subcontractor-compliance/) · [Northspyre forecasting / Anticipated Cost Report](https://www.northspyre.com/forecasting) · [Rabbet product overview](https://rabbet.com/developers/product-overview)
