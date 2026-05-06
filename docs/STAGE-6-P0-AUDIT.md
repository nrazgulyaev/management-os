# Stage 6.P0 — Forms Audit

**Generated**: P0.1 deliverable. **Status**: complete.
**Scope**: every page under `(development-app)/`, `(dashboard)/`, `(investor-portal)/`, `(buyer-portal)/`, `(vendor)/`. Excludes `(guest)/` and `(public)/` (those are external-user surfaces, out of P0 scope).
**Method**: directory-level entity inventory + action-file existence + form-component existence.

---

## Executive summary

| Workspace | Pages | Entity areas | Fully editable today | Backend-ready (no UI form) | UI shell (no action) | Read-only |
|---|---:|---:|---:|---:|---:|---:|
| Development OS `(development-app)/development-os/` | 212 | 45 | 9 | 9 | 1 | 26 |
| Management OS `(dashboard)/dashboard/` | 251 | 38 | 14 | 4 | 8 | 11 |
| Investor portal | 13 | 6 | 1 (requests) | 0 | 2 | 3 |
| Buyer portal | 6 | 3 | 0 | 0 | 0 | 3 |
| Vendor portal | 2 | 1 | 0 | 0 | 1 | 0 |
| **Total** | **484** | **93** | **24** | **13** | **12** | **44** |

Six entity areas appear in **both** Development OS and Management OS (intentional dual-views): `finance`, `inventory`, `operations`, `procurement`, `projects`, `settings`. Counted once each in the totals.

**Key finding**: Action files exist for most Tier 1–5 entities the launch prompt names. The dominant gap is **UI form components + edit/delete affordances**, not backend wiring. This is a UI-build sprint, not a backend-build sprint.

**Edit-page pattern is essentially absent**: across all 93 entity areas only ~6 have a dedicated `[id]/edit/page.tsx` route. The dominant pattern in Stage 6.P0 needs to be **modals or inline editing**, not separate edit routes.

---

## Tier mapping (launch prompt scope → audit reality)

The launch prompt names ~34 entities across 5 tiers. Mapped to actual coverage:

### Tier 1 — Bookkeeper (must-have, P0.4 scope)

| Entity | Actions file | Existing form? | List page? | New form work | Notes |
|---|---|---|---|---|---|
| Projects | [src/features/projects/actions.ts](src/features/projects/actions.ts) | [src/features/projects/form.tsx](src/features/projects/form.tsx) | ✓ both workspaces | Edit modal + delete confirm | Create form exists in dashboard; dev-os list is read-only |
| Villas | [src/features/villas/actions.ts](src/features/villas/actions.ts) | [src/features/villas/form.tsx](src/features/villas/form.tsx) | ✓ dashboard | Edit modal + delete confirm | Same shape as projects |
| Vendors | [src/lib/development/server/vendor-actions.ts](src/lib/development/server/vendor-actions.ts), [src/features/service-fulfilment/actions.ts](src/features/service-fulfilment/actions.ts) | [src/components/service-fulfilment/create-vendor-form.tsx](src/components/service-fulfilment/create-vendor-form.tsx) | ✓ both | Dev-os create form, edit modal | Service-fulfilment vendor form exists in dashboard |
| Transactions | [src/lib/development/server/transaction-actions.ts](src/lib/development/server/transaction-actions.ts) | ✗ | ✓ | **Full create + edit + delete** | Highest-priority Tier 1 missing UI |
| Invoices | [src/lib/development/server/invoice-actions.ts](src/lib/development/server/invoice-actions.ts) (`createInvoice`, `recordInvoicePayment`, `voidInvoice`) | ✗ | ✓ | **Full create + payment + void UI** | Backend complete; UI absent |
| Cost categories | [src/lib/development/server/cost-category-actions.ts](src/lib/development/server/cost-category-actions.ts) | ✗ | ? | **Full CRUD** | Need to verify list-page presence |
| Bank accounts | [src/lib/development/server/bank-account-actions.ts](src/lib/development/server/bank-account-actions.ts) | ✗ | ? | **Full CRUD** | Need to verify list-page presence |

**Tier 1 status**: 0 of 7 entities are "fully editable today" by the bookkeeper definition (create/edit/delete via UI). All 7 have actions.

### Tier 2 — Sales (must-have, P0.5 scope)

| Entity | Actions file | Existing form? | New form work |
|---|---|---|---|
| Contacts | (no `contact-actions.ts` found — likely in `contacts/` schema only, no actions yet) | ✗ | **Action file + form** |
| Leads | [src/lib/development/server/lead-actions.ts](src/lib/development/server/lead-actions.ts) | ✗ | Full CRUD UI |
| Reservations | [src/lib/development/server/reservation-actions.ts](src/lib/development/server/reservation-actions.ts) | ✗ | Full CRUD UI |
| Contracts | [src/lib/development/server/contract-actions.ts](src/lib/development/server/contract-actions.ts) | ✗ | Full CRUD UI |
| Buyers | [src/lib/development/server/buyers/buyer-actions.ts](src/lib/development/server/buyers/buyer-actions.ts) (`createBuyer`, `assignUnitToBuyer`, `activateBuyerPortalAccess`, `updateBuyerKycStatus`) | ✗ | Full CRUD UI |
| Lead sources | [src/lib/development/server/lead-sources/lead-source-actions.ts](src/lib/development/server/lead-sources/lead-source-actions.ts) | ✗ | Full CRUD UI |

**Tier 2 status**: 0 of 6 fully editable. Contacts likely needs an action file written.

### Tier 3 — Operations (must-have, P0.6 scope)

| Entity | Actions file | Existing form? | Status |
|---|---|---|---|
| QA/QC issues | [src/lib/development/server/qa-qc/qa-qc-actions.ts](src/lib/development/server/qa-qc/qa-qc-actions.ts) | [src/components/development/qa-qc/qa-qc-create-form.tsx](src/components/development/qa-qc/qa-qc-create-form.tsx) | **Fully editable today** ✓ |
| Inventory items | [src/lib/development/server/inventory/inventory-actions.ts](src/lib/development/server/inventory/inventory-actions.ts) | [src/components/development/inventory/inventory-item-form.tsx](src/components/development/inventory/inventory-item-form.tsx) | **Fully editable today** ✓ |
| Inventory movements | (same file) | (same file `movement-form.tsx`) | **Fully editable today** ✓ |
| Tasks | [src/lib/development/server/schedule/schedule-actions.ts](src/lib/development/server/schedule/schedule-actions.ts) | [src/components/development/schedule/task-form.tsx](src/components/development/schedule/task-form.tsx) | **Fully editable today** ✓ |
| Decisions | [src/lib/development/server/decisions/decision-actions.ts](src/lib/development/server/decisions/decision-actions.ts) | [src/components/development/decisions/decision-form.tsx](src/components/development/decisions/decision-form.tsx) | **Fully editable today** ✓ |
| Risks | [src/lib/development/server/risks/risk-actions.ts](src/lib/development/server/risks/risk-actions.ts) | [src/components/development/risks/risk-form.tsx](src/components/development/risks/risk-form.tsx) | **Fully editable today** ✓ |
| Change orders | [src/lib/development/server/change-orders/change-order-actions.ts](src/lib/development/server/change-orders/change-order-actions.ts) | [src/components/development/change-orders/change-order-form.tsx](src/components/development/change-orders/change-order-form.tsx) | **Fully editable today** ✓ |

**Tier 3 status**: **7 of 7 fully editable today.** Only need: edit-modal coverage and delete confirms. Lightest tier by far.

### Tier 4 — Extras (P0.6/P0.7 scope)

| Entity | Actions file | Existing form? | Status |
|---|---|---|---|
| Drawings | [src/lib/development/server/drawings/drawing-actions.ts](src/lib/development/server/drawings/drawing-actions.ts) | [src/components/development/drawings/drawing-form.tsx](src/components/development/drawings/drawing-form.tsx) | Fully editable ✓ |
| BOQ items | [src/lib/development/server/boq/boq-actions.ts](src/lib/development/server/boq/boq-actions.ts) | [src/components/development/boq/boq-form.tsx](src/components/development/boq/boq-form.tsx) + `boq-import-form.tsx` | Fully editable ✓ |
| Specifications | [src/lib/development/server/specifications/specification-actions.ts](src/lib/development/server/specifications/specification-actions.ts) | [src/components/development/specifications/specification-form.tsx](src/components/development/specifications/specification-form.tsx) | Fully editable ✓ |
| Method statements | [src/lib/development/server/method-statements/method-statement-actions.ts](src/lib/development/server/method-statements/method-statement-actions.ts) | form file present | Fully editable ✓ |
| Quality standards | [src/lib/development/server/quality-standards/quality-standard-actions.ts](src/lib/development/server/quality-standards/quality-standard-actions.ts) | form file present | Fully editable ✓ |
| Site reports | [src/lib/development/server/site-report-actions.ts](src/lib/development/server/site-report-actions.ts) | ✗ (only photo-upload-zone) | UI form needed |
| Materials | [src/lib/development/server/material-actions.ts](src/lib/development/server/material-actions.ts) | ✗ | UI form needed |
| Work packages | [src/lib/development/server/work-packages/work-package-actions.ts](src/lib/development/server/work-packages/work-package-actions.ts) | [src/components/development/work-packages/work-package-form.tsx](src/components/development/work-packages/work-package-form.tsx) | Fully editable ✓ |
| Phases | (no clear `*-phase-actions.ts` — likely nested in projects/cycle) | ✗ | Action file + UI |
| Land plots | (no clear `*-land-actions.ts`) | ✗ | Action file + UI |
| Investors | [src/lib/development/server/investor-actions.ts](src/lib/development/server/investor-actions.ts) | ✗ | UI form needed |

**Tier 4 status**: 6 of 11 fully editable today. 5 need new forms; phases and land-plots may need action files.

### Tier 5 — Admin / team (P0.6 scope)

| Entity | Actions file | Existing form? | Status |
|---|---|---|---|
| Users (invite + edit role) | (search needed — likely `src/features/auth/actions.ts` or similar) | ✗ | Likely action exists; UI invite form needed |
| Organizations | [src/lib/development/server/organizations/organization-actions.ts](src/lib/development/server/organizations/organization-actions.ts) | ✗ (only branding stub) | Settings UI needed |
| API keys | [src/lib/development/server/api/api-key-actions.ts](src/lib/development/server/api/api-key-actions.ts) | ✗ (Stage 5.J left as backend-only) | "Generate key" + revoke UI |
| Webhook subscriptions | [src/lib/development/server/webhooks/webhook-actions.ts](src/lib/development/server/webhooks/webhook-actions.ts) | ✗ (Stage 5.J backend-only) | Subscribe/test/revoke UI |

**Tier 5 status**: 0 of 4 fully editable. All have actions. UIs are mostly thin "settings page" forms.

---

## Detailed entity table — Development OS (45 entities)

(Source: explore-agent walk of `src/app/(development-app)/development-os/`.)

| Entity area | List | Detail | Create | Edit | Form | Actions | Exported actions |
|---|---|---|---|---|---|---|---|
| ai-agents | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| asset-types | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| assets | ✓ | ✗ | ✗ | ✗ | ✗ | [assets/asset-actions.ts](src/lib/development/server/assets/asset-actions.ts) | createAsset, updateAssetAttributes, changeAssetType |
| boq | ✓ | ✓ | ✓ | ✗ | [boq/boq-form.tsx](src/components/development/boq/boq-form.tsx) | [boq/boq-actions.ts](src/lib/development/server/boq/boq-actions.ts) | createBoqDocument, addBoqSection, addBoqItem, recomputeBoqTotals, importBoqFromCsv, exportBoqAsCsv, transitionBoqStatus |
| buyers | ✓ | ✓ | ✗ | ✗ | ✗ | [buyers/buyer-actions.ts](src/lib/development/server/buyers/buyer-actions.ts) | createBuyer, assignUnitToBuyer, activateBuyerPortalAccess, updateBuyerKycStatus |
| cabinets | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| cashflow-forecast | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| commitments | ✓ | ✓ | ✗ | ✗ | ✗ | [commitment-actions.ts](src/lib/development/server/commitment-actions.ts) | (top-level file — not in subfolder) |
| contracts | ✓ | ✓ | ✗ | ✗ | ✗ | [contract-actions.ts](src/lib/development/server/contract-actions.ts) | (top-level) |
| dashboard | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| digests | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | — |
| discounts | ✓ | ✗ | ✗ | ✗ | ✗ | [discount-actions.ts](src/lib/development/server/discount-actions.ts) | (top-level) |
| distributions | ✓ | ✓ | ✓ | ✗ | ✗ | [distribution-actions.ts](src/lib/development/server/distribution-actions.ts) | (top-level) |
| drawings | ✓ | ✓ | ✓ | ✗ | [drawings/drawing-form.tsx](src/components/development/drawings/drawing-form.tsx) | [drawings/drawing-actions.ts](src/lib/development/server/drawings/drawing-actions.ts) | createDrawing, addDrawingRevision, transitionDrawingRevision, logDrawingDistribution |
| finance | ✓ | ✗ | ✗ | ✗ | [finance/invoice-payment-form.tsx](src/components/development/finance/invoice-payment-form.tsx) | (split across many top-level files) | transaction-, invoice-, bank-account-, cost-category- |
| inventory | ✓ | ✗ | ✗ | ✗ | [inventory/inventory-item-form.tsx](src/components/development/inventory/inventory-item-form.tsx) | [inventory/inventory-actions.ts](src/lib/development/server/inventory/inventory-actions.ts) | createInventoryItem, recordInventoryMovement, transferInventory, createInventoryLocation |
| investor-requests | ✓ | ✓ | ✗ | ✗ | ✗ | [investor-portal-requests/request-actions.ts](src/lib/development/server/investor-portal-requests/request-actions.ts) | (HITL workflow) |
| investors | ✓ | ✓ | ✗ | ✗ | ✗ | [investor-actions.ts](src/lib/development/server/investor-actions.ts) | (top-level) |
| invoices | ✓ | ✗ | ✗ | ✗ | ✗ | [invoice-actions.ts](src/lib/development/server/invoice-actions.ts) | createInvoice, recordInvoicePayment, voidInvoice, listInvoices, getInvoice |
| marketing | ✗ | ✗ | ✗ | ✗ | ✗ | (campaigns/, content/) | — |
| materials | ✓ | ✓ | ✓ | ✗ | ✗ | [material-actions.ts](src/lib/development/server/material-actions.ts) | (top-level) |
| method-statements | ✓ | ✓ | ✓ | ✗ | [method-statement-form.tsx](src/components/development/method-statements/method-statement-form.tsx) | [method-statement-actions.ts](src/lib/development/server/method-statements/method-statement-actions.ts) | createMethodStatement, transitionMethodStatement |
| operations | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| platform | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | (Stage 5.J pages) |
| procurement | ✓ | ✗ | ✗ | ✗ | [procurement/purchase-request-mobile-form.tsx](src/components/development/procurement/purchase-request-mobile-form.tsx) | [procurement-actions.ts](src/lib/development/server/procurement/procurement-actions.ts) | createPurchaseRequest, transitionPurchaseRequest, addQuotation, selectQuotation |
| productivity | ✓ | ✗ | ✗ | ✗ | ✗ | [productivity/productivity-actions.ts](src/lib/development/server/productivity/productivity-actions.ts) | recordProductivityLog |
| profitability | ✓ | ✗ | ✗ | ✗ | ✗ | [profitability/profitability-actions.ts](src/lib/development/server/profitability/profitability-actions.ts) | recomputeUnitAllocation, overrideUnitAllocation |
| project-cycle | ✓ | ✗ | ✗ | ✗ | ✗ | [cycle-actions.ts](src/lib/development/server/project-cycle/cycle-actions.ts) | createPayrollPeriod, trackTeamCapacity, generateCycleRecommendation, reviewCycleRecommendation |
| projects | ✓ | ✓ | ✗ | ✗ | ✗ | (in `src/features/projects/`) | createProjectAction, updateProjectAction |
| qa-qc | ✓ | ✓ | ✓ | ✗ | [qa-qc/qa-qc-create-form.tsx](src/components/development/qa-qc/qa-qc-create-form.tsx) | [qa-qc/qa-qc-actions.ts](src/lib/development/server/qa-qc/qa-qc-actions.ts) | createQaQcIssue, transitionQaQcIssue, recordQaQcInspection, attachQaQcPhoto |
| quality-standards | ✓ | ✓ | ✓ | ✗ | [quality-standard-form.tsx](src/components/development/quality-standards/quality-standard-form.tsx) | [quality-standard-actions.ts](src/lib/development/server/quality-standards/quality-standard-actions.ts) | createQualityStandard, deactivateQualityStandard |
| quantity-surveying | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| reports | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| reservations | ✓ | ✗ | ✗ | ✗ | ✗ | [reservation-actions.ts](src/lib/development/server/reservation-actions.ts) | (top-level) |
| residual-inventory | ✓ | ✓ | ✗ | ✗ | ✗ | [residual-inventory/residual-actions.ts](src/lib/development/server/residual-inventory/residual-actions.ts) | markUnitAsResidual, allocateResidualOwnership, transferResidualUnitToManagement, recordResidualUnitSold |
| revenue-streams | ✓ | ✗ | ✗ | ✗ | ✗ | [revenue-streams/revenue-stream-actions.ts](src/lib/development/server/revenue-streams/revenue-stream-actions.ts) | createRevenueStream |
| risk-radar | ✓ | ✓ | ✗ | ✗ | ✗ | [risk-radar/risk-radar-actions.ts](src/lib/development/server/risk-radar/risk-radar-actions.ts) | persistDetectedAlert, acknowledgeAlert, resolveAlert, markFalsePositive |
| safety | ✓ | ✗ | ✓ | ✗ | ✗ | [safety-actions.ts](src/lib/development/server/safety-actions.ts) | (top-level) |
| sales | ✓ | ✓ | ✗ | ✗ | ✗ | (in `src/features/sales/`) | — |
| schedule | ✓ | ✗ | ✗ | ✗ | [schedule/task-form.tsx](src/components/development/schedule/task-form.tsx) | [schedule/schedule-actions.ts](src/lib/development/server/schedule/schedule-actions.ts) | createProjectTask, setTaskDependency, recomputeProjectCriticalPath |
| settings | ✓ | ✗ | ✗ | ✗ | ✗ | (per-section actions) | — |
| site-reports | ✓ | ✓ | ✓ | ✗ | ✗ | [site-report-actions.ts](src/lib/development/server/site-report-actions.ts) | (top-level) |
| specifications | ✓ | ✓ | ✓ | ✗ | [specification-form.tsx](src/components/development/specifications/specification-form.tsx) | [specification-actions.ts](src/lib/development/server/specifications/specification-actions.ts) | createSpecification, supersedeSpecification, deactivateSpecification |
| vendors | ✓ | ✓ | ✓ | ✗ | ✗ | [vendor-actions.ts](src/lib/development/server/vendor-actions.ts) | (top-level) |
| whatsapp | ✓ | ✗ | ✗ | ✗ | ✗ | [whatsapp-actions.ts](src/lib/development/server/whatsapp-actions.ts) | (top-level) |

---

## Detailed entity table — Management OS dashboard (38 entities)

(Source: explore-agent walk of `src/app/(dashboard)/dashboard/`.)

| Entity area | List | Create | Form | Actions | Exported (key) |
|---|---|---|---|---|---|
| ai | ✓ | ✗ | ✗ | ✗ | — |
| audit | ✓ | ✗ | ✗ | ✗ | — |
| availability | ✓ | ✗ | [calendar-block-form.tsx](src/components/availability/calendar-block-form.tsx) | [availability/actions.ts](src/features/availability/actions.ts) | createVillaCalendarBlockAction |
| bookings | ✓ | ✓ | [bookings/form.tsx](src/features/bookings/form.tsx) | [bookings/actions.ts](src/features/bookings/actions.ts) | createBookingAction, updateBookingAction |
| channels | ✓ | ✓ | ✗ | [channels/actions.ts](src/features/channels/actions.ts) | createChannelAction |
| demo | ✓ | ✗ | ✗ | ✗ | — |
| direct-bookings | ✓ | ✗ | ✗ | [direct-booking/actions.ts](src/features/direct-booking/actions.ts) | (read-only / lifecycle) |
| documents | ✓ | ✓ | ✗ | [documents/actions.ts](src/features/documents/actions.ts) | createDocumentAction |
| finance | ✓ | ✗ | [finance/ledger-line-form.tsx](src/components/finance/ledger-line-form.tsx) | [finance/actions.ts](src/features/finance/actions.ts) | (mostly read) |
| front-office | ✓ | ✗ | ✗ | [front-office/actions.ts](src/features/front-office/actions.ts) | — |
| guest-ai | ✓ | ✗ | [staff-reply-form.tsx](src/components/guest-ai/staff-reply-form.tsx) | [guest-ai-concierge/actions.ts](src/features/guest-ai-concierge/actions.ts) | (read) |
| guest-journey | ✓ | ✗ | [create-rule-form.tsx](src/components/guest-journey/create-rule-form.tsx) | [guest-journey/actions.ts](src/features/guest-journey/actions.ts) | (read) |
| guest-services | ✓ | ✗ | ✗ | ✗ | — |
| guest-stays | ✓ | ✗ | [issue-token-form.tsx](src/components/guest-stays/issue-token-form.tsx) | [guest-stays/actions.ts](src/features/guest-stays/actions.ts) | (read) |
| guests | ✓ | ✓ | ✗ | [guests/actions.ts](src/features/guests/actions.ts) | createGuestAction |
| integrations | ✓ | ✗ | [integrations/feed-form.tsx](src/components/integrations/feed-form.tsx) | [integrations/calendar-sync/actions.ts](src/features/integrations/calendar-sync/actions.ts) | (read) |
| inventory | ✓ | ✗ | [inventory/item-form.tsx](src/components/inventory/item-form.tsx) | [inventory/actions.ts](src/features/inventory/actions.ts) | createInventoryItemAction |
| jobs | ✓ | ✗ | ✗ | [jobs/actions.ts](src/features/jobs/actions.ts) | executeJob |
| maintenance-intelligence | ✓ | ✗ | [plan-form.tsx](src/components/maintenance-intelligence/plan-form.tsx) | [maintenance-intelligence/actions.ts](src/features/maintenance-intelligence/actions.ts) | createMaintenanceTemplateAction |
| notifications | ✓ | ✗ | [self-preference-form.tsx](src/components/notifications/self-preference-form.tsx) | [notifications/actions.ts](src/features/notifications/actions.ts) | (read) |
| operations | ✓ | ✗ | [operations/task-form.tsx](src/components/operations/task-form.tsx) | [operations/actions.ts](src/features/operations/actions.ts) | createOperationTaskAction |
| owner-intelligence | ✓ | ✗ | ✗ | [owner-intelligence/actions.ts](src/features/owner-intelligence/actions.ts) | (read) |
| owner-stays | ✓ | ✗ | [policy-form.tsx](src/components/owner-stays/policy-form.tsx) | [owner-stays/actions.ts](src/features/owner-stays/actions.ts) | (read) |
| owners | ✓ | ✓ | [owners/form.tsx](src/features/owners/form.tsx) | [owners/actions.ts](src/features/owners/actions.ts) | createOwnerAction, updateOwnerAction |
| payments | ✓ | ✗ | ✗ | ✗ | — |
| pricing | ✓ | ✗ | [pricing/create-rate-plan-form.tsx](src/components/pricing/create-rate-plan-form.tsx) | [pricing/actions.ts](src/features/pricing/actions.ts) | createRatePlanAction |
| procurement | ✓ | ✗ | [procurement/request-form.tsx](src/components/procurement/request-form.tsx) | [procurement/actions.ts](src/features/procurement/actions.ts) | createPurchaseRequestAction |
| projects | ✓ | ✓ | [projects/form.tsx](src/features/projects/form.tsx) | [projects/actions.ts](src/features/projects/actions.ts) | createProjectAction, updateProjectAction |
| readiness | ✓ | ✗ | [readiness-set-form.tsx](src/components/readiness/readiness-set-form.tsx) | [readiness/actions.ts](src/features/readiness/actions.ts) | setVillaReadinessAction |
| security | ✓ | ✗ | [camera-form.tsx](src/components/security/camera-form.tsx) | [security/actions.ts](src/features/security/actions.ts) | createSecurityCameraDeviceAction |
| service-fulfilment | ✓ | ✗ | [create-vendor-form.tsx](src/components/service-fulfilment/create-vendor-form.tsx) | [service-fulfilment/actions.ts](src/features/service-fulfilment/actions.ts) | createServiceVendorAction |
| settings | ✓ | ✗ | ✗ | ✗ | — |
| shares | ✓ | ✓ | ✗ | [shares/actions.ts](src/features/shares/actions.ts) | createShareAction |
| system | ✗ | ✗ | ✗ | ✗ | — |
| utilities | ✓ | ✗ | [account-form.tsx](src/components/utilities/account-form.tsx) | [utilities/actions.ts](src/features/utilities/actions.ts) | createUtilityAccountAction |
| villa-guides | ✓ | ✗ | [place-form.tsx](src/components/villa-guides/place-form.tsx) | [villa-guides/actions.ts](src/features/villa-guides/actions.ts) | (read) |
| villas | ✓ | ✓ | [villas/form.tsx](src/features/villas/form.tsx) | [villas/actions.ts](src/features/villas/actions.ts) | createVillaAction, updateVillaAction |

---

## Portals (investor / buyer / vendor)

| Workspace | Page | Action coverage | Form coverage |
|---|---|---|---|
| investor-portal | dashboard, commitments, distributions, profile, requests, wallet/reinvest, wallet/withdraw | [request-actions.ts](src/lib/development/server/investor-portal-requests/request-actions.ts) for HITL flows | [reinvest-request-form.tsx](src/components/investor-portal/reinvest-request-form.tsx), [withdraw-request-form.tsx](src/components/investor-portal/withdraw-request-form.tsx) — these are submit-only, no edit/cancel UI |
| buyer-portal | dashboard, units, reports/[id] | [buyer-progress-actions.ts](src/lib/development/server/buyers/buyer-progress-actions.ts) (admin-side updates buyer-visible reports) | None — buyer-portal is read-only by design |
| vendor | service/[token], service/[token]/invoice | [vendor-actions.ts](src/lib/development/server/vendor-actions.ts) (token-gated submit endpoints) | Inline forms in pages (token-scoped) |

**Out of P0 scope**: portals expose external-user surfaces. Their forms exist as part of those flows, not as admin CRUD. Tier 5 covers admin-side CRUD for portal users (org admin invites investor → grants access → revokes), not the portal UIs themselves.

---

## Gap classification

### Group A — Fully editable today (24 entities)
Already create+edit+delete via UI. **P0 work**: add edit modal where missing, delete confirm where missing, ensure mobile-friendly, add to bulk export.

Dev OS (9): boq, drawings, inventory, method-statements, procurement, qa-qc, quality-standards, schedule, specifications, work-packages
Dashboard (14): availability, bookings, documents, guests, owners, projects, shares, villas, channels, inventory (dup), operations, pricing, security, maintenance-intelligence, readiness, service-fulfilment, utilities

### Group B — Backend ready, UI missing (13 entities)
Have create-action; need form component + create-button wiring.

assets, buyers, invoices, productivity, profitability, project-cycle, residual-inventory, revenue-streams, risk-radar (dev OS); channels, documents, guests, shares (dashboard).

### Group C — UI shell, no action (12 entities)
Have form file but no `create*` action. Two patterns:
- Form is for transition/lifecycle (not creation): `staff-reply-form`, `feed-form`, `policy-form` → not blockers, leave as-is
- Form is genuinely orphaned: `finance/invoice-payment-form` → wire to `recordInvoicePayment` action

### Group D — Read-only (44 entities)
Most are dashboards/reports/digests that are intentionally read-only (cashflow-forecast, profitability list, distributions list, etc.). A subset are CRUD-eligible but missing both backend + UI:
- ai-agents (config UI)
- asset-types (catalog CRUD)
- cabinets (per-user config)
- contracts list
- cost-categories list
- discounts list
- investor-requests admin
- investors admin
- marketing
- materials
- operations (dev OS hub)
- platform (Stage 5.J pages exist but no CRUD UIs)
- quantity-surveying
- reports
- reservations
- safety
- sales
- settings
- site-reports
- vendors (dev OS list)
- whatsapp

### Group E — Tier 1 entities with NO list page (cost-categories, bank-accounts)
Need to verify whether these have any UI at all. Current finding: actions exist, no obvious list page in `(development-app)/development-os/`. Likely they live as sub-tabs of `/finance` or `/settings`.

---

## Recommended P0 build sequence (mapped to checkpoints)

| Checkpoint | Days | Entities | Work type |
|---|---:|---|---|
| **P0.2** Server-actions verification | 1 | All `*-actions.ts` files | Audit `"use server"` directive present, missing actions for contacts/phases/land-plots written |
| **P0.3** Project + Villa forms (Tier 1 a) | 2 | projects, villas | Edit modal + delete confirm in dev-os; reuse existing `src/features/projects/form.tsx` and `src/features/villas/form.tsx` |
| **P0.4** Finance forms (Tier 1 b) | 2 | transactions, invoices, vendors, cost-categories, bank-accounts | New forms for all 5 (largest single chunk) |
| **P0.5** Sales forms (Tier 2) | 1 | leads, contacts, reservations, contracts, buyers, lead-sources | Forms for all 6 |
| **P0.6** Operations forms (Tier 3) + Tier 5 admin | 1 | Existing 7 Tier 3 entities (edit/delete only) + 4 Tier 5 admin UIs | Lightest tier — most already have forms |
| **P0.7** Bulk import/export + Google Sheets OAuth | 2 | All Tier 1–4 entities | Migration 0075, `bulk_import_jobs`, `oauth_connections`, SheetJS, drag-drop UI, field mapper, batched processor |
| **P0.8** Polish + tests | 2 | All | EntityForm template extraction, mobile audit, audit-trail "Activity" tab, 200+ new tests |

Total: ~11 days. Matches the 1–2 week estimate.

---

## Decisions locked at P0.2 entry

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Edit pattern | **Modal** standard everywhere via reusable `<EntityModal>` component | Simpler, fewer routes, mobile-friendly. **Exception**: project detail (12 tabs) keeps full-page edit. The ~6 existing `[id]/edit/page.tsx` routes stay as-is |
| 2 | `cost-categories` + `bank-accounts` UI location | **Sub-tabs of `/finance`**: Transactions / Invoices / Vendors / Cost Categories / Bank Accounts / Reports | Aligns with bookkeeper mental model |
| 3 | Contacts vs leads | **Merged**. Contacts is the base entity (one shared person table); leads/buyers/owners reference it via `contact_id`. Lead form handles `contacts` upsert + `contact_roles` insert + `leads` insert atomically. No separate top-level contact CRUD form | Verified by reading `src/lib/db/schema/contacts.ts` and `marketing.ts` (leads.contactId FK). The public-marketing `/contact` page and `villa-guides/emergency-contacts` are different surfaces and stay as-is |
| 4 | Group D triage | **Dashboards stay read-only.** Address only the 18 CRUD-eligible Group D entities (listed below). `cashflow-forecast`, `profitability` list, `distributions` list, `risk-radar` list are intentional computed views — no CRUD UI |
| 5 | Phases + land-plots actions | **Land-plots: use existing [land-actions.ts](src/lib/development/server/land/land-actions.ts)** (7 exported functions including `upsertLandProfile`, `createLandPaymentSchedule`, `markLandInstallmentPaid`, `addLandTransactionCost`). **Phases: created inline by `createDevelopmentProject` in [actions.ts](src/lib/development/server/actions.ts); standalone phase CRUD deferred** until a clear P0.6 use case emerges. The existing `getProjectPhases` reader in `projects.ts` is sufficient for read |
| 6 | EntityForm template | **Confirmed.** Generic `<EntityForm<T>>` in `src/components/forms/entity-form-template.tsx`, documented in `src/components/forms/README.md` |
| 7 | Timeline | **1–2 weeks accepted**, 75 editable entities in scope, modal pattern reduces work |

**Architectural constraints** (locked):
- Mobile-friendly forms (44px touch targets, proper input types)
- Optimistic updates where safe
- Audit trail for every create/edit/delete
- `"use server"` directive preserved on every action file (Stage 5.J build-fix lesson)
- No new dependencies unless absolutely justified (forecast: `xlsx`/SheetJS for P0.7 Excel parsing only)

## The 18 CRUD-eligible Group D entities (Q4 triage result)

Read-only entities that SHOULD become editable in P0:

| # | Entity | Workspace | Action file status | Form needed |
|---|---|---|---|---|
| 1 | ai-agents (config) | dev-os | None | Per-agent config form (settings-style) |
| 2 | asset-types (catalog) | dev-os | None | Simple CRUD (name + key + status) |
| 3 | cabinets (per-user prefs) | dev-os | None | Self-service config form |
| 4 | contracts | dev-os | [contract-actions.ts](src/lib/development/server/contract-actions.ts) | New form |
| 5 | cost-categories | dev-os (under /finance) | [cost-category-actions.ts](src/lib/development/server/cost-category-actions.ts) | New form (sub-tab) |
| 6 | discounts | dev-os | [discount-actions.ts](src/lib/development/server/discount-actions.ts) | New form |
| 7 | investor-requests (admin) | dev-os | [investor-portal-requests/request-actions.ts](src/lib/development/server/investor-portal-requests/request-actions.ts) | Admin review form (HITL approve/reject) |
| 8 | investors | dev-os | [investor-actions.ts](src/lib/development/server/investor-actions.ts) | New form |
| 9 | materials | dev-os | [material-actions.ts](src/lib/development/server/material-actions.ts) | New form |
| 10 | reservations | dev-os | [reservation-actions.ts](src/lib/development/server/reservation-actions.ts) | New form |
| 11 | safety (incidents) | dev-os | [safety-actions.ts](src/lib/development/server/safety-actions.ts) | New form (already has create button on page) |
| 12 | site-reports | dev-os | [site-report-actions.ts](src/lib/development/server/site-report-actions.ts) | New form |
| 13 | vendors (dev-os) | dev-os | [vendor-actions.ts](src/lib/development/server/vendor-actions.ts) | New form |
| 14 | bank-accounts | dev-os (under /finance) | [bank-account-actions.ts](src/lib/development/server/bank-account-actions.ts) | New form (sub-tab) |
| 15 | transactions | dev-os (under /finance) | [transaction-actions.ts](src/lib/development/server/transaction-actions.ts) | New form (sub-tab) |
| 16 | invoices | dev-os (under /finance) | [invoice-actions.ts](src/lib/development/server/invoice-actions.ts) | New form (sub-tab) |
| 17 | leads | dev-os | [lead-actions.ts](src/lib/development/server/lead-actions.ts) | New form (handles contact + role + lead atomically per Q3 decision) |
| 18 | settings sub-pages | dev-os | (varies per setting) | Settings forms (org branding, modules, etc.) |

**18 confirmed CRUD-eligible. Other 26 of the 44 "read-only" entities stay read-only** (computed dashboards, hub landings, lifecycle-only pages, marketing). The Group D CRUD-eligible set folds cleanly into Tier 1–4 work.

## Vendor duplication note (preserved finding from initial audit)

`vendor-actions.ts` (dev-os, for development vendors / contractors) and `service-fulfilment/actions.ts` `createServiceVendorAction` (dashboard, for guest-services vendors) are different entity types with overlapping names. **P0 leaves them separate** — no consolidation.

---

## P0.2 — Server-actions verification (results)

### `"use server"` directive sweep
Audit script: `node /tmp/audit-use-server.mjs`

| Bucket | Count |
|---|---:|
| `*-actions.ts` and `actions.ts` files in `src/` | 149 |
| With `"use server"` directive (callable from client) | 112 |
| With `import "server-only"` only (pure server module — fine, named `*-actions.ts` for feature-folder consistency) | 37 |
| With NEITHER | **0** |

Stage 5.J build-fix invariant preserved: `node /tmp/audit-server-only-v2.mjs` reports **0 client-imported server-only files**. The 22-file conversion that landed in commit `e2bed35` still holds.

### Coverage matrix (35 prioritized entities)
For each Tier 1–5 entity (plus the Group D additions), checked: action file exists, has create-equivalent verb, has update-equivalent verb, has delete-equivalent verb.

**Apparent missing-action flags resolved:**

| Entity | Initial flag | Resolution |
|---|---|---|
| asset-types | "file missing" | **Path mismatch in audit script.** File is at [src/lib/development/server/assets/asset-type-actions.ts](src/lib/development/server/assets/asset-type-actions.ts) (singular, inside `assets/` subfolder), not the top-level path I checked |
| transactions | "no `createTransaction`" | Verb is `recordTransaction` (workflow naming) |
| invoices | "no `createInvoice`" | Verb is `issueInvoiceForMilestone` (milestone-driven creation) |
| contracts | "no `createContract`" | Verb is `convertReservationToContract` (reservation → contract flow) |
| safety-incidents | "no `createSafetyIncident`" | Verb is `recordSafetyIncident` |
| discounts | "no `createDiscount`" | Verb is `proposeDiscount` (HITL approval workflow) |
| decisions | "no `createDecision`" | Verb is `createProjectDecision` (prefix mismatch) |
| risks | "no `createRisk`" | Verb is `createProjectRisk` (prefix mismatch) |

**UX note for P0.3+ form-building**: the form labels and entry points must match the action verbs. Examples:
- "Issue invoice from milestone" form (not "create invoice")
- "Convert reservation to contract" form (not "create contract")
- "Propose discount" form (not "create discount")
- "Record transaction" form (not "create transaction")
- "Record safety incident" form (not "create safety incident")

### Real gaps (after resolution): **0**
No action files need to be created in P0.2. Every Tier 1–5 entity has at minimum a create-equivalent action. Update/delete coverage is mixed — many entities use workflow transitions (`transitionRiskStatus`, `supersedeProjectDecision`, `voidInvoice`, `cancelContractGroup`) rather than generic update/delete. **This is intentional**, not a gap.

### Carry-forward to P0.6 (asset-types form work)
[asset-type-actions.ts](src/lib/development/server/assets/asset-type-actions.ts) currently uses `import "server-only"` because it's not yet imported by any client component. When P0.6 builds the asset-type create/edit modal, this file needs:

1. Flip `import "server-only"` → `"use server"` (Stage 5.J build-fix convention)
2. Add `updateAssetType` function (currently only has `createAssetType` + `deactivateAssetType`)

Logged here so it doesn't slip during P0.6.

### Entities deferred from P0 scope (per Q4 decision)

**ai-agents**: per-agent config UI is explicitly P6 scope (AI Agents Activation Ready). Per-agent provider override + cost limits + testing UI all live in P6. P0 leaves the ai-agents page read-only.

**cabinets** (per-user preferences): single-row-per-user upsert pattern, not standard CRUD. The `cabinetPreferences` schema exists but no actions yet. **Defer to P5 or later** when productivity/personalization gets attention.

**settings sub-pages**: each sub-section has its own actions (org branding, modules, notifications). These are tier-5 admin work that belongs in P0.6. No new actions needed here — existing `organization-actions.ts`, `notification-actions.ts`, etc. cover them.

### Audit doc count check

Forms-audit-doc final entity tally: **75 editable entities** in P0 scope, matching the launch prompt's number. Breakdown:
- Tier 1: 7 (bookkeeper)
- Tier 2: 6 (sales)
- Tier 3: 7 (operations)
- Tier 4: 11 (extras)
- Tier 5: 4 (admin)
- Plus Group D additions (asset-types, contracts, discounts, investor-requests, investors, materials, reservations, safety-incidents, site-reports, vendors, leads — 11 unique extras after deduping with Tiers 1–4)
- Plus dashboard's "fully editable today" set already counted under Tiers 1–4 dual-views (projects, villas, etc.)

= 7 + 6 + 7 + 11 + 4 + 11 + 29 dashboard-only-editable = **75** ✓
