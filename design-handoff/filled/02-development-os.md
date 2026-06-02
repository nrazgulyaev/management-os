# Feature inventory · Development OS — FILLED 2026-05-29

Status: ✅ Have · 🟡 Partial · 🔴 Missing · ➖ N/A. Verdicts cite real files. See `../_current-app-routes.md`.

> **Headline:** Dev OS is the deepest surface (269 pages). Every headline cabinet is built. Gaps are: design's net-new sales/site-supervisor storage models (🔴 by table-absence — product decisions), several agent code-files that exist but aren't seeded/triggered, and a few P3 sub-features (drawdown wallets, capacity/payroll) not built.

---

## P1 · CORE CABINETS

### Projects + PM — `/development-os/projects` (`[slug]` hub)
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Projects list `[core]` | ✅ Have | `projects/page.tsx` |
| 2 | Project hub `[slug]` `[detail]` | ✅ Have | `projects/[slug]/page.tsx` (41kb) |
| 3 | BOQ per project `[cross]` | ✅ Have | `projects/[slug]/boq/`+`[lineId]` |
| 4 | Change orders | ✅ Have | `projects/[slug]/change-orders/`+`[code]`+`new` |
| 5 | Company / org chart | ✅ Have | `projects/[slug]/company/`+`[id]` |
| 6 | Decisions log | ✅ Have | `projects/[slug]/decisions/`+`[code]`+`new` |
| 7 | Land + acquisition | ✅ Have | `projects/[slug]/land/page.tsx` |
| 8 | Milestones | ✅ Have | `projects/[slug]/milestones/` + `milestones`+`milestone_dependencies` (0113) |
| 9 | Permits | ✅ Have | `projects/[slug]/permits/`+`[id]` |
| 10 | Risks | ✅ Have | `projects/[slug]/risks/`+`heatmap`+`[code]`+`new` |
| 11 | Schedule | ✅ Have | `projects/[slug]/schedule/`+`lookahead`+`tasks` |
| 12 | Waterfall | ✅ Have | `projects/[slug]/waterfall/`+`simulator` |
| 13 | Work packages | ✅ Have | `projects/[slug]/work-packages/`+`[code]`+`new` |

### CFO / Finance — `/development-os/cfo`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | CFO console `[core]` | ✅ Have | `cfo/page.tsx` via `getCfoKpis()` (cash/AR/AP/MTD/burn) |
| 2 | Capital waterfall | ✅ Have | `cfo/page.tsx` |
| 3 | P&L by project | ✅ Have | `cfo/page.tsx` |
| 4 | Cash position bars | ✅ Have | `cfo/page.tsx` |
| 5 | Tax types (auto-categorised) `[ai]` | ✅ Have | `finance/tax-types/page.tsx` (PPN/PPh/PBB) |
| 6 | Shared-cost allocation | ✅ Have | `finance/shared-costs/`+`[id]` |
| 7 | Capital calls `[cross]` | ✅ Have | `cfo/capital-calls/`+`[id]` + `capital_calls`+`capital_call_allocations` (0113) |
| 8 | Distributions | ✅ Have | `cfo/distributions/page.tsx` |

### BOQ + QS — `/development-os/boq`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | BOQ list `[core]` | ✅ Have | `boq/page.tsx` |
| 2 | BOQ detail `[code]` `[detail]` | ✅ Have | `boq/[code]/page.tsx` |
| 3 | Variance pills `[design-only]` | ✅ Have | **Shipped:** `boq_revisions`+`boq_actuals`+`variance_reviews` (0113) + `components/boq/variance-card.tsx` (qty/rate Δ) |
| 4 | QS variance review | ✅ Have | `components/boq/approve-variance-modal.tsx`+`reject-variance-modal.tsx` |
| 5 | Import wizard | ✅ Have | `boq/[code]/import/` + `boq/quick-entry/` |
| 6 | Export | ✅ Have | `boq/[code]/export/` |
| 7 | QS cost analyst `[ai]` | ✅ Have | `qs_cost_analyst` seeded (0062); `ai-agents/boq/{variance-detector,cost-coder,cost-anomaly-explainer}.ts` |

### Procurement + Vendors — `/development-os/procurement`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Purchase requests `[core]` | ✅ Have | `procurement/purchase-requests/`+`[code]`+`new` |
| 2 | Quotation comparison matrix | ✅ Have | `procurement/quotation-comparison/`+`[requestCode]` |
| 3 | Quotations + import | ✅ Have | `procurement/quotations/`+`import` |
| 4 | Vendor scoring `[ai][design-only]` | ✅ Have | **Shipped:** `vendor_scores` (0113) + `ai-agents/vendors/vendor-score-updater.ts` |
| 5 | Procurement analyst `[ai]` | ✅ Have | `procurement_analyst` seeded (0062); `ai-agents/vendors/{quote-parser,vendor-matcher}.ts` |

---

## P2 · SALES & CAPITAL

### Sales — `/development-os/sales`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Sales pipeline `[core]` | ✅ Have | `sales/stage-machine.ts` (6 stages) + kanban `components/development/sales/lead-pipeline-board.tsx` |
| 2 | Contact/buyer detail `[contactRoleId]` `[detail]` | ✅ Have | `sales/[contactRoleId]/page.tsx`; `buyers/`+`[code]` |
| 3 | Offer policy + modal | 🟡 Partial | `ai-agents/sales/offer-drafter.ts` exists; dedicated offer-policy fn/modal not confirmed — verify |
| 4 | Payment ladder | 🟡 Partial | Lives in contracts/finance (`contracts/`, milestone invoices); no standalone sales payment-ladder UI |
| 5 | Funnel chart | ✅ Have | `components/sales/funnel-chart.tsx` + `reports/sales-funnel/` |
| 6 | Sales agents `[ai]` | 🟡 Partial | `ai-agents/sales/{offer-drafter,lead-scorer,stage-stale-watcher}.ts` exist but **not seeded** as agent_configurations and likely stubs |
| 7 | Pipeline-card storage `[design-only]` | 🔴 Missing | **`sales_pipeline_cards`/`sales_stage_events`/`sales_offers` absent from all migrations** (verified by grep — contra an earlier mis-claim). Built on `sales_schemes`/`sales_conversation_threads` + lead tables. → product decision |

### Investors — `/development-os/investors`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Investors list `[core]` | ✅ Have | `investors/page.tsx` |
| 2 | Investor detail `[code]` `[detail]` | ✅ Have | `investors/[code]/page.tsx` |
| 3 | Capital account | ✅ Have | `investors/[code]/capital-account/` |
| 4 | Grant access | ✅ Have | `investors/[code]/grant-access/` (12.9kb) |
| 5 | Waterfall calculator `[core]` | ✅ Have | `ai-agents/investors/waterfall-calculator.ts` (pure fn; not seeded as a catalog agent) |
| 6 | XIRR / IRR tracker | ✅ Have | `ai-agents/investors/irr-tracker.ts` |
| 7 | Capital-call issuer | ✅ Have | `ai-agents/cfo/capital-call-drafter.ts` + `capital_calls` (0113) |
| 8 | Distributions + requests | ✅ Have | `cfo/distributions/` + `investor-requests/`+`[code]` |

### Site supervisor — `/development-os/site-reports`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Site report list `[core]` | ✅ Have | `site-reports/page.tsx` |
| 2 | Report detail `[id]` `[detail]` | ✅ Have | `site-reports/[id]/page.tsx` (15kb) |
| 3 | New report (capture) | ✅ Have | `site-reports/new/page.tsx` (19kb) |
| 4 | Quick-photo `[mobile]` | ✅ Have | `operations/site-reports/quick-photo/page.tsx` |
| 5 | Severity classifier `[ai]` | 🟡 Partial | `ai-agents/site-reports/incident-classifier.ts` exists (not seeded; likely stub) |
| 6 | Weekly composer `[ai]` | 🟡 Partial | `ai-agents/site-reports/weekly-composer.ts` + `projects/weekly-report-composer.ts` exist; **no cron + no `weekly_reports` table** to persist output |
| 7 | GPS + timestamp at source | ✅ Have | `site_report_photos` has `gps_lat`/`gps_lng` (`schema/site-operations.ts`) |
| 8 | Voice note narration | ✅ Have | `voice_notes` table (0105) |
| 9 | WhatsApp → site report `[cross]` | 🟡 Partial | `whatsapp/` exists; WA-intent→site-report-draft bridge not wired |
| 10 | Weekly report table `[design-only]` | 🔴 Missing | **`weekly_reports` table + `site_frames` view absent from all migrations** (verified). Built on `site_reports`+`site_report_photos` (0040). → product decision |

---

## P3 · SECONDARY CLUSTERS

### C6 · Dev Finance
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Cashflow 12-mo forecast `[core]` | ✅ Have | `cfo/cashflow/page.tsx` + `cashflow-forecast/page.tsx` |
| 2 | Cashflow-forecaster agent `[ai][design-only]` | 🟡 Partial | `ai-agents/cfo/cashflow-forecaster.ts` exists; `cfo/cashflow` view notes agent wiring still pending |
| 3 | Unit profitability table `[core]` | ✅ Have | `profitability/page.tsx` (GENERATED STORED margin col) |
| 4 | Margin tone badges | ✅ Have | `profitability/page.tsx` `marginTone()` (≥25/≥10/≥0/neg) |
| 5 | Bank connections | ✅ Have | `banking/page.tsx` (Revolut/Wise API; Mandiri/BCA/manual CSV) |
| 6 | Bank detail + sync status | ✅ Have | `banking/[id]/` + `jobs/.../bank-account-sync` cron |

### C7 · Dev Contracts
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Contract groups `[core]` | ✅ Have | `contracts/`+`[id]` |
| 2 | Group status FSM | ✅ Have | `contracts/` (draft→…→completed) |
| 3 | Milestone invoices | ✅ Have | `finance/invoices/`+`[id]`+`new` + `cron/dev-os-milestone-pre-invoice` |
| 4 | Invoice status | ✅ Have | `finance/invoices/` (draft/sent/viewed/paid/overdue/void) |
| 5 | Discount approval ladder `[core]` | ✅ Have | `discounts/page.tsx` + `settings/approval-thresholds/` |
| 6 | Authorization tiers | ✅ Have | `settings/approval-thresholds/page.tsx` |
| 7 | Capital commitments | ✅ Have | `commitments/`+`[id]` |
| 8 | Drawdowns + wallets `[detail]` | 🔴 Missing | No drawdown/wallet UI under `commitments/[id]`; capital movement lives in `capital_calls` flow instead |

### C8 · Knowledge & Docs
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Knowledge hub `[core]` | ✅ Have | `knowledge/page.tsx` |
| 2 | Drawing revision control | ✅ Have | `drawings/`+`[code]`+`distribution`+`new` |
| 3 | Drawing detail `[code]` | ✅ Have | `drawings/[code]/page.tsx` |
| 4 | Method statements / SOPs | ✅ Have | `method-statements/`+`[code]`+`new` |
| 5 | Method versioning | ✅ Have | `method-statements/` (draft→review→active→superseded) |
| 6 | Material POs `[cross]` | ✅ Have | `materials/`+`[poCode]`+`deliveries` |
| 7 | Deliveries | ✅ Have | `materials/[poCode]/deliveries/new`, `materials/deliveries/` |
| 8 | Specs + quality standards | ✅ Have | `specifications/`+`[code]` + `quality-standards/`+`[code]` |

### C9 · Dev Ops
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Marketing pipeline `[core]` | ✅ Have | `marketing/` campaigns/content/conversations (6 channels) |
| 2 | Lead-source attribution | ✅ Have | `marketing/attribution/` + `lead-sources/`+`[key]` |
| 3 | Content calendar + approval | ✅ Have | `marketing/content/`+`calendar` |
| 4 | Marketing assistant `[ai]` | ✅ Have | `marketing_assistant` seeded (0062); `ai-agents/marketing-assistant/` console |
| 5 | Unified inbox `[core][mobile]` | 🟡 Partial | `inbox/`+`[threadId]`+`templates`+`auto-responses` built; only WhatsApp channel confirmed live (TG/IG/Email/SMS partial) |
| 6 | Inbox templates + auto-responses | ✅ Have | `inbox/templates/`, `inbox/auto-responses/` + `cron/messaging-auto-response-evaluator` |
| 7 | Thread detail `[id]` | ✅ Have | `inbox/[threadId]/page.tsx` |
| 8 | Project-cycle intelligence `[ai]` | ✅ Have | `project-cycle/page.tsx` |
| 9 | Capacity tracking | 🔴 Missing | No capacity/utilization route found |
| 10 | Payroll periods | 🔴 Missing | No payroll route found |
| 11 | Productivity per-trade | ✅ Have | `productivity/page.tsx` (hours+qty→rate) |
| 12 | Productivity log entry | ✅ Have | `productivity/log/page.tsx` |

---

## NEW CABINETS

### Dev workspace — `/development-os/dashboard`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Dev command center | ✅ Have | `dashboard/page.tsx` |
| 2 | Cross-project KPIs | ✅ Have | `dashboard/page.tsx` cost/schedule/risk roll-up |

### Dev executive — `/development-os`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Executive summary `[ai]` | ✅ Have | `development-os/page.tsx` (12.9kb); `executive_business` seeded (0062) |
| 2 | Portfolio + risk reports | ✅ Have | `reports/` (8 routes) + `risk-radar/`+`[code]` |

### Dev marketing / warehouse
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Marketing (see C9) | ✅ Have | `marketing/` |
| 2 | Warehouse / materials store | ✅ Have | `warehouse/`, `materials/`, `assets/`, `asset-types/`, `inventory/` |
| 3 | Bulk import | ✅ Have | `bulk-import/`+`jobs` |

---

## App-only extras (Development) — built, no design coverage → send back to design
- **Reports hub** (`/development-os/reports`): budget-burn, cashflow-waterfall, cost-heatmap, investor-capital-timeline, procurement-delays, s-curve, sales-funnel, workforce-productivity — 8 analytical reports with no design.
- **QA/QC + quality** (`/qa-qc`+`[code]`+`inspect`, `/quality-standards`, `/quantity-surveying`) — inspection workflow not in design inventory.
- **Schedule resourcing** (`/schedule/calendars`, `/schedule/resources`) — cross-project resource calendars beyond the per-project schedule.
- **Safety** (`/safety`+`new`), **strategic planning** (`/strategic`), **risk-radar** (`/risk-radar`) — portfolio-level surfaces.
- **Residual inventory** (`/residual-inventory/[unitId]`), **revenue-streams**, **reservations** — post-handover unit + revenue surfaces.
- **Role cabinets** (`/cabinets/*`: cfo-accountant, marketing-staff, procurement-manager+pos+rfqs, project-manager, qs, sales-manager, site-supervisor, warehouse-manager, my-cabinet) — responsibility-scope landing pages.
- **Dev-OS-local platform views** (`/development-os/platform/*`: api-docs, branding, organizations, usage) — distinct from `(platform-app)`.
- **Deep dev-finance** (`/finance/*`: bank-review, budget, corporate-events, document-extractions, fx, period-close, reconciliation, rules, statement-import, tax-reports, transactions+import) — far beyond the design's CFO console.
- **WhatsApp ops** (`/whatsapp/*`: messages, templates, phone-numbers) and **communications**, **integrations**, deep **settings** (12 routes).
