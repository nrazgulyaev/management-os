import "server-only";

/**
 * Stage 7.B — Feature gating helpers.
 *
 * Three gating layers:
 *   1. Page-level — middleware-style guard called at the top of a server
 *      component. Redirects to /upgrade when locked.
 *   2. Action-level — server-action wrapper that throws
 *      `FeatureNotAvailableError` when locked. Caller surfaces a toast.
 *   3. UI-level — pure helper consumed by client components to render
 *      lock badges + upgrade CTAs. UI gate is informational; the
 *      authoritative gate is server-side.
 *
 * Soft vs hard limits:
 *   - Soft: warning banner approaching 80%/95% (uses `getNumericLimit`).
 *   - Hard: server actions refuse create when at limit.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  featureFlags,
  orgSubscriptions,
  planFeatures,
} from "@/lib/db/schema/subscriptions";

export class FeatureNotAvailableError extends Error {
  readonly code = "FEATURE_NOT_AVAILABLE";
  readonly flagCode: string;
  readonly planCode: string;
  constructor(flagCode: string, planCode: string) {
    super(
      `Feature '${flagCode}' is not available on plan '${planCode}'. Upgrade to enable it.`,
    );
    this.name = "FeatureNotAvailableError";
    this.flagCode = flagCode;
    this.planCode = planCode;
  }
}

export class FeatureLimitExceededError extends Error {
  readonly code = "FEATURE_LIMIT_EXCEEDED";
  readonly flagCode: string;
  readonly limit: bigint;
  readonly current: bigint;
  constructor(flagCode: string, limit: bigint, current: bigint) {
    super(
      `Plan limit reached for '${flagCode}': ${current.toString()} / ${limit.toString()}.`,
    );
    this.name = "FeatureLimitExceededError";
    this.flagCode = flagCode;
    this.limit = limit;
    this.current = current;
  }
}

/**
 * Resolve the **active** subscription row for an org. Returns null when
 * the org has no subscription row (which should never happen in
 * production — onboarding seeds a 'trial' row).
 */
export async function getActiveOrgSubscription(
  organizationId: string,
): Promise<{
  planCode: string;
  status: string;
  isInternalComp: boolean;
} | null> {
  const db = getDb();
  if (!db) return null;
  // Active states: trial, active, grace, cancelling. Suspended/archived
  // orgs have no functional access.
  const [row] = await db
    .select({
      planCode: orgSubscriptions.planCode,
      status: orgSubscriptions.status,
      isInternalComp: orgSubscriptions.isInternalComp,
    })
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, organizationId))
    .orderBy(orgSubscriptions.createdAt)
    .limit(1);
  return row ?? null;
}

/**
 * Check if a feature flag is enabled for an org's plan.
 *
 * Returns `true` for boolean flags, the limit value for numeric flags
 * (or null when unset), and `false` when the flag is disabled OR the
 * plan doesn't include it.
 */
export async function getFeatureForOrg(
  organizationId: string,
  flagCode: string,
): Promise<
  | { enabled: false; reason: "no_subscription" | "not_in_plan" | "disabled" }
  | { enabled: true; limit: bigint | null }
> {
  const db = getDb();
  if (!db) {
    return { enabled: false, reason: "no_subscription" };
  }

  const sub = await getActiveOrgSubscription(organizationId);
  if (!sub) return { enabled: false, reason: "no_subscription" };

  // Internal-comp orgs bypass plan gating — always return enabled.
  if (sub.isInternalComp) return { enabled: true, limit: null };

  const [row] = await db
    .select({
      isEnabled: planFeatures.isEnabled,
      limitValue: planFeatures.limitValue,
    })
    .from(planFeatures)
    .innerJoin(featureFlags, eq(featureFlags.flagCode, planFeatures.flagCode))
    .where(
      and(
        eq(planFeatures.planCode, sub.planCode),
        eq(planFeatures.flagCode, flagCode),
      ),
    )
    .limit(1);

  if (!row) return { enabled: false, reason: "not_in_plan" };
  if (!row.isEnabled) return { enabled: false, reason: "disabled" };
  return { enabled: true, limit: row.limitValue };
}

/**
 * Action-level guard. Throws `FeatureNotAvailableError` when the org's
 * plan doesn't include the requested boolean flag.
 *
 * Usage:
 *   await requireFeature(orgId, "feature.investor_portal");
 */
export async function requireFeature(
  organizationId: string,
  flagCode: string,
): Promise<void> {
  const result = await getFeatureForOrg(organizationId, flagCode);
  if (!result.enabled) {
    const sub = await getActiveOrgSubscription(organizationId);
    throw new FeatureNotAvailableError(flagCode, sub?.planCode ?? "none");
  }
}

/**
 * Action-level numeric-limit guard. Throws `FeatureLimitExceededError`
 * when `current >= limit`. Pass `current` from a `count(*)` query.
 *
 * Usage:
 *   const villaCount = ...await db.select({ c: count() }).from(villas)...;
 *   await requireWithinLimit(orgId, "limit.villa_count", villaCount);
 */
export async function requireWithinLimit(
  organizationId: string,
  flagCode: string,
  current: bigint | number,
): Promise<void> {
  const result = await getFeatureForOrg(organizationId, flagCode);
  if (!result.enabled) {
    // Limit-class flags absent from the plan are treated as 0 (block).
    throw new FeatureNotAvailableError(
      flagCode,
      (await getActiveOrgSubscription(organizationId))?.planCode ?? "none",
    );
  }
  if (result.limit == null) return; // null limit = unlimited
  const cur = typeof current === "bigint" ? current : BigInt(current);
  if (cur >= result.limit) {
    throw new FeatureLimitExceededError(flagCode, result.limit, cur);
  }
}

/**
 * Page-level guard for server components. Returns the redirect target
 * when the org doesn't have access. Caller invokes redirect() on the
 * return value.
 *
 *   const redirectTo = await pageGate(orgId, "cabinet.cfo_accountant");
 *   if (redirectTo) redirect(redirectTo);
 */
export async function pageGate(
  organizationId: string,
  flagCode: string,
): Promise<string | null> {
  const result = await getFeatureForOrg(organizationId, flagCode);
  if (result.enabled) return null;
  return `/dashboard/billing/upgrade?locked=${encodeURIComponent(flagCode)}`;
}

/**
 * UI-level read for client components rendering lock badges. Returns
 * a serializable summary.
 */
export interface UiFeatureGate {
  flagCode: string;
  enabled: boolean;
  limit: string | null; // serialized bigint
  reason: "ok" | "no_subscription" | "not_in_plan" | "disabled";
}

export async function uiFeatureGate(
  organizationId: string,
  flagCode: string,
): Promise<UiFeatureGate> {
  const result = await getFeatureForOrg(organizationId, flagCode);
  if (result.enabled) {
    return {
      flagCode,
      enabled: true,
      limit: result.limit !== null ? result.limit.toString() : null,
      reason: "ok",
    };
  }
  return {
    flagCode,
    enabled: false,
    limit: null,
    reason: result.reason,
  };
}
