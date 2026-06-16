# MGMT Tenancy Audit — 2026-06-15

Per-function org-scoping audit of the entire mgmt feature layer (`src/features/**`, 269 DB files) — the layer only ever swept point-wise before (#249 reads, #199/#200 writes). One combined audit→fix→verify workflow (73 agents).

**204 confirmed leaks across the layer** — high=98 · med=84 · low=22; **123 cross-tenant WRITE-IDORs**. 734 functions classified SAFE. All 204 fixed + adversarially verified; 8 flagged remainders/regressions fixed in a follow-up pass (incl. migration 0180 MFA-factor org backfill).

---

## access-grants/actions.ts  _(3)_
- **[MED·WRITE]** `createOwnerAccessGrantAction` — app_users_owners (INSERT); reads owners/app_users indirectly via the client-supplied ids
  - After requireOrgId(), verify the supplied ownerId AND appUserId belong to the caller's org before insert (e.g. `const org = await requireOrgId(); const [o] = await db.select().from(owners).where(and(eq(owners.id, d.ownerId), eq(owners.organizationId, org))).limit(1); if (!o) return {ok:false,error:'Owner not found.'}` plus the same for appUsers) and stamp `organizationId: org` in the insert .values().
- **[MED·WRITE]** `revokeOwnerAccessGrantAction` — app_users_owners (SELECT by id then UPDATE)
  - Org-scope the lookup+update: `const org = await requireOrgId();` then add `eq(appUsersOwners.organizationId, org)` to the SELECT .where() (return 'Grant not found.' if missing) and to the UPDATE .where(); backfill any null org rows so the predicate is reliable.
- **[MED·WRITE]** `reactivateOwnerAccessGrantAction` — app_users_owners (SELECT by id then UPDATE)
  - Org-scope the lookup+update: `const org = await requireOrgId();` then add `eq(appUsersOwners.organizationId, org)` to the SELECT .where() (return 'Grant not found.') and to the UPDATE .where().

## ai-agents/operations/turnover-allocator.ts  _(1)_
- **[MED·WRITE]** `run` — turnovers (read + update)
  - Scope the pending read AND the update through the villa→projects org anchor like turnover-queries.ts does: pending = db.select({id, deadline}).from(turnovers).innerJoin(villas, eq(villas.id, turnovers.villaId)).innerJoin(projects, eq(projects.id, villas.projectId)).where(and(eq(turnovers.turnoverDate, sql`CURRENT_DATE`), isNull(turnovers.assigneeUserId), eq(projects.organizationId, input.organizationId))) — the update loop is then safe because every a.turnoverId came from the org-scoped read.

## ai-agents/projects/rfi-router.ts  _(1)_
- **[HIGH·READ]** `route` — contact_roles, contacts
  - Add org scoping to the contact_roles read — join projects on contactRoles.scopeProjectId and filter the caller org, e.g. thread input.organizationId into route() and add .innerJoin(projects, eq(projects.id, contactRoles.scopeProjectId)) plus eq(projects.organizationId, input.organizationId) in the WHERE (or have composeRfi reject a projectId whose projects.organizationId !== requireOrgId() before calling routeRfi).

## ai-agents/projects/schedule-variance-detector.ts  _(1)_
- **[MED·READ]** `run` — milestones, milestone_dependencies
  - Filter both reads by org: milestoneRows = db.select().from(milestones).where(input.projectId ? and(eq(milestones.organizationId, input.organizationId), eq(milestones.projectId, input.projectId)) : eq(milestones.organizationId, input.organizationId)); and add eq(milestoneDependencies.organizationId, input.organizationId) to the edges WHERE alongside inArray(toMilestoneId, ids).

## ai-agents/projects/weekly-report-data.ts  _(1)_
- **[LOW·READ]** `composeWeeklyReport` — projects, development_project_meta, milestones, boq_revisions, boq_documents, rfis, site_reports
  - Validate project↔org up front and scope: after loading projectRow add eq(projects.organizationId, input.organizationId) to the project lookup (return null on mismatch). Since milestones/boq_revisions/boq_documents/rfis/site_reports all carry organization_id, also add eq(<table>.organizationId, input.organizationId) to each read (or rely on the validated projectId once the project itself is org-checked).

## ai/operations-copilot/context.ts  _(1)_
- **[MED·READ]** `buildOperationsSnapshot` — bookings, jobRuns (job_runs), notificationQueue (notification_queue)
  - The function receives organizationId but the 4 direct count queries ignore it: add `and(...existing, eq(bookings.organizationId, organizationId))` to the check-in/check-out counts (lines 52-62), `eq(jobRuns.organizationId, organizationId)` to the failed-jobs count (line 64-67), and `eq(notificationQueue.organizationId, organizationId)` to the queued-notifications count (line 70-73) — guard each with `organizationId ? ... : undefined` so the null/cron caller stays platform-wide.

## ai/operations-copilot/service.ts  _(3)_
- **[MED·WRITE]** `generateOperationsCopilotSummary` — ai_operations_summaries (archive-all UPDATE)
  - The archive step (lines 133-136) sets status='archived' on EVERY active summary regardless of org, so one tenant's refresh clobbers every other org's active summary. ai_operations_summaries has no org column of its own — scope the archive by the run anchor: `.where(and(eq(aiOperationsSummaries.status,'active'), inArray(aiOperationsSummaries.runId, db.select({id:aiAssistantRuns.id}).from(aiAssistantRuns).where(or(eq(aiAssistantRuns.organizationId, organizationId), isNull(aiAssistantRuns.organizationId))))))` (i.e. only archive this org's / platform summaries).
- **[MED·READ]** `getLatestOperationsSummary` — ai_operations_summaries
  - ai_operations_summaries has no org column — anchor via runId -> ai_assistant_runs.organizationId. Join aiAssistantRuns and add `or(eq(aiAssistantRuns.organizationId, await requireOrgId().catch(()=>null)), isNull(aiAssistantRuns.organizationId))` to both the active-row and the most-recent-fallback queries (mirror the pattern already used in listAssistantRuns / getAssistantRunDetail in this same file).
- **[MED·READ]** `listOperationsSummaries` — ai_operations_summaries
  - Anchor via runId -> ai_assistant_runs.organizationId: leftJoin aiAssistantRuns and add `.where(or(eq(aiAssistantRuns.organizationId, await requireOrgId().catch(()=>null)), isNull(aiAssistantRuns.organizationId)))` (same null-org-visible pattern as listAssistantRuns in this file).

## attachments/actions.ts  _(3)_
- **[HIGH·WRITE]** `deleteAttachmentAction` — task_attachments (DELETE)
  - task_attachments has no org column — anchor via its parent (taskId -> operation_tasks.organizationId, or maintenanceTicketId -> maintenance_tickets -> villa -> project.organizationId, or checklistItemId -> task_checklist_items -> task_checklists -> operation_tasks.organizationId). Before deleting, resolve the row's parent org and verify it equals await requireOrgId(); e.g. for a task-bound attachment add `and(eq(taskAttachments.id, id), exists(db.select().from(operationTasks).where(and(eq(operationTasks.id, taskAttachments.taskId), eq(operationTasks.organizationId, orgId)))))` (and the equivalent for the ticket / checklist-item parents) — return "not found" otherwise.
- **[MED·WRITE]** `registerUploadedAttachmentAction` — task_attachments (SELECT + UPDATE)
  - Same parent-anchor IDOR as deleteAttachmentAction: before flipping uploadStatus, confirm the attachment's parent (task/ticket/checklist-item) belongs to await requireOrgId() (join operation_tasks / maintenance_tickets->villa->project / task_checklist_items->task_checklists->operation_tasks and filter on organizationId), else return "Attachment not found."
- **[MED·WRITE]** `createSignedUploadUrlAction` — task_attachments (INSERT)
  - The client supplies target/targetId (task | checklist_item | maintenance_ticket) and a row is inserted against it with no verification the target belongs to the caller's org — an attacker can attach to another org's task/ticket. Validate targetId against requireOrgId() via the parent table (e.g. operation_tasks.organizationId for target='task', villa->project.organizationId for 'maintenance_ticket', task_checklists->operation_tasks for 'checklist_item') and reject if no in-org parent row is found, before creating the signed token + row.

## audit/services.ts  _(1)_
- **[HIGH·READ]** `listAuditEvents` — audit_events, app_users
  - audit_events has an organizationId column (migration 0154) but reads ignore it. Add `.where(eq(auditEvents.organizationId, await requireOrgId()))` (keep an `or(..., isNull(auditEvents.organizationId))` if platform-global rows must stay visible). NOTE: recordAuditEvent does not currently stamp organizationId, so this fix must be paired with stamping org on write (derive actor's org) or post-fix rows will be null-org and disappear from tenant views.

## availability/services.ts  _(1)_
- **[HIGH·READ]** `listAvailableVillas` — villas, projects, villa_calendar_blocks
  - Add org scoping via the projects join: leftJoin->innerJoin projects and push eq(projectsTable.organizationId, await requireOrgId()) into villaFilters (villas anchor org via projects).

## booking-automation/actions.ts  _(5)_
- **[MED·WRITE]** `createBookingAutomationRuleAction` — booking_automation_rules
  - Add `organizationId: await requireOrgId(),` to the .insert(bookingAutomationRules).values({...}) so the new rule is stamped to the caller's org (currently inserted org-less; combined with the unscoped list reads below, one tenant's rule becomes visible/active to all).
- **[HIGH·WRITE]** `updateBookingAutomationRuleAction` — booking_automation_rules
  - Add the org predicate to the update WHERE: `.where(and(eq(bookingAutomationRules.id, parsedId.data.id), eq(bookingAutomationRules.organizationId, await requireOrgId())))` — currently filters by id only, so any tenant can overwrite another org's automation rule.
- **[HIGH·WRITE]** `runBookingAutomationActionForBooking` — bookings (via service), operation_tasks, booking_automation_runs (writes)
  - Verify booking ownership before running: load the booking ANDed with `eq(bookings.organizationId, await requireOrgId())` and return early if not found, then call runBookingAutomationForBooking — currently passes the raw client bookingId straight into the service which fetches it org-less and materialises tasks into that booking's org.
- **[HIGH·WRITE]** `runBookingAutomationForRecentBookingsAction` — bookings
  - Scope the select to the caller's org: `.from(bookings).where(eq(bookings.organizationId, await requireOrgId()))` — currently selects the 50 most-recent bookings across ALL tenants and runs automation (creating operation_tasks) on each, a cross-tenant read + write.
- **[LOW·WRITE]** `seedDefaultBookingAutomationRulesAction` — (delegates to createDefaultBookingAutomationRulesIfMissing)
  - No direct DB here; the leak is in the delegated seeder (see createDefaultBookingAutomationRulesIfMissing) — pass requireOrgId() into the seeder and have it stamp/scope by org.

## booking-automation/services.ts  _(4)_
- **[MED·READ]** `listBookingAutomationRules` — booking_automation_rules, villas
  - Add `.where(eq(bookingAutomationRules.organizationId, await requireOrgId()))` (function must take/derive org) — currently lists every tenant's automation rules into the cabinet.
- **[MED·READ]** `listBookingAutomationRuns` — booking_automation_runs, booking_automation_rules, bookings, operation_tasks
  - Add `eq(bookingAutomationRuns.organizationId, await requireOrgId())` to the WHERE — currently the page-level call (no bookingId) returns the latest 200 runs across all tenants. (The /dashboard/bookings/[id] caller passes a bookingId that is org-gated upstream, but the integrations-page caller is not.)
- **[MED·WRITE]** `createDefaultBookingAutomationRulesIfMissing` — booking_automation_rules
  - Scope the existence count by org and stamp the inserts: `count(*) WHERE organization_id = orgId` and add `organizationId: orgId` to each DEFAULT_RULES value — currently the global count means tenant B never gets its own defaults once any tenant has seeded, and the inserted rows are org-less.
- **[HIGH·WRITE]** `runBookingAutomationForBooking` — bookings, villas, booking_automation_rules, booking_automation_runs (writes), operation_tasks (writes), task_checklists/items
  - Filter the rules query by the booking's org: load booking, then `.where(and(eq(bookingAutomationRules.status,'active'), eq(bookingAutomationRules.triggerEvent,'booking_created'), eq(bookingAutomationRules.organizationId, booking.organizationId)))`, and have the action gate the bookingId to the caller's org first — currently every tenant's active rules are evaluated against the booking, and the booking itself is fetched org-less.

## bookings/type-availability.ts  _(1)_
- **[HIGH·READ]** `listAvailableVillaTypes` — villas (org via projects), bookings, villa_calendar_blocks, asset_types
  - Add `const organizationId = await requireOrgId();` then join projects and filter villas by org: `.innerJoin(projects, eq(projects.id, villas.projectId)).where(and(eq(projects.organizationId, organizationId), notInArray(villas.status, [...]), eq(assetTypes.isRentable, true)))` — the bookings/blocks reads then inherit the boundary via the org-scoped allVillaIds.

## direct-booking/deposit-expiry.ts  _(1)_
- **[HIGH·WRITE]** `expireDeposit` — direct_booking_deposits (read+update), direct_booking_deposit_events (insert), direct_booking_requests (read+update), direct_booking_holds (read+update)
  - Scope at the boundary: in expireDepositNowAction add `const organizationId = await requireOrgId();` then pass it down and in expireDeposit add `eq(directBookingDeposits.organizationId, organizationId)` (allow NULL legacy) on the initial select so a foreign/other-org deposit reads as not_found before any status flip + cascade.

## direct-booking/deposits.ts  _(8)_
- **[HIGH·READ]** `getDepositById` — direct_booking_deposits
  - Add an org-scoped variant: `getDepositById(id, organizationId)` with `and(eq(id), or(eq(organizationId, org), isNull(organizationId)))` and have the [id] page pass `await requireOrgId()` so a foreign deposit returns notFound.
- **[HIGH·READ]** `listDepositEvents` — direct_booking_deposit_events
  - Pass org and filter: add `organizationId` param and `and(eq(depositId,...), or(eq(directBookingDepositEvents.organizationId, org), isNull(...)))`; or gate it behind an org-scoped getDepositById first so a foreign deposit's timeline never loads.
- **[HIGH·READ]** `listDirectBookingDeposits` — direct_booking_deposits (+joins direct_booking_requests, direct_booking_holds)
  - Take organizationId and add `eq(directBookingDeposits.organizationId, organizationId)` (with or(isNull) for legacy) to the filters; page passes `await requireOrgId()`.
- **[MED·READ]** `getDepositMetrics` — direct_booking_deposits (aggregate)
  - Take organizationId and add `.where(eq(directBookingDeposits.organizationId, organizationId))` to the aggregate so counts/totalCollected are tenant-scoped; callers pass `await requireOrgId()`.
- **[HIGH·READ]** `listPaymentProviderAccounts` — payment_provider_accounts
  - Take organizationId and add `.where(or(eq(paymentProviderAccounts.organizationId, organizationId), isNull(paymentProviderAccounts.organizationId)))`; pages pass `await requireOrgId()` (PSP creds are sensitive — must not cross tenants).
- **[LOW·READ]** `getActiveProviderAccount` — payment_provider_accounts
  - Thread the request's organizationId into ensureDepositForRequest and add `or(eq(paymentProviderAccounts.organizationId, org), isNull(...))` so a deposit can never be attached to another org's active PSP account (default path is manual_stub, so low blast radius today).
- **[MED·READ]** `listPaymentWebhookEvents` — payment_webhook_events
  - Take organizationId and add `.where(or(eq(paymentWebhookEvents.organizationId, organizationId), isNull(paymentWebhookEvents.organizationId)))`; pages pass `await requireOrgId()`.
- **[MED·READ]** `getDepositForRequest` — direct_booking_deposits
  - Primary fix is to org-scope the parent (getRequestDetailById) so r.id is verified; defensively, give getDepositForRequest an organizationId param and add `eq(directBookingDeposits.organizationId, org)` (or isNull legacy) so a cross-org request's deposit can't be read.

## direct-booking/finance-reconciliation.ts  _(4)_
- **[HIGH·READ]** `listDirectBookingFinanceLinks` — direct_booking_finance_links (+joins direct_booking_requests, bookings)
  - Take organizationId and add `eq(directBookingFinanceLinks.organizationId, organizationId)` to the filters; page passes `await requireOrgId()`.
- **[HIGH·READ]** `getDirectBookingFinanceLinkById` — direct_booking_finance_links
  - Add organizationId param and `and(eq(id), eq(directBookingFinanceLinks.organizationId, organizationId))`; page passes `await requireOrgId()` so a foreign link returns notFound.
- **[MED·READ]** `getReconciliationMetrics` — direct_booking_finance_links (aggregate), direct_booking_requests
  - Take organizationId and add `eq(directBookingFinanceLinks.organizationId, organizationId)` to the aggregate, and scope the unposted-count query via the request join (eq(directBookingRequests.organizationId, org)); callers pass `await requireOrgId()`.
- **[MED·WRITE]** `reconcileDirectBookingsBatch` — direct_booking_requests, direct_booking_finance_links, revenue_lines (via postDirectBookingRevenue)
  - Scope the candidate sweep to the caller's org: add `const organizationId = await requireOrgId()` in reconcilePendingDirectBookingsAction, pass it into reconcileDirectBookingsBatch, and add `eq(directBookingRequests.organizationId, organizationId)` to the candidate query (currently it selects converted-unposted requests across ALL orgs and posts revenue for each — note each per-request post is itself re-scoped because c.organizationId is passed to postDirectBookingRevenue, so the money is stamped to the right org, but a tenant action still triggers other orgs' postings/notifications).

## direct-booking/guest-messages.ts  _(5)_
- **[HIGH·WRITE]** `createStaffMessageInThread` — direct_booking_guest_messages (insert), direct_booking_guest_message_threads (select+update)
  - Pass requireOrgId() into the fn and scope the thread lookup: .where(and(eq(directBookingGuestMessageThreads.id, threadId), or(isNull(directBookingGuestMessageThreads.organizationId), eq(directBookingGuestMessageThreads.organizationId, organizationId)))) — return not_found on miss so an operator cannot reply into another tenant's thread.
- **[HIGH·WRITE]** `setThreadStatus` — direct_booking_guest_message_threads (update)
  - Take an organizationId (from requireOrgId() in the action) and add it to the UPDATE predicate: .where(and(eq(directBookingGuestMessageThreads.id, threadId), or(isNull(...organizationId), eq(...organizationId, organizationId)))) so an operator cannot open/close/archive another tenant's thread.
- **[MED·WRITE]** `markStaffThreadRead` — direct_booking_guest_messages (update), direct_booking_guest_message_threads (update)
  - Scope by org: resolve the thread (id + org) first via requireOrgId(), bail if it isn't the caller's, then run the existing updates keyed on the verified thread.id (or add the org predicate to both UPDATE .where clauses).
- **[HIGH·READ]** `listAdminSnapshots` — direct_booking_guest_status_snapshots
  - const organizationId = await requireOrgId(); then add eq(directBookingGuestStatusSnapshots.organizationId, organizationId) (with or(isNull(...)) for legacy rows) to the WHERE so the list shows only the caller's tenant snapshots (villa label, dates, stage, headline).
- **[HIGH·READ]** `getAdminSnapshotById` — direct_booking_guest_status_snapshots
  - const organizationId = await requireOrgId(); add and(eq(...id, id), or(isNull(...organizationId), eq(...organizationId, organizationId))) so a foreign snapshot id resolves to null (notFound). Also closes leakage of another org's holdId/requestId/depositId/bookingId that the page then exposes and feeds into the rebuild action.

## direct-booking/guest-status-services.ts  _(5)_
- **[MED·WRITE]** `rebuildGuestStatusSnapshotForHold` — direct_booking_holds, villas, direct_booking_requests, direct_booking_deposits, bookings, direct_booking_deposit_events, direct_booking_guest_status_snapshots (insert/update)
  - In rebuildDirectBookingGuestStatusAction, derive organizationId = await requireOrgId() and verify the hold belongs to the caller (eq(directBookingHolds.id, holdId) AND eq/isNull organizationId) before calling; or accept an optional organizationId in this fn and gate the initial hold select on it. Internal/token callers keep passing null. Prevents an operator from forcing a snapshot rebuild over another tenant's hold (and reading its hold/deposit money fields into the regenerated snapshot).
- **[MED·WRITE]** `rebuildGuestStatusSnapshotForRequest` — direct_booking_requests (-> rebuildGuestStatusSnapshotForHold)
  - Same remediation as rebuildGuestStatusSnapshotForHold — validate the requestId's org against requireOrgId() in the action before resolving the holdId (or thread org through to the hold select).
- **[MED·WRITE]** `rebuildGuestStatusSnapshotForDeposit` — direct_booking_deposits, direct_booking_requests (-> rebuildGuestStatusSnapshotForHold)
  - Same remediation — gate the depositId on the caller's org (deposits scope via direct_booking_requests.organization_id) in the action before triggering the cross-org snapshot rebuild.
- **[MED·WRITE]** `rebuildGuestStatusSnapshotForBooking` — direct_booking_requests (-> rebuildGuestStatusSnapshotForHold)
  - Same remediation — validate the bookingId/request org against requireOrgId() before rebuilding the foreign-tenant snapshot.
- **[MED·WRITE]** `queueDirectBookingGuestNotification` — direct_booking_guest_notifications (insert)
  - In adminQueueGuestNotificationAction, verify the holdId belongs to requireOrgId() (eq(directBookingHolds.id, holdId) AND org match) before queueing, and stamp organizationId on the inserted notification, so an operator cannot inject a guest-facing notification onto another tenant's hold.

## direct-booking/services.ts  _(1)_
- **[MED·READ]** `getDirectBookingMetrics` — direct_booking_holds, direct_booking_requests
  - Add a requireOrgId() filter to both aggregates: include AND organization_id = ${organizationId} (or the or(isNull(...)) legacy form) in each COUNT(*) FILTER query so the KPI tiles (active holds, submitted/approved/rejected, conversion rate) count only the caller's tenant rather than the whole platform's direct-booking volume.

## documents/app-services.ts  _(1)_
- **[HIGH·READ]** `getDocDetail` — document_versions, document_signature_requests
  - Take organizationId = await requireOrgId() and first verify the parent document is in-org (select documents where id=documentId AND organizationId=org; else return empty), or add eq(documentVersions.organizationId, org) / eq(documentSignatureRequests.organizationId, org) to both where() clauses.

## dynamic-pricing/actions.ts  _(13)_
- **[HIGH·WRITE]** `createPricingRuleSetAction` — pricing_rule_sets
  - INSERT omits organizationId entirely — add organizationId: await requireOrgId() to the .values({...}) so new rule sets are tenant-anchored (and also validate projectId/villaId belong to that org).
- **[HIGH·WRITE]** `updatePricingRuleSetAction` — pricing_rule_sets
  - .where(and(eq(pricingRuleSets.id, id), eq(pricingRuleSets.organizationId, await requireOrgId())))
- **[HIGH·WRITE]** `setRuleSetStatus (pausePricingRuleSetAction / archivePricingRuleSetAction)` — pricing_rule_sets
  - .where(and(eq(pricingRuleSets.id, id), eq(pricingRuleSets.organizationId, await requireOrgId())))
- **[HIGH·WRITE]** `upsertDayOfWeekRuleAction` — pricing_day_of_week_rules
  - First verify ruleSetId is in-org (select pricingRuleSets where id=ruleSetId AND organizationId=requireOrgId()); reject otherwise; then stamp organizationId on insert and scope the existing-row select+update to org.
- **[HIGH·WRITE]** `upsertOccupancyRuleAction` — pricing_occupancy_rules
  - Verify ruleSetId belongs to requireOrgId() before insert and stamp organizationId on the .values({...}).
- **[HIGH·WRITE]** `upsertCloseOutRuleAction` — pricing_close_out_rules
  - Verify ruleSetId belongs to requireOrgId() before insert and stamp organizationId on the .values({...}).
- **[HIGH·WRITE]** `upsertChannelRuleAction` — pricing_channel_rules
  - Verify ruleSetId belongs to requireOrgId(); scope the existing-row select+update to org and stamp organizationId on insert.
- **[HIGH·WRITE]** `createMinStayRuleAction` — pricing_min_stay_rules
  - Verify ruleSetId belongs to requireOrgId() before insert and stamp organizationId on the .values({...}).
- **[HIGH·WRITE]** `createStopSellRuleAction` — pricing_stop_sell_rules
  - Verify ruleSetId belongs to requireOrgId() before insert and stamp organizationId on the .values({...}).
- **[HIGH·WRITE]** `archivePricingRuleAction` — pricing_day_of_week_rules, pricing_occupancy_rules, pricing_close_out_rules, pricing_channel_rules, pricing_min_stay_rules, pricing_stop_sell_rules
  - .where(and(eq(target.id, parsed.data.id), eq(target.organizationId, await requireOrgId())))
- **[HIGH·WRITE]** `upsertVillaRateOverrideAction` — villa_rate_overrides
  - Verify villaId is in-org (join projects.organizationId = requireOrgId()) before the upsert and stamp organizationId on the .values({...}); the (villaId,stayDate) unique key currently lets a cross-org id overwrite another tenant's override.
- **[HIGH·WRITE]** `deleteVillaRateOverrideAction` — villa_rate_overrides
  - Add eq(villaRateOverrides.organizationId, await requireOrgId()) to the delete where() and() (and/or verify villaId in-org via projects.organizationId).
- **[MED·READ]** `adminQuoteStayAction / simulateChannelPushAction` — (delegates to services / channel-push-stub)
  - These inherit the gap from quoteDynamicStay / simulateChannelPushForRatePlan (reported above) — fixing those scoping holes (validate villaId/ruleSetId in-org) closes these entrypoints; no independent fix needed here beyond passing requireOrgId() down.

## dynamic-pricing/channel-push-stub.ts  _(1)_
- **[HIGH·WRITE]** `simulateChannelPushForRatePlan` — pricing_rule_sets (read), channel_push_events (insert)
  - Resolve org once: select pricingRuleSets where id=ruleSetId AND organizationId=requireOrgId() (return early if not found), then stamp organizationId: <that org> on the channelPushEvents insert; both the cross-org rule-set read AND the unstamped insert are currently open.

## dynamic-pricing/services.ts  _(12)_
- **[HIGH·READ]** `listPricingRuleSets` — pricing_rule_sets
  - const organizationId = await requireOrgId(); push eq(pricingRuleSets.organizationId, organizationId) into the filters array unconditionally.
- **[HIGH·READ]** `getPricingRuleSetById` — pricing_rule_sets
  - .where(and(eq(pricingRuleSets.id, id), eq(pricingRuleSets.organizationId, await requireOrgId())))
- **[MED·READ]** `getApplicablePricingRuleSet` — villas (via projects), pricing_rule_sets
  - Scope the villa lookup to the org (join projects, filter projects.organizationId = requireOrgId()) and add eq(pricingRuleSets.organizationId, org) to the candidate query so a cross-org villaId yields no rule set.
- **[MED·READ]** `listPricingRulesForSet` — pricing_day_of_week_rules, pricing_occupancy_rules, pricing_close_out_rules, pricing_channel_rules, pricing_min_stay_rules, pricing_stop_sell_rules
  - Verify the rule set is in-org first (getPricingRuleSetById org-scoped) OR add eq(<table>.organizationId, await requireOrgId()) alongside the ruleSetId eq in each of the six sub-queries.
- **[LOW·READ]** `getVillaRateOverridesByDate` — villa_rate_overrides
  - Add eq(villaRateOverrides.organizationId, await requireOrgId()) to the where() (note: also reachable from the by-design public quote path, so prefer scoping at the quote entrypoint by validating villaId in-org).
- **[MED·READ]** `listVillaRateOverrides` — villa_rate_overrides
  - Add eq(villaRateOverrides.organizationId, await requireOrgId()) to the where() and().
- **[MED·READ]** `listQuoteLogs` — pricing_quote_logs
  - const organizationId = await requireOrgId(); filters.push(eq(pricingQuoteLogs.organizationId, organizationId)) unconditionally.
- **[MED·READ]** `listChannelPushEvents` — channel_push_events
  - const organizationId = await requireOrgId(); filters.push(eq(channelPushEvents.organizationId, organizationId)) unconditionally.
- **[MED·READ]** `getPricingHubMetrics` — pricing_rule_sets, pricing_quote_logs, channel_push_events, pricing_stop_sell_rules, villas
  - Add WHERE organization_id = <requireOrgId()> to every count/aggregate subquery (and scope the villas NOT EXISTS to the org via projects.organization_id) so metrics reflect only the caller's tenant.
- **[LOW·READ]** `countPricingRulesPerSet` — pricing_day_of_week_rules, pricing_occupancy_rules, pricing_close_out_rules, pricing_channel_rules, pricing_min_stay_rules, pricing_stop_sell_rules
  - Add eq(<table>.organizationId, await requireOrgId()) to each of the six grouped count queries (low impact since the map is keyed by ruleSetId, but it still leaks foreign rule-set counts).
- **[LOW·WRITE]** `createQuoteLog` — pricing_quote_logs
  - Stamp organizationId on insert by resolving the villa's org (join villaId -> projects.organizationId) before writing, so quote logs are tenant-attributable rather than NULL/unscoped.
- **[MED·READ]** `quoteDynamicStay / quoteDynamicCalendar` — bookings, villa_calendar_blocks, owner_stay_requests, villa_rate_overrides, pricing_rule_sets, villas
  - Gate the dashboard callers (and these fns) on an in-org villaId: resolve villa via projects.organizationId = requireOrgId() and bail when it doesn't belong; the public /api/v1/quote path is intentionally org-agnostic (prices only, no PII), so scope at the dashboard entrypoint to avoid breaking the public quote.

## finance/material-usage-bridge-actions.ts  _(3)_
- **[HIGH·WRITE]** `bridgePendingMaterialUsageAction` — task_material_usage (read) → expense_lines + finance_material_usage_links (write via createExpenseFromTaskMaterialUsage)
  - Add eq(taskMaterialUsage.organizationId, await requireOrgId()) to the pending-rows .where(...) so the batch only bridges the caller's own org's usage.
- **[HIGH·WRITE]** `bridgeMaterialUsageForTaskAction` — task_material_usage (read) → expense_lines + finance_material_usage_links (write)
  - Add eq(taskMaterialUsage.organizationId, await requireOrgId()) to the .where(and(...)) alongside the taskId/status filters so a foreign taskId matches nothing.
- **[HIGH·WRITE]** `bridgeOneMaterialUsageAction` — task_material_usage (read) → expense_lines + finance_material_usage_links (write)
  - Before calling createExpenseFromTaskMaterialUsage, load the usage row AND eq(taskMaterialUsage.organizationId, await requireOrgId()) and return 'not found' if absent (or pass orgId down and have the core scope its lookup).

## finance/material-usage-bridge.ts  _(1)_
- **[HIGH·WRITE]** `createExpenseFromTaskMaterialUsage` — task_material_usage, inventory_items, operation_tasks (read by id, no org filter) → expense_lines + finance_material_usage_links (INSERT)
  - Pass organizationId (from requireOrgId at the action) into this core, AND it onto the .select() of taskMaterialUsage by id, and STAMP organizationId on the finance_material_usage_links insert (currently the link insert omits organizationId, so bridged links are born org-less).

## finance/services.ts  _(1)_
- **[MED·READ]** `listManagementFeeRules` — management_fee_rules
  - Join villas→projects / projects and AND COALESCE(villaProject.organizationId, project.organizationId) = await requireOrgId() (mirroring listExpenseLines), so the page only lists the caller's own org's fee rules instead of every tenant's fee percentages/amounts.

## finance/statement-actions.ts  _(1)_
- **[HIGH·WRITE]** `generateAllForPeriod` — owner_statements, statement_lines (via generateAllPendingStatements)
  - Root cause is in generateAllPendingStatements (statement-generation.ts) — see that finding; this wrapper inherits the unscoped target query.

## finance/statement-generation.ts  _(2)_
- **[HIGH·WRITE]** `generateAllPendingStatements` — ownership_shares, bookings (target enumeration) -> owner_statements, statement_lines (writes)
  - Add the org boundary to the target query: JOIN villas v ON v.id = b.villa_id JOIN projects p ON p.id = v.project_id ... WHERE p.organization_id = ${orgId}::uuid (exactly as src/app/api/cron/statements-monthly/route.ts does). As written, the DISTINCT owner_id/villa_id is pulled from ownership_shares JOIN bookings with NO org filter, so a caller generates statements for OTHER orgs' owner/villa pairs and stamps each new owner_statements row (+ statement_lines built from the foreign villa's bookings) with the CALLER's organizationId — materializing another tenant's owner name + booking-derived financials into the caller's org.
- **[MED·WRITE]** `generateStatementForOwnerVilla` — ownership_shares, owners, bookings, villas, dev_transactions, expense_lines, owner_statements, statement_lines, statement_periods
  - Defense-in-depth: validate the (ownerId, villaId) pair belongs to orgId before generating — e.g. require villa->project.organization_id = orgId (resolveProjectId already loads the villa; add AND p.organization_id check) and reject otherwise. loadContext (ownership_shares JOIN owners by ownerId/villaId only), loadBookings (bookings by villaId only) and resolveProjectId (villas by id only) carry NO org predicate, so when called with a foreign ownerId/villaId the function happily builds a statement from another org's bookings. Currently safe ONLY because regenerateStatement pre-scopes ids; it becomes a real cross-tenant write the moment any caller (generateAllPendingStatements does exactly this) passes unverified ids. Fixing generateAllPendingStatements closes the live hole; this guard prevents regression.

## front-office/services.ts  _(1)_
- **[LOW·READ]** `listStayEventsForBooking` — bookingStayEvents
  - Add org scope: const organizationId = await requireOrgId(); .where(and(eq(bookingStayEvents.bookingId, bookingId), eq(bookingStayEvents.organizationId, organizationId))).

## guest-ai-concierge/attachment-cleanup.ts  _(3)_
- **[HIGH·WRITE]** `cleanupStalePendingAttachments` — guest_ai_handoff_reply_attachments (SELECT stale pending rows + UPDATE upload_status='deleted' + storage delete)
  - Scope the sweep to the caller's org: thread an organizationId param from the action (requireOrgId) and add a join attachments→guest_ai_handoffs→bookings→villas→projects with eq(projects.organizationId, orgId) (or guard on the handoff's org) to the SELECT/UPDATE; leave the cron path global. e.g. .where(and(eq(uploadStatus,'pending'), lt(createdAt,cutoff), eq(projects.organizationId, orgId)))
- **[MED·READ]** `listFailedMetadata` — guest_ai_handoff_reply_attachments (SELECT id, handoffId, fileName, mimeType, metadataError, createdAt where metadata_status='failed')
  - Add an org join+filter: .innerJoin(guestAiHandoffs, eq(guestAiHandoffs.id, attachments.handoffId)) → bookings → villas → projects and AND eq(projects.organizationId, await requireOrgId()) (thread orgId in from the page).
- **[LOW·READ]** `countStalePendingAttachments` — guest_ai_handoff_reply_attachments (count(*) where upload_status='pending' AND createdAt<cutoff)
  - Same org anchor as the sweep: AND eq(projects.organizationId, orgId) via attachments→handoffs→bookings→villas→projects (thread orgId from caller); aggregate-only so low severity.

## guest-ai-concierge/attachments-actions.ts  _(3)_
- **[HIGH·WRITE]** `createStaffReplyAttachmentUploadAction` — guest_ai_handoff_reply_attachments (INSERT)
  - Add org enforcement: const orgId = await requireOrgId(); after preflight verify the handoff belongs to orgId (join pre.handoff→booking→villa→projects and reject on mismatch, mirroring acknowledgeHandoffAction's guard) and stamp organizationId: orgId on the INSERT .values.
- **[MED·WRITE]** `registerStaffReplyAttachmentUploadedAction` — guest_ai_handoff_reply_attachments (SELECT by id, then UPDATE)
  - After loading att, derive orgId = await requireOrgId() and verify the attachment's handoff is in orgId (join handoff→booking→villa→projects) before the UPDATE; reject as not-found on mismatch.
- **[HIGH·WRITE]** `deleteStaffReplyAttachmentAction` — guest_ai_handoff_reply_attachments (SELECT by id, then storage delete + UPDATE deleted)
  - Derive orgId = await requireOrgId() and confirm att's handoff belongs to orgId (join handoff→booking→villa→projects) before deleteStorageObject + UPDATE; reject as not-found on mismatch.

## guest-ai-concierge/attachments-services.ts  _(2)_
- **[HIGH·READ]** `listAdminAttachmentsForHandoff` — guest_ai_handoff_reply_attachments (SELECT all non-deleted for a handoffId)
  - Add an org join+filter: .innerJoin(guestAiHandoffs, eq(guestAiHandoffs.id, attachments.handoffId)) → bookings → villas → projects and AND eq(projects.organizationId, await requireOrgId()) (thread orgId from the page); or, cheaper, gate getHandoffDetail by org and pass a pre-verified handoff.
- **[MED·READ]** `preflightAttachment` — guest_ai_handoff_replies (SELECT by id), guest_ai_handoffs (SELECT by id)
  - Accept an orgId param and add the org predicate to both lookups (reply→handoff→booking→villa→projects, eq(projects.organizationId, orgId)); for the guest path it is already token-gated, but the staff path needs org enforcement here or at the caller.

## guest-ai-concierge/handoff-actions.ts  _(1)_
- **[MED·WRITE]** `archiveSessionAction` — guest_ai_concierge_sessions (UPDATE status='archived' by id)
  - Add org scoping mirroring acknowledge/resolve: load the session, derive orgId = await requireOrgId(), and only UPDATE when session.organizationId is NULL or === orgId — e.g. .where(and(eq(guestAiConciergeSessions.id, id), or(isNull(guestAiConciergeSessions.organizationId), eq(guestAiConciergeSessions.organizationId, orgId)))).

## guest-ai-concierge/handoff-metrics.ts  _(1)_
- **[HIGH·READ]** `getHandoffMetricsView` — guest_ai_handoffs (SELECT, joined to bookings/villas), guest_ai_handoff_reply_attachments (count by handoff)
  - Thread orgId in (await requireOrgId at the page) and add AND (eq(guestAiHandoffs.organizationId, orgId)) — or, since org is nullable, anchor via the existing join: AND eq(projects.organizationId, orgId) by extending the leftJoins villas→projects to an inner org filter; apply the same org predicate to the attachment count subquery.

## guest-ai-concierge/handoff-services.ts  _(4)_
- **[HIGH·READ]** `listHandoffs` — guest_ai_handoffs (joins guest_stay_tokens, bookings, villas, service_requests)
  - const organizationId = await requireOrgId(); add filters.push(eq(guestAiHandoffs.organizationId, organizationId)) so the WHERE always includes the org predicate.
- **[HIGH·READ]** `getHandoffDetail` — guest_ai_handoffs (joins guest_stay_tokens, bookings, villas, service_requests)
  - const organizationId = await requireOrgId(); change .where(eq(guestAiHandoffs.id, id)) to .where(and(eq(guestAiHandoffs.id, id), eq(guestAiHandoffs.organizationId, organizationId))).
- **[HIGH·READ]** `listHandoffsForSession` — guest_ai_handoffs (joins guest_stay_tokens, bookings, villas, service_requests)
  - const organizationId = await requireOrgId(); change the WHERE to and(eq(guestAiHandoffs.guestAiConciergeSessionId, sessionId), eq(guestAiHandoffs.organizationId, organizationId)).
- **[MED·READ]** `countHandoffsByStatus` — guest_ai_handoffs
  - const organizationId = await requireOrgId(); add .where(eq(guestAiHandoffs.organizationId, organizationId)) to the aggregate so counts are per-tenant.

## guest-ai-concierge/metadata-strip.ts  _(1)_
- **[LOW·WRITE]** `processPendingAttachments` — guest_ai_handoff_reply_attachments
  - Thread organizationId: add an org param, await requireOrgId() in the action, and AND eq(guestAiHandoffReplyAttachments.organizationId, organizationId) into the pending-select (it only mutates EXIF/scan/processing-status columns, not business data, hence low).

## guest-ai-concierge/read-receipts-actions.ts  _(1)_
- **[MED·WRITE]** `markStaffRepliesReadAction` — guest_ai_handoffs, guest_ai_handoff_reply_reads, guest_ai_handoff_replies
  - After requirePermission, verify ownership: const organizationId = await requireOrgId(); load the handoff and return {ok:false} unless handoff.organizationId === organizationId before calling recordStaffReadReceipts.

## guest-ai-concierge/read-receipts-services.ts  _(1)_
- **[LOW·READ]** `medianFirstStaffReadSeconds` — guest_ai_handoff_replies, guest_ai_handoff_reply_reads
  - const organizationId = await requireOrgId(); add .where(and(eq(guestAiHandoffReplies.authorType,'guest'), eq(guestAiHandoffReplies.organizationId, organizationId))) so the SLA median is per-tenant (aggregate-only, no row content exposed, hence low).

## guest-ai-concierge/realtime-services.ts  _(3)_
- **[HIGH·READ]** `pollAdminEvents` — guest_ai_handoff_replies, guest_ai_handoff_reply_attachments, guest_ai_handoff_reply_reads, guest_ai_handoffs
  - The admin stream route must org-scope the existence check: change the `[exists]` query in app/(dashboard)/dashboard/guest-ai/handoffs/[id]/stream/route.ts to `.where(and(eq(guestAiHandoffs.id, id), or(isNull(guestAiHandoffs.organizationId), eq(guestAiHandoffs.organizationId, await requireOrgId()))))` before opening the SSE stream; alternatively add an organizationId arg to pollAdminEvents/seedGuestCursor/loadHandoff and AND it into every reply/attachment/receipt/handoff filter.
- **[MED·READ]** `seedGuestCursor` — guest_ai_handoff_replies, guest_ai_handoff_reply_attachments, guest_ai_handoff_reply_reads, guest_ai_handoffs
  - Same root fix as pollAdminEvents — the admin route must verify handoff org ownership before calling seedGuestCursor(id); or thread an organizationId param into seedGuestCursor and AND it into the aggregate WHERE.
- **[LOW·READ]** `loadHandoff` — guest_ai_handoffs
  - Covered by the admin-route org-ownership fix above; once pollAdminEvents only ever runs with an org-verified handoffId, loadHandoff is safe. Defense-in-depth: thread organizationId into loadHandoff and AND it into the WHERE.

## guest-ai-concierge/replies-actions.ts  _(1)_
- **[LOW·WRITE]** `markStaffReadAction` — (delegates to markStaffReadAt)
  - Before calling markStaffReadAt, load the handoff and reject when its organizationId is set and != await requireOrgId() (mirrors createStaffHandoffReplyAction's NULL-allowed/mismatch-rejected guard); only resets staff read-receipt state so impact is low, but it is a reachable cross-tenant write.

## guest-ai-concierge/replies-services.ts  _(2)_
- **[HIGH·READ]** `listAdminRepliesForHandoff` — guest_ai_handoff_replies, app_users
  - Org-scope the timeline: AND `or(isNull(guestAiHandoffReplies.organizationId), eq(guestAiHandoffReplies.organizationId, await requireOrgId()))` into the WHERE; better still, fix the page gate so getHandoffDetail(id) org-checks the handoff and the page calls notFound() for cross-org ids before reaching this read.
- **[LOW·WRITE]** `markStaffReadAt` — guest_ai_handoff_replies, guest_ai_handoffs
  - Low-impact (only resets readByStaffAt and staffUnreadCount=0 on another org's handoff — no data disclosure, but a cross-tenant state mutation). Gate it: in markStaffReadAction org-verify the handoff (load guest_ai_handoffs, reject when organizationId set and != requireOrgId()) before calling markStaffReadAt; or pass organizationId into markStaffReadAt and AND it (via handoff join) into the update predicates.

## guest-ai-concierge/services.ts  _(3)_
- **[HIGH·READ]** `listAdminSessions` — guest_ai_concierge_sessions, guest_ai_concierge_messages, guest_stay_tokens, bookings
  - Add `organizationId` scoping: take `const organizationId = await requireOrgId()` (or accept it as an arg from the page) and AND `or(isNull(guestAiConciergeSessions.organizationId), eq(guestAiConciergeSessions.organizationId, organizationId))` into the WHERE clause of the main select.
- **[HIGH·READ]** `getAdminSessionDetail` — guest_ai_concierge_sessions, guest_ai_concierge_messages, guest_ai_concierge_runs, guest_stay_tokens, bookings
  - Org-scope the session lookup: AND `or(isNull(guestAiConciergeSessions.organizationId), eq(guestAiConciergeSessions.organizationId, await requireOrgId()))` into the `.where(eq(guestAiConciergeSessions.id, id))` so a cross-org id reads as not-found (the page already calls notFound() on a null session).
- **[MED·READ]** `countSessionsByStatus` — guest_ai_concierge_sessions, guest_ai_concierge_messages
  - Scope the aggregate: `const organizationId = await requireOrgId()` then add `.where(or(isNull(guestAiConciergeSessions.organizationId), eq(guestAiConciergeSessions.organizationId, organizationId)))` to the session count and add the same org predicate to the correlated refused-messages subquery.

## guest-journey/owner-events-rebuild.ts  _(2)_
- **[HIGH·WRITE]** `rebuildOwnerVisibleEventsForOwner` — owner_visible_events (delete+insert), ownership_shares, bookings, villa_calendar_blocks, owner_stay_requests, operation_tasks, maintenance_tickets, guest_reviews, owner_statements, guest_journey_events
  - Scope the action: in refreshOwnerVisibleEventsAction confirm the ownerId belongs to requireOrgId() before calling (e.g. `await db.select().from(owners).where(and(eq(owners.id, v.ownerId), eq(owners.organizationId, orgId)))` -> 'not found'); and add `eq(ownershipShares.organizationId, orgId)` inside loadOwnerScope (pass orgId in). Also stamp organizationId on the owner_visible_events INSERT (column exists, currently null).
- **[HIGH·WRITE]** `rebuildOwnerVisibleEventsForVilla` — ownership_shares, owner_visible_events (via per-owner rebuild)
  - In refreshOwnerVisibleEventsAction, verify the villaId belongs to requireOrgId() (join villas->projects, filter projects.organizationId) before calling; this function then operates only on in-org villas.

## guest-journey/runner.ts  _(3)_
- **[MED·READ]** `ensureJourneyRunsForBooking` — guest_journey_rules, guest_journey_runs
  - Filter rules to the booking's org: after getBookingForJourney (returns booking.organizationId), add `and(eq(guestJourneyRules.status,'active'), eq(guestJourneyRules.organizationId, booking.organizationId))`. Also scope bookingId in runJourneyRuleNowAction to requireOrgId() (innerJoin bookings + eq org) so a foreign bookingId reads as not-found.
- **[MED·WRITE]** `runGuestJourneyRuleForBooking` — guest_journey_runs, guest_journey_rules, guest_journey_suggestions, guest_journey_events
  - Scope at the action boundary: in runJourneyRuleNowAction verify both bookingId (via bookings.organizationId) and ruleId (via guest_journey_rules.organizationId) belong to requireOrgId() before dispatch; or AND the rule org to the booking org inside the runner (rule.organizationId === booking.organizationId else skip).
- **[MED·WRITE]** `generateJourneySuggestionsForBooking` — guest_journey_runs, guest_journey_suggestions, guest_journey_events
  - Same fix as ensureJourneyRunsForBooking/runGuestJourneyRuleForBooking: scope the bookingId to requireOrgId() in the action and constrain rules to the booking's organizationId in the runner.

## guest-journey/services.ts  _(6)_
- **[MED·READ]** `getJourneyHubStats` — guest_journey_rules, guest_journey_runs, guest_journey_suggestions, guest_review_requests
  - Add `const organizationId = await requireOrgId();` and AND `eq(guestJourneyRules.organizationId, organizationId)` into the rules/runs aggregates (runs/suggestions/reviews via innerJoin bookings + eq(bookings.organizationId, organizationId)).
- **[MED·READ]** `listGuestJourneyRules` — guest_journey_rules
  - Add `filters.push(eq(guestJourneyRules.organizationId, await requireOrgId()));` so the rule list is org-scoped (guest_journey_rules.organization_id is NOT NULL).
- **[MED·READ]** `getGuestJourneyRule` — guest_journey_rules
  - AND the org into the WHERE: `.where(and(eq(guestJourneyRules.id, id), eq(guestJourneyRules.organizationId, await requireOrgId())))` so a cross-org rule id reads as not-found.
- **[MED·READ]** `listGuestJourneyRuns` — guest_journey_runs (anchor via bookings.organization_id)
  - Make the bookings join an innerJoin and add `filters.push(eq(bookings.organizationId, await requireOrgId()))` (guest_journey_runs has no org column; it anchors via booking).
- **[MED·READ]** `listGuestJourneySuggestions` — guest_journey_suggestions (anchor via bookings.organization_id)
  - innerJoin bookings and add `filters.push(eq(bookings.organizationId, await requireOrgId()))` (suggestions have no org column; anchor via booking).
- **[MED·READ]** `listGuestReviewRequests` — guest_review_requests (anchor via bookings.organization_id)
  - innerJoin bookings and add `filters.push(eq(bookings.organizationId, await requireOrgId()))` (guest_review_requests has no org column; anchor via booking).

## guest-stays/actions.ts  _(1)_
- **[HIGH·WRITE]** `revokeSmartLockStubAction` — smart_lock_access_codes (via revokeStubSmartLockCode)
  - Before calling revokeStubSmartLockCode, resolve the code inside the org: SELECT smart_lock_access_codes JOIN bookings ON bookings.id = smart_lock_access_codes.booking_id WHERE smart_lock_access_codes.id = id AND bookings.organization_id = await requireOrgId() — return 'not found' if absent (or push that org-via-booking predicate into revokeStubSmartLockCode's WHERE).

## guest-stays/smart-lock-stub.ts  _(1)_
- **[HIGH·WRITE]** `revokeStubSmartLockCode` — smart_lock_access_codes (update)
  - Scope the UPDATE to the caller's org via the booking lineage: db.update(smartLockAccessCodes).set({...}).where(and(eq(smartLockAccessCodes.id, id), exists(db.select().from(bookings).where(and(eq(bookings.id, smartLockAccessCodes.bookingId), eq(bookings.organizationId, await requireOrgId())))))) — or pre-resolve the code's booking org in revokeSmartLockStubAction and reject cross-org ids before calling this.

## guests/actions.ts  _(1)_
- **[MED·WRITE]** `transition (via archiveGuestAction / unarchiveGuestAction)` — guests (SELECT by id, then UPDATE status WHERE guests.id = id)
  - Add org scope: `const organizationId = await requireOrgId();` then both the SELECT and UPDATE need `and(eq(guests.id, id), eq(guests.organizationId, organizationId))` (mig 0176 added guests.organization_id; the `select where eq(guests.id,id)` and `update set status where eq(guests.id,id)` are currently unscoped, letting a tenant archive/unarchive another org's guest).

## integrations/calendar-sync/actions.ts  _(9)_
- **[HIGH·WRITE]** `createCalendarFeedAction` — channel_calendar_feeds (INSERT)
  - Resolve+verify org server-side: `const organizationId = await requireOrgId();` then verify the supplied villaId belongs to that org (join villas→projects, `eq(projects.organizationId, organizationId)`, else 'Villa not found'), and stamp `organizationId` on the INSERT. Currently the insert never sets organizationId (left null) and never checks villaId — a tenant can attach a feed (which then SSRF-fetches and materialises events/bookings) onto another org's villa.
- **[HIGH·WRITE]** `editCalendarFeedAction` — channel_calendar_feeds (UPDATE WHERE id = clientId)
  - `const organizationId = await requireOrgId();` and add `and(eq(channelCalendarFeeds.id, id), eq(channelCalendarFeeds.organizationId, organizationId))` to the UPDATE (return 'Feed not found' on no row). Currently any tenant with integrations.write can rewrite another org's feed URL (incl. re-pointing feedUrl/villaId).
- **[HIGH·WRITE]** `setFeedStatus (via pauseCalendarFeedAction / resumeCalendarFeedAction / archiveCalendarFeedAction)` — channel_calendar_feeds (SELECT by id, UPDATE status WHERE id = clientId)
  - `const organizationId = await requireOrgId();` and scope both the SELECT and UPDATE with `and(eq(channelCalendarFeeds.id, parsed.data.id), eq(channelCalendarFeeds.organizationId, organizationId))`. Currently a tenant can pause/resume/archive another org's calendar feed by id.
- **[HIGH·WRITE]** `syncCalendarFeed / syncCalendarFeedAction` — channel_calendar_feeds (SELECT/UPDATE by id), channel_calendar_events (SELECT/INSERT/UPDATE by feedId), booking_conflicts (INSERT)
  - Scope the entry-point action, not the internal fn (which the cron legitimately calls per-feed). In syncCalendarFeedAction: `const organizationId = await requireOrgId();` then verify ownership before sync: `select from channelCalendarFeeds where and(eq(id, parsed.data.id), eq(organizationId, organizationId))` → 'Feed not found' if absent, then call syncCalendarFeed(id). Currently a tenant can force-fetch (SSRF-revalidated but still) and rewrite another org's feed + its events by id.
- **[HIGH·WRITE]** `materialiseCalendarEventAsBooking / materialiseCalendarEventAction` — channel_calendar_events (SELECT/UPDATE by id), channel_calendar_feeds (SELECT), villas (SELECT), projects (SELECT), bookings (SELECT/INSERT)
  - In materialiseCalendarEventAction: `const organizationId = await requireOrgId();` and verify the event belongs to the org before materialising — load the event's feed and require `eq(channelCalendarFeeds.organizationId, organizationId)` (or join event→feed→project org), else 'Event not found'. Currently a tenant can pass another org's calendar event id and create a confirmed booking in that other org (the org is derived from the feed/villa, not the caller), and stamp event.bookingId cross-tenant.
- **[MED·WRITE]** `ignoreCalendarEventAction` — channel_calendar_events (UPDATE status='ignored' WHERE id = clientId)
  - `const organizationId = await requireOrgId();` and scope the UPDATE with `and(eq(channelCalendarEvents.id, parsed.data.id), eq(channelCalendarEvents.organizationId, organizationId))` (channel_calendar_events has organization_id, mig 0154). Currently a tenant can mark another org's calendar event as ignored.
- **[MED·WRITE]** `resolveBookingConflictAction` — booking_conflicts (SELECT by id, UPDATE status='resolved' WHERE id = clientId)
  - `const organizationId = await requireOrgId();` and scope both SELECT and UPDATE with `and(eq(bookingConflicts.id, parsed.data.id), eq(bookingConflicts.organizationId, organizationId))` (booking_conflicts has organization_id, mig 0154). Currently a tenant can resolve another org's booking conflict.
- **[MED·WRITE]** `acknowledgeBookingConflictAction` — booking_conflicts (UPDATE status='acknowledged' WHERE id = clientId)
  - `const organizationId = await requireOrgId();` and scope the UPDATE with `and(eq(bookingConflicts.id, parsed.data.id), eq(bookingConflicts.organizationId, organizationId))`. Currently a tenant can acknowledge another org's booking conflict (also missing a `before` existence check).
- **[HIGH·WRITE]** `syncAllActiveCalendarFeedsAction` — channel_calendar_feeds (SELECT ids WHERE status='active'), then per-feed syncCalendarFeed
  - Scope the feed selection to the caller's org: `const organizationId = await requireOrgId();` then `where(and(eq(channelCalendarFeeds.status, 'active'), eq(channelCalendarFeeds.organizationId, organizationId)))`. Currently it selects EVERY active feed across ALL orgs and syncs them — a single tenant clicking 'Sync all' fetches/upserts/rewrites every other org's feeds and events platform-wide.

## inventory/actions.ts  _(5)_
- **[MED·WRITE]** `createSupplierAction` — suppliers (INSERT)
  - const organizationId = await requireOrgId(); then .values({ ...emptyToNull(parsed.data), organizationId })
- **[MED·WRITE]** `createInventoryLocationAction` — inventory_locations (INSERT)
  - const organizationId = await requireOrgId(); add organizationId to the .values({...}) object
- **[MED·WRITE]** `createInventoryCategoryAction` — inventory_categories (INSERT)
  - const organizationId = await requireOrgId(); add organizationId to the .values({...}) object
- **[MED·WRITE]** `createInventoryItemAction` — inventory_items (INSERT)
  - const organizationId = await requireOrgId(); add organizationId to the .values({...}) object
- **[LOW·WRITE]** `createTaskMaterialUsageAction` — inventory_items (read), inventory_movements (via applyMovement), task_material_usage (INSERT)
  - add organizationId to the taskMaterialUsage .values({...}) insert (organizationId is already in scope from requireOrgId())

## inventory/counts-actions.ts  _(1)_
- **[MED·WRITE]** `createInventoryCountAction` — inventory_counts (INSERT) + preloadCountLinesForLocation
  - const organizationId = await requireOrgId(); verify the location belongs to org, then add organizationId to inventoryCounts .values({...}) (and pass org into preloadCountLinesForLocation insert)

## inventory/counts-services.ts  _(1)_
- **[MED·WRITE]** `preloadCountLinesForLocation` — inventory_stock_levels (read), inventory_count_lines (INSERT)
  - include organizationId (already fetched via requireOrgId()) in each inventoryCountLines insert value object

## maintenance-intelligence/actions.ts  _(5)_
- **[MED·WRITE]** `createVillaMaintenancePlanAction` — villas (read), villa_maintenance_plans (insert)
  - Scope the villa lookup to the caller's org: SELECT villas JOIN projects WHERE villas.id=villaId AND projects.organizationId=organizationId; if no row, return {ok:false,error:'Villa not found.'} before inserting the plan.
- **[HIGH·WRITE]** `pauseVillaMaintenancePlanAction` — villa_maintenance_plans
  - Add requireOrgId() and scope the update: .where(and(eq(villaMaintenancePlans.id, parsed.data.id), eq(villaMaintenancePlans.organizationId, organizationId)))
- **[HIGH·WRITE]** `archiveVillaMaintenancePlanAction` — villa_maintenance_plans
  - Add requireOrgId() and scope the update: .where(and(eq(villaMaintenancePlans.id, parsed.data.id), eq(villaMaintenancePlans.organizationId, organizationId)))
- **[HIGH·WRITE]** `acknowledgeRiskEventAction` — maintenance_risk_events
  - Add requireOrgId() and scope the update: .where(and(eq(maintenanceRiskEvents.id, parsed.data.id), eq(maintenanceRiskEvents.organizationId, organizationId)))
- **[HIGH·WRITE]** `resolveRiskEventAction` — maintenance_risk_events
  - Add requireOrgId() and scope the update: .where(and(eq(maintenanceRiskEvents.id, parsed.data.id), eq(maintenanceRiskEvents.organizationId, organizationId)))

## maintenance-intelligence/scheduling.ts  _(1)_
- **[HIGH·WRITE]** `suggestMaintenanceWindows` — villa_maintenance_plans, villa_calendar_blocks, villas, operation_tasks, maintenance_window_suggestions
  - Add org scope to the plan lookup: change `.where(eq(villaMaintenancePlans.id, planId))` (L60) to `.where(and(eq(villaMaintenancePlans.id, planId), eq(villaMaintenancePlans.organizationId, await requireOrgId())))` so a foreign planId reads as not-found before any villa-block/project read, DELETE of foreign suggestions (L158), or INSERT (L167).

## notifications/services.ts  _(2)_
- **[HIGH·READ]** `listNotifications` — notification_queue
  - Add `const organizationId = await requireOrgId();` and `filters.push(eq(notificationQueue.organizationId, organizationId));` (build the where from filters with and(...filters)).
- **[LOW·READ]** `getNotificationById` — notification_queue
  - Add `const organizationId = await requireOrgId();` and AND `eq(notificationQueue.organizationId, organizationId)` into the where so a cross-org id resolves to null.

## operations/actions.ts  _(2)_
- **[MED·WRITE]** `generateDuePreventiveTasksAction` — preventive_schedules, operation_tasks
  - Scope the due-schedule read to the caller's org: filter preventiveSchedules by or(projectId in org-projects, villaId in org-villas) (same subquery pattern as listPreventiveSchedules) so it can't generate operation_tasks (stamped with the caller's organizationId) from another tenant's schedules. Currently it selects ALL active schedules platform-wide and stamps the generated task with the caller's org, materialising other tenants' preventive schedules into the caller's org.
- **[MED·WRITE]** `createServiceRequestAction / acceptServiceRequestAction / completeServiceRequestAction / cancelServiceRequestAction (transitionServiceRequest)` — service_requests
  - service_requests has no org column and the transition path selects/updates by id only with NO transitive org check (unlike maintenance/damage which use *BelongsToOrg). Add a villa->project org resolver (or inner-join villas->projects filtered by requireOrgId) and reject when the request's villa is not in the caller's org. Create path is fine; the transition actions are the gap.

## owner-bookings/projection.ts  _(2)_
- **[MED·WRITE]** `rebuildOwnerBookingSummaryForBooking` — bookings, ownership_shares, owner_booking_summaries, owner_booking_revenue_breakdowns, owner_revenue_source_monthly
  - In the action, validate the booking belongs to the caller's org before rebuilding: load bookings by id AND eq(bookings.organizationId, await requireOrgId()) and reject if not found. (The projection then derives org from the booking; an attacker passing another tenant's bookingId currently triggers a rebuild of that org's owner projection rows — a cross-tenant write/recompute the caller has no permission over.)
- **[MED·WRITE]** `rebuildOwnerBookingSummaryForDirectRequest` — direct_booking_requests, ownership_shares, owner_booking_summaries, owner_booking_revenue_breakdowns, owner_revenue_source_monthly
  - In the action, validate the request belongs to the caller's org: load directBookingRequests by id AND eq(directBookingRequests.organizationId, await requireOrgId()) and reject if not found before calling the rebuild.

## owner-bookings/services.ts  _(1)_
- **[HIGH·READ]** `getOwnerBookingSummaryById` — owner_booking_summaries (+leftJoin villas/projects/owner_statements)
  - Add an org guard reachable from the admin path: e.g. accept `opts?: { ownerOnly?: boolean; organizationId?: string }` and when organizationId is passed push `eq(ownerBookingSummaries.organizationId, opts.organizationId)` into `conditions`; then change the dashboard page to call `getOwnerBookingSummaryById(id, { organizationId: await requireOrgId() })`.

## owner-intelligence/actions.ts  _(2)_
- **[MED·WRITE]** `updateOwnerCalendarPreferencesAction` — owner_calendar_preferences
  - Before writing, resolve the caller org via requireOrgId() and verify v.ownerId belongs to it (e.g. join owners/ownership_shares -> project.organizationId, or check it is in listOwnerIdsForCurrentUser()); scope the existing-row lookup/update with that org and stamp organizationId on insert, returning 'Owner not found.' on mismatch.
- **[MED·WRITE]** `refreshOwnerVisibleEventsAction` — owner_visible_events (via rebuildOwnerVisibleEventsForAllOwners)
  - Thread the caller org: pass `await requireOrgId()` into rebuildOwnerVisibleEventsForAllOwners and have that helper restrict its owner/event sweep to that org (verify the helper is org-scoped before relying on it). [Helper is outside the assigned file set — confirm its scoping; the action as written hands it no tenant boundary.]

## owner-intelligence/health-services.ts  _(1)_
- **[HIGH·READ]** `computeVillaHealth` — villas+projects, bookings, owner_stay_requests, villa_calendar_blocks, operation_tasks, maintenance_tickets, preventive_schedules, maintenance_risk_events, guest_reviews
  - Pass the verified org from the admin page: change dashboard health/[villaId]/page.tsx:40 to `computeVillaHealth(villaId, periodStart, periodEnd, await requireOrgId())` — the function already rejects a cross-org villa (returns null) when organizationId is non-null, which then triggers the existing notFound().

## owner-portal/get-documents.ts  _(1)_
- **[HIGH·READ]** `getOwnerDocuments` — documents
  - Add the owner's org to the WHERE: resolve organizationId = await getOwnerOrgId(ownerId) and AND eq(documents.organizationId, organizationId) onto the predicate (so the visibleToOwner=true branch is org-bounded, not global).

## owner-stays/actions.ts  _(5)_
- **[MED·WRITE]** `archiveOwnerStayPolicyAction` — owner_stay_policies
  - Resolve the policy's org via leftJoin projects on owner_stay_policies.project_id and confirm projects.organizationId === requireOrgId() (or null/global project) before the UPDATE; bail not-found otherwise — mirror removeEquivalenceMemberAction's org-join guard.
- **[MED·WRITE]** `updateOwnerStayPolicyAction` — owner_stay_policies
  - Before the UPDATE, load the policy joined to projects and require projects.organizationId === requireOrgId() (or global null project); return not-found on mismatch so a cross-org policy id can't be re-written (including re-pointing project_id/villa_id into another org).
- **[MED·WRITE]** `addEquivalenceMemberAction` — villa_equivalence_group_members
  - Before the INSERT, load villa_equivalence_groups by groupId joined to projects and require projects.organizationId === requireOrgId() (or global null project), and likewise that the villaId's villa→project is in-org; bail not-found otherwise so a member can't be attached across orgs (matching removeEquivalenceMemberAction's guard).
- **[MED·WRITE]** `updateEquivalenceGroupAction` — villa_equivalence_groups
  - Before the UPDATE, load the group joined to projects and require projects.organizationId === requireOrgId() (or global null project); return not-found on mismatch so another org's group can't be renamed/re-pointed.
- **[MED·WRITE]** `archiveEquivalenceGroupAction` — villa_equivalence_groups
  - Same as updateEquivalenceGroupAction: join projects and require in-org (or global null project) before flipping status to archived; bail not-found on a cross-org group id.

## owner-stays/relocation-actions.ts  _(4)_
- **[HIGH·WRITE]** `findRelocationCandidatesAction` — owner_stay_requests, villa_calendar_blocks, villa_equivalence_group_members, booking_relocation_candidates
  - In findRelocationCandidates, after loading the request require req.organizationId === requireOrgId() (return early on mismatch) so an operator can't discover/delete/insert relocation candidates against another org's request, villas and bookings.
- **[HIGH·WRITE]** `approveRelocationCandidateAction` — booking_relocation_candidates
  - Before the UPDATE, confirm the candidate is in-org by joining booking_relocation_candidates → ownerStayRequests and requiring ownerStayRequests.organizationId === requireOrgId() (mirror listRelocationCandidates); bail not-found otherwise.
- **[HIGH·WRITE]** `rejectRelocationCandidateAction` — booking_relocation_candidates
  - Same as approve: join the candidate to ownerStayRequests and require ownerStayRequests.organizationId === requireOrgId() before flipping candidateStatus to rejected; not-found on cross-org id.
- **[HIGH·WRITE]** `applyRelocationCandidateAction` — booking_relocation_candidates, bookings, villa_calendar_blocks
  - In applyRelocationCandidate, after loading the candidate join to ownerStayRequests and require ownerStayRequests.organizationId === requireOrgId() before re-pointing bookings.villaId / re-syncing the calendar block; return not-found on mismatch (this path mutates another org's booking, so it is the most damaging of the four).

## owner-stays/relocation.ts  _(2)_
- **[HIGH·WRITE]** `findRelocationCandidates` — ownerStayRequests (read+update), bookingRelocationCandidates (insert/delete), villaCalendarBlocks, villaEquivalenceGroupMembers, bookings
  - Load the parent request with the org predicate: change line 139 `.where(eq(ownerStayRequests.id, ownerStayRequestId))` to `.where(and(eq(ownerStayRequests.id, ownerStayRequestId), eq(ownerStayRequests.organizationId, await requireOrgId())))` so a cross-org request id returns no row and the function early-returns { created: 0 } (requireOrgId + and are already imported).
- **[HIGH·WRITE]** `applyRelocationCandidate` — bookingRelocationCandidates (read+update), bookings (update — re-points villaId), villaCalendarBlocks
  - Scope the candidate load through its parent request's org: join ownerStayRequests on c.ownerStayRequestId and AND eq(ownerStayRequests.organizationId, await requireOrgId()) in the candidate fetch at line 338-342 (bookingRelocationCandidates has no org column, so it must anchor via ownerStayRequests.organizationId), returning { ok:false, reason:"candidate not found" } when out-of-org.

## owners/actions.ts  _(1)_
- **[LOW·READ]** `recordPortalInviteAction` — owners (read only)
  - Line 432 loads the owner with `.where(eq(owners.id, d.ownerId))` and NO org predicate, then writes the owner's email into an audit event (after: { email: owner.email }). A cross-org ownerId leaks that owner's email into the caller's audit log. Scope the load like the sibling actions: `.where(and(eq(owners.id, d.ownerId), eq(owners.organizationId, await requireOrgId())))` and return "Owner not found." when null.

## readiness/services.ts  _(1)_
- **[HIGH·READ]** `listCurrentReadiness` — villa_readiness_states (LEFT JOIN villas -> projects)
  - Add an org predicate via the project join (villas anchor org through projects): push eq(projectsTable.organizationId, await requireOrgId()) into the filters array (and switch the villas/projects leftJoin to innerJoin so the org filter is enforced).

## responsibility-scopes/actions.ts  _(2)_
- **[HIGH·WRITE]** `editResponsibilityScopeAction` — user_responsibility_scopes
  - Gate the UPDATE on org: .where(and(eq(userResponsibilityScopes.id, parsed.data.id), eq(userResponsibilityScopes.organizationId, await requireOrgId())))
- **[HIGH·WRITE]** `archiveResponsibilityScopeAction` — user_responsibility_scopes
  - Gate the UPDATE on org: .where(and(eq(userResponsibilityScopes.id, parsed.data.id), eq(userResponsibilityScopes.organizationId, await requireOrgId())))

## responsibility-scopes/services.ts  _(1)_
- **[HIGH·READ]** `listResponsibilityScopes` — user_responsibility_scopes (+leftJoin app_users, projects, villas)
  - Take an orgId param (await requireOrgId() in the page) and add filters.push(eq(userResponsibilityScopes.organizationId, orgId)); user_responsibility_scopes.organizationId is NOT NULL (migration 0155).

## security-baseline/mfa-services.ts  _(2)_
- **[HIGH·READ]** `listMfaFactorsForAdmin` — auth_mfa_factors
  - Accept organizationId (derive via requireOrgId in the page) and add .where(eq(authMfaFactors.organizationId, orgId)) — org column exists (migration 0154) and the revoke path already scopes by it; NULL pre-backfill rows can be tolerated with or(eq,isNull) if needed.
- **[HIGH·READ]** `listSecurityEventsForAdmin` — auth_security_events
  - Accept organizationId (requireOrgId in the page) and add .where(eq(authSecurityEvents.organizationId, orgId)); org column exists (migration 0154). NOTE: also stamp organizationId on insert in recordSecurityEvent so the filter has data.

## service-fulfilment/actions.ts  _(11)_
- **[MED·WRITE]** `createFulfilmentForOrderAction` — guest_service_fulfilments (insert), guest_service_orders/guest_services (read)
  - After requireOrgId(), verify the order belongs to the org: join guestServiceOrders→guestServices and add eq(guestServices.organizationId, organizationId) to the order lookup (return 'Order not found.' on mismatch)
- **[MED·WRITE]** `assignFulfilmentStaffAction` — guest_service_fulfilments
  - Before the update: const organizationId = await requireOrgId(); if (!(await loadFulfilmentInOrg(db, parsed.data.id, organizationId))) return { ok: false, error: 'Fulfilment not found.' };
- **[MED·WRITE]** `updateFulfilmentScheduleAction` — guest_service_fulfilments
  - After requireOrgId(): if (!(await loadFulfilmentInOrg(db, parsed.data.id, organizationId))) return { ok: false, error: 'Fulfilment not found.' };
- **[MED·WRITE]** `updateFulfilmentEtaAction` — guest_service_fulfilments
  - After requireOrgId(): if (!(await loadFulfilmentInOrg(db, parsed.data.id, organizationId))) return { ok: false, error: 'Fulfilment not found.' };
- **[HIGH·WRITE]** `transitionFulfilmentStatusAction` — guest_service_fulfilments
  - After requireOrgId(): if (!(await loadFulfilmentInOrg(db, parsed.data.id, organizationId))) return { ok: false, error: 'Fulfilment not found.' };
- **[HIGH·WRITE]** `cancelFulfilmentAction` — guest_service_fulfilments
  - After requireOrgId(): if (!(await loadFulfilmentInOrg(db, parsed.data.id, organizationId))) return { ok: false, error: 'Fulfilment not found.' };
- **[MED·WRITE]** `requestGuestConfirmationAction` — guest_service_fulfilments
  - After requireOrgId(): if (!(await loadFulfilmentInOrg(db, parsed.data.id, organizationId))) return { ok: false, error: 'Fulfilment not found.' };
- **[MED·WRITE]** `failFulfilmentAction` — guest_service_fulfilments
  - After requireOrgId(): if (!(await loadFulfilmentInOrg(db, parsed.data.id, organizationId))) return { ok: false, error: 'Fulfilment not found.' };
- **[HIGH·WRITE]** `issueVendorTokenAction` — service_vendor_tokens (insert), guest_service_fulfilments (read)
  - After loading: const organizationId = await requireOrgId(); if (!(await loadFulfilmentInOrg(db, parsed.data.fulfilmentId, organizationId))) return { ok: false, error: 'Fulfilment not found.' };
- **[LOW·WRITE]** `revokeVendorTokenAction` — service_vendor_tokens
  - Scope via the parent fulfilment: select the token's fulfilmentId, run loadFulfilmentInOrg(db, fulfilmentId, await requireOrgId()), reject if not owned before the update
- **[LOW·WRITE]** `hideGuestServiceRatingAction / flagGuestServiceRatingAction` — guest_service_ratings
  - Scope via the parent fulfilment: select the rating's fulfilmentId, run loadFulfilmentInOrg(db, fulfilmentId, await requireOrgId()), reject if not owned before the update

## service-fulfilment/services.ts  _(2)_
- **[LOW·READ]** `listFulfilmentEvents` — service_fulfilment_events
  - add org predicate via parent fulfilment, e.g. require an organizationId arg and inner-join guestServiceFulfilments with eq(guestServiceFulfilments.organizationId, organizationId) (events.organization_id is nullable so prefer the parent join)
- **[LOW·READ]** `listFulfilmentsForBooking` — guest_service_fulfilments, guest_service_orders (+joins)
  - thread an organizationId arg and add eq(guestServiceFulfilments.organizationId, organizationId) to the WHERE (or join guestServiceOrders→villas→projects and filter projects.organizationId)

## storage/storage-service.ts  _(3)_
- **[HIGH·READ]** `getDocumentSignedUrl` — documents
  - Accept the caller's organizationId and add eq(documents.organizationId, organizationId) to the .where (the route comment even flags 'fine-grained per-doc access checks ... are a follow-up'); for the nullable-org legacy rows widen to or(isNull(documents.organizationId), eq(documents.organizationId, organizationId)).
- **[HIGH·WRITE]** `deleteDocument` — documents
  - Thread the caller's organizationId and add eq(documents.organizationId, organizationId) to both the .select and the .delete .where so a foreign document id deletes nothing (and removes nothing from storage).
- **[LOW·READ]** `listDocumentsByEntity` — documents
  - Add organizationId param and eq(documents.organizationId, organizationId) (or or(isNull(org), eq(org)) for legacy rows) to the AND when wired into a tenant surface; currently unreferenced and entityId is a UUID so practical reachability is nil.

## utilities/actions.ts  _(2)_
- **[MED·WRITE]** `recordUtilityReadingAction` — utility_accounts (read), utility_readings (write), maintenance_risk_events (write)
  - const organizationId = await requireOrgId(); then load the account with and(eq(utilityAccounts.id, parsed.data.utilityAccountId), eq(utilityAccounts.organizationId, organizationId)) so a foreign account id reads as not-found (prevents writing a reading/risk-event into another tenant's account and reading back its thresholds/villa).
- **[MED·WRITE]** `createUtilityPaymentReminderAction` — utility_accounts (read), utility_payment_reminders (write)
  - const organizationId = await requireOrgId(); then load with and(eq(utilityAccounts.id, parsed.data.utilityAccountId), eq(utilityAccounts.organizationId, organizationId)) so a foreign account id cannot have a payment reminder minted against another tenant's account.

## utilities/services.ts  _(3)_
- **[HIGH·READ]** `listUtilityReadings` — utility_readings, utility_accounts (join), villas (join)
  - const organizationId = await requireOrgId(); push eq(utilityReadings.organizationId, organizationId) into the filters array (utility_readings.organization_id is NOT NULL) so the list pages no longer enumerate every tenant's meter readings.
- **[HIGH·READ]** `listUtilityPaymentReminders` — utility_payment_reminders, utility_accounts (join), villas (join)
  - const organizationId = await requireOrgId(); push eq(utilityPaymentReminders.organizationId, organizationId) into the filters array (org column is NOT NULL) so the payments list pages stop showing every tenant's bills.
- **[LOW·READ]** `getLatestReadingForAccount` — utility_readings
  - Add organizationId param and and(eq(utilityReadings.utilityAccountId, id), eq(utilityReadings.organizationId, await requireOrgId())) before wiring to a tenant surface; currently unreferenced.

## villa-guides/actions.ts  _(5)_
- **[HIGH·WRITE]** `upsertGuideSectionAction (UPDATE branch)` — villa_guide_sections
  - In the update branch add the org guard: .where(and(eq(villaGuideSections.id, parsed.data.id), eq(villaGuideSections.organizationId, await requireOrgId()))) so an admin in tenant A cannot rewrite tenant B's guide section.
- **[HIGH·WRITE]** `archiveGuideSectionAction` — villa_guide_sections
  - .where(and(eq(villaGuideSections.id, parsed.data.id), eq(villaGuideSections.organizationId, await requireOrgId()))) so a foreign section cannot be archived cross-tenant.
- **[HIGH·WRITE]** `upsertWifiAction (UPDATE branch) + archiveWifiCredentialAction` — villa_wifi_credentials
  - villa_wifi_credentials has NO organization_id (anchors org via villaId/projectId -> projects). Resolve the row's org via a projects join and gate on requireOrgId() before update/archive — e.g. verify the existing row's villa/project belongs to the caller's org first (subquery on villas/projects), or add eq filter through the project FK. A bare eq(id) fix is insufficient; needs the projects-anchored guard.
- **[HIGH·WRITE]** `upsertEmergencyContactAction (UPDATE branch) + archiveEmergencyContactAction` — villa_emergency_contacts
  - villa_emergency_contacts has NO organization_id (org via villaId/projectId -> projects). Gate update/archive on the row's project/villa belonging to requireOrgId() (projects-anchored subquery) — a bare eq(id) filter cannot enforce tenancy here.
- **[HIGH·WRITE]** `upsertNeighborhoodPlaceAction (UPDATE branch) + archiveNeighborhoodPlaceAction` — villa_neighborhood_places
  - villa_neighborhood_places has NO organization_id (org via villaId/projectId -> projects). Gate update/archive on the row's project/villa belonging to requireOrgId() (projects-anchored subquery); bare eq(id) cannot enforce tenancy.

## villa-guides/wifi-crypto.ts  _(1)_
- **[HIGH·WRITE]** `migratePlaintextWifiPasswords` — villa_wifi_credentials (select + update); auth_security_events (insert via recordSecurityEvent)
  - Take organizationId = await requireOrgId() and scope the scan to the caller's org via projects: replace `db.select().from(villaWifiCredentials)` with a leftJoin(projects, eq(projects.id, villaWifiCredentials.projectId)).leftJoin(villas, eq(villas.id, villaWifiCredentials.villaId)).leftJoin(villaProjectAlias, eq(villaProjectAlias.id, villas.projectId)) and `.where(or(eq(projects.organizationId, organizationId), eq(villaProjectAlias.organizationId, organizationId)))` (selecting villaWifiCredentials.id) so only this org's rows are encrypted/cleared.

