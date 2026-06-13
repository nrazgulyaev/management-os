import "server-only";

import { and, asc, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import { ownerStayFinanceLinks } from "@/lib/db/schema/owner-stay-finance";
import {
  expenseLines,
  managementFeeLines,
  statementPeriods,
} from "@/lib/db/schema/finance";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { owners } from "@/lib/db/schema/ownership";
import { recordAuditEvent } from "@/features/audit/services";
import { requireOrgId } from "@/features/auth/require-org";
import {
  calculateOwnerStayFinanceAmounts,
  decideBridge,
  effectiveDateForRequest,
  isBridgeEligibleStatus,
  type FinanceBridgeStatus,
  type StatementPeriodLike,
} from "./finance-bridge-pure";

/**
 * V9C — DB-aware owner-stay → finance bridge. Pure decision lives in
 * `finance-bridge-pure.ts`; this module fetches the request + statement
 * periods, makes the decision, materialises rows when bridged, and
 * persists the audit row in `owner_stay_finance_links`.
 *
 * Idempotency anchor: unique index on `owner_stay_finance_links.owner_stay_request_id`.
 * Re-running the bridge updates the existing link row instead of
 * inserting a duplicate.
 */

export interface BridgeOutcome {
  ok: boolean;
  requestId: string;
  status: FinanceBridgeStatus;
  reason?: string;
  linkId?: string;
  managementFeeLineId?: string | null;
  expenseLineId?: string | null;
  amountMinor: number;
  currency: string;
}

const BRIDGE_DESCRIPTION_PREFIX = "Owner stay";

/**
 * Bridge a single approved/completed owner-stay request. Idempotent —
 * call as many times as you like, only one set of finance rows + one
 * link row will exist.
 */
export async function createFinanceRowsForOwnerStay(
  requestId: string,
  actorUserId: string | null = null,
  // TENANCY: when set, only bridge a request belonging to this org (a cross-org
  // id reads as not-found). The action layer passes requireOrgId().
  expectedOrgId: string | null = null,
): Promise<BridgeOutcome> {
  const db = getDb();
  if (!db) {
    return {
      ok: false,
      requestId,
      status: "failed",
      reason: "database unavailable",
      amountMinor: 0,
      currency: "USD",
    };
  }

  // TENANCY (write-flow follow-up) — gate the bridge to the caller's org so an
  // admin cannot materialise finance rows for another org's request by id.
  const organizationId = await requireOrgId();
  const [req] = await db
    .select()
    .from(ownerStayRequests)
    .where(
      and(
        eq(ownerStayRequests.id, requestId),
        eq(ownerStayRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!req || (expectedOrgId !== null && req.organizationId !== expectedOrgId)) {
    return {
      ok: false,
      requestId,
      status: "failed",
      reason: "request not found",
      amountMinor: 0,
      currency: "USD",
    };
  }

  // Already bridged? Idempotency short-circuit.
  const [existingLink] = await db
    .select()
    .from(ownerStayFinanceLinks)
    .where(eq(ownerStayFinanceLinks.ownerStayRequestId, req.id))
    .limit(1);

  if (existingLink && existingLink.bridgeStatus === "bridged") {
    return {
      ok: true,
      requestId: req.id,
      status: "bridged",
      reason: "already bridged",
      linkId: existingLink.id,
      managementFeeLineId: existingLink.managementFeeLineId,
      expenseLineId: existingLink.operationalExpenseLineId,
      amountMinor: existingLink.amountMinor,
      currency: existingLink.currency,
    };
  }

  if (!isBridgeEligibleStatus(req.status)) {
    const outcome: BridgeOutcome = {
      ok: false,
      requestId: req.id,
      status: "failed",
      reason: `request status '${req.status}' is not bridge-eligible`,
      amountMinor: 0,
      currency: req.currency,
    };
    await upsertLink(req, existingLink?.id, {
      bridgeStatus: "failed",
      reason: outcome.reason ?? null,
      amountMinor: 0,
      currency: req.currency,
      actorUserId,
    });
    await recordAuditEvent({
      actorUserId,
      action: "owner_stay.finance_bridge.failed",
      entityType: "owner_stay_request",
      entityId: req.id,
      after: { reason: outcome.reason },
    });
    return outcome;
  }

  const effectiveDate = effectiveDateForRequest(
    req.requestedEnd as unknown as string,
  );

  // Pull candidate statement periods that could contain `effectiveDate`.
  const periodRows = await db
    .select({
      id: statementPeriods.id,
      status: statementPeriods.status,
      periodStart: statementPeriods.periodStart,
      periodEnd: statementPeriods.periodEnd,
    })
    .from(statementPeriods)
    .where(
      and(
        lte(statementPeriods.periodStart, effectiveDate),
        gt(statementPeriods.periodEnd, effectiveDate),
      ),
    )
    .orderBy(asc(statementPeriods.periodStart));
  // The `> periodEnd` predicate above excludes periods whose end is
  // exactly `effectiveDate`. Drizzle's date comparators stay strict —
  // re-pull in JS for an inclusive `<= periodEnd` test.
  const allPeriods = await db
    .select({
      id: statementPeriods.id,
      status: statementPeriods.status,
      periodStart: statementPeriods.periodStart,
      periodEnd: statementPeriods.periodEnd,
    })
    .from(statementPeriods)
    .where(lte(statementPeriods.periodStart, effectiveDate))
    .orderBy(desc(statementPeriods.periodStart))
    .limit(20);
  const candidatePeriods: StatementPeriodLike[] = [
    ...allPeriods,
    ...periodRows,
  ]
    .map((p) => ({
      id: p.id,
      status: p.status,
      periodStart: p.periodStart as unknown as string,
      periodEnd: p.periodEnd as unknown as string,
    }))
    .filter((p, i, arr) => arr.findIndex((q) => q.id === p.id) === i);

  const decision = decideBridge(
    {
      requestId: req.id,
      ownerId: req.ownerId,
      villaId: req.villaId,
      projectId: req.projectId,
      status: req.status,
      effectiveDate,
      estimatedManagementCompensationMinor:
        req.estimatedManagementCompensationMinor,
      estimatedOperationalCostMinor: req.estimatedOperationalCostMinor,
      currency: req.currency,
    },
    candidatePeriods,
  );

  if (decision.status === "failed") {
    const outcome: BridgeOutcome = {
      ok: false,
      requestId: req.id,
      status: "failed",
      reason: decision.reason,
      amountMinor: decision.amounts.totalMinor,
      currency: decision.amounts.currency,
    };
    await upsertLink(req, existingLink?.id, {
      bridgeStatus: "failed",
      reason: decision.reason,
      amountMinor: decision.amounts.totalMinor,
      currency: decision.amounts.currency,
      actorUserId,
    });
    await recordAuditEvent({
      actorUserId,
      action: "owner_stay.finance_bridge.failed",
      entityType: "owner_stay_request",
      entityId: req.id,
      after: { reason: decision.reason },
    });
    return outcome;
  }

  if (decision.status === "skipped_no_charge") {
    const linkId = await upsertLink(req, existingLink?.id, {
      bridgeStatus: "skipped_no_charge",
      reason: decision.reason,
      amountMinor: 0,
      currency: decision.amounts.currency,
      actorUserId,
    });
    await db
      .update(ownerStayRequests)
      .set({
        financeBridgeStatus: "skipped_no_charge",
        financeLinkId: linkId,
        updatedAt: new Date(),
      })
      .where(eq(ownerStayRequests.id, req.id));
    await recordAuditEvent({
      actorUserId,
      action: "owner_stay.finance_bridge.skipped_no_charge",
      entityType: "owner_stay_request",
      entityId: req.id,
    });
    return {
      ok: true,
      requestId: req.id,
      status: "skipped_no_charge",
      reason: decision.reason,
      linkId,
      amountMinor: 0,
      currency: decision.amounts.currency,
    };
  }

  if (decision.status === "skipped_locked_period") {
    const linkId = await upsertLink(req, existingLink?.id, {
      bridgeStatus: "skipped_locked_period",
      reason: decision.reason,
      amountMinor: decision.amounts.totalMinor,
      currency: decision.amounts.currency,
      statementPeriodId: decision.period.id,
      actorUserId,
    });
    await db
      .update(ownerStayRequests)
      .set({
        financeBridgeStatus: "skipped_locked_period",
        financeLinkId: linkId,
        updatedAt: new Date(),
      })
      .where(eq(ownerStayRequests.id, req.id));
    await recordAuditEvent({
      actorUserId,
      action: "owner_stay.finance_bridge.skipped_locked_period",
      entityType: "owner_stay_request",
      entityId: req.id,
      after: {
        statementPeriodId: decision.period.id,
        reason: decision.reason,
      },
    });
    return {
      ok: true,
      requestId: req.id,
      status: "skipped_locked_period",
      reason: decision.reason,
      linkId,
      amountMinor: decision.amounts.totalMinor,
      currency: decision.amounts.currency,
    };
  }

  // decision.status === "bridged" — write the finance rows.
  const description = await buildDescription(req.id, req.villaId);
  let managementFeeLineId: string | null = null;
  let expenseLineId: string | null = null;

  try {
    if (decision.amounts.compensationMinor > 0) {
      const [mfRow] = await db
        .insert(managementFeeLines)
        .values({
          villaId: req.villaId,
          projectId: req.projectId,
          ownerId: req.ownerId,
          description: `${BRIDGE_DESCRIPTION_PREFIX} compensation · ${description}`,
          amountMinor: BigInt(decision.amounts.compensationMinor),
          currency: decision.amounts.currency,
          feeDate: effectiveDate,
          status: "posted",
          createdBy: actorUserId,
        })
        .returning({ id: managementFeeLines.id });
      managementFeeLineId = mfRow!.id;
    }
    if (decision.amounts.operationalCostMinor > 0) {
      const [exRow] = await db
        .insert(expenseLines)
        .values({
          villaId: req.villaId,
          projectId: req.projectId,
          bookingId: null,
          expenseType: "owner_stay_operational_cost",
          description: `${BRIDGE_DESCRIPTION_PREFIX} operational cost · ${description}`,
          amountMinor: BigInt(decision.amounts.operationalCostMinor),
          currency: decision.amounts.currency,
          expenseDate: effectiveDate,
          allocationScope: "owner_direct",
          ownerChargeable: true,
          status: "posted",
          createdBy: actorUserId,
        })
        .returning({ id: expenseLines.id });
      expenseLineId = exRow!.id;
    }
  } catch (e) {
    // Locked-period DB trigger or another integrity issue. Reverse any
    // partial writes by leaving them out — Postgres rolls back nothing
    // here (we're not in an explicit transaction), so we record the
    // failure on the link row and let admin retry.
    const message = e instanceof Error ? e.message : String(e);
    const linkId = await upsertLink(req, existingLink?.id, {
      bridgeStatus: "failed",
      reason: `db insert failed: ${message.slice(0, 200)}`,
      amountMinor: decision.amounts.totalMinor,
      currency: decision.amounts.currency,
      statementPeriodId: decision.period?.id ?? null,
      actorUserId,
    });
    await db
      .update(ownerStayRequests)
      .set({
        financeBridgeStatus: "failed",
        financeLinkId: linkId,
        updatedAt: new Date(),
      })
      .where(eq(ownerStayRequests.id, req.id));
    await recordAuditEvent({
      actorUserId,
      action: "owner_stay.finance_bridge.failed",
      entityType: "owner_stay_request",
      entityId: req.id,
      after: { reason: message.slice(0, 200) },
    });
    return {
      ok: false,
      requestId: req.id,
      status: "failed",
      reason: message,
      linkId,
      amountMinor: decision.amounts.totalMinor,
      currency: decision.amounts.currency,
    };
  }

  const linkId = await upsertLink(req, existingLink?.id, {
    bridgeStatus: "bridged",
    reason: null,
    amountMinor: decision.amounts.totalMinor,
    currency: decision.amounts.currency,
    statementPeriodId: decision.period?.id ?? null,
    managementFeeLineId,
    operationalExpenseLineId: expenseLineId,
    actorUserId,
  });

  await db
    .update(ownerStayRequests)
    .set({
      financeBridgeStatus: "bridged",
      financeLinkId: linkId,
      updatedAt: new Date(),
    })
    .where(eq(ownerStayRequests.id, req.id));

  await recordAuditEvent({
    actorUserId,
    action: "owner_stay.finance_bridge.bridged",
    entityType: "owner_stay_request",
    entityId: req.id,
    after: {
      linkId,
      managementFeeLineId,
      expenseLineId,
      amountMinor: decision.amounts.totalMinor,
      currency: decision.amounts.currency,
    },
  });

  return {
    ok: true,
    requestId: req.id,
    status: "bridged",
    linkId,
    managementFeeLineId,
    expenseLineId,
    amountMinor: decision.amounts.totalMinor,
    currency: decision.amounts.currency,
  };
}

interface UpsertLinkInput {
  bridgeStatus: FinanceBridgeStatus;
  reason: string | null;
  amountMinor: number;
  currency: string;
  statementPeriodId?: string | null;
  managementFeeLineId?: string | null;
  operationalExpenseLineId?: string | null;
  compensationRevenueLineId?: string | null;
  actorUserId: string | null;
}

async function upsertLink(
  req: typeof ownerStayRequests.$inferSelect,
  existingLinkId: string | undefined,
  patch: UpsertLinkInput,
): Promise<string> {
  const db = getDb()!;
  if (existingLinkId) {
    await db
      .update(ownerStayFinanceLinks)
      .set({
        bridgeStatus: patch.bridgeStatus,
        reason: patch.reason,
        amountMinor: patch.amountMinor,
        currency: patch.currency,
        statementPeriodId:
          patch.statementPeriodId !== undefined
            ? patch.statementPeriodId
            : undefined,
        managementFeeLineId:
          patch.managementFeeLineId !== undefined
            ? patch.managementFeeLineId
            : undefined,
        operationalExpenseLineId:
          patch.operationalExpenseLineId !== undefined
            ? patch.operationalExpenseLineId
            : undefined,
        compensationRevenueLineId:
          patch.compensationRevenueLineId !== undefined
            ? patch.compensationRevenueLineId
            : undefined,
        updatedAt: new Date(),
      })
      .where(eq(ownerStayFinanceLinks.id, existingLinkId));
    return existingLinkId;
  }
  // Org anchor (TENANCY 0158) — copy the parent request's org when present,
  // else resolve through the request's project (projects.organization_id is
  // NOT NULL).
  let organizationId = req.organizationId;
  if (!organizationId && req.projectId) {
    const [p] = await db
      .select({ organizationId: projectsTable.organizationId })
      .from(projectsTable)
      .where(eq(projectsTable.id, req.projectId))
      .limit(1);
    organizationId = p?.organizationId ?? null;
  }
  if (!organizationId) {
    throw new Error(
      `Cannot resolve organization for owner-stay request ${req.id}.`,
    );
  }
  const [row] = await db
    .insert(ownerStayFinanceLinks)
    .values({
      organizationId,
      ownerStayRequestId: req.id,
      ownerId: req.ownerId,
      villaId: req.villaId,
      projectId: req.projectId,
      statementPeriodId: patch.statementPeriodId ?? null,
      managementFeeLineId: patch.managementFeeLineId ?? null,
      operationalExpenseLineId: patch.operationalExpenseLineId ?? null,
      compensationRevenueLineId: patch.compensationRevenueLineId ?? null,
      bridgeStatus: patch.bridgeStatus,
      amountMinor: patch.amountMinor,
      currency: patch.currency,
      reason: patch.reason,
      createdBy: patch.actorUserId,
    })
    .returning({ id: ownerStayFinanceLinks.id });
  return row!.id;
}

async function buildDescription(
  requestId: string,
  _villaId: string,
): Promise<string> {
  const db = getDb();
  if (!db) return requestId.slice(0, 8);
  const [row] = await db
    .select({
      villaCode: villas.unitCode,
      ownerName: owners.displayName,
      requestedStart: ownerStayRequests.requestedStart,
      requestedEnd: ownerStayRequests.requestedEnd,
      projectName: projectsTable.name,
    })
    .from(ownerStayRequests)
    .leftJoin(villas, eq(villas.id, ownerStayRequests.villaId))
    .leftJoin(owners, eq(owners.id, ownerStayRequests.ownerId))
    .leftJoin(projectsTable, eq(projectsTable.id, ownerStayRequests.projectId))
    .where(eq(ownerStayRequests.id, requestId))
    .limit(1);
  if (!row) return requestId.slice(0, 8);
  return `${row.ownerName ?? "owner"} · ${row.villaCode ?? "villa"} · ${row.requestedStart as unknown as string} → ${row.requestedEnd as unknown as string}`;
}

// -----------------------------------------------------------------------------
// Read helpers — admin surfaces
// -----------------------------------------------------------------------------

export interface FinanceLinkRow {
  id: string;
  ownerStayRequestId: string;
  ownerId: string;
  ownerName: string | null;
  villaId: string;
  villaCode: string | null;
  bridgeStatus: string;
  amountMinor: number;
  currency: string;
  reason: string | null;
  statementPeriodId: string | null;
  managementFeeLineId: string | null;
  operationalExpenseLineId: string | null;
  createdAt: string;
}

export async function listFinanceLinks(opts?: {
  status?: string | string[];
  limit?: number;
}): Promise<FinanceLinkRow[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY — this is a sensitive money surface (Finance Bridge page lists
  // bridged management-fee / expense amounts + owner names). Scope strictly to
  // the caller's org so it never lists another org's bridged links.
  const organizationId = await requireOrgId();
  const filters = [eq(ownerStayFinanceLinks.organizationId, organizationId)];
  if (opts?.status) {
    if (Array.isArray(opts.status))
      filters.push(inArray(ownerStayFinanceLinks.bridgeStatus, opts.status));
    else filters.push(eq(ownerStayFinanceLinks.bridgeStatus, opts.status));
  }
  const rows = await db
    .select({
      l: ownerStayFinanceLinks,
      ownerName: owners.displayName,
      villaCode: villas.unitCode,
    })
    .from(ownerStayFinanceLinks)
    .leftJoin(owners, eq(owners.id, ownerStayFinanceLinks.ownerId))
    .leftJoin(villas, eq(villas.id, ownerStayFinanceLinks.villaId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(ownerStayFinanceLinks.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    id: r.l.id,
    ownerStayRequestId: r.l.ownerStayRequestId,
    ownerId: r.l.ownerId,
    ownerName: r.ownerName ?? null,
    villaId: r.l.villaId,
    villaCode: r.villaCode ?? null,
    bridgeStatus: r.l.bridgeStatus,
    amountMinor: r.l.amountMinor,
    currency: r.l.currency,
    reason: r.l.reason,
    statementPeriodId: r.l.statementPeriodId,
    managementFeeLineId: r.l.managementFeeLineId,
    operationalExpenseLineId: r.l.operationalExpenseLineId,
    createdAt: r.l.createdAt.toISOString(),
  }));
}

export async function listPendingBridgeRequests(
  limit = 50,
  orgId: string | null = null,
): Promise<{ id: string }[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: ownerStayRequests.id })
    .from(ownerStayRequests)
    .where(
      and(
        inArray(ownerStayRequests.status, ["approved", "completed"]),
        inArray(ownerStayRequests.financeBridgeStatus, [
          "pending",
          "failed",
          "skipped_locked_period",
        ]),
        // TENANCY: only the caller's org's pending stays.
        ...(orgId ? [eq(ownerStayRequests.organizationId, orgId)] : []),
      ),
    )
    .orderBy(asc(ownerStayRequests.requestedEnd))
    .limit(limit);
  return rows;
}

/**
 * Convenience: bridge every owner-stay request that is currently in
 * `pending` / `failed` / `skipped_locked_period` finance-bridge state.
 * Used by the admin "bridge all pending" button.
 */
export async function bridgePendingOwnerStays(
  actorUserId: string | null,
  limit = 50,
  // TENANCY: scope the batch to the caller's org (passed from the action).
  orgId: string | null = null,
): Promise<{ checked: number; outcomes: BridgeOutcome[] }> {
  const targets = await listPendingBridgeRequests(limit, orgId);
  const outcomes: BridgeOutcome[] = [];
  for (const t of targets) {
    const out = await createFinanceRowsForOwnerStay(t.id, actorUserId, orgId);
    outcomes.push(out);
  }
  return { checked: targets.length, outcomes };
}

/**
 * Reverse a previously bridged owner-stay: deletes the materialised
 * finance rows (subject to the locked-period DB trigger) and flips the
 * link to `reversed`. Designed for the rare case where an admin needs
 * to undo before close.
 */
export async function reverseFinanceBridgeForOwnerStay(
  requestId: string,
  actorUserId: string | null,
  reason: string,
  // TENANCY: when set, only reverse a request belonging to this org.
  expectedOrgId: string | null = null,
): Promise<BridgeOutcome> {
  const db = getDb();
  if (!db) {
    return {
      ok: false,
      requestId,
      status: "failed",
      reason: "database unavailable",
      amountMinor: 0,
      currency: "USD",
    };
  }
  // TENANCY: this is a write path also reachable from cron (expectedOrgId
  // null = system, no scoping). The caller-supplied expectedOrgId is the
  // cron-safe gate — do NOT swap in requireOrgId() here (it would fall back
  // to the default org and mis-scope cron reversals).
  if (expectedOrgId !== null) {
    const [reqOrg] = await db
      .select({ organizationId: ownerStayRequests.organizationId })
      .from(ownerStayRequests)
      .where(eq(ownerStayRequests.id, requestId))
      .limit(1);
    if (!reqOrg || reqOrg.organizationId !== expectedOrgId) {
      return {
        ok: false,
        requestId,
        status: "failed",
        reason: "request not found",
        amountMinor: 0,
        currency: "USD",
      };
    }
  }
  const [link] = await db
    .select()
    .from(ownerStayFinanceLinks)
    .where(eq(ownerStayFinanceLinks.ownerStayRequestId, requestId))
    .limit(1);
  if (!link || link.bridgeStatus !== "bridged") {
    return {
      ok: false,
      requestId,
      status: "failed",
      reason: "no bridged link to reverse",
      amountMinor: 0,
      currency: "USD",
    };
  }

  try {
    if (link.managementFeeLineId) {
      await db
        .delete(managementFeeLines)
        .where(eq(managementFeeLines.id, link.managementFeeLineId));
    }
    if (link.operationalExpenseLineId) {
      await db
        .delete(expenseLines)
        .where(eq(expenseLines.id, link.operationalExpenseLineId));
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      requestId,
      status: "failed",
      reason: `reverse failed: ${message.slice(0, 200)}`,
      amountMinor: link.amountMinor,
      currency: link.currency,
    };
  }

  await db
    .update(ownerStayFinanceLinks)
    .set({
      bridgeStatus: "reversed",
      reason,
      managementFeeLineId: null,
      operationalExpenseLineId: null,
      updatedAt: new Date(),
    })
    .where(eq(ownerStayFinanceLinks.id, link.id));

  await db
    .update(ownerStayRequests)
    .set({
      financeBridgeStatus: "reversed",
      updatedAt: new Date(),
    })
    .where(eq(ownerStayRequests.id, requestId));

  await recordAuditEvent({
    actorUserId,
    action: "owner_stay.finance_bridge.reversed",
    entityType: "owner_stay_request",
    entityId: requestId,
    after: { linkId: link.id, reason },
  });

  return {
    ok: true,
    requestId,
    status: "reversed",
    linkId: link.id,
    amountMinor: link.amountMinor,
    currency: link.currency,
  };
}

// Export for the admin UI to compute "where will this land?" without
// triggering a write.
export { calculateOwnerStayFinanceAmounts, effectiveDateForRequest };
