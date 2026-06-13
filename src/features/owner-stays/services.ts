import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db/client";
import {
  ownerStayPolicies,
  ownerStayRequests,
  villaEquivalenceGroups,
  villaEquivalenceGroupMembers,
  bookingRelocationCandidates,
  type OwnerStayRequest,
} from "@/lib/db/schema/owner-stays";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { owners } from "@/lib/db/schema/ownership";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { appUsersOwners } from "@/lib/db/schema/access-grants";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";
import {
  DEMO_OWNER_CONTEXT,
  isDemoOwnerFallbackActive,
  listDemoOwnerStayRequests,
} from "@/features/demo-data/owner-portal-fallback";
import {
  loadActiveBlocksForVilla,
  detectAvailabilityConflicts,
} from "@/features/availability/services";
import { quoteForRange } from "@/features/pricing/services";
import { estimateOwnerStay, type OwnerStayEstimate } from "./estimate";
import {
  pickApplicablePolicy,
  type OwnerStayPolicyLike,
} from "./policy";

// -----------------------------------------------------------------------------
// Policies
// -----------------------------------------------------------------------------

export interface OwnerStayPolicyRow {
  id: string;
  policyName: string;
  projectId: string | null;
  projectName: string | null;
  villaId: string | null;
  villaCode: string | null;
  freeNightsPerYear: number;
  freeNightsApplyToPeak: boolean;
  requiresApproval: boolean;
  allowDisplacingGuestBookings: boolean;
  relocationAllowed: boolean;
  operationalCostModel: string;
  fixedOperationalCostMinor: number | null;
  currency: string | null;
  compensationModel: string;
  compensationPercent: string | null;
  fixedCompensationMinor: number | null;
  blackoutDates: unknown;
  peakSeasonRules: unknown;
  status: string;
}

export async function listOwnerStayPolicies(opts?: {
  projectId?: string;
  villaId?: string;
  status?: string;
}): Promise<OwnerStayPolicyRow[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY — policies have no org column. Scope through their parents: a policy
  // resolves to an org via its project (project_id) OR via its villa's project
  // (villa_id -> villas.project_id). policyProjectId/villaId are both nullable
  // (global policies), so also allow rows that reference neither. The villa's
  // project is reached via an aliased join (villas has no org column).
  const organizationId = await requireOrgId();
  const villaProj = alias(projectsTable, "villa_proj");
  const filters = [
    or(
      eq(projectsTable.organizationId, organizationId),
      eq(villaProj.organizationId, organizationId),
      and(isNull(ownerStayPolicies.projectId), isNull(ownerStayPolicies.villaId)),
    ),
  ];
  if (opts?.projectId)
    filters.push(eq(ownerStayPolicies.projectId, opts.projectId));
  if (opts?.villaId)
    filters.push(eq(ownerStayPolicies.villaId, opts.villaId));
  if (opts?.status) filters.push(eq(ownerStayPolicies.status, opts.status));
  const rows = await db
    .select({
      p: ownerStayPolicies,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(ownerStayPolicies)
    .leftJoin(villas, eq(villas.id, ownerStayPolicies.villaId))
    .leftJoin(villaProj, eq(villaProj.id, villas.projectId))
    .leftJoin(projectsTable, eq(projectsTable.id, ownerStayPolicies.projectId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(ownerStayPolicies.policyName));
  return rows.map((r) => ({
    id: r.p.id,
    policyName: r.p.policyName,
    projectId: r.p.projectId,
    projectName: r.projectName ?? null,
    villaId: r.p.villaId,
    villaCode: r.villaCode ?? null,
    freeNightsPerYear: r.p.freeNightsPerYear,
    freeNightsApplyToPeak: r.p.freeNightsApplyToPeak,
    requiresApproval: r.p.requiresApproval,
    allowDisplacingGuestBookings: r.p.allowDisplacingGuestBookings,
    relocationAllowed: r.p.relocationAllowed,
    operationalCostModel: r.p.operationalCostModel,
    fixedOperationalCostMinor: r.p.fixedOperationalCostMinor,
    currency: r.p.currency,
    compensationModel: r.p.compensationModel,
    compensationPercent:
      r.p.compensationPercent != null ? String(r.p.compensationPercent) : null,
    fixedCompensationMinor: r.p.fixedCompensationMinor,
    blackoutDates: r.p.blackoutDates,
    peakSeasonRules: r.p.peakSeasonRules,
    status: r.p.status,
  }));
}

export async function getApplicableOwnerStayPolicy(
  villaId: string,
  projectId: string | null,
): Promise<OwnerStayPolicyLike | null> {
  const db = getDb();
  if (!db) return null;
  // TENANCY — this runs in the owner-portal estimate path where requireOrgId()
  // is wrong (caller's org may differ from the villa's). Scope to the VILLA's
  // org instead: resolve it from the villa's project, then restrict the policy
  // scan to policies that resolve to that org (via project_id OR villa_id ->
  // villas.project_id) or are global (both null). This both fixes the cross-org
  // match and avoids scanning every org's policies.
  const [villaRow] = await db
    .select({ organizationId: projectsTable.organizationId })
    .from(villas)
    .innerJoin(projectsTable, eq(projectsTable.id, villas.projectId))
    .where(eq(villas.id, villaId))
    .limit(1);
  const villaOrgId = villaRow?.organizationId ?? null;
  // Pull all candidates that could apply: villa-specific, project-specific, global.
  const filters = [eq(ownerStayPolicies.status, "active")];
  if (villaOrgId) {
    const villaProj = alias(projectsTable, "villa_proj_for_policy");
    const scopedRows = await db
      .select({ p: ownerStayPolicies })
      .from(ownerStayPolicies)
      .leftJoin(villas, eq(villas.id, ownerStayPolicies.villaId))
      .leftJoin(villaProj, eq(villaProj.id, villas.projectId))
      .leftJoin(projectsTable, eq(projectsTable.id, ownerStayPolicies.projectId))
      .where(
        and(
          eq(ownerStayPolicies.status, "active"),
          or(
            eq(projectsTable.organizationId, villaOrgId),
            eq(villaProj.organizationId, villaOrgId),
            and(
              isNull(ownerStayPolicies.projectId),
              isNull(ownerStayPolicies.villaId),
            ),
          ),
        ),
      );
    return pickApplicablePolicy(
      scopedRows.map((row) => {
        const r = row.p;
        return {
          id: r.id,
          projectId: r.projectId,
          villaId: r.villaId,
          freeNightsPerYear: r.freeNightsPerYear,
          freeNightsApplyToPeak: r.freeNightsApplyToPeak,
          requiresApproval: r.requiresApproval,
          allowDisplacingGuestBookings: r.allowDisplacingGuestBookings,
          relocationAllowed: r.relocationAllowed,
          operationalCostModel: r.operationalCostModel,
          fixedOperationalCostMinor: r.fixedOperationalCostMinor,
          currency: r.currency,
          compensationModel: r.compensationModel,
          compensationPercent:
            r.compensationPercent != null
              ? String(r.compensationPercent)
              : null,
          fixedCompensationMinor: r.fixedCompensationMinor,
          blackoutDates: r.blackoutDates,
          peakSeasonRules: r.peakSeasonRules,
          status: r.status,
        };
      }),
      villaId,
      projectId,
    );
  }
  const rows = await db
    .select()
    .from(ownerStayPolicies)
    .where(and(...filters));
  return pickApplicablePolicy(
    rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      villaId: r.villaId,
      freeNightsPerYear: r.freeNightsPerYear,
      freeNightsApplyToPeak: r.freeNightsApplyToPeak,
      requiresApproval: r.requiresApproval,
      allowDisplacingGuestBookings: r.allowDisplacingGuestBookings,
      relocationAllowed: r.relocationAllowed,
      operationalCostModel: r.operationalCostModel,
      fixedOperationalCostMinor: r.fixedOperationalCostMinor,
      currency: r.currency,
      compensationModel: r.compensationModel,
      compensationPercent:
        r.compensationPercent != null ? String(r.compensationPercent) : null,
      fixedCompensationMinor: r.fixedCompensationMinor,
      blackoutDates: r.blackoutDates,
      peakSeasonRules: r.peakSeasonRules,
      status: r.status,
    })),
    villaId,
    projectId,
  );
}

// -----------------------------------------------------------------------------
// Allowance usage helpers
// -----------------------------------------------------------------------------

/**
 * Sum of `allowance_nights_applied` for an owner across approved /
 * completed requests in a given calendar year.
 */
export async function calculateAllowanceUsage(
  ownerId: string,
  year: number,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${ownerStayRequests.allowanceNightsApplied}), 0)`,
    })
    .from(ownerStayRequests)
    .where(
      and(
        eq(ownerStayRequests.ownerId, ownerId),
        eq(ownerStayRequests.allowanceYear, year),
        inArray(ownerStayRequests.status, ["approved", "completed"]),
      ),
    );
  return Number(row?.total ?? 0);
}

// -----------------------------------------------------------------------------
// Estimate (pricing + policy + allowance combined)
// -----------------------------------------------------------------------------

export interface OwnerStayEstimateContext {
  estimate: OwnerStayEstimate;
  policy: OwnerStayPolicyLike | null;
  ratePlanId: string | null;
  conflicts: { id: string; blockType: string; startsAt: string; endsAt: string }[];
  hasGuestBookingConflict: boolean;
  hasAnyConflict: boolean;
}

export async function estimateOwnerStayRequest(input: {
  ownerId: string;
  villaId: string;
  requestedStart: string; // YYYY-MM-DD
  requestedEnd: string; // YYYY-MM-DD
}): Promise<OwnerStayEstimateContext> {
  const db = getDb();
  if (!db) {
    // Without a DB we can't estimate. Return an empty shell.
    return {
      estimate: {
        totalNights: 0,
        blackoutNightCount: 0,
        peakNightCount: 0,
        allowanceNightsApplied: 0,
        billableNights: 0,
        estimatedGrossRevenueMinor: 0,
        estimatedManagementCompensationMinor: 0,
        estimatedOperationalCostMinor: 0,
        estimatedTotalOwnerChargeMinor: 0,
        currency: "USD",
        requiresAdminApproval: true,
        warnings: ["Database unavailable — estimate cannot be computed."],
      },
      policy: null,
      ratePlanId: null,
      conflicts: [],
      hasGuestBookingConflict: false,
      hasAnyConflict: false,
    };
  }

  const [v] = await db
    .select({ id: villas.id, projectId: villas.projectId })
    .from(villas)
    .where(eq(villas.id, input.villaId))
    .limit(1);
  if (!v) {
    return {
      estimate: {
        totalNights: 0,
        blackoutNightCount: 0,
        peakNightCount: 0,
        allowanceNightsApplied: 0,
        billableNights: 0,
        estimatedGrossRevenueMinor: 0,
        estimatedManagementCompensationMinor: 0,
        estimatedOperationalCostMinor: 0,
        estimatedTotalOwnerChargeMinor: 0,
        currency: "USD",
        requiresAdminApproval: true,
        warnings: ["Villa not found."],
      },
      policy: null,
      ratePlanId: null,
      conflicts: [],
      hasGuestBookingConflict: false,
      hasAnyConflict: false,
    };
  }

  const policy = await getApplicableOwnerStayPolicy(input.villaId, v.projectId);
  const year = Number(input.requestedStart.slice(0, 4));
  const alreadyApplied = await calculateAllowanceUsage(input.ownerId, year);
  const quote = await quoteForRange({
    villaId: input.villaId,
    checkIn: input.requestedStart,
    checkOut: input.requestedEnd,
  });
  // Normalise the service reason `'no_plan'` to a shape the estimator
  // accepts (it expects the pure quote's union). When there's no plan
  // we surface the warning via the estimator's own warnings list.
  const estimateQuote =
    quote.reason === "no_plan"
      ? {
          available: false as const,
          reason: "no_nights" as const,
          currency: quote.currency,
          nights: 0,
          grossAmountMinor: 0,
          breakdown: [],
          minLosWarning: null,
        }
      : {
          available: quote.available,
          reason: quote.reason,
          currency: quote.currency,
          nights: quote.nights,
          grossAmountMinor: quote.grossAmountMinor,
          breakdown: quote.breakdown,
          minLosWarning: quote.minLosWarning,
        };
  const estimate = estimateOwnerStay({
    policy,
    quote: estimateQuote,
    requestedStart: input.requestedStart,
    requestedEnd: input.requestedEnd,
    alreadyAppliedThisYear: alreadyApplied,
  });

  // Surface conflicts but don't block the estimate. Generic shape — owner-
  // facing UI will translate to a "dates unavailable" message without
  // exposing booking codes / guest details.
  const startTs = new Date(`${input.requestedStart}T00:00:00.000Z`);
  const endTs = new Date(`${input.requestedEnd}T00:00:00.000Z`);
  const conflicts = await detectAvailabilityConflicts(
    input.villaId,
    startTs,
    endTs,
  );
  const hasGuestBookingConflict = conflicts.some(
    (c) => c.blockType === "guest_booking",
  );

  return {
    estimate,
    policy,
    ratePlanId: quote.ratePlanId,
    conflicts: conflicts.map((c) => ({
      id: c.id,
      blockType: c.blockType,
      startsAt: new Date(c.startsAt).toISOString(),
      endsAt: new Date(c.endsAt).toISOString(),
    })),
    hasGuestBookingConflict,
    hasAnyConflict: conflicts.length > 0,
  };
}

// -----------------------------------------------------------------------------
// Request lifecycle reads
// -----------------------------------------------------------------------------

export interface OwnerStayRequestRow {
  id: string;
  ownerId: string;
  ownerName: string | null;
  villaId: string;
  villaCode: string | null;
  projectId: string | null;
  projectName: string | null;
  requestedStart: string;
  requestedEnd: string;
  guestsCount: number | null;
  purpose: string | null;
  status: string;
  estimatedGrossRevenueMinor: number;
  estimatedManagementCompensationMinor: number;
  estimatedOperationalCostMinor: number;
  estimatedTotalOwnerChargeMinor: number;
  currency: string;
  allowanceYear: number | null;
  allowanceNightsApplied: number;
  billableNights: number;
  relocationRequired: boolean;
  relocationPossible: boolean | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  completedAt: string | null;
  createdCalendarBlockId: string | null;
  adminNotes: string | null;
  /** v9C — current finance bridge state for the request. */
  financeBridgeStatus: string;
  financeLinkId: string | null;
  createdAt: string;
}

function demoOwnerStayFallback(): OwnerStayRequestRow[] {
  if (!isDemoOwnerFallbackActive()) return [];
  return listDemoOwnerStayRequests().map((r) => ({
    id: r.id,
    ownerId: r.ownerId,
    ownerName: "Emma Whitmore",
    villaId: r.villaId,
    villaCode: r.villaCode,
    projectId: null,
    projectName: r.villaName.includes("Enso")
      ? "Enso Villas"
      : r.villaName.includes("Eternal")
        ? "Eternal Villas"
        : "Ahau Villas",
    requestedStart: r.startDate,
    requestedEnd: r.endDate,
    guestsCount: r.guests,
    purpose: r.notes,
    status: r.status,
    estimatedGrossRevenueMinor: 0,
    estimatedManagementCompensationMinor: 0,
    estimatedOperationalCostMinor: 0,
    estimatedTotalOwnerChargeMinor: 0,
    currency: "IDR",
    allowanceYear: new Date().getUTCFullYear(),
    allowanceNightsApplied: 4,
    billableNights: 0,
    relocationRequired: false,
    relocationPossible: null,
    approvedAt: r.status === "approved" ? r.createdAt : null,
    rejectedAt: null,
    completedAt: r.status === "charges_posted" ? r.createdAt : null,
    createdCalendarBlockId: null,
    adminNotes: null,
    financeBridgeStatus:
      r.status === "charges_posted" ? "posted" : "not_required",
    financeLinkId: null,
    createdAt: r.createdAt,
  }));
}

function mapRequest(
  r: OwnerStayRequest,
  villaCode: string | null,
  projectName: string | null,
  ownerName: string | null,
): OwnerStayRequestRow {
  return {
    id: r.id,
    ownerId: r.ownerId,
    ownerName,
    villaId: r.villaId,
    villaCode,
    projectId: r.projectId,
    projectName,
    requestedStart: r.requestedStart as unknown as string,
    requestedEnd: r.requestedEnd as unknown as string,
    guestsCount: r.guestsCount,
    purpose: r.purpose,
    status: r.status,
    estimatedGrossRevenueMinor: r.estimatedGrossRevenueMinor,
    estimatedManagementCompensationMinor: r.estimatedManagementCompensationMinor,
    estimatedOperationalCostMinor: r.estimatedOperationalCostMinor,
    estimatedTotalOwnerChargeMinor: r.estimatedTotalOwnerChargeMinor,
    currency: r.currency,
    allowanceYear: r.allowanceYear,
    allowanceNightsApplied: r.allowanceNightsApplied,
    billableNights: r.billableNights,
    relocationRequired: r.relocationRequired,
    relocationPossible: r.relocationPossible,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdCalendarBlockId: r.createdCalendarBlockId,
    adminNotes: r.adminNotes,
    financeBridgeStatus: r.financeBridgeStatus,
    financeLinkId: r.financeLinkId,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listOwnerStayRequests(opts?: {
  status?: string | string[];
  ownerId?: string;
  villaId?: string;
  limit?: number;
}): Promise<OwnerStayRequestRow[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY (mig 0152/0158): owner_stay_requests is org-scoped. Filter to the
  // caller's org so the mgmt list (and the dashboard attention card it feeds)
  // never shows another org's — or demo — owner-stay requests.
  const filters = [eq(ownerStayRequests.organizationId, await requireOrgId())];
  if (opts?.status) {
    if (Array.isArray(opts.status))
      filters.push(inArray(ownerStayRequests.status, opts.status));
    else filters.push(eq(ownerStayRequests.status, opts.status));
  }
  if (opts?.ownerId) filters.push(eq(ownerStayRequests.ownerId, opts.ownerId));
  if (opts?.villaId) filters.push(eq(ownerStayRequests.villaId, opts.villaId));
  const rows = await db
    .select({
      r: ownerStayRequests,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
      ownerName: owners.displayName,
    })
    .from(ownerStayRequests)
    .leftJoin(villas, eq(villas.id, ownerStayRequests.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, ownerStayRequests.projectId))
    .leftJoin(owners, eq(owners.id, ownerStayRequests.ownerId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(ownerStayRequests.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) =>
    mapRequest(r.r, r.villaCode ?? null, r.projectName ?? null, r.ownerName ?? null),
  );
}

export async function listOwnerStayRequestsForCurrentOwner(): Promise<
  OwnerStayRequestRow[]
> {
  const db = getDb();
  if (!db) return demoOwnerStayFallback();
  const me = await getCurrentAppUser();
  let ownerIds: string[] = [];
  if (me) {
    const grants = await db
      .select({ ownerId: appUsersOwners.ownerId })
      .from(appUsersOwners)
      .where(
        and(
          eq(appUsersOwners.appUserId, me.id),
          eq(appUsersOwners.status, "active"),
        ),
      );
    ownerIds = grants.map((g) => g.ownerId);
  }
  if (ownerIds.length === 0) {
    // P116B — demo-mode fallback so the demo owner stays page never empty.
    if (isDemoOwnerFallbackActive()) {
      ownerIds = [DEMO_OWNER_CONTEXT.ownerId];
    } else {
      return [];
    }
  }
  return listOwnerStayRequests({ ownerId: ownerIds[0], limit: 200 }).then(
    async () => {
      // Multi-owner support: union by inArray.
      const rows = await db
        .select({
          r: ownerStayRequests,
          villaCode: villas.unitCode,
          projectName: projectsTable.name,
          ownerName: owners.displayName,
        })
        .from(ownerStayRequests)
        .leftJoin(villas, eq(villas.id, ownerStayRequests.villaId))
        .leftJoin(projectsTable, eq(projectsTable.id, ownerStayRequests.projectId))
        .leftJoin(owners, eq(owners.id, ownerStayRequests.ownerId))
        .where(inArray(ownerStayRequests.ownerId, ownerIds))
        .orderBy(desc(ownerStayRequests.createdAt))
        .limit(200);
      if (rows.length === 0) return demoOwnerStayFallback();
      return rows.map((r) =>
        mapRequest(
          r.r,
          r.villaCode ?? null,
          r.projectName ?? null,
          r.ownerName ?? null,
        ),
      );
    },
  );
}

export async function getOwnerStayRequestById(
  id: string,
): Promise<OwnerStayRequestRow | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select({
      r: ownerStayRequests,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
      ownerName: owners.displayName,
    })
    .from(ownerStayRequests)
    .leftJoin(villas, eq(villas.id, ownerStayRequests.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, ownerStayRequests.projectId))
    .leftJoin(owners, eq(owners.id, ownerStayRequests.ownerId))
    // NOTE: deliberately NOT org-scoped — this by-id read is shared with the
    // owner portal (/owner/stays/[id]), where the caller's org can legitimately
    // differ from the villa's org and the page enforces access via ownerId
    // instead. The MGMT detail page must use getOwnerStayRequestByIdForOrg()
    // below so a cross-org id reads as not-found.
    .where(eq(ownerStayRequests.id, id))
    .limit(1);
  return r
    ? mapRequest(r.r, r.villaCode ?? null, r.projectName ?? null, r.ownerName ?? null)
    : null;
}

/**
 * Mgmt-only by-id read: like getOwnerStayRequestById but ANDs the caller's org
 * so a cross-org request id reads as not-found (closes the typed-id IDOR on the
 * /dashboard/owner-stays/requests/[id] detail page). Do NOT use from the owner
 * portal — see the note above.
 */
export async function getOwnerStayRequestByIdForOrg(
  id: string,
): Promise<OwnerStayRequestRow | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [r] = await db
    .select({
      r: ownerStayRequests,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
      ownerName: owners.displayName,
    })
    .from(ownerStayRequests)
    .leftJoin(villas, eq(villas.id, ownerStayRequests.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, ownerStayRequests.projectId))
    .leftJoin(owners, eq(owners.id, ownerStayRequests.ownerId))
    .where(
      and(
        eq(ownerStayRequests.id, id),
        eq(ownerStayRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  return r
    ? mapRequest(r.r, r.villaCode ?? null, r.projectName ?? null, r.ownerName ?? null)
    : null;
}

// -----------------------------------------------------------------------------
// Owner-portal choices — what owner_ids + villas can the current user see?
// -----------------------------------------------------------------------------

export interface OwnerPortalChoice {
  ownerId: string;
  ownerName: string;
  villas: { id: string; unitCode: string; projectName: string | null }[];
}

/**
 * Used by the owner-portal "request a stay" form. Filters strictly to
 * owner_ids the current app_user holds an active grant on, and to villas
 * linked via `ownership_shares` so an owner only ever sees their own
 * villas in the picker.
 */
export async function listOwnerPortalChoicesForCurrentUser(): Promise<
  OwnerPortalChoice[]
> {
  const db = getDb();
  if (!db) return [];
  const me = await getCurrentAppUser();
  if (!me) return [];
  const grants = await db
    .select({ ownerId: appUsersOwners.ownerId })
    .from(appUsersOwners)
    .where(
      and(
        eq(appUsersOwners.appUserId, me.id),
        eq(appUsersOwners.status, "active"),
      ),
    );
  if (grants.length === 0) return [];
  const ownerIds = Array.from(new Set(grants.map((g) => g.ownerId)));

  const ownerRows = await db
    .select({ id: owners.id, displayName: owners.displayName })
    .from(owners)
    .where(inArray(owners.id, ownerIds))
    .orderBy(asc(owners.displayName));

  const villaRows = (await db.execute(sql`
    SELECT s.owner_id AS "ownerId", v.id, v.unit_code AS "unitCode",
           p.name AS "projectName"
      FROM ownership_shares s
      JOIN villas v ON v.id = s.villa_id
      LEFT JOIN projects p ON p.id = v.project_id
     WHERE s.owner_id IN (${sql.join(
       ownerIds.map((id) => sql`${id}::uuid`),
       sql`, `,
     )})
       AND s.status = 'active'
     ORDER BY v.unit_code ASC
  `)) as unknown as Array<{
    ownerId: string;
    id: string;
    unitCode: string;
    projectName: string | null;
  }> & { rows?: Array<{
    ownerId: string;
    id: string;
    unitCode: string;
    projectName: string | null;
  }> };
  const flat = villaRows.rows ?? (villaRows as unknown as Array<{
    ownerId: string;
    id: string;
    unitCode: string;
    projectName: string | null;
  }>);

  const byOwner: Record<string, OwnerPortalChoice["villas"]> = {};
  for (const v of flat) {
    if (!byOwner[v.ownerId]) byOwner[v.ownerId] = [];
    byOwner[v.ownerId].push({
      id: v.id,
      unitCode: v.unitCode,
      projectName: v.projectName ?? null,
    });
  }
  return ownerRows.map((o) => ({
    ownerId: o.id,
    ownerName: o.displayName,
    villas: byOwner[o.id] ?? [],
  }));
}

// -----------------------------------------------------------------------------
// Equivalence groups
// -----------------------------------------------------------------------------

export async function listEquivalenceGroups() {
  const db = getDb();
  if (!db) return [];
  // TENANCY — groups have no org column; scope through their project. projectId
  // is nullable (global groups), so allow either an in-org project OR a global
  // group (null projectId). Backs the dashboard "N equivalence groups" KPI and
  // the Equivalence Groups page.
  const organizationId = await requireOrgId();
  const groups = await db
    .select({
      g: villaEquivalenceGroups,
      projectName: projectsTable.name,
    })
    .from(villaEquivalenceGroups)
    .leftJoin(projectsTable, eq(projectsTable.id, villaEquivalenceGroups.projectId))
    .where(
      or(
        eq(projectsTable.organizationId, organizationId),
        isNull(villaEquivalenceGroups.projectId),
      ),
    )
    .orderBy(asc(villaEquivalenceGroups.name));
  return groups.map((g) => ({
    id: g.g.id,
    name: g.g.name,
    projectId: g.g.projectId,
    projectName: g.projectName ?? null,
    description: g.g.description,
    status: g.g.status,
  }));
}

export async function listEquivalenceMembers(groupId: string) {
  const db = getDb();
  if (!db) return [];
  // TENANCY (defense-in-depth) — the only caller feeds group ids returned by the
  // now-scoped listEquivalenceGroups, but gate the parent group's org here too so
  // a directly-supplied out-of-org groupId returns nothing. Group scope = in-org
  // project OR global (null projectId), matching listEquivalenceGroups.
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      m: villaEquivalenceGroupMembers,
      villaCode: villas.unitCode,
      villaStatus: villas.status,
    })
    .from(villaEquivalenceGroupMembers)
    .innerJoin(
      villaEquivalenceGroups,
      eq(villaEquivalenceGroups.id, villaEquivalenceGroupMembers.groupId),
    )
    .leftJoin(projectsTable, eq(projectsTable.id, villaEquivalenceGroups.projectId))
    .leftJoin(villas, eq(villas.id, villaEquivalenceGroupMembers.villaId))
    .where(
      and(
        eq(villaEquivalenceGroupMembers.groupId, groupId),
        or(
          eq(projectsTable.organizationId, organizationId),
          isNull(villaEquivalenceGroups.projectId),
        ),
      ),
    )
    .orderBy(asc(villaEquivalenceGroupMembers.qualityRank));
  return rows.map((r) => ({
    id: r.m.id,
    groupId: r.m.groupId,
    villaId: r.m.villaId,
    villaCode: r.villaCode ?? null,
    villaStatus: r.villaStatus ?? null,
    qualityRank: r.m.qualityRank,
    notes: r.m.notes,
    status: r.m.status,
  }));
}

/**
 * Pure helper: collapse the estimator output into the columns we persist
 * on `owner_stay_requests`. Exposed so the action layer + future finance
 * bridge speak the same shape. NO finance materialisation in v9B —
 * `revenue_lines` / `expense_lines` writing lands in v9C.
 */
export function calculateOwnerStayCharges(
  estimate: OwnerStayEstimate,
): {
  estimatedGrossRevenueMinor: number;
  estimatedManagementCompensationMinor: number;
  estimatedOperationalCostMinor: number;
  estimatedTotalOwnerChargeMinor: number;
  currency: string;
  allowanceNightsApplied: number;
  billableNights: number;
} {
  return {
    estimatedGrossRevenueMinor: estimate.estimatedGrossRevenueMinor,
    estimatedManagementCompensationMinor:
      estimate.estimatedManagementCompensationMinor,
    estimatedOperationalCostMinor: estimate.estimatedOperationalCostMinor,
    estimatedTotalOwnerChargeMinor: estimate.estimatedTotalOwnerChargeMinor,
    currency: estimate.currency,
    allowanceNightsApplied: estimate.allowanceNightsApplied,
    billableNights: estimate.billableNights,
  };
}

// Suppress unused imports — these are referenced indirectly via re-exports.
export const _drizzleHelpers = {
  asc,
  desc,
  gte,
  lte,
  isNull,
  or,
  loadActiveBlocksForVilla,
  villaCalendarBlocks,
  bookingRelocationCandidates,
  villaEquivalenceGroups,
  villaEquivalenceGroupMembers,
};
