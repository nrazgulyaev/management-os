# Comparative Functional Audit — Management: Owners & Money

Cluster: `owners`, `owner-stays`, `owner-intelligence`, `finance`, `payments`, `payroll`, `shares`, `billing` + external **Owner Portal** (`src/app/(owner)/`).
Date: 2026-07-02. Method: read page.tsx + feature-layer queries/actions; verified money math and lifecycle guards; competitor benchmark via web search. No code edited.

TL;DR — this is the **strongest** cluster in the app. Core owner-money engine (statement net, payout lifecycle, disputed-pause, BPJS/PPh21 payroll) is genuinely built and correct, not mock. The real gaps are **competitive/table-stakes** (trust accounting, automated ACH payout rail, 1099/annual tax docs), not broken code.

---

## A. Functional status table

| Area | Status | Evidence |
|---|---|---|
| Owner-statement net calc (gross − fees − expenses − taxes − reserves − mgmt − custom) | **WORKS** | `src/features/finance/statement-net-pure.ts:48` `computeStatementNet` subtracts all deductions; `assertStatementLinesMatchNet:94` enforces Σ(lines)==net (throws before writing money). |
| Statement generator (real data → lines → persist) | **WORKS** | `src/features/finance/statement-generator.ts:144` `generateOwnerStatement` — real revenue/fee/expense/tax/reserve/mgmt pulls, share allocation, formula+ledger+bookings revenue sources, FX snapshot, per-villa idempotency (double-count fix `:1321`). |
| Statement lifecycle draft→issued→approved→paid; disputed re-open | **WORKS** | `src/features/finance/statement-actions.ts:53` approve guards illegal transitions (`:64` disputed must re-open first); resolve+reissue supersession `:240`. |
| Payout batch/line lifecycle + **disputed-pause** | **WORKS** | `src/features/finance/actions.ts:700` pause at line-create; `:784` re-checked at money-releasing approved→paid; state-machine `:56`, org-scoped. |
| Payout **actual money movement** (bank/ACH disbursement) | **PARTIAL (by design)** | Sets `status=paid`+`paidAt` only (`actions.ts:803`). No external rail — manual mark-paid. Consistent with deferred-PSP decision (Indonesia/Xendit is last build). Not a defect; a known gap. |
| Owner-statement PDF (mgmt + owner portal) | **WORKS** | `src/app/(owner)/owner/statements/[id]/pdf/route.ts` (authz: internal OR own owner + issued/approved/paid) → `renderOwnerStatementPdf`; mgmt route `src/app/api/finance/statements/[id]/pdf/route.ts` → `renderStatementPdf` (real @react-pdf `statement-pdf.tsx:113`). |
| Owner-portal statement detail (net hero, math table, transparency) | **WORKS** | `src/app/(owner)/owner/statements/[id]/page.tsx` — owner-scope guard `:44`, draft/voided hidden `:51`, owner-visible-only lines `:56`, source breakdown + reconciliation warnings. |
| Owner-portal document download | **WORKS** | `src/app/api/owner/documents/[id]/download/route.ts` — `ownerCanAccessDocument` per-id re-check → signed-URL 302. |
| Payroll BPJS (JHT/JKK/JKM/JP capped + Kesehatan) + PPh21 TER | **WORKS (real, researched)** | `src/features/payroll/statutory.ts` — full PMK 168/2023 TER A/B/C tables (`:130-268`), 2026 caps (JP Rp11,086,300), employer/employee split, no-NPWP surcharge, proration `:446`; posted by `actions.ts:548` `runPayrollAction` via `computeStatutory`. |
| Ownership shares / splits (must total 100%, over/under flagged) | **WORKS** | `src/app/(dashboard)/dashboard/shares/page.tsx` — over/under-100% flags; `services.ts:148` `listOwnershipShares` org-scoped DB rows (`source:"db"`). |
| Owner-stays free-night policy + finance bridge | **WORKS** | `src/features/owner-stays/estimate.ts:79` `estimateOwnerStay` — allowance/peak/blackout nights, mgmt compensation, operational cost; policy engine `policy.ts`, finance-bridge posts to ledger. |
| Owner-intelligence (health/tier/revenue/cohort) | **WORKS** | Real per-owner health/tier/YTD-net derivations (`owners/services.ts:229` `listOwnersForCrm`); "mock" only in no-DB fallback. |
| Billing / plan upgrade | **PARTIAL** | `src/app/(dashboard)/dashboard/billing/upgrade/page.tsx` reads real `plan_packaging`; checkout returns 503 when `STRIPE_SECRET_KEY` absent (Stage 9.A deferred) — button surfaces the message. Functional but no live checkout by default. |
| Payments (providers/webhooks) | **PARTIAL** | Provider config + webhook scaffolding present; live capture deferred to PSP build (manual mark-paid path is the live one). |

**Counts:** WORKS 11 · PARTIAL 3 (payout-rail, billing checkout, payments — all *intentional* deferrals) · MOCK 0 · BROKEN 0.

### "Mock money shown as real?" — NO
`source:"mock"` in `owners/services.ts:64/155` only fires when `getDb()` returns null (unconfigured DB / dev). With a real DB every reader returns `source:"db"` real rows. Safe dev-fallback, not fake money in production.

---

## B. Competitor benchmark (AppFolio, Buildium, Guesty, Hostaway, Xero)

| Capability | Competitors (2025-26) | Us | Verdict |
|---|---|---|---|
| Owner statement + self-serve portal PDF | AppFolio/Buildium/Guesty auto-generate monthly, owner pulls own | Full — generator + PDF + portal detail + dispute | **PARITY** |
| Statement net = rev − expenses − mgmt fee | All | Yes, invariant-checked | **PARITY** |
| Management-fee calc (% gross / % net / fixed / formula) | All | Yes — ledger rules + formula modes | **PARITY / DIFFERENTIATION** (per-owner/project override, custom deductions) |
| Multi-owner ownership splits by % | Weak in Guesty/Hostaway; strong in ours | Yes — villa+pool+hybrid share allocation | **DIFFERENTIATION** |
| Owner-stays / owner personal reservations w/ policy | Guesty 2025 added owner reservations | Yes + free-night policy + finance bridge | **PARITY / DIFFERENTIATION** |
| Statement dispute + resolve/reissue supersession | Guesty has revenue-discrepancy troubleshooting | Yes — first-class disputed→superseded flow + payout pause | **DIFFERENTIATION** |
| Localized statutory payroll (BPJS/PPh21) | Not in these US/global tools | Yes — real Indonesian TER | **DIFFERENTIATION** |
| **Trust / escrow accounting** (separate client-funds ledger, 3-way reconciliation, commingling controls) | AppFolio/Buildium core; legally required in many US states | **ABSENT** (no trust ledger, no 3-way recon) | **GAP — P1** |
| **Automated ACH / bank owner payout rail** (bulk disbursement) | AppFolio Pay Owners, Buildium Owner Draw, Guesty bulk disbursement | Manual mark-paid only (rail deferred) | **GAP — P1** |
| **1099 / annual owner tax docs** (e-file 1099-MISC/NEC; annual statement) | AppFolio/Buildium e-file free; Guesty auto-1099 + annual statement | Monthly PDF only; no annual roll-up, no 1099/tax form | **GAP — P1** (annual statement P2 for ID market where 1099 is US-specific) |
| Owner ACH contributions (owner pays IN) | AppFolio/Buildium | Absent | GAP — P2 |
| Bulk/batch statement disbursement selection UI | Guesty 2025, AppFolio | Batch model exists; bulk-select UX thin | GAP — P2 |

---

## C. Prioritized recommendations

**P0 (none broken)** — no functional/money defect requires an emergency fix. Engine is correct.

**P1 (table-stakes competitive gaps):**
1. **Trust/escrow accounting** — add a client-funds sub-ledger per owner + three-way reconciliation (bank ↔ GL ↔ Σ owner ledgers). This is legally mandated for US property managers and the single biggest differentiator vs AppFolio/Buildium. Even for the ID market, an owner-liability ledger (money held vs paid) closes the "where is my money" trust gap.
2. **Automated owner payout rail** — wire the deferred PSP (Xendit/bank disbursement for ID) into `setPayoutLineStatusAction` so approved→paid actually moves money + bulk-disbursement UI. Today's manual mark-paid is fine for launch but is the clearest parity gap.
3. **Annual owner statement / tax-doc roll-up** — aggregate the monthly statements into a year-end owner statement + (for any US owners) 1099. The monthly generator already has all inputs; this is an aggregation + PDF, not new money math.

**P2:**
4. Owner ACH *inbound* contributions (owner funds a shortfall).
5. Bulk statement disbursement selection UX on `finance/payouts`.
6. Enable live Stripe checkout on billing (`STRIPE_SECRET_KEY`) — currently 503 by default.

---

## Sources
- [Buildium vs AppFolio](https://www.buildium.com/blog/buildium-vs-appfolio/) · [AppFolio Owner Portal FAQ](https://www.appfolio.com/help/owner) · [Trust accounting AppFolio vs Buildium](https://www.apmhelp.com/blog/trust-accounting-in-appfolio-vs-buildium-how-the-two-systems-handle-it-differently)
- [Hostaway owner-ready statements](https://www.hostaway.com/blog/owner-ready-financial-statements/) · [Guesty homeowners portal](https://www.guesty.com/features/homeowners-portal/) · [7 Guesty updates 2025](https://www.guesty.com/blog/7-guesty-updates-that-defined-2025/)
- [Trust accounting 101 (Yardi)](https://www.yardibreeze.com/blog/2025/09/trust-accounting-for-property-managers/) · [Guesty owner reservations](https://help.guesty.com/hc/en-gb/articles/22576102445213-Managing-owner-reservations)
