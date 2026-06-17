# Dev-OS Production-Completeness Audit — 2026-06-17

**Question this answers:** "Доделали ли мы девелопмент-платформу и админ-платформу?"

**Method:** 15 cabinet-cluster audit agents read every `page.tsx` under `src/app/(development-app)/development-os/**`, traced each surface to the server actions/queries it calls, and classified it COMPLETE vs a GAP. Every high/med GAP was then re-checked by an independent **adversarial verifier** that re-read the cited file:line and either confirmed or rejected it. This is a *completeness* audit (is the feature finished & usable), not a *does-an-action-exist* audit (that was the prior wire-up sweep).

## Headline

**The spine is production-deep; the edges are not.** Every cabinet's *core* entity has real CRUD + lifecycle + money flows wired to org-scoped DB reads (see "What is production-deep" per cabinet below — these highlights are genuinely strong). But the audit confirmed **86 real completeness gaps (45 high, 39 med) + 26 low**, concentrated in four shapes:

| Gap type | n | What it means |
|---|---:|---|
| **MISSING_CRUD** | 33 | You can VIEW the entity but can't create/edit/advance it — the server action exists, org-scoped and complete, with **zero UI caller**. Empty-states literally say "Use the `createX` server action". |
| **MOCK_DATA** | 17 | Page renders hardcoded/synthetic data instead of the DB. Heavily in `/reports/*` (7 of 8 charts are fake) + a few orphaned duplicate pages. |
| **DEAD_END** | 16 | Flow starts but can't finish (disabled button, no-op modal, a status that can never advance). |
| **SHALLOW** | 13 | Exists but missing a key piece — UUID slices instead of names on money pages, missing joins, missing filters. |
| **STUB** | 5 | Pure prose placeholder page, no form. |
| **BROKEN_DRILL** | 2 | A link/promise to a detail route that doesn't exist. |

**So: no, not "done" — but the gap is mostly mechanical.** ~33 of 86 are "mount a form/button over an action that's already built and tenant-safe" — the same shape as the functional-gap wave (#267–272) and wire-up sweep (#111–118). The harder ones are the money-lifecycle dead-end (contracts → AJB), the mock reports, and deleting a few orphaned mock pages.

## ⚠️ Security side-effects (3 cross-tenant read leaks) — FIXED in this PR

The completeness audit caught three pages issuing **unscoped reads** (no `organization_id` filter) against org-owning tables — i.e. they render *other tenants'* data. Trivial one-line fixes, shipped here regardless of the wave plan (standing "fix leaks immediately" pattern, BYPASSRLS = code-only isolation):

1. `procurement/quotations` — `listAllQuotations()` selected `procurement_quotations` with `.limit(200)` and **no org filter** → every org's quotations. Fixed: `requireOrgId()` + `eq(procurementQuotations.organizationId, orgId)`.
2. `reports/cashflow-waterfall` — raw `SELECT … FROM cashflow_forecasts WHERE status='active'` with no org filter → could surface another tenant's forecast as the headline chart. Fixed: `AND organization_id = ${orgId}`.
3. `marketing/lead-sources/[key]` — raw `SELECT COUNT(*) FROM leads WHERE lead_source_key=…` with no org filter → "leads attributed" counted across all tenants. Fixed: `AND organization_id = ${orgId}`.

(These were inline page-level raw queries, which is why the `db.select()` tenancy guard didn't flag them. Worth a follow-up: extend the guard to catch raw `db.execute(sql)` reads of org tables.)

## Confirmed gaps by cabinet

| Cabinet | High/Med gaps | Note |
|---|---:|---|
| cabinets-settings-platform | 11 | Admin platform: settings pages with no form (roles, branding, data-export, my-cabinet, webhooks, api-keys), platform landing mock + no create-org UI, RFQ award no-op |
| projects | 10 | BOQ mock, permits/land/company/decisions/change-orders/tasks read-only, Documents tab stub |
| executive-reports | 9 | **7 of 8 reports are MOCK_DATA** (s-curve, budget-burn, cost-heatmap, capital-timeline, sales-funnel, workforce, procurement-delays) |
| finance-cfo | 8 | cfo/cashflow + capital-calls/[id] mock, budget read-only, corporate-events/bank-account/distributions CRUD gaps |
| sales-contracts-buyers | 6 | **contract → completed/AJB unreachable (money!)**, revenue-streams no list/CRUD, buyers UUID slices |
| procurement-vendors-materials | 6 | engagement/performance/PO-cancel/delivery-QC read-only, quotations leak (fixed) |
| inventory-warehouse-assets | 6 | residual-inventory + assets + locations + item-edit read-only |
| site-construction | 6 | safety detail route missing + photo dead-end, spec/method/quality-standard create forms too thin, QA↔standard link unwired |
| ai-agents | 6 | **agent output review can never be approved/rejected** (whole HITL loop dead-ends), digests no lifecycle, memory no manual entry |
| marketing | 5 | content/new + conversations + leads read-only/stub |
| schedule-coordination | 4 | calendars/resources/productivity read-only, project-cycle gen orphaned |
| capital-investors | 3 | investor-requests UUID slices (money triage), investor-detail no Add-commitment |
| communications | 3 | whatsapp templates/phone-numbers no CRUD, /communications orphaned mock |
| boq-qs | 2 | BOQ detail can only CSV-replace (no add-section/line), new-BOQ dead-ends without CSV |
| risk | 1 | /strategic is an orphaned mock (delete) |

## HIGH-severity inventory (45)

### Money / lifecycle critical (do first)
- **`contracts/[id]` → completed/AJB is unreachable** (`contract-actions.ts`). No action ever sets `contractGroups.status='completed'` / `completed_at`. Since `revenue-recognition-queries.ts` recognises sale revenue ONLY when status='completed' OR completed_at IS NOT NULL, **all collected sale cash is stuck "deferred" forever** and the Contracts "Completed" KPI is permanently 0. Fix: `completeContractGroup`/`recordAjbTransfer` action (require all signed + milestones paid) + "Mark AJB" button + `in_payment` auto-transition on final milestone payment.
- **`investor-requests` list + `[code]` detail** — operator approves/executes a money-moving **wallet movement** while the page shows `investorId.slice(0,8)` / `sourceProjectId.slice(0,8)` UUIDs (no join). Fix: LEFT JOIN investors + projects, render names.

### MOCK_DATA (renders fake data instead of DB)
- `projects/[slug]/boq` + `boq/[lineId]` — `Math.random()` BOQ; lineId never queried (same fabricated screen for every line).
- `cfo/cashflow` — `syntheticMonths()` 12-month chart; a real one exists at `/cashflow-forecast` (duplicate fake → redirect/delete).
- `cfo/capital-calls/[id]` — `MOCK_DETAIL` keyed only on `cc-001`; **every real capital-call 404s**. Needs a real `loadCfoCapitalCallDetail(id)` reader.
- `strategic` — entire page hardcoded `const UNITS` + literal KPIs, both buttons "Coming soon", **route orphaned** (nav points to /profitability + /project-cycle). → **delete**.
- `communications` — hardcoded TEMPLATES/KPIs, orphaned from nav, duplicates `/whatsapp/*`. → **delete**.
- `platform` (landing) — hardcoded `const ORGS` + literal KPIs; super-admins see fabricated tenants/MRR. Real `listOrganizations()` already used by sibling.
- `cabinets/procurement-manager/rfqs/[id]` — ignores `[id]`, hardcoded 3-vendor comparison + fake recommendation.
- **`reports/*` — 7 of 8 are hardcoded arrays**: s-curve, budget-burn, cost-heatmap, investor-capital-timeline, sales-funnel, workforce-productivity, procurement-delays. (Only cashflow-waterfall is real.) Each has a real data source available (milestones / `getProjectFinancialSummary` / `unit_cost_allocations` / investor-capital / sales / dev_material_pos).

### MISSING_CRUD (action built & org-scoped, zero UI)
- `projects/[slug]/permits` — no create (empty-state cites `createPermit`).
- `finance/budget` — Budgeted baseline can never be entered (`createBudgetLine` unmounted) → variance % meaningless on a fresh tenant.
- `vendors/[code]` — engagements read-only (`setEngagementStatus`/`terminateVendorEngagement` unmounted).
- `residual-inventory` (list + `[unitId]`) — `markUnitAsResidual`/`allocateResidualOwnership`/`transferResidualUnitToManagement`/`recordResidualUnitSold` all unmounted.
- `assets` — `createAsset`/`updateAssetAttributes`/`changeAssetType` unmounted, no detail route.
- `inventory/locations` — `createInventoryLocation` (dev-OS) unmounted.
- `schedule/calendars/[code]` — `addHoliday`/`editWorkingCalendar`/`archiveWorkingCalendar` unmounted.
- `schedule/resources/[code]` — `assignResourceToTask`/`editResourcePool`/`archiveResourcePool` unmounted.
- `marketing/leads` — read-only, no detail route, no create/advance.
- `digests/[code]` — `approveDigest`/`distributeDigest`/`editDigestSection` unmounted → digest stuck "draft".
- `whatsapp/templates` — no create/edit/approve → outbound template path dead (only approved templates can send).
- `whatsapp/phone-numbers` — register/resolve actions unmounted.
- `settings/users-and-roles` — `grantUserRole`/`revokeUserRole` unmounted (the admin page built for exactly this).
- `platform/branding` — header promises hex inputs; body is read-only `<pre>` (`updateOrganizationBranding` unmounted).

### DEAD_END / STUB / BROKEN_DRILL (high)
- `cfo/capital-calls/[id]` — "Record receipt" button permanently disabled; `RecordCapitalReceivedModal` exists, not wired.
- `revenue-streams` — `listRevenueStreams()` fetched then **never rendered** (create with no list of result).
- `safety` — **no `safety/[id]` route** (BROKEN_DRILL) and create-form promises "photos on the detail page" that doesn't exist (DEAD_END); `safety_incidents.photoDocumentIds[]` never written.
- `marketing/content/new` — pure prose, **no form** (the cabinet's most-linked CTA); no `createContentPiece` exists.
- `marketing/conversations/[code]` — `recordConsent`/`triggerConversationAnalysis` unmounted; no message-list query.
- `digests/new` — instruction card, no generate form (`generateDigest` only called by cron).
- **`ai-agents` output review** — every run persists `awaiting_review`; `AgentOutputDetail` is read-only with only a Back button; **there is zero `.update(agentOutputs)` anywhere** → the review queue can never be cleared.
- `platform` — "+ Organization" / "Export" disabled; `createOrganization` has no UI path (only server-side provisioning wrapper).
- `cabinets/procurement-manager/rfqs/[id]` — "Award PO" modal has no `onConfirm` → writes no PO.
- `settings/data-export` — `requestDataExport` unmounted (empty-state cites it).

## MED-severity inventory (39) — compact

**projects (5):** permits/[id], company, decisions/[code] (supersede/reverse unmounted), change-orders/[code] (transition unmounted), schedule/tasks/[code] (no task-update action), Documents tab (stub).
**finance-cfo (4):** distributions (Coming-Q3 stub but linked as primary CTA), cfo capital-waterfall (illustrative literal), corporate-events (no create), bank-accounts/[id] (no edit/balance).
**capital-investors (1):** investors/[code] — empty-state says "Use the API or seed script"; `CommitmentModalForm` exists but only mounted on global /commitments.
**sales (3):** revenue-streams CRUD (create-only), buyers/[code] units (UUID slices, no join), sales/[contactRoleId] Documents tab (stub).
**boq-qs (2):** boq/[code] add-section/line (CSV-replace only), new-BOQ dead-ends without CSV.
**procurement (3):** vendor performance entry, materials/[poCode] cancel, delivery QC + delivery-detail route.
**inventory (2):** assets filter UI (reads searchParams, renders no control), inventory item edit/deactivate.
**site (3):** specifications + method-statements create forms collect a thin subset (no edit action → detail sections permanently empty), quality-standards↔QA-inspection link unwired.
**schedule (2):** productivity (no list/edit/delete of entries), project-cycle (generate orphaned everywhere, rows not drillable).
**marketing (2):** content/[code] (no status/variant control), lead-sources/[key] (count leak — fixed).
**ai-agents (3):** memory (no manual entry), route-to-human modal no-op, dynamic `[agentCode]` page (hardcoded empty runs for 13 agents).
**communications (1):** /communications mock (delete or wire).
**executive-reports (2):** /reports index markets fake reports as live; cashflow-waterfall org leak (fixed).
**cabinets-settings-platform (4):** my-cabinet (no form), webhooks (no per-row manage), api-keys (no revoke), bulk-import/jobs/[id] (BROKEN_DRILL — promised error-log route missing).

## LOW (26) — polish, deferred
Filters/search/pagination missing on several lists (investors, commitments, distributions, investor-requests inbox), disabled "Coming soon" buttons in cabinet headers, stale empty-state copy, "demo data" report badging, intentional read-only-by-design surfaces (channels calendar, channel inbox detail), orphaned `/new` stub routes whose modal-on-index works. Full list in the audit JSON. None block a tenant from operating.

## What IS production-deep (so this is "finish", not "rebuild")
Per-cabinet, the verified-complete spine includes: full investor lifecycle + money moves (capital-investors — strongest), the finance hub (transactions/GL/accounting/tax/commitments/shared-costs/reconciliation/profitability/cashflow-forecast), the procurement RFQ→PO loop, warehouse stock/picks/receive/cycle-count, site-reports + QA-QC + drawings, coordination board, risk radar, marketing campaigns/connections/content-kanban, the inbox + channels cabinets, the executive monthly/quarterly/YTD surfaces, and the platform/settings admin core (orgs, approval-thresholds, notifications, ai-usage, bulk-import). The gaps are secondary surfaces, reports, and a handful of orphaned mocks.

## Proposed fix waves
- **Wave A — security + money (small, critical, mostly shipped here):** 3 leaks ✅; contract→AJB completion + revenue-recognition unblock; investor-requests + buyers UUID→names joins.
- **Wave B — mount-existing-action CRUD (the big mechanical one, fan-out by cabinet, file-disjoint):** the 33 MISSING_CRUD + high DEAD_ENDs — each "mount a form/button over a built, tenant-safe action". Mirrors #111–118 / #267–272.
- **Wave C — mock-data → real / delete orphans:** delete `/strategic`, `/communications`, `/cfo/cashflow` dup; real readers for `cfo/capital-calls/[id]`, `rfqs/[id]`, `platform`, `boq`; wire the 7 reports (or badge "demo" + defer).
- **Wave D — STUB pages + LOW polish:** filters, copy, disabled-button cleanup.
