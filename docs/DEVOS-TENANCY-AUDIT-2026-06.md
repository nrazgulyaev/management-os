# Dev-OS Tenancy Audit — 2026-06-15

READ-ONLY org-scoping audit of the 82 zero-org-awareness files under `src/lib/development/server/**` (build→adversarial-verify, 28 agents). The DB role is **BYPASSRLS** — no RLS net — so an unscoped query on an org-owning table is a cross-tenant leak.

**163 confirmed leaks across 60 files** — high=54 · med=80 · low=29; **32 are cross-tenant WRITE-IDORs**. 73 functions classified SAFE (global/caller-scoped) and excluded.

All findings carry an org column on the table (confirmed) and a reachable tenant-page call path. Fix = `requireOrgId()` + AND `organizationId` on load+mutate (cron-safe optional-org where a cron/AI-agent calls the reader); writes need a scoped FK-existence check. No migrations expected (columns exist).

---

## ai-usage.ts  _(3)_
- **[MED·READ]** `getAiUsageByAssistant` — ai_assistant_runs
  - Fix: add requireOrgId() and scope the WHERE to (ai_assistant_runs.organization_id = orgId OR organization_id IS NULL) so per-assistant run/spend roll-ups are this-tenant-only while keeping platform/un-attributed (null-org) engine runs visible
- **[MED·READ]** `getRecentAiRuns` — ai_assistant_runs
  - Fix: add requireOrgId() and AND (ai_assistant_runs.organization_id = orgId OR organization_id IS NULL) to the WHERE; currently any optional assistantKey filter returns the latest 100 runs across ALL tenants, exposing other orgs' input/output summaries, model, cost and error messages
- **[LOW·READ]** `getAiSpendWindows` — ai_assistant_runs
  - Fix: add requireOrgId() and AND (organization_id = orgId OR organization_id IS NULL) to both sum() queries so today/month spend bars are per-tenant (aggregate-only, low sensitivity)

## assets/asset-queries.ts  _(2)_
- **[MED·READ]** `listAssets` — villas (+ asset_types join)
  - Fix: join projects and add requireOrgId() + AND eq(projects.organizationId, orgId) (villas anchors org via projects.organizationId); the client-supplied projectId/typeKey/category filters currently let any tenant's project/units be listed
- **[LOW·READ]** `listAssetTypes` — asset_types
  - Fix: add requireOrgId() + AND (asset_types.organization_id = orgId OR organization_id IS NULL) so the catalog is per-tenant while still showing shared/seed types whose org is null

## bank-accounts.ts  _(4)_
- **[HIGH·READ]** `getBankAccounts` — dev_bank_accounts
  - Fix: add requireOrgId() + AND eq(devBankAccounts.organizationId, orgId) to the SELECT — currently lists every tenant's bank/crypto accounts incl. account number, IBAN, SWIFT, wallet address and balances (financial PII)
- **[HIGH·READ]** `getBankAccount` — dev_bank_accounts
  - Fix: add requireOrgId() + AND eq(devBankAccounts.organizationId, orgId) and notFound on org mismatch — a guessed/known UUID currently returns another tenant's full account (IBAN/SWIFT/wallet/balance)
- **[HIGH·READ]** `getAccountsBelowThreshold` — dev_bank_accounts
  - Fix: fixing getBankAccounts() (add requireOrgId() + org predicate) closes this transitively — it filters in JS over the already cross-tenant list; no separate query change needed
- **[MED·READ]** `getCompanyTotalUSDBalance` — dev_bank_accounts
  - Fix: add AND organization_id = orgId (from requireOrgId()) to the raw SQL — currently sums is_company_account balances across ALL tenants, so every org's finance KPI shows the platform-wide company balance

## boq/boq-queries.ts  _(4)_
- **[MED·READ]** `listBoqSectionTargets` — boq_sections, boq_documents
  - Fix: const orgId = await requireOrgId(); add .where(and(eq(boqDocuments.organizationId, orgId), eq(boqSections.organizationId, orgId))) to the join.
- **[MED·READ]** `listBoqDocuments` — boq_documents
  - Fix: const orgId = await requireOrgId(); push eq(boqDocuments.organizationId, orgId) into the conditions array so it always applies.
- **[MED·READ]** `getBoqDocumentByCode` — boq_documents, boq_sections, boq_items
  - Fix: const orgId = await requireOrgId(); add AND eq(boqDocuments.organizationId, orgId) to the boqCode lookup (return null on mismatch); sections/items then follow from the verified doc.id.
- **[LOW·READ]** `getBoqActualsByLine` — boq_items, boq_sections, boq_actuals
  - Fix: Add AND s.organization_id = ${orgId} (requireOrgId) to the WHERE, OR rely on a fixed getBoqDocumentByCode to pass an org-verified document.id; defense-in-depth org filter preferred.

## budget-actions.ts  _(3)_
- **[LOW·WRITE]** `createBudgetLine` — dev_budget_lines
  - Fix: const orgId = await requireOrgId(); set organization_id = orgId on insert (currently impossible via Drizzle — schema is missing the column), verify projectId belongs to orgId (join projects), and add an org predicate to the supersession-match conditions + the UPDATE WHERE.
- **[LOW·WRITE]** `updateBudgetLine` — dev_budget_lines
  - Fix: const orgId = await requireOrgId(); add AND organization_id = orgId to the lookup (throw on mismatch) before delegating to a likewise org-scoped createBudgetLine.
- **[LOW·WRITE]** `deleteBudgetLine` — dev_budget_lines (+ reads dev_transactions, dev_commitments_ledger)
  - Fix: const orgId = await requireOrgId(); add an organization_id = orgId predicate to both the SELECT (notFound on mismatch) and the DELETE WHERE.

## budget.ts  _(4)_
- **[HIGH·READ]** `getBudgetVsActual` — dev_budget_lines, dev_commitments_ledger, dev_transactions, dev_cost_categories
  - Fix: const orgId = await requireOrgId(); add organization_id = ${orgId} to the cats CTE and to bud/com/act CTEs (alongside project_id), and verify projectId belongs to orgId before running.
- **[HIGH·READ]** `getProjectFinancialSummary` — dev_budget_lines, dev_commitments_ledger, dev_transactions, dev_cost_categories (via getBudgetVsActual)
  - Fix: Fixed transitively once getBudgetVsActual is org-scoped; also verify projectId belongs to requireOrgId() at this entry point.
- **[MED·READ]** `getBudgetLine` — dev_budget_lines
  - Fix: const orgId = await requireOrgId(); add a organization_id = orgId predicate to the SELECT; return null on mismatch.
- **[MED·READ]** `getBudgetHistory` — dev_budget_lines
  - Fix: const orgId = await requireOrgId(); push an organization_id = orgId predicate into the conditions array.

## buyers/buyer-queries.ts  _(4)_
- **[HIGH·READ]** `listBuyers` — buyers
  - Fix: const orgId = await requireOrgId(); push eq(buyers.organizationId, orgId) into the conditions array.
- **[HIGH·READ]** `getBuyerByCode` — buyers, buyer_unit_assignments
  - Fix: const orgId = await requireOrgId(); add AND eq(buyers.organizationId, orgId) to the buyerCode lookup (return null on mismatch); assignments follow from the verified buyer.id.
- **[MED·READ]** `listBuyerProgressReports` — buyer_progress_reports
  - Fix: const orgId = await requireOrgId(); push eq(buyerProgressReports.organizationId, orgId) into the conditions array.
- **[MED·READ]** `getBuyerProgressReport` — buyer_progress_reports
  - Fix: const orgId = await requireOrgId(); add AND eq(buyerProgressReports.organizationId, orgId) to the SELECT; return null on mismatch.

## calendar/calendar-actions.ts  _(2)_
- **[MED·WRITE]** `createCalendar` — working_calendars
  - Fix: const orgId = await requireOrgId(); set organizationId: orgId on the insert and verify any supplied projectId/vendorId belong to orgId.
- **[MED·WRITE]** `addHoliday` — holiday_calendar
  - Fix: const orgId = await requireOrgId(); verify the calendarId's working_calendars.organization_id = orgId before inserting; optionally set holidayCalendar.organizationId = orgId.

## calendar/calendar-queries.ts  _(3)_
- **[MED·READ]** `listCalendars` — working_calendars
  - Fix: const orgId = await requireOrgId(); add .where(or(eq(workingCalendars.organizationId, orgId), isNull(workingCalendars.organizationId))) — org column is nullable so include shared NULL-org rows.
- **[MED·READ]** `getCalendarByCode` — working_calendars
  - Fix: const orgId = await requireOrgId(); add AND (organization_id = orgId OR organization_id IS NULL) to the lookup; return null on cross-org mismatch.
- **[LOW·READ]** `listHolidays` — holiday_calendar
  - Fix: Rely on a fixed getCalendarByCode to org-verify the calendar before passing cal.id; optionally add AND (organization_id = orgId OR organization_id IS NULL) as defense-in-depth (org column is nullable).

## capital-account/capital-account-queries.ts  _(3)_
- **[HIGH·READ]** `getInvestorCapitalAccount` — investor_wallets ⨝ capital_commitments
  - Fix: Add requireOrgId() and AND eq(capitalCommitments.organizationId, orgId) (capital_commitments.organization_id exists; investor_wallets also has organization_id) to the WHERE. Upstream getInvestor→getInvestors must also be org-scoped so the investor.id is org-verified before it reaches here.
- **[HIGH·READ]** `listWalletMovements` — wallet_movements
  - Fix: Add requireOrgId() + always-on AND eq(walletMovements.organizationId, orgId) to the conditions list (not gated on the optional investorId/walletId filters).
- **[LOW·READ]** `getWalletMovement` — wallet_movements
  - Fix: Latent: add requireOrgId() + AND eq(walletMovements.organizationId, orgId); notFound on mismatch before any caller mounts it.

## change-orders/change-order-queries.ts  _(1)_
- **[MED·READ]** `getChangeOrderByCode` — change_orders
  - Fix: Add requireOrgId() + AND eq(changeOrders.organizationId, orgId) to the SELECT; notFound on mismatch. (Page should also resolve project via getDevelopmentProjectBySlug and assert co.projectId === project id.)

## commitments-ledger.ts  _(2)_
- **[HIGH·READ]** `getCommitmentsLedger` — dev_commitments_ledger
  - Fix: Add requireOrgId() + always-on AND eq(devCommitmentsLedger.organizationId, orgId) independent of the optional projectId/category/vendor/status filters.
- **[LOW·READ]** `getOpenCommitmentsByCategory` — dev_commitments_ledger
  - Fix: Latent: add an organizationId param and AND organization_id = $org to the raw WHERE (or only call with an org-verified projectId via requireOrgId() at the page).

## commitments.ts  _(2)_
- **[HIGH·READ]** `getCommitment` — capital_commitments, investor_wallets, capital_drawdowns
  - Fix: Add requireOrgId() and AND eq(capitalCommitments.organizationId, orgId) to the base/wallet/drawdown selects; return null on mismatch. Upstream getCommitments (getCommitmentsRaw) must also add cc.organization_id scope.
- **[LOW·READ]** `getCommitmentDrawdownProgress` — capital_commitments ⨝ capital_drawdowns
  - Fix: Latent: add requireOrgId() + AND cc.organization_id = $org to the raw WHERE (or accept a pre-scoped commitment id from an org-verified caller).

## company-structure/company-queries.ts  _(2)_
- **[MED·READ]** `getCompanyStructure` — project_company_structures, company_structure_shareholders
  - Fix: Add requireOrgId() + AND eq(projectCompanyStructures.organizationId, orgId); notFound on mismatch. Scope companyStructureShareholders too (it has organization_id). Page should also resolve the [slug] project and assert structure.projectId matches.
- **[LOW·READ]** `getActiveStructureForProject` — project_company_structures
  - Fix: Latent: add requireOrgId() + AND eq(projectCompanyStructures.organizationId, orgId), or only call with an org-verified projectId.

## contact-sales.ts  _(2)_
- **[HIGH·READ]** `getLeadSalesSnapshot` — reservations (via getReservations), contract_groups (via getContractGroups)
  - Fix: Thread requireOrgId() through: getReservations must innerJoin projects and AND eq(projects.organizationId, orgId) (reservations has NO own org col — anchor via projectId→projects); getContractGroups must AND eq(contractGroups.organizationId, orgId). getLeadDetail must also org-scope the contactRole lookup so contactId is org-verified.
- **[LOW·READ]** `hasActiveReservation` — reservations
  - Fix: Latent: anchor org — innerJoin projects on reservations.projectId and AND eq(projects.organizationId, requireOrgId()); reservations has NO own organization_id column.

## contacts.ts  _(3)_
- **[HIGH·WRITE]** `findOrCreateContact` — contacts
  - Fix: Thread requireOrgId() in; add AND eq(contacts.organizationId, orgId) to both dedup SELECTs (email + phone), stamp organizationId on the INSERT, and add the org predicate to the UPDATE .where so a tenant cannot dedup-attach to / mutate another org's contact PII.
- **[MED·READ]** `getContactById` — contacts
  - Fix: Add requireOrgId() + AND eq(contacts.organizationId, orgId) to the SELECT and return null on mismatch; also org-scope getLeadDetail (leads.ts:155) which feeds the unverified contactId.
- **[LOW·READ]** `getActiveLeadRole` — contact_roles
  - Fix: Add AND eq(contactRoles.organizationId, orgId) (from requireOrgId()) to the SELECT so the duplicate-lead existence check is evaluated within the caller's own org, matching the org used for the subsequent insert.

## contracts.ts  _(2)_
- **[HIGH·READ]** `getContractGroups` — contract_groups (+ joined contacts/villas/projects/contract_templates/sales_schemes)
  - Fix: Add requireOrgId() + AND eq(contractGroups.organizationId, orgId) to the WHERE (contract_groups.organization_id is NOT NULL) so the contracts list, discounts page, and contact-sales snapshot only show the caller's deals (money + buyer PII).
- **[HIGH·READ]** `getContractGroupById` — contract_groups (+ joins) + contracts + contract_milestones
  - Fix: Add requireOrgId() + AND eq(contractGroups.organizationId, orgId) to the head SELECT and notFound() on mismatch; the child contracts/milestones SELECTs (keyed by the now-verified contractGroupId) inherit safety.

## corporate-event-actions.ts  _(1)_
- **[MED·WRITE]** `recordCorporateEvent` — dev_corporate_events
  - Fix: Add organization_id to dev_corporate_events (migration), stamp it from requireOrgId() on INSERT, add AND organization_id = $orgId to the director-loan-repayment validation SELECT, and scope event_code uniqueness per-org (currently event_code is a global UNIQUE so tenants collide).

## corporate-events.ts  _(2)_
- **[HIGH·READ]** `getCorporateEvents` — dev_corporate_events
  - Fix: Add organization_id to dev_corporate_events (migration + backfill via related project/contact or default org), then filter AND eq(devCorporateEvents.organizationId, requireOrgId()). Until the column exists this page exposes ALL tenants' corporate finance (director loans / dividends / share transfers, amounts, related contacts).
- **[HIGH·READ]** `getCorporateEventsSummary` — dev_corporate_events
  - Fix: After adding organization_id (see getCorporateEvents), add WHERE organization_id = $orgId to the raw GROUP BY event_type SQL so the per-type counts and sum(amount_usd_minor) are per-tenant, not a global sum across all orgs.

## decisions/decision-queries.ts  _(1)_
- **[MED·READ]** `getProjectDecisionByCode` — project_decisions
  - Fix: Add requireOrgId() + AND eq(projectDecisions.organizationId, orgId) to the SELECT (project_decisions.organization_id is NOT NULL) and notFound() on mismatch, so a tenant cannot read another org's decision-log entry by its globally-unique code.

## discount-actions.ts  _(4)_
- **[HIGH·WRITE]** `approveDiscount` — unit_discounts (select by id + update); roles/user_roles (read)
  - Fix: Add requireInternalUser()+requireOrgId(); when loading the discount by id, join villas->projects.organizationId (or contacts.organizationId) and AND eq(org)=callerOrg; notFound/forbid on cross-org id before flipping status to 'approved'.
- **[HIGH·WRITE]** `rejectDiscount` — unit_discounts (blind update by id)
  - Fix: Add requireInternalUser()+requireOrgId(); pre-SELECT the discount and resolve its org via villa->project (or contact), AND the UPDATE WHERE with callerOrg; reject cross-org id. Currently a blind UPDATE by id with no SELECT at all.
- **[HIGH·WRITE]** `applyDiscountToContract` — unit_discounts (select+update), contract_groups (select+update), price_snapshots (insert via createPriceSnapshot)
  - Fix: Add requireInternalUser()+requireOrgId(); AND eq(contractGroups.organizationId, orgId) on both the contract_groups SELECT and UPDATE, and verify the discount's villa/contact org matches; notFound on mismatch. contract_groups HAS organization_id (schema line 290) yet code uses only eq(contractGroups.id, id).
- **[MED·WRITE]** `proposeDiscount` — unit_discounts (insert); reads roles/user_roles/discount_authorizations
  - Fix: Add requireInternalUser()+requireOrgId(); verify villaId (villas->projects.organizationId) and contactId (contacts.organizationId) belong to caller's org before INSERT; reject on mismatch. Also stamp/derive an org anchor. (unit_discounts has no organization_id column; org is anchored only via villa/contact.)

## discounts.ts  _(3)_
- **[MED·READ]** `getDiscounts` — unit_discounts (select) innerJoin villas, contacts
  - Fix: Add requireOrgId() and scope by org: innerJoin villas->projects and AND eq(projects.organizationId, orgId) (or filter contacts.organizationId). Thread org into DiscountFilters.
- **[MED·READ]** `getPendingDiscountApprovals` — unit_discounts (via getDiscounts)
  - Fix: Scope the underlying getDiscounts() by caller org (villas->projects.organizationId), then keep the status='pending_approval' filter.
- **[LOW·READ]** `getDiscountById` — unit_discounts (select by id) innerJoin villas, contacts
  - Fix: Add org scoping (innerJoin villas->projects AND eq(projects.organizationId, requireOrgId())) to the WHERE; return null on cross-org id. Currently latent (no caller) but unsafe if wired.

## distributions.ts  _(4)_
- **[HIGH·READ]** `getDistribution` — distributions (select by id) + distribution_allocations JOIN capital_commitments JOIN investors (raw SQL by distribution_id)
  - Fix: Add requireOrgId() and AND eq(distributions.organizationId, orgId) on the base lookup (and scope the underlying getDistributions()); return null (notFound) on cross-org id. Reaches investor legal names + per-investor capital/profit amounts.
- **[HIGH·READ]** `previewDistribution` — capital_commitments JOIN investors LEFT JOIN investor_wallets (via loadCommitmentSnapshots, raw SQL by project_id)
  - Fix: Take orgId from requireOrgId() and add AND cc.organization_id = ${orgId} in loadCommitmentSnapshots, and verify the projectId belongs to the org before previewing. Today a cross-org projectId returns that org's investor commitment/wallet financials.
- **[HIGH·READ]** `_internals.loadCommitmentSnapshots` — capital_commitments JOIN investors LEFT JOIN investor_wallets (raw SQL filtered by cc.project_id or project_id IS NULL)
  - Fix: Add an org predicate AND cc.organization_id = ${orgId} (orgId from requireOrgId at the action boundary, threaded in) so a cross-org or NULL projectId cannot pull another tenant's commitments/wallets. This loader also feeds the money-moving declareDistribution path.
- **[MED·READ]** `getDistributions` — distributions (raw SQL) LEFT JOIN projects, distribution_allocations
  - Fix: Add requireOrgId() and append AND d.organization_id = ${orgId} to the WHERE in the raw SQL; thread org through DistributionFilters. distributions.organization_id is NOT NULL (migration 0163).

## drawdown-actions.ts  _(3)_
- **[HIGH·WRITE]** `requestDrawdown` — capital_commitments (select by id), capital_drawdowns (select max + insert)
  - Fix: Add requireInternalUser()+requireOrgId(); AND eq(capitalCommitments.organizationId, orgId) on the commitment SELECT and reject if not found (guard NULL org since the column is nullable) before inserting the drawdown.
- **[HIGH·WRITE]** `confirmDrawdownReceipt` — capital_drawdowns (select+update by id), investor_wallets (select+update), wallet_transactions (insert)
  - Fix: Add requireInternalUser()+requireOrgId(); resolve the drawdown's org (capital_drawdowns.organization_id, or via its commitment) and AND eq(org)=callerOrg before mutating; reject cross-org drawdownId. This credits a wallet balance — highest severity.
- **[HIGH·WRITE]** `cancelDrawdown` — capital_drawdowns (select status + update by id)
  - Fix: Add requireInternalUser()+requireOrgId(); AND eq(capitalDrawdowns.organizationId, orgId) (or resolve org via the commitment) on the SELECT/UPDATE; reject cross-org id.

## executive-digest/digest-queries.ts  _(3)_
- **[MED·READ]** `listDigestsInRange` — executive_digests (select by period overlap)
  - Fix: Add requireOrgId() and AND eq(executiveDigests.organizationId, orgId) to the WHERE. executive_digests.organization_id exists (schema line 222).
- **[MED·READ]** `listDigests` — executive_digests (select newest N)
  - Fix: Add requireOrgId() and AND eq(executiveDigests.organizationId, orgId) before the limit.
- **[MED·READ]** `getDigestByCode` — executive_digests (select by digest_code)
  - Fix: Add requireOrgId() and AND eq(executiveDigests.organizationId, orgId); return null (notFound) on cross-org code.

## interactions.ts  _(6)_
- **[MED·READ]** `getContactInteractions` — contact_interactions
  - Fix: add requireOrgId() + AND eq(contactInteractions.organizationId, orgId) to the SELECT; also scope the upstream getLeadDetail (leads.ts) by org / notFound on mismatch so contactId can't be cross-org iterated.
- **[MED·READ]** `getPendingDraftsForContact` — contact_interactions
  - Fix: add requireOrgId() + AND eq(contactInteractions.organizationId, orgId) to the WHERE (alongside contactId + reviewStatus).
- **[LOW·READ]** `getProjectInteractions` — contact_interactions
  - Fix: add requireOrgId() + AND eq(contactInteractions.organizationId, orgId) (or join projects and filter projects.organizationId) before mounting any caller.
- **[LOW·WRITE]** `logInteraction` — contact_interactions
  - Fix: stamp organizationId = await requireOrgId() inside logInteraction (do NOT trust input.organizationId), and validate input.contactId/relatedRoleId belong to that org before insert.
- **[LOW·WRITE]** `markFollowUpCompleted` — contact_interactions
  - Fix: add requireOrgId() + AND eq(contactInteractions.organizationId, orgId) to the UPDATE WHERE so a tenant can't complete another org's follow-up by guessing the interaction uuid.
- **[LOW·READ]** `getPendingDraftCount` — contact_interactions
  - Fix: add requireOrgId() + AND eq(contactInteractions.organizationId, orgId) to the count.

## inventory/inventory-queries.ts  _(5)_
- **[MED·READ]** `listInventoryItems` — dev_os_inventory_items
  - Fix: add requireOrgId() and push eq(devOsInventoryItems.organizationId, orgId) into the conditions array.
- **[MED·READ]** `getInventoryItemBySku` — dev_os_inventory_items, dev_os_inventory_stock_balances (join dev_os_inventory_locations)
  - Fix: add requireOrgId() + AND eq(devOsInventoryItems.organizationId, orgId) to the item SELECT (notFound on mismatch) and eq(devOsInventoryStockBalances.organizationId, orgId) to the balances query.
- **[MED·READ]** `listInventoryLocations` — dev_os_inventory_locations
  - Fix: add requireOrgId() + AND eq(devOsInventoryLocations.organizationId, orgId) to the WHERE.
- **[MED·READ]** `listInventoryMovements` — dev_os_inventory_movements
  - Fix: add requireOrgId() and push eq(devOsInventoryMovements.organizationId, orgId) into the conditions array (independent of the optional item/location/project/villa filters).
- **[MED·READ]** `listLowStockItems` — dev_os_inventory_items, dev_os_inventory_stock_balances, dev_os_inventory_locations (raw SQL)
  - Fix: add requireOrgId() and AND i.organization_id = ${orgId} (and b.organization_id = ${orgId}) to the raw SQL WHERE clause.

## investor-portal-requests/request-queries.ts  _(3)_
- **[MED·READ]** `listInvestorPortalRequests` — investor_portal_requests
  - Fix: add requireOrgId() and push eq(investorPortalRequests.organizationId, orgId) into conditions.
- **[MED·READ]** `getInvestorPortalRequestByCode` — investor_portal_requests
  - Fix: add requireOrgId() + AND eq(investorPortalRequests.organizationId, orgId) to the SELECT; notFound on mismatch.
- **[LOW·READ]** `getInvestorPortalRequest` — investor_portal_requests
  - Fix: add requireOrgId() + AND eq(investorPortalRequests.organizationId, orgId) to the SELECT; notFound on mismatch.

## investors.ts  _(4)_
- **[HIGH·READ]** `getInvestors` — investors, capital_commitments, investor_wallets (raw SQL)
  - Fix: add requireOrgId() and WHERE i.organization_id = ${orgId} to the raw SQL (the commitments/wallet subqueries narrow via investor_id, so scoping investors i is sufficient).
- **[HIGH·READ]** `getInvestor` — investors, capital_commitments (via getInvestors + getCommitmentsByInvestor)
  - Fix: scope getInvestors() by requireOrgId() (propagates here); additionally verify resolved investor.organizationId === orgId and notFound on mismatch, and pass orgId into getCommitmentsByInvestor.
- **[HIGH·READ]** `getCommitments` — capital_commitments, investors, projects, capital_drawdowns, investor_wallets (raw SQL via getCommitmentsRaw)
  - Fix: add requireOrgId() and AND cc.organization_id = ${orgId} into the conditions list in getCommitmentsRaw (capital_commitments.organization_id exists at investor-capital.ts:107).
- **[MED·READ]** `getInvestorMetrics` — investors, capital_commitments, investor_wallets (raw SQL)
  - Fix: add requireOrgId() and WHERE organization_id = ${orgId} to the FROM investors aggregate, and AND c.organization_id = ${orgId} to the capital_commitments aggregate.

## invoices.ts  _(3)_
- **[HIGH·READ]** `getInvoices` — invoices (innerJoin contacts, leftJoin contract_milestones)
  - Fix: add requireOrgId() + AND eq(contacts.organizationId, orgId) to the WHERE (or join contract_groups and filter contractGroups.organizationId). invoices has no org col but every joined anchor does.
- **[LOW·READ]** `getInvoicesByContract` — invoices (delegates to getInvoices)
  - Fix: scope underlying getInvoices by org (requireOrgId + contacts/contractGroups.organizationId); wrapper then inherits. Filtering by contractGroupId alone does not prove the group belongs to the caller's org.
- **[LOW·READ]** `getInvoiceById` — invoices (innerJoin contacts, leftJoin contract_milestones)
  - Fix: add requireOrgId() + AND eq(contacts.organizationId, orgId) (or join contract_groups org) to the WHERE; return null/notFound on org mismatch.

## late-fees.ts  _(3)_
- **[MED·WRITE]** `waiveLateFees` — late_fee_accruals (UPDATE status->waived)
  - Fix: before UPDATE, verify the milestone's org: subselect/join contract_milestones with eq(organizationId, requireOrgId()) and reject on mismatch; or add that predicate to the WHERE.
- **[LOW·READ]** `getActiveLateFeeRule` — late_fee_rules
  - Fix: if wired to a page, join projects and AND eq(projects.organizationId, requireOrgId()); cron-safe as-is because its only (orphaned) caller supplies an org-derived projectId from contract_groups.
- **[LOW·READ]** `getLateFeeAccruals` — late_fee_accruals
  - Fix: when wired, join contract_milestones and AND eq(contractMilestones.organizationId, requireOrgId()); notFound on org mismatch.

## leads.ts  _(5)_
- **[HIGH·READ]** `getLeadsPipeline` — contact_roles (joins contacts, lead_sources, unit_types, projects, agents)
  - Fix: add requireOrgId() + AND eq(contactRoles.organizationId, orgId) to the WHERE (also scope the allAgents subquery by org).
- **[HIGH·READ]** `getLeadDetail` — contact_roles (joins contacts, lead_sources, unit_types, projects, agents)
  - Fix: add requireOrgId() + AND eq(contactRoles.organizationId, orgId) to the WHERE; return null (page already calls notFound) on org mismatch.
- **[MED·READ]** `getLeadPipelineMetrics` — contact_roles (raw SQL FILTER aggregate)
  - Fix: add `AND organization_id = ${requireOrgId()}` to the raw SQL WHERE (alongside role='lead').
- **[MED·READ]** `getActiveLeadSources` — lead_sources (SELECT)
  - Fix: add requireOrgId() + AND eq(leadSources.organizationId, orgId) (handle null/default-org rows per the 0154 backfill policy).
- **[LOW·READ]** `getProjectLeads` — contact_roles (via getLeadsPipeline)
  - Fix: scope getLeadsPipeline by org (requireOrgId + contactRoles.organizationId); this wrapper then inherits it. Caller-side projectId is already org-verified, mitigating in practice.

## marketing/attribution-queries.ts  _(2)_
- **[MED·READ]** `loadTopAttributedSource` — leads, marketing_lead_sources
  - Fix: leads HAS organization_id (migration 0072) — fix is simpler than the audit said: add requireOrgId() + filters.push(eq(leads.organizationId, orgId)) to the GROUP BY query. The marketing_lead_sources lookup-by-sourceKey can stay global (it is a nullable shared reference dimension per 0072).
- **[MED·READ]** `loadChannelSplit` — content_variants, content_pieces
  - Fix: content_pieces AND content_variants both have organization_id (declared in schema + 0072). Add requireOrgId() + and(eq(contentPieces.organizationId, orgId), eq(contentVariants.organizationId, orgId)) to the WHERE; counts currently span all tenants.

## materials.ts  _(5)_
- **[MED·READ]** `getMaterialPurchaseOrders` — material_purchase_orders, material_po_lines, material_deliveries, vendors, projects
  - Fix: material_purchase_orders has organization_id (0072). Add requireOrgId() and append `po.organization_id = ${orgId}` to the raw-SQL conditions so the unfiltered list path (materials/page.tsx) cannot return other tenants' POs (vendor legal names + amounts).
- **[MED·READ]** `getMaterialPO` — material_purchase_orders, material_po_lines, material_deliveries
  - Fix: Calls unscoped getMaterialPurchaseOrders() then matches client poCode/id, plus org-less SELECTs on materialPoLines/materialDeliveries by poId. Scope getMaterialPurchaseOrders by org (above) and add eq(...organizationId, orgId) to the lines/deliveries SELECTs; notFound() already fires on miss, so org-scoping the source list closes the IDOR.
- **[MED·READ]** `getMaterialDeliveries` — material_deliveries, material_purchase_orders, material_delivery_lines, vendors, projects
  - Fix: material_deliveries has organization_id (0072). Add requireOrgId() and append `d.organization_id = ${orgId}` to the raw-SQL conditions.
- **[MED·READ]** `getMaterialDelivery` — material_deliveries (via getMaterialDeliveries)
  - Fix: Wrapper over unscoped getMaterialDeliveries() that finds by client id/deliveryCode. Scope getMaterialDeliveries by org (above) so this wrapper can only match the caller's own deliveries.
- **[LOW·READ]** `getMaterialUtilization` — material_po_lines
  - Fix: material_po_lines has organization_id (0072). Add requireOrgId() + `AND organization_id = ${orgId}` to the aggregate WHERE (currently filters only WHERE po_id = ${poId}). Aggregate quantities only, hence low.

## method-statements/method-statement-queries.ts  _(2)_
- **[MED·READ]** `listMethodStatements` — method_statements
  - Fix: method_statements has organization_id (schema + 0072). Add requireOrgId() + push eq(methodStatements.organizationId, orgId) into conditions[] of the WHERE.
- **[MED·READ]** `getMethodStatementByCode` — method_statements
  - Fix: Add requireOrgId() + and(eq(methodStatements.methodCode, code), eq(methodStatements.organizationId, orgId)) to the SELECT; returns null on org mismatch.

## milestone-actions.ts  _(5)_
- **[HIGH·WRITE]** `triggerMilestonePreInvoice` — contract_milestones
  - Fix: contract_milestones has organization_id (migrations 0162/0163, NOT NULL). Add requireOrgId() and and(eq(contractMilestones.id, id), eq(contractMilestones.organizationId, orgId)) to the UPDATE WHERE so it cannot flip another tenant's milestone to pre_invoiced.
- **[HIGH·WRITE]** `triggerMilestoneInvoice` — contract_milestones
  - Fix: Add requireOrgId() + AND eq(contractMilestones.organizationId, orgId) to the UPDATE WHERE; otherwise any tenant can mark another tenant's milestone invoiced.
- **[HIGH·WRITE]** `recordMilestonePayment` — contract_milestones
  - Fix: Money write. Add requireOrgId() and AND eq(contractMilestones.organizationId, orgId) to BOTH the SELECT (milestone load) and the UPDATE; return error on org mismatch so a tenant cannot credit/alter another tenant's payment record.
- **[HIGH·WRITE]** `markMilestoneOverdue` — contract_milestones
  - Fix: Add requireOrgId() + AND eq(contractMilestones.organizationId, orgId) to the UPDATE WHERE.
- **[HIGH·WRITE]** `waiveMilestone` — contract_milestones
  - Fix: Add requireOrgId() + AND eq(contractMilestones.organizationId, orgId) to the UPDATE WHERE so a tenant cannot waive another tenant's revenue milestone.

## notifications.ts  _(4)_
- **[HIGH·READ]** `getNotificationDeliveryLog` — dev_notification_delivery_log
  - Fix: dev_notification_delivery_log has organization_id (schema + 0072). Add requireOrgId() + eq(devNotificationDeliveryLog.organizationId, orgId) to the WHERE — log rows carry recipientAddress + subject/body (PII) across tenants.
- **[MED·READ]** `getNotificationRules` — dev_notification_rules
  - Fix: dev_notification_rules has organization_id (schema + 0072). Add requireOrgId() + eq(devNotificationRules.organizationId, orgId) to the WHERE.
- **[MED·READ]** `getNotificationTemplates` — dev_notification_templates
  - Fix: dev_notification_templates has organization_id (schema + 0072). Add requireOrgId() + eq(devNotificationTemplates.organizationId, orgId) to the WHERE.
- **[MED·READ]** `getNotificationTemplateByName` — dev_notification_templates
  - Fix: Add requireOrgId() + and(eq(devNotificationTemplates.templateName, name), eq(devNotificationTemplates.organizationId, orgId)) to the SELECT; null on org mismatch. The cron caller (notification-dispatch-job) should derive org from the trigger entity and pass it in.

## organizations/organization-actions.ts  _(4)_
- **[HIGH·WRITE]** `updateOrganizationModules` — organizations
  - Fix: Add await requireSuperAdmin() at the top of the action. It UPDATEs any org row by client-supplied organizationCode with zero auth; reachable from OrganizationSettingsForm on /development-os/platform/organizations/[code], gated only by enforceProductAccess('dev') — any dev-enabled tenant, not super_admin.
- **[HIGH·WRITE]** `archiveOrganization` — organizations
  - Fix: Add await requireSuperAdmin() before the UPDATE. archiveOrganization (L99-114) sets isActive=false on any org by client-supplied organizationCode with no auth; reachable from the same platform [code] page form. A dev tenant can deactivate (lock out) any other tenant's org.
- **[MED·WRITE]** `createOrganization` — organizations
  - Fix: Add await requireSuperAdmin() inside createOrganization itself. Its sole known caller (subscription-os/org-provisioning-actions.ts L106) does requireSuperAdmin() before calling it, but the raw 'use server' action has no internal guard and is directly invocable by any authenticated user to mint tenant rows.
- **[MED·WRITE]** `updateOrganizationBranding` — organizations
  - Fix: Add await requireSuperAdmin() before the UPDATE. updateOrganizationBranding (L62-76) writes brandingConfig to any org by client-supplied organizationCode with no auth. No UI caller found, but it is a directly-invocable 'use server' action endpoint.

## organizations/organization-queries.ts  _(2)_
- **[MED·READ]** `listOrganizations` — organizations
  - Fix: Gate the two platform pages (/platform/organizations and /platform/branding) or this query behind requireSuperAdmin(). It SELECTs the entire tenant registry (codes, names, tiers, modules) and is rendered on pages gated only by enforceProductAccess('dev').
- **[MED·READ]** `getOrganizationByCode` — organizations
  - Fix: Gate /development-os/platform/organizations/[code]/page.tsx behind requireSuperAdmin() (or add the check in the query for the platform path). The other callers all pass the fixed literal 'ARCONIQUE_DEFAULT' and are safe; the [code] page passes the raw client-supplied code, letting any dev tenant read any org's full config/branding.

## pm/pm-subcontractor-queries.ts  _(2)_
- **[LOW·READ]** `loadActiveSubcontractors` — work_packages, vendors, projects
  - Fix: Before wiring to any cabinet, make org-scoping mandatory: organizationId = await requireOrgId() and AND eq(workPackages.organizationId, orgId) (both work_packages and vendors carry organization_id). Do not rely on the optional projectIds param.
- **[LOW·READ]** `loadProjectCompletion` — work_packages, projects
  - Fix: Add organizationId = await requireOrgId() and AND eq(workPackages.organizationId, orgId) to the SELECT (mandatory, not the optional projectIds branch) before this is wired to a cabinet.

## pricing.ts  _(2)_
- **[HIGH·WRITE]** `createPriceSnapshot` — unit_price_snapshots
  - Fix: Primary fix in the unscoped callers: createReservation and applyDiscountToContract must requireOrgId() and assert the villa's project.organizationId == orgId before insert. Defensively, resolve villa→project.organizationId inside this fn and assert == requireOrgId(). Today a tenant can write a money/price record keyed to another org's villa.
- **[MED·READ]** `calculateCurrentPrice` — villas, unit_development_meta, pricing_rules
  - Fix: Scope the villas SELECT (L113-126): innerJoin projects and AND eq(projects.organizationId, await requireOrgId()), return null on mismatch — OR have createReservation validate villaId→org first. Today createReservation (reservation-actions.ts L58-161) passes raw formData villaId with no requireOrgId and no villa-org check, so this reads another org's villa pricing/construction-progress.

## procurement/quotation-comparison-queries.ts  _(2)_
- **[MED·READ]** `listQuotationComparisons` — procurement_quotations, dev_os_purchase_requests, vendors
  - Fix: Call requireOrgId() and add AND eq(procurementQuotations.organizationId, orgId) to the agg SELECT (step 1) and the selected-vendor SELECT (step 3), and AND eq(devOsPurchaseRequests.organizationId, orgId) to the PR SELECT (step 2). The requestIds IN-list then derives only from org-scoped quotations.
- **[MED·READ]** `listPurchaseRequestsAwaitingQuotations` — procurement_quotations, dev_os_purchase_requests
  - Fix: Call requireOrgId() and add AND eq(procurementQuotations.organizationId, orgId) to the haveQuotes SELECT and AND eq(devOsPurchaseRequests.organizationId, orgId) to the candidates SELECT.

## procurement/quotation-matrix-queries.ts  _(1)_
- **[MED·READ]** `loadQuotationMatrix` — procurement_quotations, dev_os_purchase_requests, vendors
  - Fix: Call requireOrgId() and add .where(eq(procurementQuotations.organizationId, orgId)) to the allQuotations SELECT; the prIds/vendorIds IN-lists then derive only from org-scoped quotations. Add AND eq(devOsPurchaseRequests.organizationId, orgId) to the PR fetch for defense-in-depth.

## productivity/productivity-queries.ts  _(1)_
- **[MED·READ]** `listAllProductivityLogs` — productivity_logs
  - Fix: Call requireOrgId() and add .where(eq(productivityLogs.organizationId, orgId)) before the orderBy/limit. productivity_logs has organization_id (schema/schedule-sophistication.ts line 283).

## profitability/profitability-aggregation.ts  _(1)_
- **[HIGH·WRITE]** `recomputeAllProfitability` — projects (scan), then per-project dev_budget_lines/dev_transactions/villas/unit_cost_allocations/residual_inventory_units (writes)
  - Fix: Add an optional org param: the tenant path (recomputeProfitabilityAction) calls requireOrgId() and passes it so the projects scan at lines 446-449 gains AND eq(projects.organizationId, orgId); keep an explicit all-orgs branch (no org / loop) for the cron caller runDevOsProfitabilityRecompute only.

## quality-standards/quality-standard-queries.ts  _(2)_
- **[MED·READ]** `listQualityStandards` — quality_standards
  - Fix: const orgId = await requireOrgId(); push eq(qualityStandards.organizationId, orgId) into the conditions array so the list returns only this org's standards.
- **[MED·READ]** `getQualityStandardByCode` — quality_standards
  - Fix: const orgId = await requireOrgId(); WHERE and(eq(qualityStandards.standardCode, code), eq(qualityStandards.organizationId, orgId)); return null so the page notFound()s on cross-org code.

## receiving-queries.ts  _(2)_
- **[MED·READ]** `getReceivingQueue` — material_receiving_holds (org col); material_purchase_orders/po_lines/deliveries via getMaterialPurchaseOrders/getMaterialUtilization
  - Fix: Scope at the source: thread requireOrgId() through getMaterialPurchaseOrders (add po.organization_id = orgId to its WHERE) and add eq(materialReceivingHolds.organizationId, orgId) to the hold-count SELECT. Currently lists every tenant's open POs + QC holds.
- **[MED·READ]** `getReceivingPoDetail` — material_receiving_holds (org col); material PO/lines/deliveries via getMaterialPO/getMaterialUtilization
  - Fix: const orgId = await requireOrgId(); make getMaterialPO org-scoped (return null when PO.organization_id != orgId) and add eq(materialReceivingHolds.organizationId, orgId) to the holds SELECT (line 157). notFound on cross-org idOrCode.

## reservations.ts  _(2)_
- **[MED·READ]** `getReservations` — reservations (joins contacts, villas, projects)
  - Fix: reservations has no org column; anchor via the existing projects join: const orgId = await requireOrgId(); add eq(projects.organizationId, orgId) to the WHERE so the list is restricted to this org's projects/reservations.
- **[LOW·READ]** `getProjectReservations` — reservations (via getReservations)
  - Fix: Thin wrapper over getReservations({projectId}); once getReservations enforces eq(projects.organizationId, orgId) this is covered. Separately ensure project-sales.getProjectSalesData org-verifies projectId (notFound on cross-org project) since it passes a client-derived projectId unchecked.

## residual-inventory/residual-queries.ts  _(3)_
- **[HIGH·READ]** `getResidualUnit` — residual_inventory_units, residual_unit_ownership_shares (both have org col)
  - Fix: const orgId = await requireOrgId(); WHERE and(eq(residualInventoryUnits.id, id), eq(residualInventoryUnits.organizationId, orgId)); return null (page notFound) on mismatch — exposes another org's unit + investor ownership shares/economic claims otherwise.
- **[HIGH·READ]** `listInvestorResidualShares` — residual_unit_ownership_shares
  - Fix: const orgId = await requireOrgId(); WHERE and(eq(residualUnitOwnershipShares.investorId, investorId), eq(residualUnitOwnershipShares.organizationId, orgId)). Separately org-scope getInvestor/getInvestors so the investorId itself is org-verified. Exposes cross-tenant investor economic-claim financials otherwise.
- **[MED·READ]** `listResidualUnits` — residual_inventory_units
  - Fix: const orgId = await requireOrgId(); push eq(residualInventoryUnits.organizationId, orgId) into the conditions so the list is org-restricted.

## risk-radar/risk-radar-queries.ts  _(4)_
- **[HIGH·READ]** `getAlertByCode` — risk_radar_alerts
  - Fix: add requireOrgId() + AND eq(riskRadarAlerts.organizationId, orgId) to the SELECT and treat a cross-org row as null (notFound); today /risk-radar/[code] and /executive/risk/[id] call this with a client-supplied alertCode and render full alert (description, aiReasoning, affectedEntities, supportingData) on notFound-only-on-null, so any 'dev'-product tenant can read another org's alert by iterating ALERT/INC-style codes
- **[MED·READ]** `listRecentAlerts` — risk_radar_alerts
  - Fix: add requireOrgId() + AND eq(riskRadarAlerts.organizationId, orgId) to the query; the risk-radar inbox (limit 200), the development-os dashboard, and the executive page all list titles/severities/statuses across every org
- **[MED·READ]** `listAlertsInRange` — risk_radar_alerts
  - Fix: add requireOrgId() + AND eq(riskRadarAlerts.organizationId, orgId) to the WHERE; the month/quarter/YTD executive rollups currently count every org's alerts raised in the window
- **[MED·READ]** `listSimilarAlerts` — risk_radar_alerts
  - Fix: add requireOrgId() + AND eq(riskRadarAlerts.organizationId, orgId) to the matcher; the 'Similar risks' panel on the alert detail pages leaks other orgs' alert titles, codes, statuses and resolutionNotes for the same category/detectionMethod

## risks/risk-queries.ts  _(1)_
- **[HIGH·READ]** `getProjectRiskByCode` — project_risks
  - Fix: add requireOrgId() + AND eq(projectRisks.organizationId, orgId) (or verify risk.projectId belongs to the [slug] project's org) and notFound on mismatch; projects/[slug]/risks/[code]/page.tsx L43 passes the raw client code and never checks the returned risk's projectId against the URL slug, so a tenant can read another org's risk-register entry (title, mitigationPlan, estimatedCostImpactMinor money field) via /projects/<own-slug>/risks/<other-org-code>

## safety-actions.ts  _(3)_
- **[HIGH·WRITE]** `recordSafetyIncident` — safety_incidents (anchors org via projects)
  - Fix: before insert, validate projectId belongs to requireOrgId()'s org (join projects + eq(projects.organizationId, orgId), throw/notFound on mismatch); also scope the safety/new project <select> (page L57-60 reads .from(projects) unscoped). safety_incidents has no organization_id, so org must be anchored through projects.id
- **[HIGH·WRITE]** `setSafetyIncidentStatus` — safety_incidents (anchors org via projects)
  - Fix: before UPDATE, verify the incident's projectId is in requireOrgId()'s org (join projects + eq(projects.organizationId, orgId)) and notFound/throw on mismatch; a client can flip another org's incident status by posting its raw id
- **[HIGH·WRITE]** `resolveSafetyIncident` — safety_incidents (anchors org via projects)
  - Fix: before UPDATE, verify the incident's projectId is in requireOrgId()'s org (join projects + eq(projects.organizationId, orgId)) and throw on mismatch; otherwise a tenant can resolve and write resolutionNotes onto another org's safety incident

## safety.ts  _(4)_
- **[HIGH·READ]** `getSafetyIncidents` — safety_incidents (anchors org via projects)
  - Fix: require org and filter via projectId IN (SELECT id FROM projects WHERE organization_id = requireOrgId()) (join projects + eq(projects.organizationId, orgId)); safety_incidents has no org column. safety/page.tsx L39 calls it with NO filter, so the safety log lists every tenant's incident codes, descriptions and severities
- **[HIGH·READ]** `getSafetyIncident` — safety_incidents (anchors org via projects)
  - Fix: fixed transitively by org-scoping getSafetyIncidents (its source); it calls getSafetyIncidents() with no filter then does an in-memory find by id/code, so it currently resolves any org's incident
- **[MED·READ]** `getSafetyMetrics` — safety_incidents (anchors org via projects)
  - Fix: add a mandatory org predicate to the raw SQL (AND project_id IN (SELECT id FROM projects WHERE organization_id = $orgId)); safety/page.tsx L42 calls it with no projectId so the count/sum aggregates mix every tenant's incident counts and affected-worker totals
- **[MED·READ]** `getOpenSafetyIncidents` — safety_incidents (anchors org via projects)
  - Fix: fixed transitively by org-scoping getSafetyIncidents (projects join on requireOrgId()); until then getSafetyIncidents({status:'open'}) returns open incidents across all orgs

## schedule/resource-pool-queries.ts  _(3)_
- **[MED·READ]** `listResourcePools` — resource_pools
  - Fix: add requireOrgId() + .where(eq(resourcePools.organizationId, orgId)) to the SELECT
- **[MED·READ]** `getResourcePoolByCode` — resource_pools
  - Fix: add requireOrgId() + AND eq(resourcePools.organizationId, orgId) to the WHERE; notFound() in the page on null/mismatch
- **[MED·READ]** `listResourceAssignmentsForResource` — task_resource_assignments
  - Fix: add requireOrgId() + AND eq(taskResourceAssignments.organizationId, orgId) to the WHERE; primary fix is org-scoping getResourcePoolByCode so resourceId is org-verified

## schedule/schedule-queries.ts  _(3)_
- **[MED·READ]** `listProjectTasks` — project_tasks (innerJoin work_packages on projectId branch)
  - Fix: add requireOrgId() + an unconditional AND eq(projectTasks.organizationId, orgId) so the no-filter (export) branch is org-bound, not just the projectId branch
- **[MED·READ]** `getProjectTaskByCode` — project_tasks
  - Fix: add requireOrgId() + AND eq(projectTasks.organizationId, orgId) to the WHERE; notFound() in the page; ideally also verify the task's work_package.project matches the [slug]
- **[LOW·READ]** `listTaskDependenciesForTasks` — task_dependencies
  - Fix: add requireOrgId() + AND eq(taskDependencies.organizationId, orgId); primary fix is scoping getProjectTaskByCode so the input ids are org-verified

## site-reports.ts  _(3)_
- **[HIGH·READ]** `getSiteReport` — site_reports, site_report_zones, site_report_photos, site_workforce_logs (joins site_zones)
  - Fix: add requireOrgId() + AND eq(siteReports.organizationId, orgId) to the base SELECT; notFound on mismatch; stop deriving the summary from an unfiltered getSiteReports({})
- **[MED·READ]** `getSiteZones` — site_zones
  - Fix: add requireOrgId() + AND eq(siteZones.organizationId, orgId) to the SELECT
- **[MED·READ]** `getSiteReports` — site_reports (LEFT JOIN projects + zone/photo/blocker aggregate subqueries)
  - Fix: add requireOrgId() and an unconditional WHERE r.organization_id = orgId to the raw SQL (the no-projectId list branch is currently global)

## site-reports/site-report-photo-queries.ts  _(1)_
- **[MED·READ]** `loadSiteReportPhotos` — site_report_photos (innerJoin documents)
  - Fix: add requireOrgId() + AND eq(siteReportPhotos.organizationId, orgId) to the WHERE; getSiteReportPhotoUrl signing should also re-check org

## transaction-bulk-actions.ts  _(1)_
- **[HIGH·WRITE]** `bulkRecordTransactions` — dev_bank_accounts, dev_cost_categories, projects (preloads) -> dev_transactions (via recordTransaction)
  - Fix: scope every preload by requireOrgId(): AND eq(devBankAccounts.organizationId, orgId) on the fail-fast account SELECT, and eq(...organizationId, orgId) on the devCostCategories and projects catalogue SELECTs; also fix recordTransaction's own account SELECT (transaction-actions.ts line 106-110) which is org-less

## wallets.ts  _(1)_
- **[HIGH·READ]** `getWalletByCommitment` — investor_wallets, wallet_transactions
  - Fix: Add requireOrgId() + AND eq(investorWallets.organizationId, orgId) to the investor_wallets SELECT (column is NOT NULL); return {wallet:null,recentTransactions:[]} on miss. Root cause must also be fixed: getCommitmentsRaw in investors.ts builds its WHERE only from investorId/projectId/status with NO organization_id predicate, so getCommitment(id) -> getCommitments({}).find(c=>c.id===id) resolves cross-tenant commitments; scope getCommitmentsRaw by organization_id too.

## work-packages/work-package-queries.ts  _(1)_
- **[MED·READ]** `getWorkPackageByCode` — work_packages
  - Fix: Add requireOrgId() + AND eq(workPackages.organizationId, orgId) to the SELECT (work_packages.organization_id is NOT NULL, schema line 32-34) and return null on mismatch. Alternatively/additionally the page should assert pkg.projectId belongs to the [slug] org-verified project.

