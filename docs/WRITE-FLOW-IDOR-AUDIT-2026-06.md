# Write-flow cross-org IDOR audit — 2026-06-12

Multi-agent re-audit (14 cluster auditors → adversarial verify per finding). **117 confirmed** cross-org write-IDORs, **45 money-affecting**. Same class as #199/#200 + the owner-stay cluster (#241).

Pattern: a mutating server action loads a record by id with no `organization_id` predicate, then update/delete/insert-that-mints — so an operator in org A can mutate org B's data by passing a foreign id. `requirePermission` checks the verb, not the tenant; the DB role bypasses RLS. Fix: `requireOrgId()` + AND the org into the load+mutate (or validate the FK belongs to the caller's org), mirroring `#241`.

**By severity:** {'critical': 22, 'high': 68, 'medium': 25, 'low': 2}  ·  **By cluster:** {'bookings-direct': 12, 'channels-availability': 6, 'guest-stays-services': 12, 'inventory-procurement': 13, 'notifications-messaging': 8, 'operations-maint': 12, 'owners-shares': 11, 'villas-projects-pricing': 7, 'dev-os-money': 5, 'finance-statements': 9, 'payments-banking': 7, 'owner-investor-buyer-portal-writes': 2, 'payroll-jobs-agents': 1, 'security-auth-team-docs': 12}


## CRITICAL · money

### CRITICAL · MONEY — `postDirectBookingRevenueAction -> postDirectBookingRevenue (loadRequestContext loads directBookingRequests by id with no org predicate, then inserts a posted revenue_lines money row + upserts a finance link + mirrors status on the foreign request)`
- **file:** `src/features/direct-booking/finance-reconciliation.ts`  ·  **cluster:** bookings-direct
- **why:** Confirmed cross-org money mutation with no upstream tenant guard. (1) directBookingRequests HAS its own organizationId column (schema/direct-booking.ts:93), so the table is org-anchored — kill condition "no org column" fails. (2) The only entrypoint, postDirectBookingRevenueAction (reconcile-actions.ts:23-43), reads requestId straight from FormData (only z.string().uuid()) and calls requirePermission("direct_booking.reconcile.write") — a verb-only check. requirePermission returns a CurrentUserContext that includes organizationId (permissions.ts:81), but the action never passes/compares it; pos
- **fix:** Thread requireOrgId() into the reconcile path so a foreign request 404s before any revenue_lines insert, mirroring recordBookingPaymentAction.

1) In reconcile-actions.ts, capture org and pass it down:
   import { requireOrgId } from "@/features/auth/require-org";
   const organizationId = await requireOrgId();
   const out = await postDirectBookingRevenue(parsed.data.requestId, me?.id ?? null, organizationId);

2) In finance-reconciliation.ts, give loadRequestContext and postDirectBookingRevenu

### CRITICAL · MONEY — `reverseDirectBookingFinanceLinkAction -> reverseDirectBookingFinanceLink (reverse posted direct-booking revenue link + flip linked revenue_lines row to status=reversed)`
- **file:** `src/features/direct-booking/finance-reconciliation.ts:644`  ·  **cluster:** bookings-direct
- **why:** Confirmed cross-org write-IDOR. reconcile-actions.ts:45 reverseDirectBookingFinanceLinkAction guards only with requirePermission("direct_booking.reconcile.reverse"); requirePermission (permissions.ts:103-110) checks role/permission only and never binds organizationId. The link id comes straight from formData (linkIdSchema validates uuid shape only) — it is NOT derived from any org-scoped query. reverseDirectBookingFinanceLink (line 644-648) loads the link with where(eq(directBookingFinanceLinks.id, linkId)) and NO org predicate; the only post-load gate is link.status !== "posted" (line 650), a
- **fix:** Scope the link load to the caller's org. In reverseDirectBookingFinanceLink, take organizationId from the caller (pass it down from the action, which already has ctx via requirePermission, or call requireOrgId() at the top of the action and add an organizationId param). Then change the load at line 644-648 to: const [link] = await db.select().from(directBookingFinanceLinks).where(and(eq(directBookingFinanceLinks.id, linkId), eq(directBookingFinanceLinks.organizationId, organizationId))).limit(1)

### CRITICAL · MONEY — `convertDirectBookingRequestToBookingAction`
- **file:** `src/features/direct-booking/actions.ts:185`  ·  **cluster:** bookings-direct
- **why:** Confirmed cross-org write-IDOR with no upstream org guard. (1) `id` is an attacker-controllable hidden form field (admin-buttons.tsx ConvertToBookingButton posts `<input name="id" value={id}>`); server actions are public POST endpoints, so the UUID is not derived from any org-scoped query at request time. (2) The only upstream guard, `requirePermission("direct_booking.convert")` (+ `direct_booking.manage` on the no-deposit override path), is verb-only — it checks the caller's roles, never binds the request to the caller's org. (3) The load at line 185-189 is `db.select().from(directBookingRequ
- **fix:** Resolve the caller's org BEFORE the request load and AND it into the where clause, so a cross-org id returns "Request not found.". Concretely in convertDirectBookingRequestToBookingAction:

1. Move `const organizationId = await requireOrgId();` from line 246 up to immediately after the `getCurrentAppUser()` call (line 183), before the request load.
2. Add the org predicate to the load (line 185-189):

   import { and, eq } from "drizzle-orm";
   const [request] = await db
     .select()
     .fr

### CRITICAL · MONEY — `markDepositManuallyPaidAction`
- **file:** `src/features/direct-booking/deposit-actions.ts:98`  ·  **cluster:** bookings-direct
- **why:** direct_booking_deposits is a genuine per-org table (schema/payments.ts:75 organizationId + org index; populated from the parent request's org in ensureDepositForRequest). The deposit id arrives straight from attacker-controllable FormData (deposit-buttons.tsx MarkDepositPaidButton renders a hidden `id` input; the action reads formData.get("id")), so it is NOT derived from an org-scoped upstream query. getDepositById (deposits.ts:30) selects by eq(id) with no org predicate; the action never compares deposit.organizationId to the caller's org; patchDepositStatus (deposits.ts:199) updates by eq(i
- **fix:** Add an org tenant guard after the permission check, in the house pattern (requireOrgId + reject foreign-org rows; allow legacy NULL only for internal users). In markDepositManuallyPaidAction (and apply identically to the other id-driven actions in this file — markDepositFailedAction, cancelDepositAction, refundDepositPlaceholderAction, and createOrRecreateDepositSessionAction which loads a directBookingRequests row by eq(id)):

  import { requireOrgId } from "@/features/auth/require-org";
  impo

### CRITICAL · MONEY — `assignBookingToVillaAction`
- **file:** `src/features/availability/actions.ts`  ·  **cluster:** channels-availability
- **why:** Confirmed cross-org write-IDOR. bookings has a NOT NULL org anchor (bookings.organizationId, schema lines 72-74, migration 0155). assignBookingToVillaAction loads the booking with a bare `eq(bookings.id, parsed.data.bookingId)` (line 177-181, no org predicate) and updates it with the same bare WHERE (line 200-203). The only guard is `requirePermission("front_office.write")` (line 168), which permissions.ts:103-110 shows is a pure verb check — the returned ctx's organizationId is never read. requireOrgId is imported (line 12) but never called in this function. bookingId comes straight from form
- **fix:** In assignBookingToVillaAction, resolve and enforce the org on both the booking and the target villa:

  const organizationId = await requireOrgId();

  // 1) Scope the booking load to the caller's org so a foreign bookingId 404s.
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, parsed.data.bookingId), eq(bookings.organizationId, organizationId)))
    .limit(1);
  if (!booking) return { ok: false, error: "Booking not found." };

  // 2) Verify the *tar

### CRITICAL · MONEY — `resolveDoubleBookingAction`
- **file:** `src/features/channels/manager-actions.ts`  ·  **cluster:** channels-availability
- **why:** Confirmed cross-org write-IDOR. (1) bookings has a notNull organizationId column (schema lines 72-74, index 111) — not platform-global, real org anchor. (2) The load at lines 227-238 uses inArray(bookings.id, [winnerBookingId, loserBookingId]) with NO org predicate, and the update at 250-257 cancels loser.id with only a winner.villaId===loser.villaId cross-record check. (3) The only auth gate, canManageEntity('booking'), checks the role/verb, not org membership; me.organizationId is fetched but never compared. (4) No RLS backstop: getDb() (src/lib/db/client.ts) returns a shared raw Supavisor p
- **fix:** Scope the load and assert org ownership before mutating. Replace lines 224-241:

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not authorised." };
  const organizationId = me.organizationId;

  const rows = await db
    .select({
      id: bookings.id,
      organizationId: bookings.organizationId,
      villaId: bookings.villaId,
      bookingCode: bookings.bookingCode,
      status: bookings.status,
      channelId: bookings.channelId,
      checkIn: bookings.c

### CRITICAL · MONEY — `addConciergeExtraServiceAction`
- **file:** `src/features/guest-ai-concierge/quickactions-actions.ts:259`  ·  **cluster:** guest-stays-services
- **why:** Confirmed cross-org money-IDOR with no upstream org guard on the entire path. (1) loadSessionContext (line 71-115) selects guestAiConciergeSessions WHERE eq(id, sessionId) ONLY — no org predicate (line 85) — so a session id from org B resolves and exposes org B's bookingId. (2) guardSession (line 118) only calls canManageEntity("guest"), which (permissions.ts:112-137) is a pure verb check against the caller's own role (maps to "guests.write"); it takes no entity id and never binds the target session/booking to the caller's org. (3) addBookingChargeAction (detail-actions.ts:160) only checks can
- **fix:** Add a tenant check to the concierge session load so a cross-org sessionId reads as "Session not found" before any charge is minted, mirroring listProjects/#241 and the sibling recordBookingPaymentAction. In quickactions-actions.ts:

1. In guardSession (line 118), resolve the caller org and AND it into the session load. Concretely, change loadSessionContext to accept the caller org and scope the query:

   import { and, eq } from "drizzle-orm";
   import { requireOrgId } from "@/features/auth/req

### CRITICAL · MONEY — `bridgeFulfilmentToFinanceAction → bridgeFulfilmentToFinance (revenue_lines + expense_lines insert)`
- **file:** `src/features/service-fulfilment/actions.ts:1465`  ·  **cluster:** guest-stays-services
- **why:** Confirmed cross-org write-IDOR. The action (actions.ts:1454) guards only with requirePermission("service_fulfilment.finance_bridge") — a verb check that returns the caller's own org context but never scopes the target. fulfilmentId is taken directly from formData.get("fulfilmentId") (attacker-controlled, not derived from any org-scoped query). bridgeFulfilmentToFinance (finance-bridge.ts:58-62) loads guestServiceFulfilments by id only, then the order by fulfilment.orderId (id only), then inserts revenue_lines + expense_lines against order.bookingId/villaId/projectId. No org/grant/owner/token p
- **fix:** Thread the caller org into the bridge and scope the fulfilment load through the durable NOT-NULL chain (guest_services.organizationId), mirroring the owner-stays fix. In bridgeFulfilmentToFinanceAction, capture `const ctx = await requirePermission("service_fulfilment.finance_bridge");` and pass `ctx.appUser.organizationId` (or `await requireOrgId()`) into the bridge: `bridgeFulfilmentToFinance(parsed.data.fulfilmentId, me?.id ?? null, await requireOrgId())`. In bridgeFulfilmentToFinance, add an 

### CRITICAL · MONEY — `completeFulfilmentAction`
- **file:** `src/features/service-fulfilment/actions.ts:818`  ·  **cluster:** guest-stays-services
- **why:** Real cross-org money write-IDOR. The only upstream guard is requirePermission("service_fulfilment.write") — a verb check that returns ctx.organizationId but the action discards it. The id comes straight from an attacker-controllable hidden FormData field (CompleteFulfilmentInline -> name="id" -> completeFulfilmentSchema.id = free z.string().uuid()); it is NOT derived from any org-scoped query. The UPDATE at line 818 is `.where(eq(guestServiceFulfilments.id, v.id))` only — no org predicate, no ownership/token check anywhere in the function (lines 785-853 read in full). guest_service_fulfilments
- **fix:** Load the fulfilment scoped to the caller org via the durable transitive anchor (guest_services.organization_id, which is NOT NULL), then AND that same org into the UPDATE. Concretely:

const organizationId = await requireOrgId();
const [owned] = await db
  .select({ id: guestServiceFulfilments.id })
  .from(guestServiceFulfilments)
  .innerJoin(guestServiceOrders, eq(guestServiceOrders.id, guestServiceFulfilments.orderId))
  .innerJoin(guestServices, eq(guestServices.id, guestServiceOrders.servi

### CRITICAL · MONEY — `applyMovement (called by createInventoryMovementAction l.606 + receive/transfer/writeOff/adjust wrappers; also consumeInventoryForTaskAction l.710, procurement receivePurchaseOrderLine l.388, approveInventoryCount l.198)`
- **file:** `src/features/inventory/actions.ts:487`  ·  **cluster:** inventory-procurement
- **why:** Confirmed cross-org write IDOR. The target tables inventory_movements, inventory_stock_levels, inventory_items, inventory_locations all carry organizationId (migration 0153), so they are tenant-scoped, not platform-global. The only upstream guard is requirePermission("inventory.write"/"inventory.adjust"), which checks the caller's ROLE, not the ORG of the target rows. createMovementSchema validates itemId as a UUID but does not constrain it to the caller's org. applyMovement receives itemId/fromLocationId/toLocationId straight from form input and never loads the item or locations with an eq(or
- **fix:** Anchor every movement to the caller's org. 1) In applyMovement, add organizationId resolution and verification: call requireOrgId() (import from @/features/auth/require-org), then load the item AND any referenced locations filtered by org and reject if missing — const [item] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.organizationId, organizationId))).limit(1); if (!item) return { error: "Item not found." }; and likewise for fromLocat

### CRITICAL · MONEY — `createTaskMaterialUsageAction / consumeInventoryForTaskAction`
- **file:** `src/features/inventory/actions.ts:723`  ·  **cluster:** inventory-procurement
- **why:** Confirmed real cross-org write-IDOR with a money path. createTaskMaterialUsageAction (actions.ts:684; alias consumeInventoryForTaskAction at 677) guards only with requirePermission("inventory.write"), which checks role membership via permission-matrix and returns the caller's org context but NEVER compares it to anything. itemId/taskId/locationId all arrive caller-supplied through FormData (src/components/field/material-usage-form.tsx) and the Zod schema (schema.ts:147) validates only UUID shape. The item is then loaded by eq(inventoryItems.id, d.itemId) with NO org predicate (line 703-707), s
- **fix:** In createTaskMaterialUsageAction, resolve and enforce the caller's org before any read/write. (1) const organizationId = await requireOrgId(); after requirePermission. (2) Load the item scoped to org and reject otherwise: const [item] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, d.itemId), eq(inventoryItems.organizationId, organizationId))).limit(1); if (!item) return { ok:false, error:"Item not found." }; (3) Validate taskId belongs to the org: const [task] = await d

### CRITICAL · MONEY — `approveInventoryCountAction`
- **file:** `src/features/inventory/counts-actions.ts`  ·  **cluster:** inventory-procurement
- **why:** inventory_counts has its own organizationId column (migration 0153, schema/inventory.ts:414, index inv_counts_org_idx). approveInventoryCountAction guards only with requirePermission("inventory.count.approve"), which checks role/permission via getCurrentUserContext and does NOT scope by org (its org-bearing return value is discarded). The count id is parsed straight from formData (countIdSchema) and loaded at line 179 by eq(inventoryCounts.id, id) with no org predicate — not derived from any org-scoped upstream query. So an operator in org A holding inventory.count.approve can pass org B's cou
- **fix:** Scope the load and every dependent mutation to the caller's org. In approveInventoryCountAction: import { and } from "drizzle-orm" and { requireOrgId } from "@/features/auth/require-org"; after requirePermission, add `const organizationId = await requireOrgId();` and change the load to `.where(and(eq(inventoryCounts.id, parsed.data.id), eq(inventoryCounts.organizationId, organizationId)))` so a foreign count returns "Count not found." Also AND the final status-update WHERE with `eq(inventoryCoun

### CRITICAL · MONEY — `createPurchaseOrderFromRequestAction (and the shared transitionPurchaseRequest l.89: submit/approve/reject/cancel; transitionPurchaseOrder l.284: sent/confirmed/cancelled; receivePurchaseOrderLineAction l.348; markPurchaseOrderReceivedAction l.449)`
- **file:** `src/features/procurement/actions.ts:159`  ·  **cluster:** inventory-procurement
- **why:** Confirmed cross-org write-IDOR with no upstream tenant guard. (1) Tables carry an org column — purchase_requests/purchase_orders/purchase_order_lines/purchase_request_lines all have organization_id (migration 0153; schema lines 298/355/387/329), so this is NOT a platform-global or org-less table. (2) The ONLY upstream guard is requirePermission('procurement.write'|'procurement.approve') (permissions.ts l.103) which checks the verb against the user's roles globally; it returns ctx.appUser.organizationId but the procurement actions never read or compare it. (3) The target id is a raw client-cont
- **fix:** Resolve the caller org once and guard every load + stamp every insert with it, using the canonical requireOrgId() helper (src/features/auth/require-org.ts). Concretely:

import { and, eq } from "drizzle-orm";
import { requireOrgId } from "@/features/auth/require-org";

In createPurchaseRequestAction / createPurchaseOrderAction: const organizationId = await requireOrgId(); add organizationId to the .insert(...).values({...}) (purchaseRequests and purchaseOrders), so future rows are scopable.

In 

### CRITICAL · MONEY — `receivePurchaseOrderLineAction`
- **file:** `src/features/procurement/actions.ts:364`  ·  **cluster:** inventory-procurement
- **why:** Confirmed cross-org write-IDOR. All involved tables (purchase_order_lines, purchase_orders, inventory_items, inventory_locations, inventory_movements) carry an organization_id column (migration 0153), so an org anchor exists but is never enforced. receivePurchaseOrderLineAction calls only requirePermission("procurement.write") and discards its returned context (which contains organizationId), so there is no upstream org/grant/owner/token guard. lineId, purchaseOrderId, and toLocationId all come straight from the form (receivePurchaseOrderLineSchema = bare uuids, schema.ts:106). The PO line is 
- **fix:** Org-scope every load and every write in receivePurchaseOrderLineAction:

1. After requirePermission, resolve the caller org: `const organizationId = await requireOrgId();` (import from @/features/auth/require-org).

2. Load the PO line scoped to the caller org and reject foreign rows:
   const [line] = await db.select().from(purchaseOrderLines)
     .where(and(eq(purchaseOrderLines.id, d.lineId), eq(purchaseOrderLines.organizationId, organizationId)))
     .limit(1);
   if (!line) return { ok: f

### CRITICAL · MONEY — `markUtilityPaymentPaidAction`
- **file:** `src/features/utilities/actions.ts`  ·  **cluster:** inventory-procurement
- **why:** Confirmed cross-org write-IDOR. utility_payment_reminders has a NOT NULL organization_id column (schema line 276-278), so the reminder row is its own org anchor. The action loads it with only .where(eq(utilityPaymentReminders.id, parsed.data.id)) (actions.ts:306-310) — no org predicate. The id is attacker-controlled: it comes straight from formData.get("id") via zod uuid(), passed by the client mark-paid-button.tsx, NOT derived from any org-scoped query. The only upstream guard, requirePermission('utilities.pay') (permissions.ts:103-110), checks the caller HAS the permission but never compares
- **fix:** Add org scoping to the reminder load and verify the account belongs to the same org before any mutation. In markUtilityPaymentPaidAction, after `const me = await getCurrentAppUser();` add `const organizationId = await requireOrgId();` (requireOrgId is already imported at line 17). Then scope the reminder load:

  import { and, eq } from "drizzle-orm"; // and already needed

  const [reminder] = await db
    .select()
    .from(utilityPaymentReminders)
    .where(
      and(
        eq(utilityPay

### CRITICAL · MONEY — `syncMarketingConnectionNowAction`
- **file:** `src/lib/marketing/connection-actions.ts`  ·  **cluster:** notifications-messaging
- **why:** Confirmed cross-org write-IDOR. syncMarketingConnectionNowAction (connection-actions.ts:455) gates only on requirePermission("marketing.write"), which is purely role-based (permission-matrix.ts:1317 hasPermission compares role keys only, never compares connection org to caller org). It then passes the caller-supplied connectionId straight to syncCampaignsForConnection (service.ts:51). That function loads the connection by id with NO org predicate (eq(marketingConnections.id, connectionId), service.ts:55-59) and derives org from the loaded row. For any connection whose status is "active" (the n
- **fix:** Bind the connection to the caller's org before any write. In syncMarketingConnectionNowAction, capture the org from the permission check and pass it down: `const ctx = await requirePermission("marketing.write"); const organizationId = ctx.appUser?.organizationId; if (!organizationId) return { ok: false, error: "No organization context" };` then `syncCampaignsForConnection(args.connectionId, organizationId)`. Change syncCampaignsForConnection's signature to `syncCampaignsForConnection(connectionI

### CRITICAL · MONEY — `reviewCheckinCheckoutRequestAction`
- **file:** `src/features/front-office/actions.ts`  ·  **cluster:** operations-maint
- **why:** Confirmed cross-org write-IDOR. The `id` is fully attacker-controlled: it arrives via FormData (request-row-actions.tsx:22 sets it from a string prop) and the Zod schema only enforces `z.string().uuid()` — a server action accepts any UUID regardless of what the UI rendered. The load (actions.ts:144) keys solely on `eq(checkinCheckoutRequests.id, parsed.data.id)` with NO org predicate, and the UPDATE (line 167) likewise keys on id only. The table IS a tenant table: `checkin_checkout_requests.organization_id` is NOT NULL (availability.ts:172-174, migration 0155 cutover) and also has a transitive
- **fix:** Org-scope both the load and the update. Add `import { and } from "drizzle-orm";` (currently only `eq` is imported) and `import { requireOrgId } from "@/features/auth/require-org";`. Then in reviewCheckinCheckoutRequestAction, after `const me = await getCurrentAppUser();`:

  const organizationId = await requireOrgId();

  const [before] = await db
    .select()
    .from(checkinCheckoutRequests)
    .where(
      and(
        eq(checkinCheckoutRequests.id, parsed.data.id),
        eq(checkinChec

### CRITICAL · MONEY — `updateShareAction`
- **file:** `src/features/shares/actions.ts`  ·  **cluster:** owners-shares
- **why:** Confirmed cross-org write-IDOR. `ownership_shares` has its own `organization_id` column (migration 0154, ownership.ts:61), and the canonical read path `listOwnershipShares` already scopes on exactly this column (owners/services.ts:180 → `eq(ownershipShares.organizationId, organizationId)`), proving the anchor is real and established. `updateShareAction` (actions.ts:107) gates only on `canManageEntity("share")` → `hasPermissionImpl(ctx, "shares.write")`, which is a permission verb, NOT a tenant check — it never compares the target row's org to the caller's. The `id` is attacker-controlled: it c
- **fix:** Scope both the load and the update to the caller's org. In `updateShareAction`:

import { and, eq } from "drizzle-orm";
import { requireOrgId } from "@/features/auth/require-org";

...
const db = getDb();
if (!db) return { ok: false, error: "Database is not configured." };
const organizationId = await requireOrgId();
const me = await getCurrentAppUser();
const d = parsed.data;
const [before] = await db
  .select()
  .from(ownershipShares)
  .where(and(eq(ownershipShares.id, id.data), eq(ownershi

### CRITICAL · MONEY — `archiveShareAction`
- **file:** `src/features/shares/actions.ts`  ·  **cluster:** owners-shares
- **why:** Confirmed cross-org write-IDOR. archiveShareAction takes the share `id` straight from formData (caller-controlled; the row-action UI at owners-row-actions.tsx:222 only appends row.id, but a server action is a public POST so the attacker chooses any UUID). The only upstream guard is canManageEntity("share") which checks the shares.write role permission ONLY — no org/owner/grant/token scoping, and that permission is identical for a legitimate user in every org. Both the SELECT (line 79) and the UPDATE (line 82) filter solely on eq(ownershipShares.id, id.data) with no org predicate, so a user in 
- **fix:** In archiveShareAction, resolve the caller's org and AND it into BOTH the select and the update. Add import { and, eq } from "drizzle-orm" and import { requireOrgId } from "@/features/auth/require-org". Then:

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing share id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrent

### CRITICAL · MONEY — `createShareAction`
- **file:** `src/features/shares/actions.ts`  ·  **cluster:** owners-shares
- **why:** Confirmed cross-org write-IDOR. createShareAction (src/features/shares/actions.ts:17-64) gates only on canManageEntity("share") -> hasPermissionImpl(ctx,"shares.write"), a pure role-table lookup with NO org dimension; shares.write is held by director and finance_manager (ordinary per-org roles, not just super_admin). It is a dashboard action, not a portal/grant-scoped action. createShareSchema validates only UUID shape — ownerId/villaId/projectId come straight from FormData and are NOT derived from any org-scoped query (the new-share page dropdowns are org-scoped reads, but a crafted POST bypa
- **fix:** Add org resolution + FK org-validation before the insert and stamp organizationId, mirroring onboardOwnerAction (owners/actions.ts:124-150). In src/features/shares/actions.ts createShareAction, after parsing and `const d = parsed.data;`:

  import { requireOrgId } from "@/features/auth/require-org";
  import { and, eq } from "drizzle-orm";
  import { owners } from "@/lib/db/schema/ownership";
  import { villas, projects } from "@/lib/db/schema/projects";

  const organizationId = await requireOr

### CRITICAL · MONEY — `recordCommissionChangeAction`
- **file:** `src/features/owners/actions.ts`  ·  **cluster:** owners-shares
- **why:** Confirmed cross-org write-IDOR. The owners table has its own organization_id column (schema/ownership.ts:22, migration 0173), so a transitive anchor exists. The only upstream guard is canManageEntity("owner") which (permissions.ts:112-137) just calls hasPermissionImpl(ctx, "owners.write") — a pure RBAC check with NO organization comparison. ownerId comes directly from request input (editCommissionInput.ownerId), not from any org-scoped query. The load (actions.ts:358 eq(owners.id, d.ownerId)) and the update (actions.ts:367-370 db.update(owners).set({commissionPct}).where(eq(owners.id, d.ownerI
- **fix:** requireOrgId is already imported (actions.ts:14). Scope both the load and the update to the caller's org so a foreign id reads as not-found and updates 0 rows. Replace lines 358-370:

const organizationId = await requireOrgId();
const [owner] = await db
  .select()
  .from(owners)
  .where(and(eq(owners.id, d.ownerId), eq(owners.organizationId, organizationId)))
  .limit(1);
if (!owner) return { ok: false, error: "Owner not found." };

const commissionFraction = (d.commissionPct / 100).toFixed(4

### CRITICAL · MONEY — `upsertRatePlanOverrideAction`
- **file:** `src/features/pricing/actions.ts:176`  ·  **cluster:** villas-projects-pricing
- **why:** Concrete cross-org mutation path with no upstream org guard. ratePlanId arrives as an attacker-controllable hidden form field (upsert-override-form.tsx:18) and is passed straight into db.insert(ratePlanOverrides)...onConflictDoUpdate keyed on (ratePlanId, stayDate) (actions.ts:196-218). The only guard is requirePermission("pricing.write"), which (permissions.ts:103-110) merely verifies the caller holds the permission key — it performs NO org comparison and returns no org binding that is used. The function never calls requireOrgId(), never loads the parent rate_plans row scoped to the caller's 
- **fix:** Scope the write to the caller's org and reject foreign rate plans. In upsertRatePlanOverrideAction, after requirePermission and parse:

  const organizationId = await requireOrgId(); // import from "@/features/auth/require-org"

  // 1. Load parent plan scoped to the caller's org; reject if not found.
  const [plan] = await db
    .select({ id: ratePlans.id })
    .from(ratePlans)
    .where(and(
      eq(ratePlans.id, parsed.data.ratePlanId),
      eq(ratePlans.organizationId, organizationId),



## HIGH · money

### HIGH · MONEY — `addBookingChargeAction`
- **file:** `src/features/bookings/detail-actions.ts:182`  ·  **cluster:** bookings-direct
- **why:** Confirmed cross-org write-IDOR. addBookingChargeAction loads the parent booking with `eq(bookings.id, bookingId)` and NO org predicate (line 185), then INSERTs a booking_charges money line (signed amount; charge or negative deduction) stamped with parent.organizationId — the FOREIGN booking's org. The only guard is canManageEntity("booking"), which resolves to hasPermissionImpl(ctx, "bookings.write") (permissions.ts:112) — a pure verb/role check with no org or booking-ownership scoping; it never calls requireOrgId(). bookingId is a direct argument to a "use server" action and is attacker-contr
- **fix:** Mirror recordBookingPaymentAction in the same file. At the top of addBookingChargeAction (after the canManageEntity check / db null-check), add `const organizationId = await requireOrgId();`. Then change the parent load to AND the caller's org into the WHERE and 404 on a cross-org id:

  const [parent] = await db
    .select({ organizationId: bookings.organizationId })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.organizationId, organizationId)))
    .limit(1);
  if

### HIGH · MONEY — `updateBookingAction`
- **file:** `src/features/bookings/actions.ts`  ·  **cluster:** bookings-direct
- **why:** Confirmed cross-org write-IDOR. (1) The only guard, canManageEntity("booking"), resolves to hasPermissionImpl(ctx, "bookings.write") — a pure role/permission check that never binds the target booking's organization_id to the caller's org. (2) bookings.organization_id is a real NOT NULL anchor (schema line 72-74, migration 0149/0155). (3) id = formData.get("id") comes from a hidden form input (form.tsx:59), validated only as a UUID — fully attacker-controlled, NOT re-derived from any org-scoped query. (4) Both the before-row select (line 143, eq(bookings.id, id.data)) and the UPDATE where (line
- **fix:** In updateBookingAction, resolve the caller's org and scope BOTH the before-row read and the UPDATE by it so cross-org ids 404. Concretely: after the db null-check, add `const organizationId = await requireOrgId();` then change the read on line 143 to `const [before] = await db.select().from(bookings).where(and(eq(bookings.id, id.data), eq(bookings.organizationId, organizationId))).limit(1);` and the UPDATE where on line 170 to `.where(and(eq(bookings.id, id.data), eq(bookings.organizationId, org

### HIGH · MONEY — `cancelDepositAction, refundDepositPlaceholderAction, markDepositFailedAction (and the sibling markDepositManuallyPaidAction)`
- **file:** `src/features/direct-booking/deposit-actions.ts`  ·  **cluster:** bookings-direct
- **why:** Confirmed cross-org write-IDOR. direct_booking_deposits has its own organization_id column (schema/payments.ts:75) — it is a multi-tenant table, not platform-global. getDepositById (deposits.ts:30-41) reads by eq(id) with NO org predicate, and patchDepositStatus (deposits.ts:199-212) updates by eq(id) with NO org predicate. The only upstream guard is requirePermission("direct_booking.deposit.write"/".refund"), which checks role/permission but never compares deposit.organizationId to the caller's appUser.organizationId. The deposit id is attacker-controlled: it arrives as a hidden form field th
- **fix:** Resolve the caller's org and enforce it on both the read and the write. Add `import { requireOrgId } from "@/features/auth/require-org";` to deposit-actions.ts, then in each of cancelDepositAction, refundDepositPlaceholderAction, markDepositFailedAction, markDepositManuallyPaidAction (and createOrRecreateDepositSessionAction / any expireDepositNowAction) do: `const organizationId = await requireOrgId();` after requirePermission, and after `const deposit = await getDepositById(parsed.data.id);` a

### HIGH · MONEY — `withdrawFromWallet`
- **file:** `src/lib/development/server/wallet-actions.ts`  ·  **cluster:** dev-os-money
- **why:** Confirmed unguarded cross-org money-mutation primitive. investor_wallets HAS a NOT NULL organization_id column (schema line 258), so the table is org-scoped and a transitive anchor exists — "no org column" does not apply. withdrawFromWallet selects the wallet solely by eq(investorWallets.id, walletId) (line 52), debits availableBalanceUsdMinor and bumps totalWithdrawnUsdMinor via eq(investorWallets.id, w.id) (line 72), and inserts a wallet_withdrawal row — all with NO organizationId predicate. The entire file has ZERO auth: grep confirms no requireOrgId, no requireInternalUser, no @/features/a
- **fix:** Add org enforcement to all 5 functions in wallet-actions.ts; for withdrawFromWallet specifically: (1) import the guards — import { requireInternalUser } from "@/features/auth/permissions"; import { requireOrgId } from "@/features/auth/require-org"; (2) at the top of withdrawFromWallet after parsing: await requireInternalUser(); const organizationId = await requireOrgId(); (3) scope the SELECT (line 52) — .where(and(eq(investorWallets.id, parsed.walletId), eq(investorWallets.organizationId, organ

### HIGH · MONEY — `updateCommitmentTerms`
- **file:** `src/lib/development/server/commitment-actions.ts`  ·  **cluster:** dev-os-money
- **why:** capital_commitments has its own organization_id column (schema investor-capital.ts:107), so it is an org-scoped table, not platform-global. updateCommitmentTerms (commitment-actions.ts:147) takes a free-form id: string and issues `.update(capitalCommitments).set({...}).where(eq(capitalCommitments.id, id))` (line 169) with NO org/grant/owner/token guard: it never calls requireOrgId, requireInternalUser, or requirePermission (the file's only auth import, requireOrgId, is used solely by createCommitment). The id is a raw caller-supplied parameter, NOT derived from an org-scoped query, so a caller
- **fix:** Add an org guard and scope the UPDATE by organizationId. In updateCommitmentTerms (commitment-actions.ts:147), after parsing: `const organizationId = await requireOrgId();` (and `await requireInternalUser();` once an internal-user guard is imported, matching the cluster), then change the where-clause at line 169 from `.where(eq(capitalCommitments.id, id))` to `.where(and(eq(capitalCommitments.id, id), eq(capitalCommitments.organizationId, organizationId)))`. `and` is already imported (line 3) an

### HIGH · MONEY — `updateWaterfallRuleParameters`
- **file:** `src/lib/development/server/waterfall/waterfall-actions.ts`  ·  **cluster:** dev-os-money
- **why:** Confirmed real cross-org write-IDOR. The waterfall_rules table HAS its own org anchor (organization_id, NOT NULL, schema line 35), and createWaterfallRule scopes correctly via requireOrgId() — proving org is the intended tenancy boundary. updateWaterfallRuleParameters (lines 112-124) updates ruleParameters by eq(waterfallRules.id, parsed.id) ONLY (line 121), with no organizationId predicate and no requireOrgId() call. The only guard is requireInternalUser() (line 115), which (permissions.ts:96-101) checks only ctx.isInternal — i.e. that the caller holds one of INTERNAL_ROLES (director, finance
- **fix:** Scope the UPDATE to the caller's org. Add the require-org import (already present at line 8) is in use — call it and AND it into the WHERE.

1) Add `and` to the drizzle import:
   import { and, eq } from "drizzle-orm";

2) Rewrite updateWaterfallRuleParameters:

export async function updateWaterfallRuleParameters(
  input: z.input<typeof updateParamsSchema>,
) {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = updateParamsSchema.parse(input);
  const

### HIGH · MONEY — `generateOwnerStatement (statement-generator.ts:83) called by generateOwnerStatementAction (src/features/finance/actions.ts:426)`
- **file:** `src/features/finance/statement-generator.ts`  ·  **cluster:** finance-statements
- **why:** Confirmed cross-org write-IDOR. The action requirePermission('finance.issue_statement') is a verb-only check; ownerId is parsed straight from form data (generateStatementSchema = z.string().uuid(), schema.ts:101-107) and is NOT re-derived from any org-scoped query. organizationId is the CALLER's org (requireOrgId), stamped onto the new rows but never compared to the owner's org. In generateOwnerStatement: owners are loaded by eq(owners.id, input.ownerId) (line 83-87) with no org predicate and no owner.organizationId === input.organizationId assertion (only !owner → owner_not_found); ownershipS
- **fix:** Add an org guard in generateOwnerStatement right after loading the owner, and scope the share query. (1) After line 88 (owner loaded): `if (owner.organizationId !== input.organizationId) return { ok: false, reason: "owner_not_found" };` — return the same opaque reason so cross-org owners are indistinguishable from non-existent ones. (2) Harden the owner load itself: add `eq(owners.organizationId, input.organizationId)` into the where at line 86, i.e. `.where(and(eq(owners.id, input.ownerId), eq(

### HIGH · MONEY — `createVendorInvoiceAction`
- **file:** `src/features/service-fulfilment/actions.ts`  ·  **cluster:** guest-stays-services
- **why:** Confirmed cross-org write-IDOR. The action's only guard is requirePermission("service_invoice.write"), which is verb-only: hasPermission() (permission-matrix.ts:1322) is purely role-based with no org scoping. The permission is held by org-scoped tenant roles (director, finance_manager, accountant), not only super_admin, so a finance user in org A passes. fulfilmentId, vendorId, and amountMinor are read straight from formData (schema.ts:173 — raw z.string().uuid(), no org binding) and INSERTed at actions.ts:1192 with NO upstream SELECT verifying either belongs to the caller's org, and organizat
- **fix:** Resolve and enforce the caller's org before inserting, and stamp it on the row. In createVendorInvoiceAction: const ctx = await requirePermission("service_invoice.write"); const orgId = ctx.appUser?.organizationId; if (!orgId) return { ok: false, error: "No organization." }; Then verify the fulfilment belongs to orgId via its order→service org anchor: const [ful] = await db.select({ id: guestServiceFulfilments.id }).from(guestServiceFulfilments).innerJoin(guestServiceOrders, eq(guestServiceOrder

### HIGH · MONEY — `setInvoiceStatus (markVendorInvoicePaidAction / approveVendorInvoiceAction / rejectVendorInvoiceAction)`
- **file:** `src/features/service-fulfilment/actions.ts:1254`  ·  **cluster:** guest-stays-services
- **why:** Confirmed cross-org write-IDOR on vendor-invoice payout state. The three exported server actions take `id` from a client-controlled hidden form input (InvoiceStatusButton in src/components/service-fulfilment/buttons.tsx:314), validate it only as a UUID (invoiceIdSchema = z.object({ id: z.string().uuid() }), schema.ts:184 — no org binding), and call setInvoiceStatus, which runs `db.update(serviceVendorInvoices).set({invoiceStatus, paidAt, approvedBy, approvedAt}).where(eq(serviceVendorInvoices.id, id))` filtering by id ONLY. The sole upstream guard is requirePermission('service_invoice.write') 
- **fix:** Scope the status flip to the caller's organization before mutating. In setInvoiceStatus, resolve the caller org and AND it into the UPDATE (or pre-load the invoice scoped to org and 404 if not owned).

Change the signature to receive the caller context (or call getCurrentAppUser inside) and rewrite:

```ts
async function setInvoiceStatus(
  id: string,
  status: "approved" | "rejected" | "paid",
): Promise<ActionResult> {
  await requirePermission("service_invoice.write");
  const db = getDb();


### HIGH · MONEY — `reverseFulfilmentFinanceBridgeAction`
- **file:** `src/features/service-fulfilment/actions.ts:1510`  ·  **cluster:** guest-stays-services
- **why:** Confirmed cross-org write-IDOR. reverseFulfilmentFinanceBridgeAction (actions.ts:1510) guards only with requirePermission("service_fulfilment.finance_bridge") — a verb-only check that never consults organizationId. It passes fulfilmentId straight from formData.get("fulfilmentId") (validated only as a UUID via reverseBridgeSchema; rendered as a client-controlled hidden form field in src/components/service-fulfilment/buttons.tsx:371) into reverseFulfilmentFinanceBridge (src/features/service-fulfilment/finance-bridge.ts:293). That function loads the link WHERE fulfilmentId=$1 with NO org filter (
- **fix:** Scope the reversal to the caller's org. In actions.ts add `import { requireOrgId } from "@/features/auth/require-org";`, capture `const organizationId = await requireOrgId();` after requirePermission, and pass it into reverseFulfilmentFinanceBridge. In src/features/service-fulfilment/finance-bridge.ts change reverseFulfilmentFinanceBridge to accept organizationId and scope BOTH the load and the update through the org-anchored parent fulfilment (the link's own organization_id is nullable pre-back

### HIGH · MONEY — `upsertServiceAction (update branch, lines 163-167)`
- **file:** `src/features/guest-services/actions.ts`  ·  **cluster:** guest-stays-services
- **why:** Confirmed cross-org write-IDOR. (1) The only upstream guard is requirePermission("guest_services.write") (line 121), which is verb-only: permissions.ts shows requirePermission just calls hasPermissionImpl(ctx, permission) against the user's role keys — it is NOT organization-aware. (2) v.id comes from upsertServiceSchema.id = optionalUuid (schema.ts:65), i.e. raw FormData; the service-editor form renders it as a plain hidden input (service-editor.tsx:50), and Server Action FormData is fully attacker-controllable. The id is NOT derived from any org-scoped query upstream. (3) The update branch (
- **fix:** Scope the update to the caller's org, mirroring the create branch. Resolve the org once and (a) pre-load to confirm ownership and (b) add the org predicate to the UPDATE where-clause:

  const organizationId = await requireOrgId();

  if (v.id) {
    // Confirm the target service belongs to the caller's org before mutating.
    const [owned] = await db
      .select({ id: guestServices.id })
      .from(guestServices)
      .where(
        and(
          eq(guestServices.id, v.id),
          eq(

### HIGH · MONEY — `upsertServiceOptionAction (update + insert branches)`
- **file:** `src/features/guest-services/actions.ts:227`  ·  **cluster:** guest-stays-services
- **why:** Real cross-org write-IDOR. requirePermission("guest_services.write") (line 200) is verb-only — it returns CurrentUserContext but only checks a permission flag, never organizationId. v.id comes from forgeable form data (upsertServiceOptionSchema.id is optionalUuid; the option-editor hidden input is fully attacker-controllable), so it is NOT derived from any org-scoped query. The update branch (227-231) does UPDATE guest_service_options SET label/priceDeltaMinor/internalCostDeltaMinor/status/isDefault WHERE eq(id) with no org predicate and no join to guest_services. The table is NOT platform-glo
- **fix:** Anchor every option write to the caller's org via the parent service before mutating. Add at top of the action (after parse): `const organizationId = await requireOrgId();`. UPDATE branch: pre-verify the existing option's parent service belongs to the caller's org, e.g.\n```ts\nif (v.id) {\n  const [owned] = await db\n    .select({ id: guestServiceOptions.id })\n    .from(guestServiceOptions)\n    .innerJoin(guestServices, eq(guestServices.id, guestServiceOptions.serviceId))\n    .where(and(\n  

### HIGH · MONEY — `assignFulfilmentVendorAction`
- **file:** `src/features/service-fulfilment/actions.ts:396`  ·  **cluster:** guest-stays-services
- **why:** Confirmed cross-org write-IDOR with no upstream org guard. (1) The only gate is requirePermission("service_fulfilment.dispatch"), which is a pure role/verb check — verified in src/features/auth/permissions.ts (requirePermission just calls hasPermissionImpl; no org comparison). (2) The id is fully attacker-controlled: assignFulfilmentVendorSchema.id is a raw z.string().uuid() parsed straight from formData (schema.ts:91-96), NOT derived from any org-scoped query. (3) The UPDATE is WHERE eq(guestServiceFulfilments.id, v.id) only — no org predicate. The vendor select is unscoped too (eq on service
- **fix:** Add a shared org-scoped fulfilment loader and AND the org into every fulfilment mutation. Use the durable transitive anchor (guest_service_orders has NO org column, so join through guest_services).

1) New helper in this file:
```ts
import { requireOrgId } from "@/features/auth/require-org";
import { and, eq } from "drizzle-orm";

async function loadFulfilmentInOrg(db, fulfilmentId: string, orgId: string) {
  const [row] = await db
    .select({ id: guestServiceFulfilments.id })
    .from(guestS

### HIGH · MONEY — `createCheckinCheckoutRequestAction`
- **file:** `src/features/front-office/actions.ts`  ·  **cluster:** operations-maint
- **why:** Confirmed cross-org write-IDOR. The action loads the parent booking with `.where(eq(bookings.id, parsed.data.bookingId))` only (actions.ts:88-92) — no org predicate. It then INSERTs a fee-bearing checkin_checkout_request (NOT-NULL organizationId at availability.ts:172; feeAmountMinor/currency fields) copying parent.organizationId from whatever booking the attacker names. The sole upstream guard is requirePermission("front_office.write") which is verb-only: it returns the caller's CurrentUserContext (with appUser.organizationId) but the action never compares it against the booking, and even cal
- **fix:** Scope the parent-booking lookup to the caller's org so a foreign bookingId returns "Booking not found" before any insert. In src/features/front-office/actions.ts: import `and` from "drizzle-orm" and `requireOrgId` from "@/features/auth/require-org". In createCheckinCheckoutRequestAction, after `requirePermission("front_office.write")` add `const organizationId = await requireOrgId();`, then change the booking select to:\n\n  const [parent] = await db\n    .select({ organizationId: bookings.organ

### HIGH · MONEY — `editDamageReportAction (and insert-side sibling createDamageReportAction:877)`
- **file:** `src/features/operations/actions.ts:1176`  ·  **cluster:** operations-maint
- **why:** Confirmed cross-org write-IDOR. editDamageReportAction loads `before` via `.where(eq(damageReports.id, d.id))` (id is a free-form client-supplied z.string().uuid() from FormData) and UPDATEs the same row by id only, mutating owner-chargeable money fields (estimatedCostMinor, ownerChargeable, guestChargeable, currency, severity) and re-pointing villaId/bookingId/guestId. The only upstream guard is requirePermission("operations.write") — a verb-only check (permissions.ts:103) with no org/row scoping. damage_reports has NO organizationId column (operations.ts:283-308), unlike its siblings operati
- **fix:** damage_reports has no organization_id column, so resolve the org transitively for the loaded row and assert it equals the caller's org before updating. In editDamageReportAction (and mirror in archiveDamageReportAction): after loading `before`, derive the row's org and guard it. Minimal implementation:

1) import: `import { and, eq } from "drizzle-orm"; import { requireOrgId } from "@/features/auth/require-org";` (requireOrgId already imported in this file).
2) `const organizationId = await requ

### HIGH · MONEY — `assignMaintenanceTicketAction (1294) + updateMaintenanceTicketStatusAction (585) + editMaintenanceTicketAction (1057) + archiveMaintenanceTicketAction (1129)`
- **file:** `src/features/operations/actions.ts`  ·  **cluster:** operations-maint
- **why:** Confirmed real cross-org write-IDOR. maintenance_tickets has NO organization_id (schema operations.ts:183-216); its only org anchor is the nullable villaId/projectId/bookingId, and none of the four actions ever resolves that anchor to an org or compares it to the caller. The ticket id is caller-controlled: client components (maintenance-assign.tsx, operations-row-actions.tsx, maintenance-status-actions.tsx) post ticketId/id as plain form fields, validated only as z.string().uuid(), then loaded with .where(eq(maintenanceTickets.id, ...)) — no org/villa join. The only upstream guard is requirePe
- **fix:** maintenance_tickets has no org column, so resolve org transitively from the loaded ticket and assert it equals the caller's org before any mutation. Add a shared helper, e.g. assertTicketInOrg(db, ticket, organizationId): resolve org via the ticket's villaId (villas.organizationId), else projectId (projects.organizationId), else bookingId (bookings.organizationId); if all three are null OR the resolved org !== organizationId, return { ok: false, error: "Ticket not found." }. Apply in all four ac

### HIGH · MONEY — `matchInvoiceAction`
- **file:** `src/lib/banking/bookkeeper-actions.ts`  ·  **cluster:** payments-banking
- **why:** Confirmed cross-org write-IDOR. bank_transactions has its own organization_id (schema/banking.ts:111), so the table is org-scoped and an org filter is available — but matchInvoiceAction's UPDATE WHERE is only eq(bankTransactions.id, bankTransactionId) (line 112), with no org predicate. There is NO upstream org guard: the action calls only getCurrentAppUser() (actor stamp for matchedBy) and requireDb() — it never calls resolveActiveOrgId()/requireOrgId(), and there is no requirePermission. zod only validates that both ids are UUIDs. RLS is not an effective backstop: the Drizzle client connects 
- **fix:** Resolve the caller's org and AND it into the WHERE, and verify the supplied invoiceId belongs to that same org before linking. Concretely:

1. Add the org resolution + import `and` (already importing `eq`):
   import { and, eq } from "drizzle-orm";
   import { invoices } from "@/lib/db/schema/sales";

2. In matchInvoiceAction, after the zod parse:
   const orgId = await resolveActiveOrgId();
   const user = await getCurrentAppUser();
   const db = requireDb();

   // Validate the target invoice 

### HIGH · MONEY — `setRuleActiveAction`
- **file:** `src/lib/banking/bookkeeper-actions.ts:217`  ·  **cluster:** payments-banking
- **why:** Confirmed cross-org write-IDOR. reconciliation_rules has its own organization_id column (schema/banking.ts:267, notNull), so an org anchor exists. setRuleActiveAction(ruleId, isActive) (lines 217-227) calls ONLY requireDb() — which is a pure DB-handle getter with no auth (client.ts:63-71) — and updates `SET isActive WHERE eq(reconciliationRules.id, ruleId)` with NO org predicate, no resolveActiveOrgId()/requireOrgId(), no requirePermission, no getCurrentAppUser. ruleId is a plain string arg to a public server-action POST endpoint; the rules page binding r.id only constrains the UI rendering, n
- **fix:** Scope the UPDATE to the caller's org, matching the in-file convention. In setRuleActiveAction (bookkeeper-actions.ts:217), add an org resolution and AND it into the WHERE clause; also import `and` from drizzle-orm (currently only `eq` is imported on line 4):

import { and, eq } from "drizzle-orm";

export async function setRuleActiveAction(
  ruleId: string,
  isActive: boolean,
): Promise<void> {
  const orgId = await resolveActiveOrgId();
  const db = requireDb();
  await db
    .update(reconc

### HIGH · MONEY — `reopenPeriodAction → reopenPeriod (src/lib/banking/service.ts:382)`
- **file:** `src/lib/banking/bookkeeper-actions.ts:299`  ·  **cluster:** payments-banking
- **why:** Confirmed cross-org write-IDOR. closed_periods has a notNull organization_id column (schema/banking.ts:314), but reopenPeriod (service.ts:382-398) does `UPDATE closed_periods SET reopenedBy/reopenedAt/reopenReason WHERE eq(closedPeriods.id, periodId)` with NO org predicate and accepts no organizationId arg. reopenPeriodAction (bookkeeper-actions.ts:299-319) takes periodId raw from formData, only checks getCurrentAppUser() is non-null (proves a session exists, not which period the caller owns), never calls resolveActiveOrgId()/requireOrgId(), never requirePermission, and never loads-and-verifie
- **fix:** Scope the reopen to the caller's org at both layers. (1) In reopenPeriodAction (src/lib/banking/bookkeeper-actions.ts:299), after parsing, resolve the caller org and pass it down: `const orgId = await resolveActiveOrgId();` then `await reopenPeriod({ periodId: parsed.data.periodId, organizationId: orgId, reopenedBy: user.id, reason: parsed.data.reason });`. Optionally add `await requirePermission("banking.write")` for parity with other finance writes. (2) In reopenPeriod (src/lib/banking/service

### HIGH · MONEY — `updateRatePlanAction`
- **file:** `src/features/pricing/actions.ts`  ·  **cluster:** villas-projects-pricing
- **why:** Concrete cross-org write path with no upstream org guard. (1) Table has a real org anchor: rate_plans.organizationId (pricing.ts:29, nullable since 0153). (2) The id is attacker-controlled, NOT derived from an org-scoped query: updateRatePlanAction reads id from formData.get("id") (actions.ts:89), Zod only checks it is a UUID (updateRatePlanSchema id: z.string().uuid()), then uses it directly: .where(eq(ratePlans.id, parsed.data.id)) (actions.ts:112) with no prior in-org load. (3) The only guard is requirePermission("pricing.write") (actions.ts:86) — verb-only; requirePermission (permissions.t
- **fix:** Scope the update to the caller's org and confirm a row was hit. In src/features/pricing/actions.ts: (a) widen the drizzle import to `import { and, eq } from "drizzle-orm";` and add `import { requireOrgId } from "@/features/auth/require-org";`. (b) In updateRatePlanAction after the db null-check add `const organizationId = await requireOrgId();`. (c) Change the update to capture affected rows and AND the org predicate:

  const updated = await db
    .update(ratePlans)
    .set({ /* unchanged set

### HIGH · MONEY — `createRatePlanSeasonAction`
- **file:** `src/features/pricing/actions.ts`  ·  **cluster:** villas-projects-pricing
- **why:** Real cross-org write-IDOR. The action (src/features/pricing/actions.ts:126-174) gates only on requirePermission("pricing.write"), which checks the permission globally and discards the returned org context. The season is inserted with ratePlanId taken straight from the form (line 151), validated only as a UUID by createSeasonSchema (schema.ts:21 `z.string().uuid()`). ratePlanId arrives via a hidden field in create-season-form.tsx:16, and a server action is a public POST endpoint, so a caller in org A can POST any org B rate_plan UUID. The parent rate_plans row is never loaded scoped to the call
- **fix:** Resolve the caller's org and verify the parent plan belongs to it before inserting, and anchor the season. Add `import { requireOrgId } from "@/features/auth/require-org";` and `import { and } from "drizzle-orm";`. In createRatePlanSeasonAction, after `const me = await getCurrentAppUser();`:

  const organizationId = await requireOrgId();
  const [parentPlan] = await db
    .select({ id: ratePlans.id })
    .from(ratePlans)
    .where(and(eq(ratePlans.id, parsed.data.ratePlanId), eq(ratePlans.or

### HIGH · MONEY — `createRatePlanAction`
- **file:** `src/features/pricing/actions.ts:50`  ·  **cluster:** villas-projects-pricing
- **why:** rate_plans has an org anchor (organization_id col added in migration 0153) plus transitive anchors via projectId->projects.organization_id and villaId->villas->projects.organization_id. createRatePlanAction (src/features/pricing/actions.ts:37-80) guards only with requirePermission("pricing.write"), which checks the permission flag and returns a context carrying organizationId but the action never uses it and never calls requireOrgId(). The insert (lines 50-64) takes projectId/villaId straight from FormData (createRatePlanSchema validates UUID shape only, not ownership) and never sets organizat
- **fix:** In createRatePlanAction, after requirePermission, resolve the caller org and validate any supplied ids against it, then stamp the org:

  await requirePermission("pricing.write");
  const organizationId = await requireOrgId();
  // ...parse...
  if (parsed.data.projectId) {
    const [p] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, parsed.data.projectId), eq(projects.organizationId, organizationId))).limit(1);
    if (!p) return { ok: false, error: "Inva


## MEDIUM · money

### MEDIUM · MONEY — `deactivateWaterfallRule`
- **file:** `src/lib/development/server/waterfall/waterfall-actions.ts`  ·  **cluster:** dev-os-money
- **why:** Confirmed cross-org write-IDOR. (1) Table waterfall_rules carries a NOT NULL organizationId org anchor (schema lines 35-39; migrations 0152/0158), so it is a per-org tenant table, not platform-global. (2) The only upstream guard at line 97 is requireInternalUser(), which verifies the caller holds an internal role but does NOT bind the mutation to the caller's org — it returns ctx but the function never reads ctx.organizationId nor calls requireOrgId(). (3) input.id is an arbitrary caller-supplied UUID; it is NOT derived from any org-scoped query (there is no production caller wrapping it — onl
- **fix:** Scope the UPDATE to the caller's org. In deactivateWaterfallRule (line 96), add `import { and } from "drizzle-orm";` and change the body to:

  export async function deactivateWaterfallRule(input: { id: string }) {
    await requireInternalUser();
    const organizationId = await requireOrgId();
    const db = requireDb();
    const [row] = await db
      .update(waterfallRules)
      .set({ isActive: false, effectiveUntil: new Date().toISOString().slice(0, 10) })
      .where(and(eq(waterfallRu


## HIGH

### HIGH — `extendBookingStayAction`
- **file:** `src/features/bookings/detail-actions.ts`  ·  **cluster:** bookings-direct
- **why:** Confirmed cross-org write-IDOR. `bookings` has a NOT NULL `organization_id` anchor (schema/bookings.ts:72-74), so the table is org-scoped and the row is reachable by any org. The only guard is `canManageEntity("booking")` (detail-actions.ts:234), which resolves to `hasPermission(ctx, "bookings.write")` — a pure ROLE check (`ctx.roles.some(r => allowed.includes(r))`, permission-matrix.ts:1317-1323) with NO comparison to the booking's org. `bookingId` is a free caller-supplied argument (passed straight from a client prop in _extend-stay.tsx:28), NOT derived from any org-scoped query. The SELECT 
- **fix:** Scope every booking touch in extendBookingStayAction to the caller's org, mirroring recordBookingPaymentAction in the same file. (1) After the db null-check add `const organizationId = await requireOrgId();` (requireOrgId is already imported, line 18). (2) Add the org predicate to the load select at line 253 — change `.where(eq(bookings.id, bookingId))` to `.where(and(eq(bookings.id, bookingId), eq(bookings.organizationId, organizationId)))` so a foreign bookingId resolves to no row and returns 

### HIGH — `setBookingStatusAction`
- **file:** `src/features/bookings/actions.ts:195 (setBookingStatusAction)`  ·  **cluster:** bookings-direct
- **why:** The bookings table has its own organization_id column (schema/bookings.ts:72), so it is a directly org-anchored multi-tenant table. The only upstream guard, canManageEntity("booking"), resolves to hasPermission(ctx, "bookings.write") — a pure role/permission check against the CALLER's own context with no org filter on the target row. The select (lines 205-209) loads the before-row by eq(bookings.id, parsed.data.id) and the update (lines 211-214) sets status by eq(bookings.id, parsed.data.id), both with NO org predicate. parsed.data.id comes straight from attacker-controlled formData, not from 
- **fix:** Add org scoping using the already-imported requireOrgId() and the already-imported `and` is NOT yet imported — add it. Concretely: (1) import: change `import { eq } from "drizzle-orm";` to `import { and, eq } from "drizzle-orm";`. (2) After the db null-check, resolve the caller's org: `const organizationId = await requireOrgId();`. (3) Scope the select WHERE (line 208): `.where(and(eq(bookings.id, parsed.data.id), eq(bookings.organizationId, organizationId)))`. (4) Scope the update WHERE (line 2

### HIGH — `approveDirectBookingRequestAction (and shared helper updateRequestStatus, also reached by markDirectBookingUnderReviewAction / rejectDirectBookingRequestAction)`
- **file:** `src/features/direct-booking/services.ts:331 (updateRequestStatus) called from src/features/direct-booking/actions.ts:97`  ·  **cluster:** bookings-direct
- **why:** direct_booking_requests has its own organization_id column (schema lines 93, index direct_booking_requests_org_idx), so the table is org-scoped — no transitive anchor needed. approveDirectBookingRequestAction (actions.ts:87-125) does ONLY requirePermission("direct_booking.approve"), which checks the caller holds the permission in their OWN org and never binds the target row's org. It then calls updateRequestStatus(parsed.data.id, "approved", ...) where parsed.data.id is a raw attacker-supplied UUID from decisionSchema/formData — NOT derived from any org-scoped query (the action never SELECTs t
- **fix:** Scope the shared mutation helper by org and resolve the caller's org in each action.

1) services.ts — give updateRequestStatus an organizationId arg and AND it into the WHERE:

   export async function updateRequestStatus(
     id: string,
     status: DirectBookingRequest["status"],
     organizationId: string,
     patch?: Partial<DirectBookingRequest>,
   ): Promise<DirectBookingRequest | null> {
     const db = getDb();
     if (!db) return null;
     const [row] = await db
       .update(d

### HIGH — `cancelVillaCalendarBlockAction`
- **file:** `src/features/availability/actions.ts`  ·  **cluster:** channels-availability
- **why:** Confirmed cross-org write-IDOR. The table villa_calendar_blocks HAS its own org column (organizationId, schema/availability.ts line 39) populated from requireOrgId() on every insert (createVillaCalendarBlockAction line 75), so it is org-scoped data, not platform-global. In cancelVillaCalendarBlockAction the id is fully attacker-controlled: cancelCalendarBlockSchema is just { id: uuid } (schema.ts line 33-35), supplied from client FormData via CancelBlockButton (fd.set("id", id)); it is NOT derived from any org-scoped query. The only upstream guard is requirePermission("availability.write") (li
- **fix:** Scope both the read and the write to the caller's org. In cancelVillaCalendarBlockAction add the org id and predicate:

  import { and, eq } from "drizzle-orm";
  ...
  const organizationId = await requireOrgId();

  const [before] = await db
    .select()
    .from(villaCalendarBlocks)
    .where(and(
      eq(villaCalendarBlocks.id, parsed.data.id),
      eq(villaCalendarBlocks.organizationId, organizationId),
    ))
    .limit(1);
  if (!before) return { ok: false, error: "Block not found." }

### HIGH — `createVillaCalendarBlockAction`
- **file:** `src/features/availability/actions.ts`  ·  **cluster:** channels-availability
- **why:** Confirmed cross-org write-IDOR. The action only calls requirePermission("availability.write") (a role-only check, permissions.ts:103-110 — not bound to the villaId) and requireOrgId() (returns the CALLER's org A). The villaId comes straight from formData (schema only validates it is a uuid). The villa lookup (actions.ts:64-68) filters solely by eq(villas.id, villaId) with no org/project join, and villas has NO organization_id column (projects.ts:50-102) — its only org anchor is transitive via villas.projectId -> projects.organizationId, which is never asserted here. detectAvailabilityConflicts
- **fix:** Org-scope the villa resolution before insert. Replace the bare villa lookup (actions.ts:64-68) with a join through projects and assert org ownership; reject foreign/missing villas. Concretely, after `const organizationId = await requireOrgId();`:

  const [v] = await db
    .select({ projectId: villas.projectId, orgId: projects.organizationId })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(eq(villas.id, parsed.data.villaId))
    .limit(1);
  if (!v || 

### HIGH — `retryConnectionSyncAction`
- **file:** `src/features/channels/manager-actions.ts:344`  ·  **cluster:** channels-availability
- **why:** Confirmed cross-org write-IDOR with no upstream org guard. `retryConnectionSyncAction` (lines 296-379) takes `connectionId` raw from client FormData (zod validates only that it is a UUID), then loads the connection with `.where(eq(channelConnections.id, connectionId))` (line 319) — NO org predicate. It then (a) inserts a channel_sync_log row stamped with the FOREIGN `conn.organizationId` (line 328) and (b) `UPDATE channel_connections SET status/lastInventorySyncAt/... WHERE id = conn.id` (lines 343-362), flipping the target connection from `error` to `active` and falsifying its sync history. T
- **fix:** Scope every connection access to the caller's org. Add the caller's org id and apply it to BOTH the load and the update, and use it (not the trusted conn row) for the sync-log insert:

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not authorised." };
  const organizationId = me.organizationId;
  // ...
  const [conn] = await db
    .select({ id: channelConnections.id, organizationId: channelConnections.organizationId, channel: channelConnections.channel, status: 

### HIGH — `rebuildStatementTransparency (entry: rebuildStatementTransparencyAction, src/features/statement-transparency/actions.ts:28)`
- **file:** `src/features/statement-transparency/rebuild.ts:75`  ·  **cluster:** finance-statements
- **why:** Concrete cross-org mutation with no upstream org/grant/owner/token guard. (1) The entry action rebuildStatementTransparencyAction (actions.ts:37) guards only with requirePermission("statement_transparency.manage") — a verb/role check that returns CurrentUserContext but never compares the caller's org to the statement's org; the permission-matrix entry (permission-matrix.ts:1243) is a role→permission map, not per-resource scoping. (2) statementId is fully attacker-controlled: it comes from formData.get("statementId") (actions.ts:39) and statementIdSchema only validates well-formedness. (3) rebu
- **fix:** Org-scope the statement load so a foreign id resolves to nothing and nothing is deleted/rebuilt. In src/features/statement-transparency/actions.ts:rebuildStatementTransparencyAction, resolve const orgId = await requireOrgId() (import from @/features/auth/require-org) after requirePermission, and pass it down: rebuildStatementTransparency(parsed.data.statementId, me?.id ?? null, orgId). In src/features/statement-transparency/rebuild.ts, add an organizationId param to rebuildStatementTransparency 

### HIGH — `rebuildStatementTransparencyForOwner (called by rebuildStatementTransparencyForOwnerAction, src/features/statement-transparency/actions.ts:89)`
- **file:** `src/features/statement-transparency/rebuild.ts:352`  ·  **cluster:** finance-statements
- **why:** Confirmed cross-org write-IDOR with no upstream org guard. The action (actions.ts:89-105) only calls requirePermission("statement_transparency.manage") — a role/permission check. It discards the returned ctx.organizationId and validates ownerId solely as z.string().uuid() (schema.ts:12), so ownerId is attacker-controlled. rebuildStatementTransparencyForOwner (rebuild.ts:358-361) selects ALL owner_statements via eq(ownerStatements.ownerId, ownerId) with NO org predicate, then rebuildStatementTransparency (rebuild.ts:118-126) DELETEs + reinserts statement_source_group_lines / statement_source_gr
- **fix:** Scope the rebuild to the caller's org at both the action and the query. (1) In rebuildStatementTransparencyForOwnerAction (actions.ts:89), resolve the caller org and pass it down:

  import { requireOrgId } from "@/features/auth/require-org";
  ...
  await requirePermission("statement_transparency.manage");
  const parsed = ownerIdSchema.safeParse({ ownerId: formData.get("ownerId") });
  if (!parsed.success) return { ok: false, error: "Invalid ownerId" };
  const orgId = await requireOrgId();
  

### HIGH — `hideGuestReviewAction (line 250) and markGuestReviewOwnerVisibleAction (line 278)`
- **file:** `src/features/owner-intelligence/actions.ts:250`  ·  **cluster:** finance-statements
- **why:** Confirmed cross-org write-IDOR. guest_reviews HAS organization_id (own column + villa→project.org transitive anchor), added AND backfilled by migration 0154 (drizzle/0154 lines 136/431-438/594), so it is not a platform-global table and the anchor is populated. Both UPDATEs filter only by eq(guestReviews.id, parsed.data.id) (actions.ts:260-267 / 288-295) with NO org predicate. The id comes raw from FormData; reviewIdSchema (schema.ts:74) only asserts it is a UUID — it is NOT derived from any org-scoped query. requirePermission('guest_review.manage') is a verb-only check (permissions.ts:103-110)
- **fix:** Resolve the caller org up front and AND it into both UPDATE where-clauses. Add `import { and, eq } from "drizzle-orm";` and `import { requireOrgId } from "@/features/auth/require-org";`. In hideGuestReviewAction (after requirePermission, line 254): `const orgId = await requireOrgId();` then change the where to `.where(and(eq(guestReviews.id, parsed.data.id), eq(guestReviews.organizationId, orgId)))`. Apply the same change to markGuestReviewOwnerVisibleAction (line 288-295). Optionally use `.retu

### HIGH — `updateSupplierAction`
- **file:** `src/features/inventory/actions.ts:247`  ·  **cluster:** inventory-procurement
- **why:** Confirmed cross-org write-IDOR. The suppliers table has its own organizationId column (src/lib/db/schema/inventory.ts:59, migration 0153), so org distinction is real. The only upstream guard is requirePermission("procurement.write") (line 235), which (permissions.ts:103-110) checks the permission verb against the caller's context and never compares the target row's org to the caller's org. input.id is forgeable: it flows straight from the client component InventoryRowActions -> updateSupplierAction({ id: row.id }, ...) (inventory-row-actions.tsx:190) as a plain server-action argument; the serv
- **fix:** In src/features/inventory/actions.ts, add the import `import { requireOrgId } from "@/features/auth/require-org";` (the `and` and `eq` operators are already imported on line 4). Then in updateSupplierAction, after requirePermission, resolve the org and AND it into the WHERE:

  await requirePermission("procurement.write");
  const organizationId = await requireOrgId();
  ...
  const [row] = await db
    .update(suppliers)
    .set(emptyToNull(parsed.data) as Partial<typeof suppliers.$inferInsert

### HIGH — `archiveSupplierAction`
- **file:** `src/features/inventory/actions.ts:269`  ·  **cluster:** inventory-procurement
- **why:** Confirmed cross-org write-IDOR. The `suppliers` table has its own `organization_id` column (src/lib/db/schema/inventory.ts:59, added by migration 0153 — the schema comment at line 58 even says "nullable org anchor + backfill. No threading yet."). `archiveSupplierAction` (actions.ts:264-284) performs `UPDATE suppliers SET status='archived' WHERE id = input.id` (line 269-273) with NO organization predicate. The only upstream guard is `requirePermission("procurement.write")`, which is a role/permission boolean check (src/features/auth/permissions.ts:103-110) — it returns a ctx carrying `organizat
- **fix:** Scope the write to the caller's org. Import `requireOrgId` (from "@/features/auth/require-org") and `and` (already imported from drizzle-orm), then constrain the WHERE clause:

export async function archiveSupplierAction(input: IdActionInput): Promise<ActionResult> {
  await requirePermission("procurement.write");
  const organizationId = await requireOrgId();
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  co

### HIGH — `updateInventoryLocationAction (l.288) + archiveInventoryLocationAction (l.322)`
- **file:** `src/features/inventory/actions.ts`  ·  **cluster:** inventory-procurement
- **why:** inventory_locations has an organization_id column (schema l.91, migration 0153 — "org anchor, no threading yet"), so it is a genuine tenant table, not platform-global. Both actions guard only with requirePermission("inventory.write"), which checks role-permission and never compares the target row's org to the caller's org. input.id is a raw client-supplied {id:string} (IdActionInput l.224) passed straight into where(eq(inventoryLocations.id, input.id)) with NO org predicate — it is not derived from any org-scoped query, and server actions are directly invokable so UI filtering is moot. getCurr
- **fix:** Scope both writes to the caller's org. Import requireOrgId (from "@/features/auth/require-org") and `and` is already imported (drizzle-orm, l.4).

updateInventoryLocationAction (after the db null-check):
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const [row] = await db
    .update(inventoryLocations)
    .set(emptyToNull(parsed.data) as Partial<typeof inventoryLocations.$inferInsert>)
    .where(and(eq(inventoryLocations.id, input.id), eq(inventoryLo

### HIGH — `updateInventoryItemAction (l.404, UPDATE l.422) / archiveInventoryItemAction (l.456, UPDATE l.461)`
- **file:** `src/features/inventory/actions.ts:422`  ·  **cluster:** inventory-procurement
- **why:** Confirmed cross-org write-IDOR. inventory_items has its own organization_id (schema/inventory.ts:141, org index inv_items_org_idx). Both actions guard only with requirePermission("inventory.write"), which checks the role permission and returns a CurrentUserContext that the action discards; it does NOT scope to the caller's org. input.id is IdActionInput={id:string} (l.224), a raw client-supplied value — the caller inventory-row-actions.tsx:195/207 passes {id: row.id} straight into the server action (a public network endpoint), and the id is NOT derived from any org-scoped query inside the acti
- **fix:** Scope both writes to the caller's org. At top of each action capture the org and add it to the WHERE so a foreign id matches zero rows (the existing `if (!row) return {ok:false, error:"Item not found."}` already handles the miss):

import { requireOrgId } from "@/features/auth/require-org";

// updateInventoryItemAction
await requirePermission("inventory.write");
const organizationId = await requireOrgId();
...
const [row] = await db
  .update(inventoryItems)
  .set({ /* unchanged */ })
  .where

### HIGH — `updateInventoryCountLineAction`
- **file:** `src/features/inventory/counts-actions.ts:86`  ·  **cluster:** inventory-procurement
- **why:** Real cross-org write-IDOR. `inventory_count_lines` has its own `organization_id` column (migration 0153) plus a transitive anchor via `count_id -> inventory_counts.organization_id`. The only upstream guard is `requirePermission("inventory.count.write")`, which (permissions.ts:103-110) checks the role matrix only and never compares the target row's org to the caller's `ctx.appUser.organizationId`. The action loads the line with `where(eq(inventoryCountLines.id, lineId))` (line 86-90) and updates with the same id-only predicate (line 100-107) — no org/AND clause on either statement. `lineId` is 
- **fix:** Add `import { requireOrgId } from "@/features/auth/require-org";` and `import { and } from "drizzle-orm";`. In updateInventoryCountLineAction, after requirePermission, resolve the caller org and AND it into BOTH the load and the update:

  await requirePermission("inventory.count.write");
  const organizationId = await requireOrgId();
  ...
  const [line] = await db
    .select()
    .from(inventoryCountLines)
    .where(and(
      eq(inventoryCountLines.id, parsed.data.lineId),
      eq(invento

### HIGH — `submitInventoryCountAction`
- **file:** `src/features/inventory/counts-actions.ts`  ·  **cluster:** inventory-procurement
- **why:** Confirmed cross-org write-IDOR. `inventory_counts` carries an `organization_id` anchor (schema line 414, migration 0153) and `inventory_count_lines` likewise (line 442), so there IS an org column to scope on. The action's only upstream guard is `requirePermission("inventory.count.write")` (line 116), which resolves via `hasPermission` — purely role-based, never references `organizationId` (grep found zero org references in permission-matrix). The count `id` comes directly from attacker-controlled `formData` (countIdSchema, line 117) and the load at line 123 is `eq(inventoryCounts.id, id)` with
- **fix:** Scope the load (and the writes) to the caller's org using the codebase's canonical requireOrgId() + AND-org-predicate pattern (see src/features/auth/require-org.ts). In submitInventoryCountAction: after requirePermission, add `const organizationId = await requireOrgId();` (import from "@/features/auth/require-org"). Change the count load to reject foreign counts before touching any lines/status:

  const [count] = await db
    .select()
    .from(inventoryCounts)
    .where(and(eq(inventoryCount

### HIGH — `markNotificationSentAction`
- **file:** `src/features/notifications/actions.ts`  ·  **cluster:** notifications-messaging
- **why:** Confirmed cross-org write-IDOR. notification_queue has its own organization_id column (schema/notifications.ts:35), so it is org-scoped, not platform-global, and has no transitive parent FK to anchor org elsewhere (schema comment: recipient is polymorphic, no reliable parent FK). The only upstream guard is requirePermission("notifications.manage"), which checks the permission verb and returns ctx but the action discards it and never compares org. The id is attacker-controlled: notificationIdSchema validates only z.string().uuid(), and the value arrives from client FormData (notification-action
- **fix:** In markNotificationSentAction, resolve the caller's org and AND it into both the select and the update where-clauses (TENANT-1 pattern). After `const db = getDb();`:

```ts
import { requireOrgId } from "@/features/auth/require-org";
import { and, eq } from "drizzle-orm";

const organizationId = await requireOrgId();

const [before] = await db
  .select()
  .from(notificationQueue)
  .where(and(
    eq(notificationQueue.id, parsed.data.id),
    eq(notificationQueue.organizationId, organizationId)

### HIGH — `markNotificationFailedAction`
- **file:** `src/features/notifications/actions.ts`  ·  **cluster:** notifications-messaging
- **why:** Confirmed cross-org write-IDOR. notificationQueue HAS a real per-row org column (organizationId, schema line 35, migration 0151, index nq_org_idx) — not platform-global. The action takes a caller-supplied UUID via notificationIdSchema ({ id: uuid } only, no org binding) posted from the client (notification-actions.tsx sets fd `id`). The load (actions.ts:77-81) filters only by eq(notificationQueue.id, id) and the UPDATE (84-87, status='failed'/failedAt/errorMessage) filters only by eq(id) — neither WHERE includes organizationId. The sole upstream guard is requirePermission('notifications.manage
- **fix:** Scope both the load and the update to the caller's org. Add `import { requireOrgId } from "@/features/auth/require-org";` (already imported) and `and` (already imported). In markNotificationFailedAction, after requirePermission:

  const organizationId = await requireOrgId();
  ...
  const [before] = await db
    .select()
    .from(notificationQueue)
    .where(and(
      eq(notificationQueue.id, parsed.data.id),
      eq(notificationQueue.organizationId, organizationId),
    ))
    .limit(1);


### HIGH — `cancelNotificationAction`
- **file:** `src/features/notifications/actions.ts`  ·  **cluster:** notifications-messaging
- **why:** Confirmed cross-org write-IDOR. The notification_queue table HAS an org anchor (organizationId column, schema/notifications.ts:35, backfilled to a real org via migration 0151). In cancelNotificationAction (actions.ts:103-128) the only upstream guard is requirePermission("notifications.write"), which (permissions.ts:103) merely checks the caller's role carries that permission and returns the user context — the action discards ctx.organizationId. The id comes straight from client-controlled FormData (notification-actions.tsx:29 `fd.set("id", id)`) into notificationIdSchema and is used raw: UPDAT
- **fix:** Scope the UPDATE to the caller's org. In cancelNotificationAction, after requirePermission, resolve the org and add it to the where clause:

  await requirePermission("notifications.write");
  const organizationId = await requireOrgId();
  ...
  const res = await db
    .update(notificationQueue)
    .set({ status: "cancelled" })
    .where(and(
      eq(notificationQueue.id, parsed.data.id),
      eq(notificationQueue.organizationId, organizationId),
    ))
    .returning({ id: notificationQueu

### HIGH — `requeueNotification (engine behind retryNotificationAction, actions.ts:257-277)`
- **file:** `src/features/notifications/delivery.ts`  ·  **cluster:** notifications-messaging
- **why:** Confirmed cross-org write-IDOR. notification_queue IS org-anchored (organization_id at schema notifications.ts:35, plus nq_org_idx) so the "no org column" kill does not apply. The id flows from raw client FormData: RetryNotificationButton (queue-actions.tsx:74-76) -> retryNotificationAction (actions.ts:257) -> queueIdSchema validates only z.string().uuid() (a shape check, not an org check). The only upstream guard is requirePermission("notifications.manage"), which is purely role-based (permissions.ts:103-110): it returns the caller's own org but never compares it to the target row's org. requ
- **fix:** Thread the caller's org through both the requeue and the redelivery, and refuse foreign rows. (1) In actions.ts retryNotificationAction, derive const organizationId = await requireOrgId(); after requirePermission, and pass it down. (2) Change requeueNotification(notificationId) -> requeueNotification(notificationId, organizationId) and AND the org predicate into BOTH the select and the update: .where(and(eq(notificationQueue.id, notificationId), eq(notificationQueue.organizationId, organizationI

### HIGH — `testMarketingConnectionAction`
- **file:** `src/lib/marketing/connection-actions.ts`  ·  **cluster:** notifications-messaging
- **why:** Confirmed cross-org write-IDOR. marketing_connections has a notNull organization_id column (p4-marketing.ts:43), so it is org-scoped, not platform-global. The action (line 306) gates only on requirePermission("marketing.read"), which is a pure role yes/no check (permissions.ts:103-110) — it never consults the caller's organizationId. connectionId is a raw, attacker-controlled server-action argument; the lookup at lines 321-324 filters by eq(id, connectionId) alone with NO organizationId predicate, and the id is NOT derived from any upstream org-scoped query. An operator in org A can pass org B
- **fix:** Anchor the action to the caller's org. Add the import `import { requireOrgId } from "@/features/auth/require-org";`, then at the top of testMarketingConnectionAction resolve and enforce org on both the load and every write:

  await requirePermission("marketing.read");
  const db = requireDb();
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  const [row] = await db
    .select()
    .from(marketingConnections)
    .where(and(
      eq(marketingConnections

### HIGH — `disconnectMarketingConnectionAction`
- **file:** `src/lib/marketing/connection-actions.ts`  ·  **cluster:** notifications-messaging
- **why:** Confirmed real cross-org write-IDOR. (1) marketing_connections owns a notNull organization_id FK column (p4-marketing.ts:43) — not platform-global, not a transitive anchor. (2) The only guard is requirePermission("marketing.write"), which is purely role-based (hasPermissionImpl(ctx, permission)) and never compares the row's org to the caller's org — an operator with marketing.write in org A passes regardless of the target's org. (3) connectionId is client-controlled: the caller src/components/marketing/connection-actions-buttons.tsx is a "use client" component that takes connectionId as a prop
- **fix:** Scope both the load and the update to the caller's org. In disconnectMarketingConnectionAction:

  import { requireOrgId } from "@/features/auth/require-org";

  export async function disconnectMarketingConnectionAction(args: {
    connectionId: string;
    reason?: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    await requirePermission("marketing.write");
    const organizationId = await requireOrgId();
    const db = requireDb();
    const me = await getCurrentAppUser(

### HIGH — `generateTaskFromPlan (reached via acceptMaintenanceWindowSuggestionAction:276 / generateMaintenanceTaskFromPlanAction:435 / generateDueMaintenanceTasksAction:468)`
- **file:** `src/features/maintenance-intelligence/actions.ts:345`  ·  **cluster:** operations-maint
- **why:** Confirmed cross-org write-IDOR with no upstream org guard. generateTaskFromPlan loads the plan by primary key only — `.where(eq(villaMaintenancePlans.id, planId))` — with no organization predicate, then INSERTs an operation_tasks row and (conditionally) a villa_calendar_blocks row using plan.organizationId, and UPDATEs the plan's next_due_at/lastGeneratedTaskId. villaMaintenancePlans.organizationId is NOT NULL (migration 0155 cutover) and maintenanceWindowSuggestions.organizationId is NOT NULL, so the rows land in org B. The planId/suggestion id is client-controlled: PlanActionBar and Suggesti
- **fix:** Resolve the caller's org once and refuse foreign-org plans/suggestions before any write. (1) In generateTaskFromPlan, accept an expectedOrgId param and AND it into the plan load: `const [plan] = await db.select().from(villaMaintenancePlans).where(and(eq(villaMaintenancePlans.id, planId), eq(villaMaintenancePlans.organizationId, expectedOrgId))).limit(1); if (!plan) return { ok:false, reason:"plan not found" };` — and add the same `eq(...organizationId, expectedOrgId)` predicate to the final next

### HIGH — `approveStayCheckinAction`
- **file:** `src/features/checkins/mgmt-actions.ts`  ·  **cluster:** operations-maint
- **why:** Concrete cross-org write path with no upstream org guard. The action is a "use server" function taking bookingId straight from the client (checkin-approve-button.tsx:33). The only guard is canManageEntity("booking") which maps to the verb permission bookings.write (permissions.ts:130) via hasPermissionImpl — it never compares the caller's org. The checkins table has no org column (anchors via bookings.organizationId, NOT NULL) and is loaded by eq(checkins.bookingId, bookingId) only (line 34). The action then issues a physical smart-lock door code (createOrGetStubSmartLockCode, which also loads
- **fix:** Anchor every read and write to the caller's org. At the top after the permission check: `const organizationId = await requireOrgId();` (import from "@/features/auth/require-org"). Load and validate the booking's org BEFORE touching the checkin or door code, and AND the org into the checkin load and the bookings update. Concretely:

import { requireOrgId } from "@/features/auth/require-org";

const organizationId = await requireOrgId();

// Validate the booking belongs to the caller's org up fron

### HIGH — `completeCheckinAction`
- **file:** `src/features/front-office/checkin-actions.ts`  ·  **cluster:** operations-maint
- **why:** Confirmed cross-org write-IDOR. The only guard is canManageEntity("booking") (line 24) which resolves to hasPermissionImpl(ctx, "bookings.write") — a pure permission/verb flag with NO comparison to the target booking's organizationId. Both target tables have a real org anchor: bookings.organizationId is NOT NULL (schema line 72) and booking_checkin_flow carries organizationId. The action loads the parent booking by id only (`.where(eq(bookings.id, input.bookingId))`, line 36) and then UPDATEs bookings.status -> 'checked_in' by id only (`.where(eq(bookings.id, input.bookingId))`, line 61), and 
- **fix:** Anchor every booking read/write to the caller's org. Add `import { and, eq } from "drizzle-orm";` and `import { requireOrgId } from "@/features/auth/require-org";`. In completeCheckinAction, after the canManageEntity guard:

  const organizationId = await requireOrgId();

Scope the parent lookup so a foreign booking is invisible:

  const [parent] = await db
    .select({ organizationId: bookings.organizationId })
    .from(bookings)
    .where(and(eq(bookings.id, input.bookingId), eq(bookings.o

### HIGH — `captureGuestIdAction`
- **file:** `src/features/checkins/id-capture-actions.ts`  ·  **cluster:** operations-maint
- **why:** Concrete cross-org mutation path with no upstream org guard. (1) `canManageEntity("booking")` (line 39) only checks the role-based `bookings.write` permission — it never binds the actor to the target booking (permissions.ts:112-137). (2) `requireOrgId()` (line 42) returns the ATTACKER's own org, not the booking's. (3) The booking is loaded by `.where(eq(bookings.id, bookingId))` (lines 53-57) with NO organizationId filter, even though `bookings` HAS an organization_id column (bookings.ts:72) — the anchor exists but is unused. (4) `bookingId` is a client-controlled hidden form input (guest-id-r
- **fix:** Scope the booking lookup to the caller's org and bail before any write. In captureGuestIdAction, move `const orgId = await requireOrgId();` above the booking select (it already is) and change the query to:

  const [bk] = await db
    .select({ id: bookings.id, guestId: bookings.guestId })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.organizationId, orgId)))
    .limit(1);
  if (!bk) return { ok: false, error: "Booking not found." };

(add `and` to the drizzle-orm i

### HIGH — `editOperationTaskAction (same defect cluster: updateOperationTaskStatusAction:136, assignOperationTaskAction:191, approveOperationTaskAction:231, archiveOperationTaskAction:1006)`
- **file:** `src/features/operations/actions.ts:931`  ·  **cluster:** operations-maint
- **why:** operation_tasks has its own organization_id column (schema line 60, indexed line 93, migration 0149) and it is the sole tenant boundary — proven by the read side: getOperationTaskById (services.ts:229-234) and listOperationTasks (services.ts:193) both AND eq(operationTasks.organizationId, organizationId). editOperationTaskAction drops it entirely: the load (lines 951-955) is .where(eq(operationTasks.id, d.id)) and the UPDATE (lines 961-984) is .where(eq(operationTasks.id, d.id)) — neither constrains organizationId. d.id is an attacker-controlled raw FormData field parsed by editOperationTaskSc
- **fix:** In every operation_tasks write action, resolve the caller's org and AND it into BOTH the load-by-id and the UPDATE WHERE, mirroring getOperationTaskById. For editOperationTaskAction (line 931):

  import { and, eq } from "drizzle-orm";
  // after requirePermission("operations.write"):
  const organizationId = await requireOrgId();
  ...
  const [before] = await db
    .select()
    .from(operationTasks)
    .where(and(eq(operationTasks.id, d.id), eq(operationTasks.organizationId, organizationId)

### HIGH — `postMgmtThreadReplyAction`
- **file:** `src/features/owner-portal/mgmt-thread-actions.ts:173`  ·  **cluster:** owner-investor-buyer-portal-writes
- **why:** Confirmed cross-org write-IDOR. owner_threads carries a REAL org anchor: organization_id NOT NULL FK to organizations.id, added in drizzle/0152_tenancy_portal_org_columns.sql:27, backfilled (line 294), set NOT NULL in 0158_tenancy_portal_org_notnull.sql:23, and declared in the schema (src/lib/db/schema/owner-threads.ts). The stale TODO at mgmt-threads.ts:17-22 ("owner_threads has no organization_id") is factually wrong. The action takes threadId as a raw client argument (validated only as a UUID), then runs the existence check (line 198, eq(ownerThreads.id, threadId)) and BOTH mutations — inse
- **fix:** Scope every owner_threads access to the caller's org. At the top of postMgmtThreadReplyAction (after the auth + UUID + body validation), add: `const organizationId = await requireOrgId();` (import requireOrgId from "@/features/auth/require-org"; import and/eq from drizzle-orm). Then AND the org into the existence check and BOTH mutations:

  const [exists] = await db
    .select({ id: ownerThreads.id })
    .from(ownerThreads)
    .where(and(eq(ownerThreads.id, threadId), eq(ownerThreads.organiz

### HIGH — `setOwnerThreadStatusAction`
- **file:** `src/features/owner-portal/mgmt-thread-actions.ts`  ·  **cluster:** owner-investor-buyer-portal-writes
- **why:** Confirmed cross-org write-IDOR. owner_threads has a real NOT NULL org anchor (organizationId, migration 0152/0158). The only upstream guard is canManageEntity("owner") which resolves to hasPermission(ctx, "owners.write") — a pure role/verb check with zero org binding (permissions.ts:112-137). The mutation at lines 261-265 sets status filtered solely by eq(ownerThreads.id, threadId); there is NO organizationId predicate. The .returning({id}) only proves the row exists globally, not that it is in-tenant, so it returns ok:true for a foreign thread. threadId is not derived from any org-scoped quer
- **fix:** In setOwnerThreadStatusAction, resolve the caller's org and AND it into the update WHERE clause. Add `import { requireOrgId } from "@/features/auth/require-org";` and `and` to the drizzle-orm import. After the db null-check:

  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const updated = await db
    .update(ownerThreads)
    .set({ status: parsedStatus.data, updatedAt: new Date() })
    .where(and(
      eq(ownerThreads.id, threadId),
      eq(ownerThre

### HIGH — `bulkOwnerStatusAction`
- **file:** `src/features/owners/bulk-actions.ts:57`  ·  **cluster:** owners-shares
- **why:** Confirmed cross-org write-IDOR. The `owners` table has its own `organizationId` column (schema/ownership.ts:22, migration 0173), so org-scoping is required. The write at line 57 is `db.update(owners).set({status,updatedAt}).where(inArray(owners.id, ids))` — filtered by id only, no org predicate. The single upstream guard, `canManageEntity("owner")` (permissions.ts:136), is purely role-based: it returns `hasPermissionImpl(ctx, "owners.write")` and never references the caller's org or the targeted rows' org. `ids` is fully attacker-controlled (bulkStatusSchema only validates UUID/min1/max500; no
- **fix:** Org-scope the UPDATE and report the true affected count from the row set so cross-org ids are silently filtered rather than trusted. In src/features/owners/bulk-actions.ts:

1. Add imports: `import { and, eq, inArray } from "drizzle-orm";` and `import { requireOrgId } from "@/features/auth/require-org";`.

2. In bulkOwnerStatusAction, after the db null-check, derive the org and scope the write:

   const organizationId = await requireOrgId();
   const me = await getCurrentAppUser();
   const upd

### HIGH — `updateOwnerAction`
- **file:** `src/features/owners/actions.ts`  ·  **cluster:** owners-shares
- **why:** Real cross-org write-IDOR. `owners` has its own org anchor `organizationId` (migration 0173; schema ownership.ts:22 — "Owners are org-scoped only through this column"). `updateOwnerAction` takes `id` from `formData.get("id")` (an attacker-controllable hidden form field in form.tsx:45, validated only as a UUID), then SELECTs with `eq(owners.id, id.data)` (line 249) and UPDATEs with `eq(owners.id, id.data)` (line 264) — no org predicate on either. The only upstream guard is `canManageEntity('owner')` → `hasPermission(ctx, "owners.write")`, which is purely role-based (permission-matrix.ts:1322: `
- **fix:** Resolve the caller's org and AND it into both the SELECT and the UPDATE, mirroring getOwnerById/createOwnerAction. In updateOwnerAction, add `import { and } from "drizzle-orm"` is already present. After `const me = await getCurrentAppUser();`:

  const organizationId = await requireOrgId();
  const [before] = await db
    .select()
    .from(owners)
    .where(and(eq(owners.id, id.data), eq(owners.organizationId, organizationId)))
    .limit(1);
  if (!before) return { ok: false, error: "Owner n

### HIGH — `transition (archiveOwnerAction / unarchiveOwnerAction)`
- **file:** `src/features/owners/actions.ts:293`  ·  **cluster:** owners-shares
- **why:** Confirmed cross-org write-IDOR. The owners table has its own org anchor (owners.organization_id, migration 0173, schema line 22). transition() takes a client-controlled id (row.id from owners-row-actions.tsx -> FormData, validated only as a UUID by idSchema), loads via db.select().where(eq(owners.id, id)) with NO org predicate, then mutates via db.update(owners).set({status}).where(eq(owners.id, id)) — again no org predicate. The only upstream guard is canManageEntity('owner'), which checks the caller's owners.write permission against their own getCurrentUserContext; it never compares the call
- **fix:** Thread the caller's org into transition() and AND it into both the load and the update. requireOrgId is already imported (line 14). Change the signature/body to:

async function transition(id, next, action) {
  if (!(await canManageEntity("owner"))) return { ok: false, error: "Not authorised." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const [before] = awa

### HIGH — `assignCategoryAction`
- **file:** `src/lib/banking/bookkeeper-actions.ts:53`  ·  **cluster:** payments-banking
- **why:** Confirmed cross-org write-IDOR. (1) bank_transactions owns an organization_id column (schema/banking.ts:111) — a real org anchor that must be enforced, not a child table that inherits scoping. (2) No RLS backstop: the Drizzle/postgres-js client (src/lib/db/client.ts) connects with a static DATABASE_URL via the Supabase/Supavisor transaction pooler and never sets per-request session context (grep found zero set_config / request.jwt.claims / SET LOCAL anywhere in src/lib/db or src/features/auth — "RLS via is_in_user_organization()" exists only in schema doc-comments and is never wired to this cl
- **fix:** Scope the UPDATE to the caller's org. In assignCategoryAction, after zod parse, resolve and AND the org:

  import { and, eq } from "drizzle-orm";
  ...
  const orgId = await resolveActiveOrgId(); // already defined in this file (wraps requireOrgId)
  const user = await getCurrentAppUser();
  const db = requireDb();
  await db
    .update(bankTransactions)
    .set({
      categoryId: parsed.data.categoryId,
      manuallyCategorized: true,
      categorizedBy: user?.id ?? null,
      categorize

### HIGH — `ignoreTransactionAction`
- **file:** `src/lib/banking/bookkeeper-actions.ts:121`  ·  **cluster:** payments-banking
- **why:** Confirmed cross-org write-IDOR. bank_transactions has its own NOT NULL organization_id (schema/banking.ts:111). ignoreTransactionAction (lines 121-141) runs UPDATE bank_transactions SET match_status='ignored' WHERE eq(bankTransactions.id, id) with NO org predicate. The id is read raw from formData.get("bankTransactionId") (server actions are POST endpoints — the client controls the full FormData; the page's org-scoped read query listBankTransactionsForUi does NOT bind the write), validated only as a zod uuid. No requireOrgId/requirePermission/getCurrentAppUser is called in the action. The only
- **fix:** Scope the UPDATE to the caller's org. In ignoreTransactionAction, resolve the active org and AND it into the WHERE clause:

  import { and, eq } from "drizzle-orm";
  ...
  const orgId = await resolveActiveOrgId();
  const db = requireDb();
  await db
    .update(bankTransactions)
    .set({ matchStatus: "ignored", updatedAt: new Date() })
    .where(
      and(
        eq(bankTransactions.id, parsed.data.bankTransactionId),
        eq(bankTransactions.organizationId, orgId),
      ),
    );

re

### HIGH — `testBankConnectionAction`
- **file:** `src/lib/banking/connection-actions.ts:229`  ·  **cluster:** payments-banking
- **why:** Confirmed cross-org write-IDOR with no upstream org guard. (1) bank_connections has a real NOT NULL organization_id FK column (src/lib/db/schema/banking.ts:45), so it IS org-scoped — not a platform-global table. (2) testBankConnectionAction is a "use server" server action (directly invokable on the wire), not an internal helper. Its only guard is requirePermission("banking.read"), which getCurrentUserContext/hasPermission resolve as a ROLE/VERB check only — it never scopes by org. There is no requireOrgId() in this path. (3) The connection is loaded by eq(bankConnections.id, args.connectionId)
- **fix:** In testBankConnectionAction, import requireOrgId (already used by the payments sibling) and AND-scope the org into the load and every UPDATE — mirroring payment-processors/connection-actions.ts. Concretely:

  import { requireOrgId } from "@/features/auth/require-org";
  ...
  await requirePermission("banking.read");
  const orgId = await requireOrgId();
  const db = requireDb();
  const me = await getCurrentAppUser();

  const [row] = await db
    .select()
    .from(bankConnections)
    .where

### HIGH — `disconnectBankConnectionAction`
- **file:** `src/lib/banking/connection-actions.ts`  ·  **cluster:** payments-banking
- **why:** Confirmed cross-org write-IDOR. bank_connections has a NOT NULL organization_id FK (schema/banking.ts:45). disconnectBankConnectionAction (connection-actions.ts:326) guards only with requirePermission("banking.write") — a baseline operator permission that resolves roles by auth.id and performs NO org binding. The action never reads ctx.appUser.organizationId; both the SELECT (line 334) and the status='archived' UPDATE (line 344) filter solely by eq(bankConnections.id, args.connectionId). connectionId is passed raw from the client component (connection-actions-buttons.tsx:89), not derived from 
- **fix:** Mirror the payment-connection twin: resolve the caller's org and AND it into both the load and the UPDATE. In disconnectBankConnectionAction, after `await requirePermission("banking.write")` add `const orgId = await requireOrgId();` (import requireOrgId from "@/features/auth/require-org"). Change the SELECT to `.where(and(eq(bankConnections.id, args.connectionId), eq(bankConnections.organizationId, orgId)))` so a foreign-org id returns null → "Connection not found." Change the UPDATE to `.where(

### HIGH — `add an upstream org-ownership guard on the caller-supplied threadId before dispatch, and AND organization_id into the conversation_threads UPDATE`
- **file:** `src/features/ai-agents/inbox-draft-actions.ts`  ·  **cluster:** payroll-jobs-agents
- **why:** Confirmed cross-org write-IDOR. sendInboxReplyAction (line 263) takes a caller-supplied threadId, resolves the caller's OWN org via requireOrgId() (which derives organizationId from the authenticated appUsers session, not from input — so org is trustworthy but threadId is attacker-controlled), and passes both straight into sendOutboundMessage({organizationId: orgId, threadId}) with NO check that the thread belongs to orgId. sendOutboundMessage (src/lib/messaging/service.ts:229-245) inserts an outbound conversation_messages row stamped with the CALLER's organizationId onto the foreign threadId,
- **fix:** In sendInboxReplyAction, after `orgId = await requireOrgId()` and before calling sendOutboundMessage, load the thread and reject any org mismatch (getThreadById already returns the full row including organizationId):

  const thread = await getThreadById(parsed.data.threadId);
  if (!thread || thread.organizationId !== orgId) {
    return { ok: false, error: "Thread not found." };
  }

getThreadById is already imported in this file. Add it to the existing import or reuse the line-40 import. Then

### HIGH — `deleteDocumentAppAction`
- **file:** `src/features/documents/app-actions.ts:104`  ·  **cluster:** security-auth-team-docs
- **why:** Confirmed cross-org write-IDOR. The `documents` table has a real per-row org anchor `organizationId` (migration 0151). The only upstream guard, `canManageEntity('document')`, resolves to `hasPermission(ctx, 'documents.write')`, which is verb-only — it checks role membership and short-circuits true for super_admin/demo, but NEVER compares the target document's org to the caller's. `guard()` does call `requireOrgId()`, but that returns the caller's SESSION org (`ctx.appUser.organizationId`), independent of the document; that value is never threaded into the query. The action is a public `"use se
- **fix:** Bind the document to the caller's session org on both the load and the delete. In deleteDocumentAppAction, change the pre-load to project + filter on org, and AND the org into the delete:

  const [before] = await db
    .select({ title: documents.title })
    .from(documents)
    .where(and(eq(documents.id, id.data), eq(documents.organizationId, g.organizationId)))
    .limit(1);
  if (!before) return { ok: false, error: "Document not found." };

  await db
    .delete(documents)
    .where(and

### HIGH — `markDocumentSignedAction`
- **file:** `src/features/documents/app-actions.ts`  ·  **cluster:** security-auth-team-docs
- **why:** Confirmed cross-org write-IDOR. The `documents` table HAS an org anchor (`organization_id`, migration 0151; schema line 26). `markDocumentSignedAction` is a `"use server"` action whose only authz is `guard()` -> `canManageEntity("document")`, which is purely verb-based: it checks the caller's `documents.write` permission against role keys (permissions.ts:112-137) and is NOT bound to any document row or org. The before-load selects only `signedAt` with `where(eq(documents.id, id.data))` (line 64-68, no org) and the mutation `db.update(documents).set({signedAt}).where(eq(documents.id, id.data))`
- **fix:** Resolve the org up front in guard() (already available as g.organizationId) and both check the loaded row's org and AND the org into the update WHERE. Concretely, replace the before-load + update in markDocumentSignedAction with:

  const [before] = await db
    .select({ signedAt: documents.signedAt, organizationId: documents.organizationId })
    .from(documents)
    .where(eq(documents.id, id.data))
    .limit(1);
  if (!before) return { ok: false, error: "Document not found." };
  if (before

### HIGH — `markCountersignedAction`
- **file:** `src/features/documents/app-actions.ts:243`  ·  **cluster:** security-auth-team-docs
- **why:** Real cross-org write-IDOR. Both document_signature_requests and documents carry a real organization_id anchor (migration 0151). The only upstream guard is guard() -> canManageEntity("document"), which is verb-only (checks documents.write permission, no org); requireOrgId() resolves g.organizationId but the value is never used in this action. The signature request is loaded by raw eq(documentSignatureRequests.id, id.data) with NO org filter, and requestId comes straight from client input (server action: the UI's org-scoped sig.id list does not constrain what an attacker can POST — any UUID is a
- **fix:** Thread g.organizationId into both the lookup and both updates. Replace the unscoped select with one that filters by org (and join/verify the document's org too):

  const [req] = await db
    .select()
    .from(documentSignatureRequests)
    .where(and(
      eq(documentSignatureRequests.id, id.data),
      eq(documentSignatureRequests.organizationId, g.organizationId),
    ))
    .limit(1);
  if (!req) return { ok: false, error: "Signature request not found." };

Then AND the org into the requ

### HIGH — `archiveDocumentAction (via transition)`
- **file:** `src/features/documents/actions.ts`  ·  **cluster:** security-auth-team-docs
- **why:** Confirmed cross-org write-IDOR. The documents table HAS an org column (organizationId, migration 0151 — nullable, backfilled, indexed; schema comment literally says "Not query-threaded yet"), so foreign-org documents coexist as distinct rows. transition() (actions.ts:74-96), the body behind archiveDocumentAction (line 98-105), takes id straight from formData.get("id") validated only as a UUID — it is NOT derived from any org-scoped query. The only guard, canManageEntity("document"), is a pure verb check: it maps to hasPermissionImpl(ctx,"documents.write") and never resolves or compares an org 
- **fix:** Resolve the caller's org and scope both the load and the update by it. In transition() (src/features/documents/actions.ts), after the auth check add `const organizationId = await requireOrgId();` (requireOrgId is already imported on line 11), then AND the org into both statements:

  const [before] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.organizationId, organizationId)))
    .limit(1);
  if (!before) return { ok: false, error: "Document not

### HIGH — `updateSecurityCameraDeviceAction`
- **file:** `src/features/security/actions.ts`  ·  **cluster:** security-auth-team-docs
- **why:** Confirmed cross-org write-IDOR. The table security_camera_devices has a NOT NULL organization_id column (availability.ts:268-270, FK to organizations.id) — it is org-scoped, not platform-global. The update at actions.ts:104-121 does `db.update(securityCameraDevices).set({...}).where(eq(securityCameraDevices.id, parsed.data.id))` with NO organizationId predicate and NO load-then-check. parsed.data.id is free-form client input: updateCameraDeviceSchema only validates `id: z.string().uuid()` (schema.ts:147) straight from formData — it is NOT derived from any org-scoped query. The sole upstream gu
- **fix:** Scope both write actions by organizationId, mirroring getSecurityCameraDeviceById in security/services.ts.

In updateSecurityCameraDeviceAction (actions.ts), after the db null-check add:
  const organizationId = await requireOrgId();
and change the write to detect cross-org misses:
  const [updated] = await db
    .update(securityCameraDevices)
    .set({ /* ...existing set... */ })
    .where(and(
      eq(securityCameraDevices.id, parsed.data.id),
      eq(securityCameraDevices.organizationId,

### HIGH — `archiveSecurityCameraDeviceAction`
- **file:** `src/features/security/actions.ts`  ·  **cluster:** security-auth-team-docs
- **why:** Confirmed cross-org write-IDOR. The action (actions.ts:139-165) reads the device id straight from client formData (String(formData.get("id"))) and runs db.update(securityCameraDevices).set({status:'archived'}).where(eq(securityCameraDevices.id, id)) with NO organization predicate. The table security_camera_devices has a NOT NULL organization_id column (schema/availability.ts:268-270) and is tenant-scoped (the sibling create action stamps organizationId via requireOrgId()), so it is not platform-global. The only gate is requirePermission("security.manage"), which is verb-only: requirePermission
- **fix:** Scope the update WHERE clause to the caller's org. In archiveSecurityCameraDeviceAction, after the db null-check add: const organizationId = await requireOrgId(); then change the where predicate to: .where(and(eq(securityCameraDevices.id, id), eq(securityCameraDevices.organizationId, organizationId))). Import `and` from "drizzle-orm" (currently only `eq` is imported). The existing `if (!row) return { ok: false, error: "Camera not found." };` then correctly fails closed on a foreign id since .ret

### HIGH — `revokeMfaFactorAsAdmin (exposed via mfa-actions.ts revokeMfaFactorAction, mounted on /dashboard/security/mfa via RevokeMfaFactorButton)`
- **file:** `src/features/security-baseline/mfa-services.ts:307`  ·  **cluster:** security-auth-team-docs
- **why:** Confirmed cross-org write-IDOR. auth_mfa_factors and auth_mfa_recovery_codes both carry organizationId (security.ts:33,74), and every factor also anchors to an org transitively via app_user_id -> app_users.organization_id (identity.ts:50, NOT NULL). revokeMfaFactorAsAdmin (line 312-316) loads the factor by factorId with NO org predicate, then update status='revoked' on the factor (319-322) + revokes that user's active recovery codes (323-331). The only upstream guard is requirePermission('mfa.manage') in revokeMfaFactorAction (mfa-actions.ts:207), and mfa.manage = ['super_admin','director'] (p
- **fix:** Scope the admin revoke to the caller's org. In revokeMfaFactorAsAdmin, accept the caller's organizationId and AND it into the factor load so foreign factors are invisible/rejected; also scope the recovery-code revoke by org (or by the loaded factor's appUserId after the org-checked load). Concretely: change the signature to revokeMfaFactorAsAdmin(input: { factorId: string; organizationId: string }) and the load to `.where(and(eq(authMfaFactors.id, input.factorId), eq(authMfaFactors.organizationI

### HIGH — `inviteOwnerToPortalAction`
- **file:** `src/features/team/actions.ts:1143`  ·  **cluster:** security-auth-team-docs
- **why:** Confirmed cross-org write-IDOR with no upstream guard. The only gate is requirePermission("owner_access.manage") (permissions.ts:103) which is verb-only — it calls hasPermissionImpl(ctx, permission) and returns; it never binds the permission to a resource or org. ownerId is untrusted client input (ownerInviteSchema: z.string().uuid()); this is a server action so the UI passing ctx.ownerId is irrelevant. The owner load (lines 1143-1148) filters ONLY eq(owners.id, data.ownerId) with NO org predicate, even though owners.organizationId now exists (migration 0173 / ownership.ts:22) — the inline com
- **fix:** In inviteOwnerToPortalAction, scope the owner load to the caller's org so a foreign ownerId cannot seed a cross-org invite/grant or leak the foreign owner's email. Change the SELECT (lines 1143-1148) from:

  const owner = await db
    .select({ id: owners.id, email: owners.email, displayName: owners.displayName })
    .from(owners)
    .where(eq(owners.id, data.ownerId))
    .limit(1)
    .then((rows) => rows[0]);

to:

  const owner = await db
    .select({ id: owners.id, email: owners.email, 

### HIGH — `updateVillaAction`
- **file:** `src/features/villas/actions.ts`  ·  **cluster:** villas-projects-pricing
- **why:** Real cross-org write-IDOR. updateVillaAction (actions.ts:103-175) gates only on canManageEntity("villa"), which is verb-only: permissions.ts:112-137 maps it to villas.write via hasPermissionImpl with no org/project/owner/grant predicate. The villa id comes from client-controlled FormData (form.tsx:55 emits `<input type="hidden" name="id">`; line 110 parses it as a bare UUID), so it is NOT derived from any org-scoped query. Both DB ops use bare eq(villas.id, id.data): the before SELECT (line 128) and the UPDATE (line 150). villas has no own organization_id (schema/projects.ts: only projectId NO
- **fix:** Scope both the load and the update to the caller's org through the villas->projects join (treat cross-org as "Villa not found"), and validate the incoming projectId belongs to the same org so a villa cannot be moved into another org's project. Concretely in updateVillaAction:

1. Add imports: `import { and } from "drizzle-orm";` `import { projects } from "@/lib/db/schema/projects";` `import { requireOrgId } from "@/features/auth/require-org";`

2. After `const d = parsed.data;`:
```ts
const orga

### HIGH — `transition (archiveVillaAction / unarchiveVillaAction)`
- **file:** `src/features/villas/actions.ts`  ·  **cluster:** villas-projects-pricing
- **why:** Confirmed cross-org write-IDOR. The shared `transition()` helper (actions.ts:177-200) gates only on `canManageEntity("villa")`, which (permissions.ts:112-137) checks the `villas.write` permission flag against the caller's roles and never compares the target villa's org to the caller's. The villas table has NO own organization_id (schema projects.ts:50-102) but DOES have a transitive org anchor: villas.project_id -> projects.organization_id (schema comment lines 21-23 states villas reach their org THROUGH a project) — so it is neither a platform-global table nor a table without an anchor. The i
- **fix:** Scope the villas transition() to the caller's org through the project anchor, mirroring projects/actions.ts. In src/features/villas/actions.ts add `import { and } from "drizzle-orm";` (already imports eq) and `import { requireOrgId } from "@/features/auth/require-org";` and `import { projects } from "@/lib/db/schema/projects";`. Then change the helper body:

async function transition(
  id: string,
  next: "archived" | "ready",
  action: "villa.archive" | "villa.unarchive",
): Promise<ActionResu


## MEDIUM

### MEDIUM — `updateBookingNotesAction`
- **file:** `src/features/bookings/detail-actions.ts:38 (updateBookingNotesAction)`  ·  **cluster:** bookings-direct
- **why:** Confirmed cross-org write-IDOR. updateBookingNotesAction is a Server Action whose bookingId arg is supplied directly by the client (_notes-editor.tsx:36 passes a client prop), so it is fully attacker-controlled. The only upstream guard is canManageEntity("booking") (line 30), which is a pure role check (hasPermission(ctx,"bookings.write")) with NO org binding and NO per-booking ownership check. The SELECT (lines 38-42) and the UPDATE (lines 50-53) both filter only by eq(bookings.id, bookingId) with no org predicate. The bookings table HAS a NOT NULL organizationId anchor (schema lines 72-74), 
- **fix:** Scope both queries to the caller's org. After the canManageEntity guard, add: `const organizationId = await requireOrgId();` (requireOrgId is already imported at line 18). Change the SELECT where-clause (line 41) from `.where(eq(bookings.id, bookingId))` to `.where(and(eq(bookings.id, bookingId), eq(bookings.organizationId, organizationId)))`. Change the UPDATE where-clause (line 53) from `.where(eq(bookings.id, bookingId))` to `.where(and(eq(bookings.id, bookingId), eq(bookings.organizationId, 

### MEDIUM — `addBookingGuestAction`
- **file:** `src/features/bookings/detail-actions.ts`  ·  **cluster:** bookings-direct
- **why:** Confirmed cross-org write-IDOR. `booking_guests` has an `organization_id` column (schema line 35) anchored transitively to `bookings.organization_id`. The action is reachable as a public server-action POST: the client component _guest-add.tsx passes an attacker-controlled `bookingId` straight into addBookingGuestAction (line 31). The only upstream guard, canManageEntity("booking"), resolves to a pure role check hasPermissionImpl(ctx, "bookings.write") and never compares the caller's organizationId to the booking's org. The parent load (lines 106-110) selects bookings.organizationId by `eq(book
- **fix:** Scope the parent load to the caller's org and reject cross-org bookings, then stamp the guest with the caller's org. In addBookingGuestAction, after the canManageEntity check add:

  const organizationId = await requireOrgId();

Then replace the parent load (lines 106-110) with an org-anded query:

  const [parent] = await db
    .select({ organizationId: bookings.organizationId })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.organizationId, organizationId)))
    .l

### MEDIUM — `enqueueAriPushAction`
- **file:** `src/features/channels/manager-actions.ts`  ·  **cluster:** channels-availability
- **why:** Confirmed cross-org IDOR (read + write). The only upstream guard is canManageEntity("channel") (line 59), which is a pure role/permission check (channels.write) with no org binding; getCurrentAppUser() (line 72) yields me.organizationId but it is never used to scope this action. villaId arrives as attacker-controlled FormData (z.string().uuid(), set in _ari-grid.tsx fd.set("villaId", villaId)), NOT derived from any org-scoped query. The villa read at lines 80-90 is .where(eq(villasTable.id, villaId)) with no project/org filter. The line-79 comment "org scope is enforced by RLS" is false for th
- **fix:** Add an org guard before the villa read and stamp organizationId on the insert. After resolving `me` (line 72-73), capture `const organizationId = me.organizationId;` then scope the villa lookup to the caller's org via the project join: change lines 80-90 to join villas->projects and filter `and(eq(villasTable.id, villaId), eq(projectsTable.organizationId, organizationId))` (import projects table and select projectsTable.organizationId), so a foreign villa returns no row -> existing `if (!villa) 

### MEDIUM — `transitionCashflowForecast`
- **file:** `src/lib/development/server/cashflow/cashflow-actions.ts:135`  ·  **cluster:** dev-os-money
- **why:** Real cross-org write-IDOR. cashflow_forecasts has a NOT NULL organization_id column (schema profitability-cashflow.ts:127-131, migration 0151/0157), so it is a per-org table. transitionCashflowForecast updates status (draft/active/archived/superseded) plus approvedBy/approvedAt, keyed only by eq(cashflowForecasts.id, forecastId) at line 149 — no org predicate. The sole upstream guard is requireInternalUser() (line 138), which is a role-only check (ctx.isInternal); it never binds the caller's org. The function imports requireOrgId but only generateCashflowForecast (line 75) calls it — transitio
- **fix:** Scope both the org resolution and the UPDATE where-clause to the session org, mirroring generateCashflowForecast. In src/lib/development/server/cashflow/cashflow-actions.ts add the `and` import from drizzle-orm and change transitionCashflowForecast:

export async function transitionCashflowForecast(
  input: z.input<typeof transitionSchema>,
) {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId(); // ADD
  const parsed = transitionSchema.parse(input);
  const

### MEDIUM — `setWarningStatus (via acknowledge/resolve/dismissStatementWarning), reached from applyWarningStatus in src/features/statement-transparency/actions.ts:111 and the three exported server actions acknowledge/resolve/dismissStatementWarningAction`
- **file:** `src/features/statement-transparency/warnings.ts:14`  ·  **cluster:** finance-statements
- **why:** Concrete cross-org mutation path with no tenant guard. The table statement_reconciliation_warnings has its own organization_id column (schema line 148, backfilled from the parent owner_statement), so a transitive org anchor exists. setWarningStatus (warnings.ts:24-27) UPDATEs purely on eq(id, warningId) with NO org predicate. The only upstream guard is requirePermission("statement_reconciliation.manage") in applyWarningStatus (actions.ts:115) — a role/verb check, not a tenant check; that permission is granted to ordinary org-scoped roles (director, finance_manager, accountant, super_admin per 
- **fix:** Scope the UPDATE to the caller's org. Thread requireOrgId() through the chain: in applyWarningStatus (actions.ts:111) resolve the org once (e.g. const ctx = await requirePermission("statement_reconciliation.manage"); const orgId = ctx.appUser?.organizationId) and pass it into setWarningStatus; in setWarningStatus (warnings.ts:14) accept orgId and AND it into the where clause:

  await db
    .update(statementReconciliationWarnings)
    .set(update)
    .where(and(
      eq(statementReconciliatio

### MEDIUM — `scanStatementAnomalies (called by runStatementAnomalyScanAction, src/features/finance/statement-anomaly-actions.ts:12)`
- **file:** `src/features/finance/statement-anomaly-detector.ts:73`  ·  **cluster:** finance-statements
- **why:** Confirmed cross-org write-IDOR. statement_anomalies has an org column (schema line 34), so it is a tenant-scoped table, not platform-global. The only upstream guard is requirePermission("finance.issue_statement"), which (hasPermission, permission-matrix.ts:1317-1323) checks only the caller's role keys and NEVER compares ctx.appUser.organizationId to the target statement's org. statementId is the route param [id] passed straight into the server action (page.tsx:160), and Server Actions are independently-invokable POST endpoints, so the page render path is no guard. getOwnerStatementById (servic
- **fix:** Org-scope the statement lookup in runStatementAnomalyScanAction so a foreign id returns "not found" before scanStatementAnomalies runs, mirroring getStatementById in statement-generation.ts. In src/features/finance/statement-anomaly-actions.ts:

  import { requireOrgId } from "@/features/auth/require-org";
  import { getDb } from "@/lib/db/client";
  import { and, eq } from "drizzle-orm";
  import { ownerStatements } from "@/lib/db/schema/finance";

  export async function runStatementAnomalySca

### MEDIUM — `createManualGuestReviewAction`
- **file:** `src/features/owner-intelligence/actions.ts:188`  ·  **cluster:** finance-statements
- **why:** Confirmed cross-org write-IDOR. (1) guest_reviews HAS an org column (organization_id, owner-intelligence.ts:51, nullable, "Not threaded yet") and a reachable transitive anchor via villa_id -> projects.organization_id (the #227 villas pattern). (2) villaId is attacker-supplied and only UUID-validated by createManualGuestReviewSchema; the insert (actions.ts:218-237) writes villaId verbatim, never resolves/validates the villa's org, and never stamps organizationId (left NULL). (3) The ONLY upstream guard is requirePermission("guest_review.write"), which resolves to hasPermission (permission-matri
- **fix:** Resolve and enforce the villa's org before inserting, and stamp organizationId. Concretely: (1) call const organizationId = await requireOrgId(); (from @/features/auth/require-org) at the top after parsing. (2) Look up the villa's owning org via the villa->project anchor and reject mismatches, e.g.:

  import { villas, projects } from "@/lib/db/schema/projects";
  import { and, eq } from "drizzle-orm";
  ...
  const [villa] = await db
    .select({ orgId: projects.organizationId })
    .from(vil

### MEDIUM — `generateVillaHealthSnapshot / computeVillaHealth (called by generateVillaHealthSnapshotAction actions.ts:89 and generateAllOwnerHealthSnapshotsAction actions.ts:133)`
- **file:** `src/features/owner-intelligence/health-services.ts:73`  ·  **cluster:** finance-statements
- **why:** Cross-org write-IDOR confirmed against all disqualifiers. villaId is parsed straight from formData (actions.ts:95) — attacker-controlled — and is NOT derived from any org-scoped query. The only upstream guard is requirePermission('villa_health.generate'), a pure role verb granted to super_admin/director/operations_manager/property_manager (permission-matrix.ts:845-850) with no org binding; the returned CurrentUserContext carries appUser.organizationId but the action never reads it. computeVillaHealth loads the villa via eq(villas.id, villaId) with no org predicate (health-services.ts:73-81), t
- **fix:** Scope both the villa load and the snapshot write to the caller's org via villa→project. In computeVillaHealth, resolve the org and assert the villa belongs to it; return null (not-found) on mismatch:

  import { requireOrgId } from "@/features/auth/require-org";
  import { projects } from "@/lib/db/schema/projects";
  ...
  const organizationId = await requireOrgId();
  const [villa] = await db
    .select({ id: villas.id, name: villas.name, unitCode: villas.unitCode, organizationId: projects.or

### MEDIUM — `resolveHandoffAction / acknowledgeHandoffAction (also createStaffHandoffReplyAction in replies-actions.ts)`
- **file:** `src/features/guest-ai-concierge/handoff-actions.ts`  ·  **cluster:** guest-stays-services
- **why:** Concrete cross-org write with no upstream org/owner/token guard. acknowledgeHandoffAction (line 343-363) and resolveHandoffAction (line 388-409) call only requirePermission('guest_ai.handoff.manage') — a verb-only RBAC check that returns ctx.appUser.organizationId but discards it. They then load guestAiHandoffs WHERE eq(id, parsed.data.id) with NO org filter, and UPDATE ... WHERE eq(id, parsed.data.id) with NO org filter. An internal operator in org A who knows/guesses a handoff UUID flips org B's handoff to acknowledged/resolved, and via appendSystemStatusReply (replies-actions.ts:341) insert
- **fix:** Scope every staff-side handoff mutator to the caller's org. Capture the org from the permission check and AND it into both the load and the update; reject cross-org/unbacked ids before any status flip or guest-visible reply. Concretely in handoff-actions.ts:

import { and, eq } from "drizzle-orm";
import { requireOrgId } from "@/features/auth/require-org";

For acknowledgeHandoffAction / resolveHandoffAction:
  await requirePermission("guest_ai.handoff.manage");
  const organizationId = await re

### MEDIUM — `createStaffHandoffReplyAction`
- **file:** `src/features/guest-ai-concierge/replies-actions.ts`  ·  **cluster:** guest-stays-services
- **why:** Confirmed cross-org write. The handoff target table guest_ai_handoffs has an organizationId column (schema line 188, backfilled via migration 0154), and the reply table guest_ai_handoff_replies also carries organizationId — so a direct org anchor exists. createStaffHandoffReplyAction (line 207) gates only on requirePermission("guest_ai.handoff.manage"), which is a verb-only check in the permission matrix and does NOT scope to the caller's org. The handoff is then loaded BY ID ONLY (lines 228-232: where eq(guestAiHandoffs.id, v.handoffId)) with no org filter. handoffId comes straight from formD
- **fix:** Scope the handoff load/write to the caller's org. After requirePermission, resolve the operator org and AND it into the lookup, mirroring handoff-actions.ts (handoff.organizationId, falling back to the stay token when null since the column is nullable/"not threaded yet"):

```ts
import { and, eq, sql } from "drizzle-orm";
import { requireOrgId } from "@/features/auth/require-org";
import { guestStayTokens } from "@/lib/db/schema/guest-stays";

await requirePermission("guest_ai.handoff.manage");


### MEDIUM — `setRuleStatus (pause/resume/archiveGuestJourneyRuleAction)`
- **file:** `src/features/guest-journey/actions.ts`  ·  **cluster:** guest-stays-services
- **why:** Confirmed cross-org write-IDOR. guest_journey_rules has organization_id NOT NULL (mig 0152/0158), and it is an org-anchored per-tenant table (createGuestJourneyRuleAction stamps requireOrgId()). The mutator setRuleStatus (actions.ts:104-107) runs only requirePermission("guest_journey.write"/.manage") — a verb-only role check (permissions.ts requirePermission -> hasPermission(ctx, permission), no org comparison) — then UPDATE guestJourneyRules SET status WHERE eq(id) with NO org predicate. The id is taken from formData.get("id") via a client-controlled hidden input (journey-buttons.tsx:59 `<inp
- **fix:** Scope the mutation to the caller's org. In setRuleStatus, capture the org id and add it to the UPDATE predicate, mirroring the org-stamped create path. Replace the body of setRuleStatus (actions.ts:95-117):

```ts
import { and, eq } from "drizzle-orm";
// ...
async function setRuleStatus(
  id: string,
  status: "active" | "paused" | "archived",
  permission: string,
): Promise<ActionResult> {
  await requirePermission(permission);
  const db = getDb();
  if (!db) return { ok: false, error: "Dat

### MEDIUM — `updateInventoryCategoryAction (l.363) / archiveInventoryCategoryAction (l.385)`
- **file:** `src/features/inventory/actions.ts`  ·  **cluster:** inventory-procurement
- **why:** Confirmed cross-org write-IDOR. inventoryCategories has its own organization_id column (schema/inventory.ts:116, inv_categories_org_idx), so a real org anchor exists. Both mutations key on eq(inventoryCategories.id, input.id) ONLY (update l.366, archive l.388) with no org predicate. input.id comes from IdActionInput { id: string } (l.224) — a caller-controlled value bound at the client/form layer, NOT derived from any org-scoped query. The only upstream guard is requirePermission("inventory.write"), which checks the role/permission flag and returns ctx (containing ctx.organizationId) but the a
- **fix:** Scope every category mutation by the caller's org. Resolve the org from the authenticated context and add it to the WHERE predicate so a foreign id no longer matches:

  import { and, eq } from "drizzle-orm";

  // updateInventoryCategoryAction (l.363)
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not authorised." };
  const [row] = await db
    .update(inventoryCategories)
    .set(emptyToNull(parsed.data) as Partial<typeof inventoryCategories.$inferInsert>)
   

### MEDIUM — `updateNotificationPreferenceAction`
- **file:** `src/features/notifications/actions.ts:165`  ·  **cluster:** notifications-messaging
- **why:** Confirmed cross-org write-IDOR. The table notification_preferences has a real organization_id FK column (schema/notifications.ts:151, np_org_idx). Upstream guards are only requirePermission("notifications.manage") (a role gate, not tenant) and requireOrgId(); the resolved organizationId is stamped into the SET values (lines 148-149) but the WHERE is eq(notificationPreferences.id, d.id) (line 165) with no org predicate. d.id is a client-supplied arbitrary UUID from updateNotificationPreferenceSchema (id: z.string().uuid().optional()) parsed from formData — it is NOT derived from any org-scoped 
- **fix:** AND the session org into the update WHERE clause so a foreign id cannot match. In src/features/notifications/actions.ts, change the d.id branch (lines 161-165) from:

  if (d.id) {
    await db
      .update(notificationPreferences)
      .set(values)
      .where(eq(notificationPreferences.id, d.id));
  }

to:

  if (d.id) {
    const res = await db
      .update(notificationPreferences)
      .set(values)
      .where(and(
        eq(notificationPreferences.id, d.id),
        eq(notificationPr

### MEDIUM — `updateExpectedCheckoutTimeAction`
- **file:** `src/features/front-office/actions.ts`  ·  **cluster:** operations-maint
- **why:** Confirmed cross-org write-IDOR. `updateExpectedCheckoutTimeAction` is a `"use server"` action callable directly as a POST endpoint. Its only guard is `requirePermission("front_office.write")`, which is verb-only — `requirePermission`/`hasPermissionImpl` check the role but never compare the caller's `ctx.appUser.organizationId` to the target. The action loads the booking by global UUID alone (`.where(eq(bookings.id, parsed.data.bookingId))`), where `bookingId` is free user input validated only as a UUID by `expectedCheckoutTimeSchema` (not derived from any org-scoped upstream query). It then re
- **fix:** Resolve the caller's org up front and guard the by-id load so foreign-org bookings are rejected before any insert — mirroring the established `requireOrgId()` pattern (require-org.ts) used by the d2c66cdb cluster fix:

```ts
import { and, eq } from "drizzle-orm";
import { requireOrgId } from "@/features/auth/require-org";

export async function updateExpectedCheckoutTimeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("front_office.

### MEDIUM — `approveGuestIdAction`
- **file:** `src/features/checkins/id-capture-actions.ts:132`  ·  **cluster:** operations-maint
- **why:** Confirmed cross-org write-IDOR. `guest_id_documents` has no organization_id column (schema guest-stays.ts:174-200) — its only org anchor is transitive via bookings.organizationId. The sole upstream guard is `canManageEntity("booking")`, which is `hasPermissionImpl(ctx, "bookings.write")` — a verb-only check against the caller's OWN org context that never receives or binds the `bookingId` argument. The bookingId is taken directly from the caller, and the row is loaded by `where(eq(guestIdDocuments.bookingId, bookingId)).limit(1)` with no org filter and no upstream org-scoped derivation, then UP
- **fix:** Anchor the document to the caller's org through the parent booking (guest_id_documents has no org column, so join/assert via bookings.organizationId). Replace the body of approveGuestIdAction:

export async function approveGuestIdAction(bookingId: string): Promise<IdCaptureResult> {
  if (!(await canManageEntity("booking"))) return { ok: false, error: "Not authorised." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const orgId = await requireOrg

### MEDIUM — `setVillaReadinessAction (actions.ts:11) → setVillaReadiness (services.ts:125), table villa_readiness_states`
- **file:** `src/features/readiness/services.ts`  ·  **cluster:** operations-maint
- **why:** Confirmed cross-org write-IDOR. villaId is attacker-controlled from formData (actions.ts:16,27) and validated only as a UUID (setReadinessSchema, schema.ts:69) — the form <select> is cosmetic and does not constrain the POST body. The only upstream guard is requirePermission("readiness.write") (actions.ts:15), which permissions.ts:103-110 shows is a verb/role check with NO tenant binding. setVillaReadiness finds, closes, and re-inserts the open readiness row keyed on villaId alone (services.ts:140-185); requireOrgId() is never invoked and the caller's org is never compared to the villa's org. T
- **fix:** Anchor the write to the caller's org. In setVillaReadiness (services.ts:125), accept/resolve the caller org and verify the villa belongs to it before mutating. Concretely: change setVillaReadinessAction (actions.ts) to call `const organizationId = await requireOrgId();` (import from "@/features/auth/require-org") and pass it into setVillaReadiness. Inside setVillaReadiness's transaction, before closing/inserting, load the villa's org and assert it matches:

  const [v] = await tx
    .select({ o

### MEDIUM — `openIntervention (scheduleFounderCallAction / offerServiceCompAction / markInterventionStartedAction) — and the sibling runChurnAnalysisAction at line 76`
- **file:** `src/features/owners/churn-actions.ts:129`  ·  **cluster:** owners-shares
- **why:** Confirmed cross-org write-IDOR with no upstream org guard. (1) ownerId is raw attacker-controlled form input, validated only as a UUID (ownerIdSchema = z.string().uuid()) — not derived from any org-scoped upstream query. (2) The only gate, canManageEntity('owner'), resolves to hasPermissionImpl(ctx, 'owners.write') — a pure role/permission check on the CALLER's roles; it never compares the caller's org to the target owner's org and never constrains which owner can be targeted. (3) The owner is loaded with db.select().from(owners).where(eq(owners.id, ownerId)) — NO org predicate — so a foreign 
- **fix:** Add a caller-org guard that rejects a foreign ownerId before any insert, and stamp the row from the caller's org (the owners table already has organization_id — migration 0173; requireOrgId lives at src/features/auth/require-org.ts).

In openIntervention (line 118) replace the unscoped load + getOwnerOrgId stamp:
  import { requireOrgId } from "@/features/auth/require-org";
  ...
  const organizationId = await requireOrgId();
  const [owner] = await db
    .select()
    .from(owners)
    .where(

### MEDIUM — `resolveInterventionAction`
- **file:** `src/features/owners/churn-actions.ts`  ·  **cluster:** owners-shares
- **why:** Concrete cross-org write path with no org guard. owner_insights.organization_id is notNull (migrations 0152/0158), but resolveInterventionAction's UPDATE where-clause is only `and(eq(ownerInsights.id, interventionId), eq(ownerInsights.ownerId, ownerId))` — NO organizationId predicate. Both ownerId and interventionId are attacker-controllable hidden form fields (_churn-panel.tsx:126-127), not derived from any org-scoped query. The only upstream guard is canManageEntity('owner') -> hasPermissionImpl(ctx,'owners.write'), a pure RBAC capability check with zero org/owner binding. Unlike its three s
- **fix:** Bind the UPDATE to the caller's org. Import requireOrgId from "@/features/auth/require-org" (already the canonical helper, used across the codebase). In resolveInterventionAction, after the id parsing and getDb check, add the caller org and AND it into the where-clause:

  const organizationId = await requireOrgId();
  const [updated] = await db
    .update(ownerInsights)
    .set({
      dismissedAt: new Date(),
      dismissedByUserId: me?.id ?? null,
      dismissedReason: "acted",
    })
   

### MEDIUM — `runChurnAnalysisAction`
- **file:** `src/features/owners/churn-actions.ts`  ·  **cluster:** owners-shares
- **why:** Confirmed cross-org write-IDOR. ownerId arrives from client-controlled FormData (server action, reachable regardless of page render). The only auth gate, canManageEntity('owner'), resolves to hasPermissionImpl(ctx,'owners.write') — a pure role check with NO comparison of the owner's org to the caller's org, so any internal user with owners.write passes for ANY ownerId. Line 76 loads the owner via where(eq(owners.id, ownerId)) with no org predicate, and the org used for the INSERT comes from getOwnerOrgId(ownerId) which is OWNER-derived (owner→ownership_shares→project.organization_id), not call
- **fix:** Bind the owner load to the caller's org using the now-present owners.organization_id column, and drop the owner-derived org for the stamp. At the top of runChurnAnalysisAction (after the canManageEntity check and ownerId parse), resolve the caller org and load the owner scoped to it:

  const ctx = await getCurrentUserContext();
  const callerOrgId = ctx.appUser?.organizationId;
  if (!callerOrgId) return { ok: false, error: "Not authorised." };
  const [owner] = await db
    .select()
    .from

### MEDIUM — `sendSignatureReminderAction`
- **file:** `src/features/documents/app-actions.ts`  ·  **cluster:** security-auth-team-docs
- **why:** Confirmed cross-org write-IDOR. The signature requests table has its own organization id column at documents-app schema line 95. The only upstream guard is canManageEntity for document which is verb-only at permissions line 112 to 137 with no row or org binding. The request is loaded by id alone at lines 181 to 185 and mutated by id alone at lines 192 to 200. The session org id is resolved but never compared to the loaded request org id. The id is attacker controlled because the server action is invoked over the network from the documents preview pane at lines 533 to 536 and is not derived fro
- **fix:** Add an org filter to the select and update where clauses scoping the signature request to the session org id, and do the same for markCountersignedAction.

### MEDIUM — `addDocumentVersionAction`
- **file:** `src/features/documents/app-actions.ts:298`  ·  **cluster:** security-auth-team-docs
- **why:** Confirmed cross-org write-IDOR. The action is a "use server" handler called directly from a client modal (documents-version-modals.tsx:59) with a UI-supplied, attacker-controlled documentId — no upstream server wrapper re-scopes the id. guard() only runs canManageEntity("document"), a verb-only role check (documents.write) that binds nothing to the target doc; requireOrgId() returns the CALLER's session org, not the document's. The doc load at lines 277-281 is `.where(eq(documents.id, d.documentId))` with NO organizationId predicate, so an operator in org A loads org B's document by id. The ac
- **fix:** Scope the document load to the caller's org and reject foreign docs before any mutation. Replace the load at lines 277-281 with: `const [doc] = await db.select().from(documents).where(and(eq(documents.id, d.documentId), eq(documents.organizationId, g.organizationId))).limit(1); if (!doc) return { ok: false, error: "Document not found." };` (and ensure `and` is imported — it already is). Additionally, AND the demote update (lines 293-296) with the org: `.where(and(eq(documentVersions.documentId, 

### MEDIUM — `generateFromTemplateAction`
- **file:** `src/features/documents/app-actions.ts:420`  ·  **cluster:** security-auth-team-docs
- **why:** Confirmed cross-org write-IDOR. The only upstream guard is verb-only: guard() runs canManageEntity("document") (role/permission check) + requireOrgId() (returns the SESSION org), neither of which constrains which templateId may be loaded. templateId comes straight from user input (generateSchema, a UUID in the request body) — it is NOT derived from an org-scoped query. The template load at line 405-408 filters by eq(documentTemplates.id, d.templateId) with NO org predicate, so a caller in org A can pass org B's templateId. document_templates is a per-org table (has organization_id, schema line
- **fix:** Scope the template load to the caller's session org and stamp the minted rows with the session org (never the template's). In generateFromTemplateAction:

1) Add the org predicate to the template fetch so a foreign template id resolves to "not found":
   const [tpl] = await db
     .select()
     .from(documentTemplates)
     .where(and(eq(documentTemplates.id, d.templateId), eq(documentTemplates.organizationId, g.organizationId)))
     .limit(1);
   if (!tpl) return { ok: false, error: "Templat

### MEDIUM — `createSignatureRequestAction`
- **file:** `src/features/documents/app-actions.ts`  ·  **cluster:** security-auth-team-docs
- **why:** Real cross-org write-IDOR. The only upstream guard is canManageEntity('document') -> hasPermission(ctx,'documents.write'), a pure role/verb check that takes no entity or org argument. requireOrgId() returns the CALLER's own session org and is used only as the '??' fallback. The document is loaded at lines 137-141 with WHERE eq(documents.id, d.documentId) and NO org predicate, and documentId comes straight from the attacker-supplied input schema (not derived from any org-scoped query). So a caller holding documents.write in org A can pass a documentId owned by org B: the load succeeds, doc.orga
- **fix:** Scope the document load to the caller's org so a foreign documentId cannot anchor the request. Replace the load at lines 137-141 with:

  const [doc] = await db
    .select({ id: documents.id, organizationId: documents.organizationId })
    .from(documents)
    .where(and(eq(documents.id, d.documentId), eq(documents.organizationId, g.organizationId)))
    .limit(1);
  if (!doc) return { ok: false, error: "Document not found." };

(`and` is already imported.) With this, a documentId from another 

### MEDIUM — `createVillaAction`
- **file:** `src/features/villas/actions.ts:62`  ·  **cluster:** villas-projects-pricing
- **why:** villas has no direct organization_id; its org anchor is transitive: villas.project_id -> projects.organization_id (schema comment src/lib/db/schema/projects.ts:21-24, and migration headers 0149 line 30 / 0153 line 11 both state "villas reach org via villas.project_id -> projects.organization_id"). createVillaAction takes projectId straight from FormData (createVillaSchema only validates it is a UUID, schema.ts:16) and inserts it at actions.ts:65 with no check that the project belongs to the caller's org. The only upstream guard is canManageEntity('villa'), which is hasPermissionImpl(ctx,'villa
- **fix:** In createVillaAction, after parsing and before the insert (actions.ts ~line 47), resolve the caller's org and verify the target project is in-org, mirroring projects/actions.ts:

  import { and, eq } from "drizzle-orm";
  import { projects } from "@/lib/db/schema/projects";
  import { requireOrgId } from "@/features/auth/require-org";

  const organizationId = await requireOrgId();
  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, d.pro


## LOW

### LOW — `updateOwnerCalendarPreferencesAction`
- **file:** `src/features/owner-intelligence/actions.ts:26`  ·  **cluster:** finance-statements
- **why:** Real cross-org write-IDOR. The table owner_calendar_preferences has its own organization_id column (migration 0154) and a transitive anchor owner→org (owners.organization_id, migration 0173), so it is org-scopable, not platform-global. The only upstream guard is requirePermission("owner_calendar.read"), which is a pure verb/role check (permissions.ts:107) — it returns context and throws only on a missing role; it never scopes by org. ownerId is read raw from formData.get("ownerId") and validated only as a UUID — it is attacker-controlled, not derived from any org-scoped query. The action loads
- **fix:** Scope the action to the caller's org and owner ownership, mirroring the safe twin in guest-journey/actions.ts:401. Replace the unscoped read/write with: (1) const ctx = await requirePermission("owner_calendar.read"); const orgId = ctx.appUser?.organizationId; if (!orgId) return { ok: false, error: "No organization context." }; (2) verify the target owner belongs to the caller org before any write — const [owner] = await db.select({ id: owners.id }).from(owners).where(and(eq(owners.id, v.ownerId)

### LOW — `recordPortalInviteAction`
- **file:** `src/features/owners/actions.ts`  ·  **cluster:** owners-shares
- **why:** The owners table is org-anchored (organization_id, migration 0173 — schema/ownership.ts:22 + owners_organization_idx). The sole upstream guard, canManageEntity('owner'), resolves to hasPermissionImpl(ctx, 'owners.write') (permissions.ts:124-136): a static RBAC capability check on the CALLER's own context that takes no owner id and never binds to the target owner's org. The read at line 407, db.select().from(owners).where(eq(owners.id, d.ownerId)), has no organizationId predicate, and d.ownerId is a caller-supplied UUID from the action input (not derived from any org-scoped query). So a caller 
- **fix:** Scope the owner lookup to the caller's org. In recordPortalInviteAction, after obtaining db, add: `const organizationId = await requireOrgId();` (requireOrgId is already imported at actions.ts:14) and change the select to `const [owner] = await db.select().from(owners).where(and(eq(owners.id, d.ownerId), eq(owners.organizationId, organizationId))).limit(1);` (and is already imported from drizzle-orm at line 5). The existing `if (!owner) return { ok: false, error: "Owner not found." };` then corr
