# Read-Flow Tenancy Audit — 2026-06-13

Multi-agent read-flow audit (18 cluster scanners -> adversarial verify, default real=false) of every dashboard-menu READ path, triggered by a live walkthrough where a brand-new empty tenant saw other orgs' demo data on some pages and hit `Service Temporarily Unavailable` / infinite spinners on others.

**144 confirmed cross-tenant read findings** (40 crash-class heavy reads, rest list/detail leaks) across 52 source files.

## Root cause of the crashes/hangs

UNSCOPED HEAVY READS running to the 300s serverless function timeout (NOT a missing-migration throw). The hanging pages call list/count/aggregate read functions whose WHERE has NO organization_id predicate. For a brand-new empty tenant these queries do not return 0 rows — they scan/aggregate the ENTIRE shared demo dataset across all orgs. The DB client (src/lib/db/client.ts:40-44) explicitly documents there is NO server-side or client-side statement_timeout, and the DB role is BYPASSRLS, so there is no safety net. A heavy unscoped read therefore never rejects fast — it runs until the 300s function timeout, surfacing as 'Service Temporarily Unavailable' (/dashboard) or an infinite spinner (Guest Stays / Owner Stays / concierge / guest-services). Because the query hangs rather than throws, even the dashboard's per-query .catch() fallbacks cannot save it — .catch() only fires on rejection, not on a query that never resolves. The org columns DO exist in the schemas (guest_services, guest_stay_tokens, guest_stay_security_events all have organization_id), so this is an unscoped read, not a not-yet-applied-migration throw.

> Evidence: No fast timeout exists: src/lib/db/client.ts:40-44 states "NOT a server-side statement_timeout here ... SHOW statement_timeout stayed at the 2min default. A query cap must be applied role-level via ALTER ROLE ... not in this client." So an unscoped read runs to the 300s function timeout, not a quick error. UNSCOPED reads behind the hanging pages (WHERE lacks any eq(table.organizationId,...) and never calls requireOrgId): (1) src/features/guest-services/services.ts:565-575 getOrderStats() — full-table count(*)/sum FILTER aggregate .from(guestServiceOrders) with NO WHERE; heaviest; feeds Guest services hub. (2) :103-127 listAllCatalogServices() CTE+joins with filters that never include org. (3) :36-43 listCategories() and :390-406 listGuestServiceOrders() unscoped. guest_services.organization_id EXISTS (schema/guest-services.ts:72) so this is unscoped, not a missing column. (4) src/features/keystone/services.ts:24-27 getSetupCounts() — count(*).from(villas)/from(projects)/from(appUsers) with NO org filter; this is the dashboard zero-state gate (page.tsx:137 isEmptySystem), so it counts the global demo dataset, returns non-empty, and /dashboard does NOT short-circuit to the empty stat

## Pattern + uniform fix

A dashboard READ leaks (or, if heavy, hangs to the 300s function timeout) when its WHERE has **no** `organization_id` predicate. DB role is BYPASSRLS and there is **no** `statement_timeout`, so an unscoped heavy aggregate never fails fast — it scans the entire shared demo dataset until the function times out.

**Fix (uniform):** `const organizationId = await requireOrgId()` (from `@/features/auth/require-org`) + AND `eq(table.organizationId, organizationId)` into the WHERE. Villas have no org column -> scope via `innerJoin(projects)` on `projects.organizationId`. Raw SQL -> add `WHERE/AND x.organization_id = ${organizationId}::uuid`.

## Crash-class reads (hang the page — fix first)

- `src/app/(dashboard)/dashboard/guest-stays/security/verifications/page.tsx` — VerificationsPage (inline db.select on guestStayTokenVerifications), VerificationsPage (inline query)
- `src/app/(development-app)/development-os/marketing/dashboard/page.tsx` — MarketingDashboardPage (inline aggregates: marketingSummary + leadSourceMix)
- `src/features/bookings/bookings-cabinet-queries.ts` — getBookingsKpis
- `src/features/finance/finance-cabinet-queries.ts` — getFinanceKpis
- `src/features/finance/reserve-balances.ts` — listReserveBalances
- `src/features/finance/services.ts` — getFinanceSummary
- `src/features/front-office/readiness-services.ts` — listArrivalReadiness
- `src/features/guest-ai-concierge/concierge-cabinet-queries.ts` — getConciergeKpis, listConciergeSessionsForCabinet, listSafetyEventsForCabinet
- `src/features/guest-services/services.ts` — getOrderStats
- `src/features/guest-stays/security.ts` — countOpenHighSeverityEvents, listSecurityEvents
- `src/features/inventory/counts-services.ts` — listInventoryCounts
- `src/features/inventory/services.ts` — getInventoryItemById, listInventoryItems, listInventoryMovements, listLowStockItems, listStockLevels
- `src/features/keystone/services.ts` — getSetupCounts
- `src/features/operations/operations-cabinet-queries.ts` — getVillaStatusBoard
- `src/features/operations/services.ts` — getOperationsMetrics
- `src/features/owner-intelligence/health-services.ts` — listOwnerVillaHealthSnapshots
- `src/features/owner-intelligence/reviews-services.ts` — listAdminReviews
- `src/features/procurement/services.ts` — listPurchaseOrders, listPurchaseRequests
- `src/features/service-fulfilment/services.ts` — getFulfilmentMetrics
- `src/features/statement-transparency/services.ts` — getTransparencyHubMetrics
- `src/features/villa-guides/services.ts` — listEmergencyContactsAdmin, listGuideSectionsAdmin, listNeighborhoodAdmin, listWifiAdmin
- `src/features/villa-guides/wifi-migration-services.ts` — listPendingWifiMigrations, summarizeWifiMigration
- `src/lib/development/server/cabinets/marketing-cabinet-queries.ts` — loadMarketingCabinet
- `src/lib/development/server/marketing/marketing-summary-queries.ts` — loadActiveCampaigns, loadSourceAttribution

## Full findings by cluster

### bookings-calendar (2 fns / 1 files)
- `src/features/bookings/bookings-cabinet-queries.ts` — getBookingsKpis⚠crash, getBookingsActivityForDate

### channels-pricing (10 fns / 4 files)
- `src/features/channels/manager.ts` — getAriPushGrid, detectDoubleBookings, listConnectionSyncHealth
- `src/features/channels/queries.ts` — getChannelVillaCoverage
- `src/features/integrations/calendar-sync/services.ts` — listCalendarFeeds, listCalendarEvents
- `src/features/pricing/services.ts` — listRatePlans, getRatePlanById, listSeasonsForPlan, listOverridesForPlanInRange

### concierge (4 fns / 2 files)
- `src/features/guest-ai-concierge/concierge-cabinet-queries.ts` — getConciergeKpis⚠crash, listConciergeSessionsForCabinet⚠crash, listSafetyEventsForCabinet⚠crash
- `src/features/guest-ai-concierge/services.ts` — listMessagesForSession

### dashboard-home (1 fns / 1 files)
- `src/features/keystone/services.ts` — getSetupCounts⚠crash

### finance (22 fns / 6 files)
- `src/features/finance/finance-cabinet-queries.ts` — getFinanceKpis⚠crash
- `src/features/finance/material-usage-bridge.ts` — listMaterialUsageFinanceLinks
- `src/features/finance/reserve-balances.ts` — listReserveBalances⚠crash
- `src/features/finance/services.ts` — listOwnerStatements, getOwnerStatementById, listStatementLines, listRevenueLines, listFeeLines, listExpenseLines, listTaxLines, listReserveMovements, listStatementPeriods, listPayoutBatches, listPayoutLines, getFinanceSummary⚠crash
- `src/features/finance/statement-anomaly-detector.ts` — listStatementAnomalies
- `src/features/statement-transparency/services.ts` — getTransparencyHubMetrics⚠crash, listTransparencyStatementRows, listStatementReconciliationWarnings, listStatementSourceGroups, listStatementSourceGroupLines, getStatementExplanationSnapshot

### front-office (4 fns / 4 files)
- `src/features/front-office/readiness-services.ts` — listArrivalReadiness⚠crash
- `src/features/front-office/room-board.ts` — loadFrontOfficeRoomBoard
- `src/features/front-office/services.ts` — listCheckinCheckoutRequests
- `src/features/front-office/watch-agents.ts` — detectVisaWatch

### guest-services (16 fns / 2 files)
- `src/features/guest-services/services.ts` — listAllCatalogServices, getServiceById, listGuestServiceOrders, getOrderById, getOrderStats⚠crash, listGuestVisibleServices
- `src/features/service-fulfilment/services.ts` — listServiceVendors, getServiceVendorById, listVendorServices, listGuestServiceFulfilments, getGuestServiceFulfilmentById, listVendorInvoices, listGuestServiceRatings, getFulfilmentMetrics⚠crash, listPendingFulfilments, getFulfilmentForGuestOrder

### guest-stays (12 fns / 5 files)
- `src/app/(dashboard)/dashboard/guest-stays/security/verifications/page.tsx` — VerificationsPage (inline query)⚠crash, VerificationsPage (inline db.select on guestStayTokenVerifications)⚠crash
- `src/app/(dashboard)/dashboard/villa-guides/wifi/[id]/page.tsx` — EditWifiPage (inline query)
- `src/features/guest-stays/security.ts` — listSecurityEvents⚠crash, countOpenHighSeverityEvents⚠crash
- `src/features/villa-guides/services.ts` — listGuideSectionsAdmin⚠crash, listWifiAdmin⚠crash, listEmergencyContactsAdmin⚠crash, listNeighborhoodAdmin⚠crash
- `src/features/villa-guides/wifi-migration-services.ts` — summarizeWifiMigration⚠crash, listWifiMigrationEvents, listPendingWifiMigrations⚠crash

### inventory-procure (15 fns / 3 files)
- `src/features/inventory/counts-services.ts` — listInventoryCounts⚠crash, getInventoryCountById, preloadCountLinesForLocation
- `src/features/inventory/services.ts` — listInventoryItems⚠crash, getInventoryItemById⚠crash, listLowStockItems⚠crash, listStockLevels⚠crash, listInventoryMovements⚠crash, listSuppliers, listInventoryLocations, listInventoryCategories
- `src/features/procurement/services.ts` — listPurchaseRequests⚠crash, getPurchaseRequestById, listPurchaseOrders⚠crash, getPurchaseOrderById

### marketing (18 fns / 10 files)
- `src/app/(development-app)/development-os/marketing/connections/[id]/page.tsx` — MarketingConnectionDetailPage (inline read)
- `src/app/(development-app)/development-os/marketing/dashboard/page.tsx` — MarketingDashboardPage (inline aggregates: marketingSummary + leadSourceMix)⚠crash
- `src/lib/development/server/cabinets/marketing-cabinet-queries.ts` — loadMarketingCabinet⚠crash
- `src/lib/development/server/campaigns/campaign-queries.ts` — listCampaigns, getCampaignByCode, listCampaignCosts
- `src/lib/development/server/content/content-queries.ts` — listContent, getContentByCode, listContentVariants
- `src/lib/development/server/conversation-review/conversation-queries.ts` — listConversationThreads, getThreadByCode
- `src/lib/development/server/marketing/lead-export-queries.ts` — loadLeadsForExport
- `src/lib/development/server/marketing/manager-performance-queries.ts` — countLeadsForCampaign
- `src/lib/development/server/marketing/marketing-summary-queries.ts` — loadActiveCampaigns⚠crash, loadSourceAttribution⚠crash
- `src/lib/marketing/queries.ts` — listConnectionsForUi, listConversionsForUi, listRecentTouchpointsForUi

### notifications (10 fns / 3 files)
- `src/features/direct-booking/guest-messages.ts` — listAdminThreads, getAdminThreadById
- `src/features/notifications/services.ts` — listNotificationsWithAttempts, listNotificationDeliveries, listNotificationPreferences
- `src/lib/messaging/queries.ts` — listThreads, getThreadById, listThreadMessages, listTemplates, listAutoResponseRules

### operations (10 fns / 4 files)
- `src/features/maintenance-intelligence/services.ts` — listOpenSuggestions
- `src/features/operations/operations-cabinet-queries.ts` — getVillaStatusBoard⚠crash, getMaintenanceTickets
- `src/features/operations/services.ts` — getOperationsMetrics⚠crash, listMaintenanceTickets, getMaintenanceTicketById, listPreventiveSchedules, listServiceRequests, listDamageReports
- `src/features/operations/turnover-queries.ts` — getTodaysTurnovers / readTurnoverRows

### owner-inbox (3 fns / 1 files)
- `src/features/owner-portal/mgmt-threads.ts` — listOwnerThreadsForMgmt, getOwnerThreadForMgmt, getOwnerGroundingContext

### owner-stays (8 fns / 3 files)
- `src/features/owner-stays/finance-bridge.ts` — listFinanceLinks, createFinanceRowsForOwnerStay (req lookup)
- `src/features/owner-stays/relocation.ts` — listRelocationCandidates
- `src/features/owner-stays/services.ts` — listOwnerStayPolicies, listEquivalenceGroups, listEquivalenceMembers, getOwnerStayRequestById, getApplicableOwnerStayPolicy

### owners-shares (2 fns / 2 files)
- `src/features/owner-intelligence/health-services.ts` — listOwnerVillaHealthSnapshots⚠crash
- `src/features/owner-intelligence/reviews-services.ts` — listAdminReviews⚠crash

### projects-villas (1 fns / 1 files)
- `src/app/(dashboard)/dashboard/villas/[id]/availability/page.tsx` — VillaAvailabilityPage (inline villa lookup)
