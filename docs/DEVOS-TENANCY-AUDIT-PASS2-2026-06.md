# Dev-OS Tenancy Audit — Pass 2 (partially-scoped files) — 2026-06-15

Per-function org-scoping audit of the **135 partially-scoped** dev-OS server files (the ones pass-1 skipped because they already referenced org somewhere). Same build→adversarial-verify method (46 agents).

**107 confirmed leaks across 48 files** — high=43 · med=43 · low=21; **61 are cross-tenant WRITE-IDORs**. 335 functions classified SAFE (already scoped / global / caller-scoped) and excluded.

Worst: `createApiKey`/`rotateApiKey` have ZERO auth (mint a live /api/v1 key for ANY org → cross-tenant API takeover); `processBulkImportJob` exfiltrates a victim's import rows into the attacker's org. Fix = requireOrgId() + org predicate on load+mutate; derive org server-side (never trust a client-supplied organizationId); scoped FK-existence checks before writes; cron-safe optional-org where a job calls the reader. No migrations.

---

## api/api-key-actions.ts  _(3)_
- **[HIGH·WRITE]** `createApiKey` — apiKeys
  - Fix: Derive org server-side: const orgId = await requireOrgId() (and an internal-user/role gate); drop organizationId+createdBy from the input schema and set organizationId: orgId, createdBy: me.id on the insert. As written the fn has NO auth at all and trusts a client-supplied organizationId, so any caller can mint a LIVE /api/v1 API key scoped to ANY org's UUID — full cross-tenant API access.
- **[HIGH·WRITE]** `rotateApiKey` — apiKeys
  - Fix: Add requireOrgId() (+ internal-user gate) and constrain the SELECT and the in-transaction UPDATE/INSERT to eq(apiKeys.organizationId, orgId); return not-found on mismatch. Currently it SELECTs by keyId with no org predicate, revokes the victim's key (DoS) AND mints a fresh PLAINTEXT key inheriting the victim org's organizationId+scopes — full cross-tenant API takeover.
- **[MED·WRITE]** `revokeApiKey` — apiKeys
  - Fix: Add requireOrgId() (+ internal-user gate) and AND eq(apiKeys.organizationId, orgId) to the UPDATE WHERE; .returning() and report not-found if 0 rows matched. As written any caller can revoke another tenant's API key by UUID — cross-tenant denial-of-service.

## assets/asset-type-actions.ts  _(3)_
- **[HIGH·WRITE]** `updateAssetType` — assetTypes
  - Fix: Add requireOrgId() and constrain UPDATE WHERE eq(assetTypes.id, id) AND eq(assetTypes.organizationId, orgId); not-found on 0 rows (deliberately NOT matching NULL-org seed rows from a tenant edit). Currently any internal user can edit ANY org's asset type — or the shared NULL-org seed catalog — by passing its id.
- **[HIGH·WRITE]** `deactivateAssetType` — assetTypes
  - Fix: Add requireOrgId() and AND eq(assetTypes.organizationId, orgId) to the UPDATE WHERE (not-found on 0 rows; do not match NULL-org seed rows). Currently any internal user can deactivate another tenant's asset type — or a shared seed type, which removes it for ALL tenants — by passing its id.
- **[MED·WRITE]** `createAssetType` — assetTypes
  - Fix: Add requireOrgId() and set organizationId: orgId on the insert. Today the insert hardcodes no organizationId, so every created type is organization_id = NULL; the read-side listAssetTypes (asset-queries.ts:101-104) treats NULL-org as the SHARED/seed catalog returned to ALL tenants, so one tenant's custom type leaks to everyone. typeKey is also globally .unique() (asset-types.ts:28), enabling cross-tenant key squat/collision.

## boq/boq-actions.ts  _(1)_
- **[MED·READ]** `exportBoqAsCsv` — boq_sections, boq_items
  - Fix: Add requireOrgId(); add AND eq(boqSections.organizationId, orgId) to the section SELECT and AND eq(boqItems.organizationId, orgId) to the item SELECT (do not rely solely on the page caller's getBoqDocumentByCode pre-scope). With no sections matched, it returns an empty CSV for cross-org docs.

## boq/boq-bulk-actions.ts  _(1)_
- **[HIGH·WRITE]** `bulkInsertBoqLines` — boq_documents, boq_sections, dev_cost_categories, boq_items
  - Fix: Add requireOrgId(); add AND eq(boqDocuments.organizationId, orgId) to the fail-fast doc SELECT (return boq_document_not_found on cross-org), AND eq(boqSections.organizationId, orgId) to the section preload, and AND eq(devCostCategories.organizationId, orgId) to the category preload. This prevents inserting boqItems (carrying the caller's org) against a sibling org's section.

## bulk-import/import-actions.ts  _(3)_
- **[HIGH·WRITE]** `processBulkImportJob` — bulk_import_jobs
  - Fix: Add an auth gate for the tenant path (requireInternalUser) AND scope the SELECT/UPDATE by org (AND eq(bulkImportJobs.organizationId, resolvedOrgId)); accept the cron caller only via a trusted server-side path that passes the job's own org. Currently the function has NO auth gate at all and selects/updates the job by id only.
- **[MED·READ]** `validateBulkImportJob` — bulk_import_jobs
  - Fix: SELECT/UPDATE bulk_import_jobs with AND eq(bulkImportJobs.organizationId, await resolveActiveOrgId()); return 'Job not found' on mismatch. requireInternalUser only checks the user is internal to THEIR org (it does not bound which org's rows they touch), and the wizard + _actions wrapper pass the client jobId straight through, so any tenant reads back another org's source_content/preview (import payloads commonly carry PII) and flips its status by id alone.
- **[MED·WRITE]** `cancelBulkImportJob` — bulk_import_jobs
  - Fix: Add AND eq(bulkImportJobs.organizationId, await resolveActiveOrgId()) to both the SELECT (line 512-516) and the UPDATE...set(status:'cancelled') (line 522-529); return 'Job not found' on mismatch.

## buyers/buyer-progress-actions.ts  _(2)_
- **[HIGH·WRITE]** `createBuyerProgressReport` — buyer_progress_reports
  - Fix: Add organizationId: await requireOrgId() to .values() and verify the client projectId (and unitId) belong to that org before insert; notFound on mismatch.
- **[HIGH·WRITE]** `transitionBuyerProgressReport` — buyer_progress_reports
  - Fix: Add AND eq(buyerProgressReports.organizationId, await requireOrgId()) to both the SELECT (line 87-91) and the UPDATE (line 115-119); throw notFound on mismatch.

## cabinets/project-manager-cabinet-queries.ts  _(1)_
- **[MED·READ]** `getLatestDailyDigest` — agent_outputs
  - Fix: Add AND organization_id = ${await requireOrgId()} to the SELECT (line 542-552) so the digest shown is the caller's org's latest, not the global latest across all tenants.

## construction-analysis-actions.ts  _(5)_
- **[HIGH·WRITE]** `generateAnalysisForReport` — site_reports (read, via analyzeSiteReport), ai_construction_analyses + ai_assistant_runs (insert)
  - Fix: This is a "use server" action invoked from the client component construction-analysis-card.tsx (line 105) with an attacker-controlled reportId; it only calls requireInternalUser() (which does NOT pin org). It passes reportId straight to analyzeSiteReport(), whose first SELECT is `where(eq(siteReports.id, reportId))` with no org predicate (construction-supervisor.ts), then INSERTs ai_construction_analyses + ai_assistant_runs. Fix: before calling analyzeSiteReport, call requireOrgId() and verify ownership with the already-org-scoped getSiteReport(reportId) (returns null cross-tenant) -> notFound on miss. Reachability and the org-less root SELECT both verified.
- **[HIGH·WRITE]** `regenerateAnalysisForReport` — ai_construction_analyses (UPDATE status->superseded by siteReportId+status), then analyzeSiteReport
  - Fix: Server action from construction-analysis-card.tsx (line 258), only requireInternalUser — no org pin. The supersede UPDATE WHERE and(eq(siteReportId, reportId), eq(status,'draft')) has no org predicate, and the subsequent analyzeSiteReport read is org-less too. Fix: requireOrgId() + verify reportId via getSiteReport(reportId) -> notFound, and add AND eq(aiConstructionAnalyses.organizationId, org) to the supersede UPDATE. A client can supersede another tenant's draft and force a re-analysis.
- **[HIGH·WRITE]** `approveAnalysis` — ai_construction_analyses (SELECT by id + UPDATE status->approved by id); site_reports (UPDATE, this one IS org-scoped)
  - Fix: Server action from construction-analysis-card.tsx (line 234) with attacker-controlled analysisId. It DOES call requireOrgId() but only applies it to the site_reports merge UPDATE (lines 135-140). The ai_construction_analyses SELECT (line 99) and the status->approved UPDATE (line 114) are keyed solely by eq(id, analysisId) with NO org predicate. Add AND eq(aiConstructionAnalyses.organizationId, organizationId) to both the SELECT (throw 'not found' on miss) and the approve UPDATE. As-is a client can flip another tenant's draft analysis to 'approved' (the site_reports write no-ops cross-org, but the analysis row is still mutated).
- **[HIGH·WRITE]** `editAndApproveAnalysis` — ai_construction_analyses (SELECT by id + UPDATE by id)
  - Fix: Server action from construction-analysis-card.tsx (line 284) with attacker-controlled analysisId. No requireOrgId at all — only requireInternalUser. Both the SELECT (line 186) and the UPDATE (line 214) are keyed by eq(aiConstructionAnalyses.id, analysisId) with no org predicate. Add requireOrgId() + AND eq(aiConstructionAnalyses.organizationId, org) to both. A client can overwrite draftSummary/safetyStatus/safetyConcerns and approve another tenant's analysis by id. Highest-impact of the set (arbitrary content overwrite).
- **[HIGH·WRITE]** `rejectAnalysis` — ai_construction_analyses (UPDATE status->rejected by id+status)
  - Fix: Server action from construction-analysis-card.tsx (line 329) with attacker-controlled analysisId. Only requireInternalUser; the UPDATE WHERE and(eq(id, analysisId), eq(status,'draft')) has no org predicate. Add requireOrgId() + AND eq(aiConstructionAnalyses.organizationId, org) to the UPDATE. A client can reject and stamp an arbitrary rejectionReason on another tenant's draft analysis. (Kept high because it is a directly reachable cross-tenant write, though impact is narrower than editAndApprove.)

## contract-actions.ts  _(1)_
- **[HIGH·WRITE]** `cancelContractGroup` — contract_groups, contracts
  - Fix: Add requireOrgId() (+ requireInternalUser like signContract) and AND eq(contractGroups.organizationId, orgId) on the contract_groups UPDATE; scope the child contracts UPDATE via the verified group id, and return 'not found' on mismatch.

## conversation-review/conversation-queries.ts  _(1)_
- **[LOW·READ]** `listManagerPerformance` — manager_performance_metrics
  - Fix: Add requireOrgId() + WHERE eq(managerPerformanceMetrics.organizationId, orgId) before it is wired to any page; currently unreachable so low, but it is an org-owning table queried with no org filter (and no auth gate).

## coordination/coordination-actions.ts  _(5)_
- **[MED·WRITE]** `removeCoordinationPin` — coordination_pins
  - Fix: Add requireOrgId() and AND eq(coordinationPins.organizationId, orgId) to the DELETE .where so a foreign pinId cannot be deleted.
- **[MED·READ]** `fetchCoordinationAnnotations` — coordination_annotations
  - Fix: Add requireOrgId() and AND eq(coordinationAnnotations.organizationId, orgId) to the SELECT so a foreign revisionId returns no markup.
- **[MED·READ]** `fetchGatedRequests` — submittals, dev_os_purchase_requests
  - Fix: Add requireOrgId() and AND eq(submittals.organizationId, orgId) plus AND eq(devOsPurchaseRequests.organizationId, orgId) to both SELECTs so foreign submittal/PR rows are not disclosed.
- **[MED·READ]** `fetchCoordinationThread` — coordination_messages (via listThreadMessages)
  - Fix: This wrapper is the cross-tenant entry point; fix listThreadMessages (add requireOrgId + org predicate) or enforce caller org here so a foreign rfi/submittal/defect id returns no messages.
- **[LOW·READ]** `linkSubmittalGate` — submittals, dev_os_purchase_requests
  - Fix: Add AND eq(submittals.organizationId, organizationId) to the submittals lookup; the write itself is already org-scoped on devOsPurchaseRequests, so impact is limited to reading a foreign submittal's projectId/ref.

## coordination/coordination-queries.ts  _(2)_
- **[MED·READ]** `listThreadMessages` — coordination_messages
  - Fix: Add requireOrgId() and AND eq(coordinationMessages.organizationId, orgId) to the WHERE so a foreign item id returns no thread.
- **[LOW·READ]** `pinExistsForRevision` — coordination_pins
  - Fix: Currently unreachable; if wired, add requireOrgId() + AND eq(coordinationPins.organizationId, orgId). Low today because it returns only a Set of caller-supplied pin ids matching a (client-supplied) revision — leaks existence, not data.

## cost-categories.ts  _(1)_
- **[LOW·READ]** `getCostCategoryUsage` — dev_transactions
  - Fix: Add const orgId = await requireOrgId(); and AND eq(devTransactions.organizationId, orgId) to the WHERE before groupBy.

## data-export/data-export-actions.ts  _(1)_
- **[HIGH·WRITE]** `requestDataExport` — data_export_requests
  - Fix: Do NOT trust client organizationId/requestedBy. Add auth: organizationId = await requireOrgId() and requestedBy = (await requireInternalUser()).appUser.id; drop those two fields from the input schema. The cron (processExportRequest/gatherTablesForScope) faithfully dumps req.organizationId's full dataset.

## distribution-suggestion-actions.ts  _(4)_
- **[HIGH·WRITE]** `regenerateSuggestion` — ai_distribution_suggestions
  - Fix: Add eq(aiDistributionSuggestions.organizationId, await requireOrgId()) to both the SELECT-by-id and the UPDATE; throw/notFound on mismatch.
- **[HIGH·WRITE]** `approveDistributionSuggestion` — ai_distribution_suggestions (+ distributions via declareDistribution)
  - Fix: Add eq(aiDistributionSuggestions.organizationId, await requireOrgId()) to the SELECT-by-id and the final UPDATE; notFound on mismatch.
- **[MED·READ]** `requestDistributionSuggestion` — ai_distribution_suggestions / projects (via suggestDistribution)
  - Fix: Resolve projectId against an org-scoped lookup (eq(projects.id, projectId) AND eq(projects.organizationId, await requireOrgId())) and notFound/throw on mismatch BEFORE calling suggestDistribution.
- **[MED·WRITE]** `rejectDistributionSuggestion` — ai_distribution_suggestions
  - Fix: Add eq(aiDistributionSuggestions.organizationId, await requireOrgId()) to the SELECT-by-id and the UPDATE; notFound on mismatch.

## document-extraction-actions.ts  _(6)_
- **[HIGH·WRITE]** `approveExtractionAsTransaction` — aiDocumentExtractions (SELECT by id + UPDATE by id)
  - Fix: add `const organizationId = await requireOrgId();` and AND eq(aiDocumentExtractions.organizationId, organizationId) to the SELECT and the UPDATE .where; throw 'Extraction not found' on mismatch. CAVEAT: aiDocumentExtractions.organizationId is nullable ('not threaded yet', backfilled migration 0154) — ensure the column is backfilled NOT NULL or the predicate will drop legitimately-null rows.
- **[HIGH·WRITE]** `rejectExtraction` — aiDocumentExtractions (SELECT by id + UPDATE by id)
  - Fix: add requireOrgId() + AND eq(aiDocumentExtractions.organizationId, organizationId) to both the SELECT (line 168) and the UPDATE .where (line 183); throw on not-found (same nullable-backfill caveat).
- **[HIGH·WRITE]** `markExtractionDuplicate` — aiDocumentExtractions (blind UPDATE by id, no SELECT)
  - Fix: add requireOrgId() + AND eq(aiDocumentExtractions.organizationId, organizationId) to the UPDATE .where (line 209) — currently a bare eq(id) blind update with no existence/org check, so a forged id flips another tenant's extraction to 'duplicate'. Same nullable-backfill caveat.
- **[HIGH·WRITE]** `regenerateExtraction` — aiDocumentExtractions (SELECT by id + supersede UPDATE by id)
  - Fix: add requireOrgId() + AND eq(aiDocumentExtractions.organizationId, organizationId) to the SELECT (line 233) and the supersede UPDATE (line 245); throw on not-found before re-running extractFromDocument on another tenant's documentId. Same nullable-backfill caveat.
- **[MED·READ]** `getDocumentExtractions` — aiDocumentExtractions (+ innerJoin documents) — SELECT list
  - Fix: add requireOrgId() and push eq(aiDocumentExtractions.organizationId, organizationId) into the conditions array (the WHERE currently falls back to sql`true` so with no filters it returns every org's extractions). Same nullable-backfill caveat.
- **[MED·READ]** `getDocumentExtraction` — aiDocumentExtractions (SELECT * by id)
  - Fix: add requireOrgId() + AND eq(aiDocumentExtractions.organizationId, organizationId) to the SELECT (line 302); return null on mismatch so the page notFound()s. Same nullable-backfill caveat.

## drawings/drawing-queries.ts  _(3)_
- **[MED·READ]** `listRecentDrawingRevisions` — drawingRevisions innerJoin drawings leftJoin projects (SELECT)
  - Fix: add `const organizationId = await requireOrgId();` (already imported in this file) + AND eq(drawingRevisions.organizationId, organizationId) to the WHERE (currently only eq(drawings.isArchived,false)). Both org columns are NOT NULL so the predicate is clean.
- **[MED·READ]** `listDrawings` — drawings (SELECT list)
  - Fix: add requireOrgId() and push eq(drawings.organizationId, organizationId) into the conditions array (currently only projectId/villaId/type/phase/isArchived). drawings.organizationId is NOT NULL.
- **[LOW·READ]** `getDrawingRevision` — drawingRevisions (SELECT by drawingId+revisionLabel) + drawingDistributionLog (SELECT by revisionId)
  - Fix: add requireOrgId() + AND eq(drawingRevisions.organizationId, organizationId) to the revision SELECT (line 134) and AND eq(drawingDistributionLog.organizationId, organizationId) to the distribution SELECT (line 139); return null on miss. Pre-emptive — both org columns are NOT NULL.

## executive/metrics-queries.ts  _(1)_
- **[MED·READ]** `listCompanySnapshotsInRange` — executive_metrics_snapshots
  - Fix: Add an organizationId param (callers pass requireOrgId()) and eq(executiveMetricsSnapshots.organizationId, organizationId) to the WHERE; notFound/empty on mismatch. Every sibling in this file (getLatestCompanySnapshot, getLatestProjectSnapshot, listRecentCompanySnapshots) already does this.

## general-ledger/auto-post.ts  _(1)_
- **[HIGH·WRITE]** `postFinanceToGl` — revenue_lines, expense_lines (READ) -> journal_entries/journal_lines via postJournal (WRITE)
  - Fix: revenue_lines/expense_lines have NO organization_id but DO have villa_id/project_id, and projects.organizationId exists. Scope the reads the way statement-generator.ts already does: derive org-owned villaId/projectId sets (org-filtered projects/villas) and add inArray(revenueLines.villaId, villaIds)/inArray(revenueLines.projectId, projectIds) (and same for expenseLines) to the SELECT, in addition to eq(status,'posted'). The in-file 'single-tenant' comment (L40-43) is factually wrong and should be deleted.

## import-template-actions.ts  _(2)_
- **[MED·WRITE]** `deactivateImportTemplate` — import_templates
  - Fix: Add const orgId = await requireOrgId() and scope the soft-delete UPDATE: .where(and(eq(importTemplates.id, parsed.id), eq(importTemplates.organizationId, orgId))). Currently keyed only on id with no auth/org check.
- **[LOW·WRITE]** `recordImportTemplateUse` — import_templates
  - Fix: Add const orgId = await requireOrgId() and scope the UPDATE: .where(and(eq(importTemplates.id, parsed.id), eq(importTemplates.organizationId, orgId))). Today the body has no auth/org check and the UPDATE is keyed only on id.

## inventory/inventory-actions.ts  _(1)_
- **[MED·READ]** `recordInventoryMovement` — dev_os_inventory_movements, dev_os_inventory_stock_balances
  - Fix: Two stock-balance pre-check SELECTs (debit lines 191-203, credit lines 231-243) filter only by itemId+locationId with NO org predicate, leaking a foreign org's quantity_on_hand into the insufficient-stock error string; and client itemId/fromLocationId/toLocationId are never verified to belong to the caller's org before the movement row (stamped with the caller's organizationId) is inserted, mis-associating another tenant's item/location under this org. Add eq(devOsInventoryStockBalances.organizationId, organizationId) to both pre-check SELECTs, and verify itemId/from/toLocationId belong to organizationId (notFound on mismatch) before recording. The balance UPDATEs/INSERT already carry organizationId so no cross-tenant balance row is written.

## inventory/inventory-bulk-actions.ts  _(1)_
- **[MED·READ]** `bulkInsertMovements` — dev_os_inventory_items, dev_os_inventory_locations
  - Fix: Gated by requireInternalUser() but NOT requireOrgId(): the item-catalogue SELECT (lines 99-106) and location-catalogue SELECT (lines 114-120) load ALL orgs' items/locations with no organizationId predicate, so a tenant's SKU/name resolves to (and then operates on) another tenant's item/location id. Add const organizationId = await requireOrgId() and AND eq(devOsInventoryItems.organizationId, organizationId) / eq(devOsInventoryLocations.organizationId, organizationId) to both catalogue SELECTs.

## investor-access-actions.ts  _(2)_
- **[MED·WRITE]** `grantInvestorPortalAccess` — investors (read), app_users (upsert), user_roles, dev_notification_delivery_log
  - Fix: The investor lookup (lines 120-128) resolves eq(investors.id, parsed.investorId) with NO org predicate, so an internal user can provision portal access (Supabase auth user + app_users + investor_viewer role + welcome email) bound to a foreign org's investor. The page passes an org-verified investor.id, but this is a 'use server' export directly invocable with any raw investorId. Add const organizationId = await requireOrgId() and AND eq(investors.organizationId, organizationId) to the investor lookup; throw on mismatch. (The org used for app_users/audit is hardcoded ARCONIQUE_DEFAULT, a single-tenant shortcut, but the unverified investorId is the actual defect.)
- **[MED·WRITE]** `revokeInvestorPortalAccess` — app_users (read+update), dev_notification_delivery_log (insert)
  - Fix: requireOrgId() is called but used only for the audit-log insert. The app_users SELECT (eq(appUsers.investorId, parsed.investorId)) and the subsequent UPDATE (eq(appUsers.id, user.id)) carry no org predicate, so a foreign investor's portal access can be cleared + the Supabase auth user permanently banned cross-tenant. Verify the investor belongs to requireOrgId() (AND eq(investors.organizationId, orgId)) before the lookup, and add eq(appUsers.organizationId, organizationId) to the app_users SELECT/UPDATE.

## investor-qa-actions.ts  _(6)_
- **[HIGH·WRITE]** `approveInvestorDraft` — ai_investor_qa_drafts (update)
  - Fix: requireInternalUser() but the UPDATE is keyed solely on eq(aiInvestorQaDrafts.id, parsed.draftId) with no org predicate — an internal user of org A can approve org B's draft and stamp reviewedBy. Scope the UPDATE by the draft's investor->org (subquery/join on investors.organizationId = requireOrgId()), NOT by aiInvestorQaDrafts.organizationId which is null on every row.
- **[HIGH·WRITE]** `editAndApproveInvestorDraft` — ai_investor_qa_drafts (update)
  - Fix: requireInternalUser() but the UPDATE is keyed solely on eq(aiInvestorQaDrafts.id, draftId) with no org predicate — worst of the set: org A can OVERWRITE the approvedResponse content of org B's investor draft (content injection into another tenant's investor comms). Scope the UPDATE by the draft's investor->org (investors.organizationId = requireOrgId()), NOT by aiInvestorQaDrafts.organizationId (null on every row).
- **[HIGH·WRITE]** `rejectInvestorDraft` — ai_investor_qa_drafts (update)
  - Fix: requireInternalUser() but the UPDATE is keyed solely on eq(aiInvestorQaDrafts.id, draftId), no org predicate — org A can reject org B's draft. Scope the UPDATE via the draft's investor->org (investors.organizationId = requireOrgId()), NOT aiInvestorQaDrafts.organizationId (null on every row).
- **[HIGH·WRITE]** `markInvestorDraftSent` — ai_investor_qa_drafts (update)
  - Fix: requireInternalUser() but the UPDATE is keyed solely on eq(aiInvestorQaDrafts.id, draftId), no org predicate — org A can flip org B's draft to status=sent. Scope the UPDATE via the draft's investor->org (investors.organizationId = requireOrgId()), NOT aiInvestorQaDrafts.organizationId (null on every row).
- **[MED·READ]** `getInvestorDrafts` — ai_investor_qa_drafts (read)
  - Fix: 'use server' export with NO auth gate at all (no requireInternalUser, no requireOrgId) and SELECT filtered only by eq(aiInvestorQaDrafts.investorId, investorId) — any authenticated caller can read another org's AI investor Q&A drafts (investor questions + drafted/approved responses) for any investorId. Add await requireInternalUser(); then scope by investor->org: resolve the investor and AND eq(investors.organizationId, await requireOrgId()) (or join investors), NOT by aiInvestorQaDrafts.organizationId.
- **[MED·READ]** `generateInvestorDraft` — investors (read for revalidate), ai_investor_qa_drafts (written via draftInvestorResponse), capital_commitments/distributions/wallets (read via draftInvestorResponse)
  - Fix: requireInternalUser() but passes the raw client investorId to draftInvestorResponse, which loads that investor + its commitments/wallets/distributions with NO org filter (eq(investors.id, parsed.investorId)) and writes an AI draft against it — leaking another org's investor financials into a generated draft and creating a draft attributed to a foreign investor. The local investorCode lookup for revalidatePath also lacks an org filter. const organizationId = await requireOrgId() and verify the investor belongs to org (AND eq(investors.organizationId, organizationId)) before drafting; thread org into draftInvestorResponse.

## invoice-actions.ts  _(4)_
- **[HIGH·WRITE]** `issueInvoiceForMilestone` — contract_milestones, contract_groups (select), invoices (insert)
  - Fix: Add requireOrgId() (+requireInternalUser()); after loading the milestone and its contract group, assert contractMilestones.organizationId == orgId (and contractGroups.organizationId == orgId) before creating the invoice — return 'Milestone not found.' on mismatch. NOTE: invoices itself has NO organization_id column, but contract_milestones and contract_groups BOTH have organization_id, so the org check is on those parents.
- **[HIGH·WRITE]** `generateInvoicePDF` — invoices (select+update), documents (insert)
  - Fix: requireOrgId() is called ONLY to stamp the documents insert (line 186); the invoice SELECT-by-id (157-160) and the invoices.documentId UPDATE (204-207) are unscoped. Resolve the invoice's org via contractGroupId->contractGroups.organizationId and reject mismatch before rendering/indexing/updating — a cross-org invoiceId otherwise gets a PDF rendered (PII) and the foreign invoice row mutated.
- **[HIGH·WRITE]** `sendInvoice` — invoices (select+update), contacts (select), email send/log
  - Fix: Unscoped SELECT invoices by id (235-239) + reads buyer contact email (246-250) + emails it + UPDATE status='sent' (294-302). Add requireOrgId()/requireInternalUser() and verify the invoice's org via contractGroups.organizationId before resolving recipient/sending — a cross-org id leaks buyer PII (email + invoice) and emails another tenant's client.
- **[HIGH·WRITE]** `voidInvoice` — invoices (update)
  - Fix: Unconditional UPDATE invoices SET status='void' WHERE id=invoiceId (324-332) with NO org check and NO auth gate at all. Add requireOrgId()+requireInternalUser(); resolve org via contractGroups.organizationId and only void when it matches — any caller can void any tenant's invoice.

## invoices/invoice-actions.ts  _(2)_
- **[MED·READ]** `listInvoices` — dev_invoices (select)
  - Fix: Add requireOrgId() and push eq(devInvoices.organizationId, orgId) into the conditions array (lines 239-244). Currently returns ALL orgs' invoices when no filter narrows them.
- **[MED·READ]** `getInvoice` — dev_invoices, dev_invoice_lines (select)
  - Fix: Add requireOrgId() + AND eq(devInvoices.organizationId, orgId) to the header SELECT (253-259); return null on mismatch so the page notFound()s. Lines are then reachable only via a gated invoiceId.

## land/land-actions.ts  _(1)_
- **[HIGH·WRITE]** `markLandInstallmentPaid` — land_payment_installments (select+update)
  - Fix: Money mutation: marks an installment paid by raw installmentId (166-190) with only requireInternalUser(), no org verification. land_payment_installments has NO org column — resolve org via installment->scheduleId->land_payment_schedules->landProfileId->land_profiles.organizationId and assert == requireOrgId() before the UPDATE; reject cross-org as 'Installment not found.'

## lead-actions.ts  _(1)_
- **[HIGH·WRITE]** `regenerateAIDraft` — contact_interactions (select+insert+update), contacts (select), ai_assistant_runs (insert+update)
  - Fix: Unlike its sibling reviewAIDraft, this has NO requireInternalUser()/requireOrgId() and SELECTs contact_interactions (757-761) + contacts (772-778) by raw id with no org predicate, then inserts a new ai_draft and annotates the original. Add requireInternalUser()+requireOrgId() and resolve the draft's org via projectId->projects.organizationId (with the row's own org column as fallback, exactly like reviewAIDraft lines 658-675), rejecting cross-org.

## material-actions.ts  _(1)_
- **[MED·WRITE]** `recordMaterialDelivery` — material_po_lines (select+update), material_deliveries + material_delivery_lines (insert), material_purchase_orders (update)
  - Fix: requireOrgId() is called and the po_line/PO UPDATEs are org-scoped (so qty/status no-op for a foreign PO), BUT the validLines SELECT on material_po_lines (193-203) has NO org predicate and parsed.poId is never verified against the caller's org — so a cross-org poId + its matching poLineId passes both the line-ownership and poId checks, and material_deliveries + material_delivery_lines rows (stamped with the CALLER's org) are created referencing another tenant's PO, while the foreign PO's line structure is read. Add eq(materialPoLines.organizationId, organizationId) to the validLines WHERE and verify the parent PO's org so a foreign poLineId is 'not found' and the tx aborts.

## permits/permit-actions.ts  _(3)_
- **[LOW·WRITE]** `transitionPermitStatus` — project_permits
  - Fix: Add const organizationId = await requireOrgId(); and AND eq(projectPermits.organizationId, organizationId) to the UPDATE .where (line 117), matching the sibling getPermit/listPermitsByProject. Currently the UPDATE filters by permitId only, so the where-clause is org-blind.
- **[LOW·WRITE]** `attachPermitDocument` — project_permit_documents (join table; org anchored on parent project_permits / documents)
  - Fix: Before the INSERT, verify BOTH FKs against requireOrgId(): SELECT projectPermits WHERE id = permitId AND organization_id = orgId, and SELECT documents WHERE id = documentId AND organization_id = orgId (throw on either miss). The join table itself has no org column (schema confirmed — only permit_id/document_id), so isolation must be enforced on both foreign keys; currently neither is checked.
- **[LOW·READ]** `listExpiringPermits` — project_permits
  - Fix: Take an explicit organizationId param (cron/global-digest pattern) OR add requireOrgId() + AND eq(projectPermits.organizationId, organizationId) to the .where. Currently filters only by expiresAt/status, so it would return every org's expiring permits.

## photo-upload-actions.ts  _(2)_
- **[HIGH·WRITE]** `uploadSiteReportPhoto` — site_reports, site_zones, projects (read) → documents, site_report_photos (write)
  - Fix: Scope the report/zone resolution to requireOrgId(): SELECT siteReports WHERE id = reportId AND organization_id = orgId (throw/notFound on miss), same for siteZones. Currently the report lookup (line 106) and zone lookup (line 128) filter by id ONLY; org is used solely to STAMP the new documents/site_report_photos rows (lines 81,183,198). A cross-org reportId is therefore accepted and an attacker-org photo+document row is grafted onto the victim's site_report, and the foreign report's status/reportDate leak back via the response/error path.
- **[LOW·WRITE]** `deleteSiteReportPhoto` — site_report_photos, documents
  - Fix: Add const organizationId = await requireOrgId(); and AND eq(siteReportPhotos.organizationId, organizationId) to the photo SELECT (line 245) so a cross-org photoId resolves to no row and throws before the DELETE + Storage blob removal. Currently only requireInternalUser() is called (no org), and the SELECT/DELETE filter by photoId only.

## procurement/procurement-actions.ts  _(1)_
- **[MED·WRITE]** `generatePurchaseRequestsFromBoqAction` — boq_items + boq_sections + boq_documents (read, joined) -> dev_os_purchase_requests (insert)
  - Fix: The BOQ read joins boqItems->boqSections->boqDocuments filtered ONLY by `boqItems.id IN (boqItemIds)` with no org predicate; all three BOQ tables have organization_id. A procurement_manager in org A passes org B's boqItemIds and the action copies r.document.projectId/description/quantity into NEW dev_os_purchase_requests stamped with the CALLER's org. Add `AND eq(boqDocuments.organizationId, organizationId)` (and/or boqItems.organizationId) to the SELECT so foreign BOQ items are dropped before insert; return 'No BOQ items found' when the org-scoped rows is empty.

## procurement/quotation-bulk-actions.ts  _(1)_
- **[HIGH·WRITE]** `bulkInsertQuotationLines` — dev_os_purchase_requests (read), vendors (read, ALL rows), procurement_quotations (read+insert), procurement_quotation_lines (read+insert)
  - Fix: Calls requireOrgId() and stamps inserts with organizationId, but (a) the PR pre-load `eq(devOsPurchaseRequests.id, parsed.prId)` has NO org predicate, so a foreign PR id is accepted and quotations+lines (stamped caller org) are attached onto org B's purchase request; (b) the vendor catalogue load `.from(vendors)` has NO .where, leaking every org's vendor legalName/vendorCode; (c) the existing-quotation lookup (PR+vendor, no org predicate). Fix: add `AND eq(devOsPurchaseRequests.organizationId, organizationId)` to the PR load (keep returning purchase_request_not_found on mismatch), add `eq(vendors.organizationId, organizationId)` to the vendor select, and add the org predicate to the existing-quotation lookup.

## procurement/quotation-comparison-actions.ts  _(1)_
- **[MED·READ]** `createPoFromQuotationComparison` — procurement_quotations (read) -> selectQuotation (write, SAFE)
  - Fix: No requireOrgId(); the pre-load `select(procurementQuotations).where(inArray(purchaseRequestId, prIds))` has NO org predicate, so supplying foreign PR ids in supplierChoicesByPrId reveals other orgs' quotation ids/vendorIds/statuses (read leak). Add requireOrgId() and `AND eq(procurementQuotations.organizationId, organizationId)` to the pre-load select.

## project-milestone-actions.ts  _(2)_
- **[HIGH·WRITE]** `updateMilestone` — milestones (select + update), milestone_dependencies (select)
  - Fix: Add `const orgId = await requireOrgId()` and AND eq(milestones.organizationId, orgId) to BOTH the `current` lookup SELECT (line 185) and the UPDATE WHERE (line 237); return {ok:false,error:'Milestone not found.'} on mismatch. The dependency-gate sub-SELECTs key off ids derived from `current`, so binding `current` to the org closes the path.
- **[HIGH·WRITE]** `deleteMilestone` — milestones (select + delete; milestone_dependencies edges cascade)
  - Fix: Add `const orgId = await requireOrgId()` and AND eq(milestones.organizationId, orgId) to BOTH the `current` lookup SELECT (line 288) and the DELETE WHERE (line 292); return {ok:false,error:'Milestone not found.'} on mismatch.

## qa-qc/qa-qc-queries.ts  _(3)_
- **[MED·READ]** `listQaQcIssues` — qa_qc_issues
  - Fix: const organizationId = await requireOrgId(); push eq(qaQcIssues.organizationId, organizationId) into the conditions array (and stop the early-return undefined-where path) so the SELECT always filters by org — this also closes the unscoped bulk-import export path which calls listQaQcIssues() with no args under only requireInternalUser().
- **[LOW·READ]** `getProjectQaQcHeatmapData` — qa_qc_issues
  - Fix: const organizationId = await requireOrgId(); add AND eq(qaQcIssues.organizationId, organizationId) to the WHERE (currently only eq(projectId)). Latent: no live caller today, but a forged cross-tenant projectId would return another org's villa/severity/status rows once wired.
- **[LOW·READ]** `countOpenIssuesByProject` — qa_qc_issues
  - Fix: const organizationId = await requireOrgId(); add AND eq(qaQcIssues.organizationId, organizationId) to the COUNT WHERE (currently eq(projectId) + status NOT IN). Latent aggregate count leak: a cross-tenant projectId would count another org's open issues once wired.

## reservation-actions.ts  _(3)_
- **[HIGH·WRITE]** `createReservation` — reservations (insert), contactRoles (update)
  - Fix: Add requireInternalUser()+requireOrgId() at the top; verify the supplied projectId/villaId belong to the caller org (join projects, assert projects.organizationId === orgId) and that contactId/contactRoleId are in-org before the insert + the contactRoles UPDATE; reject on mismatch.
- **[HIGH·WRITE]** `cancelReservation` — reservations (update)
  - Fix: Mirror markReservationPaid: add requireInternalUser()+requireOrgId(), load the reservation joined to projects, assert projects.organizationId === orgId (return not-found on mismatch) before the cancel/refund UPDATE.
- **[HIGH·WRITE]** `extendReservationExpiry` — reservations (update)
  - Fix: Add requireInternalUser()+requireOrgId(), load the reservation via projects and assert projects.organizationId === orgId before updating expiresAt; reject on mismatch.

## residual-inventory/residual-actions.ts  _(4)_
- **[MED·WRITE]** `markUnitAsResidual` — residualInventoryUnits (insert)
  - Fix: Add requireOrgId(); verify the supplied unitId(villa)/projectId belong to the caller org (join projects, assert organizationId === orgId) and stamp organizationId on the inserted row (currently left null).
- **[MED·WRITE]** `allocateResidualOwnership` — residualInventoryUnits (select), residualUnitOwnershipShares (delete+insert)
  - Fix: Add requireOrgId() and scope the unit load WHERE id = residualUnitId AND organizationId = orgId (reject on miss) before the share delete/insert; stamp organizationId on inserted ownership-share rows.
- **[LOW·WRITE]** `transferResidualUnitToManagement` — residualInventoryUnits (update)
  - Fix: Add requireOrgId() and AND eq(residualInventoryUnits.organizationId, orgId) to the UPDATE WHERE; reject when no row updated.
- **[LOW·WRITE]** `recordResidualUnitSold` — residualInventoryUnits (update)
  - Fix: Add requireOrgId() and AND eq(residualInventoryUnits.organizationId, orgId) to the UPDATE WHERE; reject when no row updated (prevents writing sold price/status onto another org's residual unit).

## schedule/resource-pool-actions.ts  _(2)_
- **[MED·WRITE]** `editWorkingCalendar` — working_calendars
  - Fix: Add const organizationId = await requireOrgId(); and scope the UPDATE WHERE to and(eq(workingCalendars.id, parsed.data.id), or(eq(workingCalendars.organizationId, organizationId), isNull(workingCalendars.organizationId))) — matching the addHoliday/calendar-queries pattern (NOT a bare eq on org, since NULL-org rows are intended shared reference calendars).
- **[MED·WRITE]** `archiveWorkingCalendar` — working_calendars
  - Fix: Add const organizationId = await requireOrgId(); and scope the UPDATE WHERE to and(eq(workingCalendars.id, args.id), or(eq(workingCalendars.organizationId, organizationId), isNull(workingCalendars.organizationId))) — matching the addHoliday pattern; this prevents archiving/disabling another org's calendar.

## schedule/schedule-actions.ts  _(1)_
- **[LOW·READ]** `setTaskDependency` — project_tasks (read), work_packages (read), task_dependencies (read+insert)
  - Fix: add eq(projectTasks.organizationId, organizationId) to the predecessor lookup (line 95) and the allTasks join (line 111), and eq(workPackages.organizationId, organizationId) to the work_packages lookup (line 101); reject when predecessor is not in-org. organizationId is already in scope (line 83); insert is already org-stamped.

## shared-costs/shared-cost-actions.ts  _(3)_
- **[MED·READ]** `listSharedCostAllocations` — shared_cost_allocations
  - Fix: add const organizationId = await requireOrgId(); and .where(eq(sharedCostAllocations.organizationId, organizationId)) to the SELECT (lines 257-263). requireOrgId is already imported in this file.
- **[MED·READ]** `getSharedCostAllocation` — shared_cost_allocations, shared_cost_allocation_lines
  - Fix: await requireOrgId() + add eq(sharedCostAllocations.organizationId, orgId) to the allocation SELECT (line 270) and eq(sharedCostAllocationLines.organizationId, orgId) to the lines SELECT (line 276); return null on mismatch so the [id] page notFound()s.
- **[MED·READ]** `proposeSharedCostAllocation` — dev_transactions (source read), shared_cost_allocations + shared_cost_allocation_lines (insert)
  - Fix: add and(eq(devTransactions.id, parsed.sourceTransactionId), eq(devTransactions.organizationId, organizationId)) to the source SELECT (line 73). Inserts are already org-stamped; org is fetched at line 63.

## specifications/specification-queries.ts  _(1)_
- **[MED·READ]** `listSpecifications` — specifications
  - Fix: add const organizationId = await requireOrgId(); conditions.push(eq(specifications.organizationId, organizationId)); requireOrgId is already imported and used by getSpecificationByCode in the same file.

## transaction-actions.ts  _(1)_
- **[MED·READ]** `recordTransaction` — dev_transactions (insert), dev_bank_accounts (select+update), dev_commitments_ledger (update)
  - Fix: In the validation SELECT (lines 106-110) add eq(devBankAccounts.organizationId, organizationId) to the WHERE and throw 'Bank account not found' on mismatch, so a foreign bankAccountId is rejected before currency/balance are read or the insert is attached.

## transactions.ts  _(2)_
- **[HIGH·READ]** `getTransactions` — dev_transactions
  - Fix: Make org scoping mandatory: call requireOrgId() inside getTransactions and always push eq(devTransactions.organizationId, orgId), keeping the optional filter only as extra narrowing. The three unscoped callers leak today: finance/page.tsx:67 getTransactions({},{limit:10}) (recent-tx widget), finance/shared-costs/page.tsx:44 getTransactions({direction:'outflow'},{limit:100}), and bulk-import/export-actions.ts:120 exportEntityData('transactions') getTransactions({},{limit:MAX_ROWS_INLINE}) — the last only does requireInternalUser() (auth, not org isolation) and exports EVERY tenant's amounts/counterparties/descriptions to CSV/XLSX.
- **[LOW·READ]** `getTransactionLedgerSummary` — dev_transactions (leftJoin dev_cost_categories)
  - Fix: Call requireOrgId() inside the function and always include eq(devTransactions.organizationId, orgId) in the WHERE so the aggregate cannot span tenants regardless of caller.

## usage/usage-queries.ts  _(1)_
- **[MED·READ]** `listUsageMetricsAcrossOrgs` — usage_metrics (select, ALL orgs)
  - Fix: Gate /development-os/platform/usage behind a super-admin/platform-admin check (this is platform-admin data, not tenant-facing) — e.g. add a requireSuperAdmin()/platform-role guard in the page or a platform/layout.tsx; or, if it must be tenant-facing, replace this function call with the existing org-scoped listUsageMetricsForOrg(await requireOrgId()). As written, the only gate is enforceProductAccess('dev'), so any dev-product tenant user reads every org's user/project/tx/invoice/AI/API/webhook volumes.

## vendors.ts  _(3)_
- **[MED·READ]** `getVendorMetrics` — vendors (raw aggregate select: count/sum/avg, ALL orgs)
  - Fix: Add organizationId = await requireOrgId() and a WHERE organization_id = ${organizationId} to the aggregate SELECT FROM vendors (mirror the sibling getVendors which already scopes via sql`v.organization_id = ${organizationId}`). Otherwise every tenant's vendors KPI cards (total vendors, by-status counts, total commitment value, avg on-time/quality) are platform-wide.
- **[LOW·READ]** `getVendorEngagements` — vendor_engagements (select) innerJoin vendors, projects — ALL orgs when no filter
  - Fix: Add organizationId = await requireOrgId() and push eq(vendorEngagements.organizationId, organizationId) as an always-present base condition (ANDed with the optional vendorId/projectId/status filters). Defense-in-depth: the two page callers happen to pass org-verified ids (vendor.id from org-scoped getVendor→getVendors; project.realProjectId from org-scoped getDevelopmentProjectBySlug→getDevelopmentProjects), so those paths are not directly exploitable today, but the query is unconditionally cross-tenant and getVendorEngagement() calls it with no filter.
- **[LOW·READ]** `getVendorEngagement` — vendor_engagements (via getVendorEngagements() with NO filter → all orgs, then .find)
  - Fix: Inherits the fix from org-scoping getVendorEngagements (add the requireOrgId base predicate there). Currently calls getVendorEngagements() with no args → unscoped all-orgs scan to resolve one id by equality. No in-repo caller today, hence low.

## whatsapp-actions.ts  _(4)_
- **[MED·READ]** `getWhatsappMessage` — whatsapp_messages
  - Fix: Add requireOrgId() and AND eq(whatsappMessages.organizationId, orgId) to the WHERE; keep page's notFound() on null/mismatch so a cross-org UUID 404s instead of returning the row.
- **[LOW·READ]** `getRecentWhatsappMessages` — whatsapp_messages
  - Fix: Add requireOrgId() + push eq(whatsappMessages.organizationId, orgId) into conditions (replacing the sql`true` fallback when empty).
- **[LOW·READ]** `getWhatsappPhoneNumbers` — whatsapp_phone_numbers
  - Fix: Add requireOrgId() + eq(whatsappPhoneNumbers.organizationId, orgId) into conditions.
- **[LOW·READ]** `getWhatsappTemplates` — whatsapp_message_templates
  - Fix: Add requireOrgId() + eq(whatsappMessageTemplates.organizationId, orgId) to the query.

## whatsapp-credential-form-actions.ts  _(3)_
- **[HIGH·WRITE]** `saveWhatsappCredentialsAction` — oauth_connections
  - Fix: Ignore parsed.data.organizationId; derive org = await requireOrgId() and use that org in the SELECT/INSERT/UPDATE WHERE. (Or assert parsed.data.organizationId === (await requireOrgId()) and return error on mismatch.) requirePermission('whatsapp.admin') is org-agnostic, so it does not constrain the target org.
- **[HIGH·READ]** `sendWhatsappTestMessageAction` — oauth_connections (via loadOrgWhatsAppCredentials / getWhatsAppProviderForOrg)
  - Fix: Derive org = await requireOrgId() and pass that to loadOrgWhatsAppCredentials/getWhatsAppProviderForOrg instead of trusting parsed.data.organizationId. Otherwise an admin loads and SENDS using another org's saved Twilio creds/from-number.
- **[HIGH·WRITE]** `disconnectWhatsappCredentialsAction` — oauth_connections
  - Fix: Derive org = await requireOrgId() and use it (not input.organizationId) in BOTH the SELECT (line 225) and UPDATE (line 239) WHERE clauses. As written an admin of org A can deactivate org B's active twilio_whatsapp connection(s) — cross-tenant denial/disconnect.

