/**
 * Stage 10.6.E.2 — SubscriptionOS read-only queries.
 *
 * All 5 admin pages share these query helpers. Reads-only; no mutations
 * ship in 10.6.E.2 (extend trial / comp / cancel are stubbed in the
 * per-org detail UI and become real server actions in a follow-up
 * sub-phase that pairs with the impersonation flow).
 *
 * Every function returns plain objects (no Drizzle row types leaked) so
 * the consumer pages stay testable + easy to snapshot.
 */

import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import {
  orgSubscriptions,
  subscriptionPlans,
  subscriptionLifecycleEvents,
  planFeatures,
  featureFlags,
} from "@/lib/db/schema/subscriptions";
import { auditEvents } from "@/lib/db/schema/audit";
import { appUsers } from "@/lib/db/schema/identity";

// ============================================================================
// Types
// ============================================================================

export interface SubscriptionOsOrgRow {
  id: string;
  organizationCode: string;
  name: string;
  organizationType: string;
  status: string;
  planCode: string | null;
  planDisplayName: string | null;
  monthlyPriceMinor: bigint | null;
  currency: string | null;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  cancelledAt: Date | null;
  isInternalComp: boolean;
  productsEnabled: string[];
  createdAt: Date;
}

export interface RevenueSnapshot {
  /** Sum of monthlyPriceMinor across active orgs (status in active / trial). */
  mrrMinor: bigint;
  /** mrr × 12 — annualised. */
  arrMinor: bigint;
  /** Total customer orgs (any status except archived/purged). */
  customerCount: number;
  /** Active subscriptions (status='active'). */
  activeCount: number;
  /** Trial subscriptions (status='trial'). */
  trialCount: number;
  /** Cancelled subscriptions in the last 30 days. */
  cancelledLast30dCount: number;
  /** Past trials → paid in the last 30 days (lifecycle event count). */
  trialToPaidLast30dCount: number;
  /** Per-tier breakdown for revenue page card grid. */
  perTier: Array<{
    planCode: string;
    planDisplayName: string;
    activeCount: number;
    trialCount: number;
    monthlyPriceMinor: bigint;
    mrrContributionMinor: bigint;
  }>;
  currency: string;
}

export interface PlatformAuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ============================================================================
// Org list — drives /platform/organizations + the per-org detail
// ============================================================================

export interface ListOrgsFilter {
  /** Filter by subscription status. Empty / undefined = all. */
  status?: "trial" | "active" | "grace" | "cancelled" | "archived" | "purged" | "";
  /** Free-text search on org name or code. Empty = no filter. */
  search?: string;
}

export async function listSubscriptionOsOrgs(
  filter: ListOrgsFilter = {},
): Promise<SubscriptionOsOrgRow[]> {
  const db = getDb();
  if (!db) return [];

  const conditions = [];
  if (filter.status) {
    conditions.push(eq(orgSubscriptions.status, filter.status));
  }
  if (filter.search && filter.search.trim().length > 0) {
    const q = `%${filter.search.trim()}%`;
    conditions.push(
      sql`(${organizations.name} ILIKE ${q} OR ${organizations.organizationCode} ILIKE ${q})`,
    );
  }

  const rows = await db
    .select({
      id: organizations.id,
      organizationCode: organizations.organizationCode,
      name: organizations.name,
      organizationType: organizations.organizationType,
      status: orgSubscriptions.status,
      planCode: orgSubscriptions.planCode,
      planDisplayName: subscriptionPlans.displayName,
      monthlyPriceMinor: subscriptionPlans.monthlyPriceMinor,
      currency: subscriptionPlans.currency,
      trialEndsAt: orgSubscriptions.trialEndsAt,
      currentPeriodEndsAt: orgSubscriptions.currentPeriodEndsAt,
      cancelledAt: orgSubscriptions.cancelledAt,
      isInternalComp: orgSubscriptions.isInternalComp,
      productsEnabled: organizations.productsEnabled,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .leftJoin(orgSubscriptions, eq(orgSubscriptions.organizationId, organizations.id))
    .leftJoin(
      subscriptionPlans,
      eq(subscriptionPlans.planCode, orgSubscriptions.planCode),
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(organizations.createdAt));

  return rows.map((r) => ({
    id: r.id,
    organizationCode: r.organizationCode,
    name: r.name,
    organizationType: r.organizationType,
    status: r.status ?? "no-subscription",
    planCode: r.planCode,
    planDisplayName: r.planDisplayName,
    monthlyPriceMinor: r.monthlyPriceMinor,
    currency: r.currency,
    trialEndsAt: r.trialEndsAt,
    currentPeriodEndsAt: r.currentPeriodEndsAt,
    cancelledAt: r.cancelledAt,
    isInternalComp: r.isInternalComp ?? false,
    productsEnabled: r.productsEnabled ?? [],
    createdAt: r.createdAt,
  }));
}

// ============================================================================
// Per-org detail
// ============================================================================

export async function getSubscriptionOsOrgByCode(
  organizationCode: string,
): Promise<SubscriptionOsOrgRow | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: organizations.id,
      organizationCode: organizations.organizationCode,
      name: organizations.name,
      organizationType: organizations.organizationType,
      status: orgSubscriptions.status,
      planCode: orgSubscriptions.planCode,
      planDisplayName: subscriptionPlans.displayName,
      monthlyPriceMinor: subscriptionPlans.monthlyPriceMinor,
      currency: subscriptionPlans.currency,
      trialEndsAt: orgSubscriptions.trialEndsAt,
      currentPeriodEndsAt: orgSubscriptions.currentPeriodEndsAt,
      cancelledAt: orgSubscriptions.cancelledAt,
      isInternalComp: orgSubscriptions.isInternalComp,
      productsEnabled: organizations.productsEnabled,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .leftJoin(orgSubscriptions, eq(orgSubscriptions.organizationId, organizations.id))
    .leftJoin(
      subscriptionPlans,
      eq(subscriptionPlans.planCode, orgSubscriptions.planCode),
    )
    .where(eq(organizations.organizationCode, organizationCode))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    organizationCode: r.organizationCode,
    name: r.name,
    organizationType: r.organizationType,
    status: r.status ?? "no-subscription",
    planCode: r.planCode,
    planDisplayName: r.planDisplayName,
    monthlyPriceMinor: r.monthlyPriceMinor,
    currency: r.currency,
    trialEndsAt: r.trialEndsAt,
    currentPeriodEndsAt: r.currentPeriodEndsAt,
    cancelledAt: r.cancelledAt,
    isInternalComp: r.isInternalComp ?? false,
    productsEnabled: r.productsEnabled ?? [],
    createdAt: r.createdAt,
  };
}

export async function getOrgLifecycleEvents(
  organizationId: string,
  limit = 25,
): Promise<
  Array<{
    id: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    actorKind: string;
    occurredAt: Date;
  }>
> {
  const db = getDb();
  if (!db) return [];
  return db
    .select({
      id: subscriptionLifecycleEvents.id,
      eventType: subscriptionLifecycleEvents.eventType,
      fromStatus: subscriptionLifecycleEvents.fromStatus,
      toStatus: subscriptionLifecycleEvents.toStatus,
      actorKind: subscriptionLifecycleEvents.actorKind,
      occurredAt: subscriptionLifecycleEvents.occurredAt,
    })
    .from(subscriptionLifecycleEvents)
    .where(eq(subscriptionLifecycleEvents.organizationId, organizationId))
    .orderBy(desc(subscriptionLifecycleEvents.occurredAt))
    .limit(limit);
}

// ============================================================================
// Revenue snapshot
// ============================================================================

export async function getRevenueSnapshot(): Promise<RevenueSnapshot> {
  const db = getDb();
  const empty: RevenueSnapshot = {
    mrrMinor: 0n,
    arrMinor: 0n,
    customerCount: 0,
    activeCount: 0,
    trialCount: 0,
    cancelledLast30dCount: 0,
    trialToPaidLast30dCount: 0,
    perTier: [],
    currency: "USD",
  };
  if (!db) return empty;

  // Pull all subscriptions joined to plans — we aggregate in JS to keep
  // the SQL portable (pg / sqlite) and to avoid drizzle helper drift.
  const rows = await db
    .select({
      status: orgSubscriptions.status,
      planCode: orgSubscriptions.planCode,
      planDisplayName: subscriptionPlans.displayName,
      monthlyPriceMinor: subscriptionPlans.monthlyPriceMinor,
      currency: subscriptionPlans.currency,
      cancelledAt: orgSubscriptions.cancelledAt,
    })
    .from(orgSubscriptions)
    .innerJoin(
      subscriptionPlans,
      eq(subscriptionPlans.planCode, orgSubscriptions.planCode),
    );

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const out: RevenueSnapshot = { ...empty };
  const tierAgg = new Map<
    string,
    {
      planCode: string;
      planDisplayName: string;
      activeCount: number;
      trialCount: number;
      monthlyPriceMinor: bigint;
      mrrContributionMinor: bigint;
    }
  >();

  for (const r of rows) {
    if (r.status !== "archived" && r.status !== "purged") {
      out.customerCount += 1;
    }
    if (r.status === "active") {
      out.activeCount += 1;
      out.mrrMinor += r.monthlyPriceMinor ?? 0n;
    }
    if (r.status === "trial") out.trialCount += 1;
    if (r.status === "cancelled" && r.cancelledAt && r.cancelledAt >= thirtyDaysAgo) {
      out.cancelledLast30dCount += 1;
    }

    const key = r.planCode;
    const cur = tierAgg.get(key) ?? {
      planCode: r.planCode,
      planDisplayName: r.planDisplayName,
      activeCount: 0,
      trialCount: 0,
      monthlyPriceMinor: r.monthlyPriceMinor ?? 0n,
      mrrContributionMinor: 0n,
    };
    if (r.status === "active") {
      cur.activeCount += 1;
      cur.mrrContributionMinor += r.monthlyPriceMinor ?? 0n;
    }
    if (r.status === "trial") cur.trialCount += 1;
    tierAgg.set(key, cur);
    out.currency = r.currency ?? "USD";
  }

  out.arrMinor = out.mrrMinor * 12n;

  // Trial → paid lifecycle events in the last 30 days.
  const conversions = await db
    .select({ id: subscriptionLifecycleEvents.id })
    .from(subscriptionLifecycleEvents)
    .where(
      and(
        eq(subscriptionLifecycleEvents.eventType, "trial_converted"),
        gte(subscriptionLifecycleEvents.occurredAt, thirtyDaysAgo),
      ),
    );
  out.trialToPaidLast30dCount = conversions.length;

  out.perTier = Array.from(tierAgg.values()).sort(
    (a, b) => Number(b.mrrContributionMinor - a.mrrContributionMinor),
  );

  return out;
}

// ============================================================================
// Audit log entries — `actorKind` filtered to platform-admin actions
// ============================================================================

export async function listPlatformAuditEntries(
  limit = 200,
): Promise<PlatformAuditEntry[]> {
  const db = getDb();
  if (!db) return [];

  // We surface every audit_events row whose action starts with
  // "platform." OR whose actor is a super_admin. The latter requires a
  // join to identify super_admin users; for v1 we use the action prefix
  // as the proxy and let 10.6.E.2.5 (impersonation) emit
  // "platform.impersonate.*" events that automatically surface here.
  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      actorUserId: auditEvents.actorUserId,
      actorEmail: appUsers.email,
      actorName: appUsers.fullName,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(appUsers, eq(appUsers.id, auditEvents.actorUserId))
    .where(sql`${auditEvents.action} LIKE 'platform.%'`)
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    actorUserId: r.actorUserId,
    actorEmail: r.actorEmail,
    actorName: r.actorName,
    metadata: r.metadata as Record<string, unknown> | null,
    createdAt: r.createdAt,
  }));
}

// ============================================================================
// Platform Console — customer-status summary (P1)
// ============================================================================

export interface PlatformConsoleSummary {
  /** Total customer orgs (any non-archived/purged status). */
  total: number;
  active: number;
  trial: number;
  grace: number;
  cancelled: number;
}

/**
 * Status-count rollup for the /platform cockpit. Counts org_subscriptions
 * grouped by status; `total` excludes archived + purged (matches the
 * RevenueSnapshot.customerCount convention).
 */
export async function getPlatformConsoleSummary(): Promise<PlatformConsoleSummary> {
  const empty: PlatformConsoleSummary = {
    total: 0,
    active: 0,
    trial: 0,
    grace: 0,
    cancelled: 0,
  };
  const db = getDb();
  if (!db) return empty;

  const rows = await db
    .select({ status: orgSubscriptions.status })
    .from(orgSubscriptions);

  const out: PlatformConsoleSummary = { ...empty };
  for (const r of rows) {
    if (r.status !== "archived" && r.status !== "purged") out.total += 1;
    if (r.status === "active") out.active += 1;
    if (r.status === "trial") out.trial += 1;
    if (r.status === "grace") out.grace += 1;
    if (r.status === "cancelled" || r.status === "cancelling") out.cancelled += 1;
  }
  return out;
}

// ============================================================================
// Plans & pricing editor — grid of plans + limits + live org counts (P1)
// ============================================================================

export interface PlanLimitRow {
  flagCode: string;
  flagDisplayName: string;
  category: string;
  isEnabled: boolean;
  limitValue: bigint | null;
  isNumericLimit: boolean;
}

export interface PlanWithCounts {
  id: string;
  planCode: string;
  displayName: string;
  description: string | null;
  tierRank: number;
  monthlyPriceMinor: bigint;
  annualPriceMinor: bigint | null;
  currency: string;
  trialPeriodDays: number;
  isActive: boolean;
  isInternal: boolean;
  isPublic: boolean;
  sortOrder: number;
  /** Orgs currently on this plan (any non-archived/purged status). */
  orgCount: number;
  /** Orgs on this plan with status='active'. */
  activeOrgCount: number;
  /** Feature limits / flags mapped to this plan. */
  limits: PlanLimitRow[];
}

/**
 * Drives the Plans & pricing editor grid. Returns every plan with its
 * feature-limit rows + a live count of orgs subscribed to it. Plans are
 * sorted by sortOrder then tierRank.
 */
export async function listPlansWithCounts(): Promise<PlanWithCounts[]> {
  const db = getDb();
  if (!db) return [];

  const plans = await db
    .select()
    .from(subscriptionPlans)
    .orderBy(subscriptionPlans.sortOrder, subscriptionPlans.tierRank);

  if (plans.length === 0) return [];

  // Org counts grouped by plan_code (single pass over subscriptions).
  const subRows = await db
    .select({
      planCode: orgSubscriptions.planCode,
      status: orgSubscriptions.status,
    })
    .from(orgSubscriptions);

  const countByPlan = new Map<string, { total: number; active: number }>();
  for (const r of subRows) {
    if (r.status === "archived" || r.status === "purged") continue;
    const cur = countByPlan.get(r.planCode) ?? { total: 0, active: 0 };
    cur.total += 1;
    if (r.status === "active") cur.active += 1;
    countByPlan.set(r.planCode, cur);
  }

  // Feature limits per plan (join plan_features -> feature_flags).
  const featureRows = await db
    .select({
      planCode: planFeatures.planCode,
      flagCode: planFeatures.flagCode,
      isEnabled: planFeatures.isEnabled,
      limitValue: planFeatures.limitValue,
      flagDisplayName: featureFlags.displayName,
      category: featureFlags.category,
      isNumericLimit: featureFlags.isNumericLimit,
    })
    .from(planFeatures)
    .leftJoin(featureFlags, eq(featureFlags.flagCode, planFeatures.flagCode));

  const limitsByPlan = new Map<string, PlanLimitRow[]>();
  for (const f of featureRows) {
    const arr = limitsByPlan.get(f.planCode) ?? [];
    arr.push({
      flagCode: f.flagCode,
      flagDisplayName: f.flagDisplayName ?? f.flagCode,
      category: f.category ?? "general",
      isEnabled: f.isEnabled,
      limitValue: f.limitValue,
      isNumericLimit: f.isNumericLimit ?? false,
    });
    limitsByPlan.set(f.planCode, arr);
  }

  return plans.map((p) => {
    const c = countByPlan.get(p.planCode) ?? { total: 0, active: 0 };
    return {
      id: p.id,
      planCode: p.planCode,
      displayName: p.displayName,
      description: p.description,
      tierRank: p.tierRank,
      monthlyPriceMinor: p.monthlyPriceMinor,
      annualPriceMinor: p.annualPriceMinor,
      currency: p.currency,
      trialPeriodDays: p.trialPeriodDays,
      isActive: p.isActive,
      isInternal: p.isInternal,
      isPublic: p.isPublic,
      sortOrder: p.sortOrder,
      orgCount: c.total,
      activeOrgCount: c.active,
      limits: (limitsByPlan.get(p.planCode) ?? []).sort((a, b) =>
        a.category.localeCompare(b.category) ||
        a.flagDisplayName.localeCompare(b.flagDisplayName),
      ),
    };
  });
}
