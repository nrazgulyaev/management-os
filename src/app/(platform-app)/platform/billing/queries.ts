/**
 * Platform Billing console — read-only queries (v1, pre-PSP).
 *
 * HONESTY CONTRACT: no payment service provider is connected yet
 * (Stripe / Xendit are deferred to platform launch), so there are no
 * invoice, payment, refund or dunning tables to read. Everything here
 * derives from what actually exists:
 *
 *   - organizations + org_subscriptions + subscription_plans
 *     → per-org billing state + MRR (same join /platform/revenue uses)
 *   - subscription_lifecycle_events → plan/billing history per org
 *   - audit_events (action LIKE 'platform.subscription.%',
 *     entity_id = org id) → operator billing actions (comp grants,
 *     trial extensions, cancellations) with actor + reason
 *
 * Colocated with the /platform/billing routes on purpose — the shared
 * subscription-os query module is owned by other surfaces; billing-only
 * reads live here. Auth is enforced by the (platform-app) layout
 * (super_admin gate); these are reads only, no mutations.
 */

import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import {
  orgSubscriptions,
  subscriptionPlans,
} from "@/lib/db/schema/subscriptions";
import { auditEvents } from "@/lib/db/schema/audit";
import { appUsers } from "@/lib/db/schema/identity";

// ============================================================================
// Billing state — derived honestly from subscription status + comp flag
// ============================================================================

/**
 * Single derived billing state per org. There is no payment data yet, so
 * "paying" means "has an active subscription on a priced plan and is not
 * comped" — actual money movement starts when the PSP lands.
 */
export type BillingState =
  | "paying" // status=active, not internal comp
  | "comped" // isInternalComp=true (any live status)
  | "trial"
  | "grace"
  | "cancelled" // cancelled or cancelling
  | "dormant" // archived / purged
  | "no-plan"; // org has no subscription row at all

export function deriveBillingState(
  status: string | null,
  isInternalComp: boolean,
): BillingState {
  if (!status || status === "no-subscription") return "no-plan";
  if (status === "archived" || status === "purged") return "dormant";
  if (status === "cancelled" || status === "cancelling") return "cancelled";
  if (isInternalComp) return "comped";
  if (status === "active") return "paying";
  if (status === "trial") return "trial";
  if (status === "grace") return "grace";
  return "no-plan";
}

export interface BillingOrgRow {
  id: string;
  organizationCode: string;
  name: string;
  organizationType: string;
  /** Raw subscription status (active / trial / grace / …). */
  status: string;
  billingState: BillingState;
  planCode: string | null;
  planDisplayName: string | null;
  monthlyPriceMinor: bigint | null;
  currency: string | null;
  isInternalComp: boolean;
  /** State-appropriate anchor date — see sinceLabel for what it means. */
  sinceDate: Date | null;
  /** Honest label for sinceDate: "period started" / "trial started" / … */
  sinceLabel: string;
}

/**
 * Per-org billing rows for the /platform/billing table. Same base join
 * as the Revenue dashboard (org_subscriptions ⨝ subscription_plans) plus
 * the org row, with an honestly-derived billing state + since-date.
 */
export async function listBillingOrgRows(): Promise<BillingOrgRow[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: organizations.id,
      organizationCode: organizations.organizationCode,
      name: organizations.name,
      organizationType: organizations.organizationType,
      orgCreatedAt: organizations.createdAt,
      status: orgSubscriptions.status,
      planCode: orgSubscriptions.planCode,
      planDisplayName: subscriptionPlans.displayName,
      monthlyPriceMinor: subscriptionPlans.monthlyPriceMinor,
      currency: subscriptionPlans.currency,
      isInternalComp: orgSubscriptions.isInternalComp,
      trialStartedAt: orgSubscriptions.trialStartedAt,
      currentPeriodStartsAt: orgSubscriptions.currentPeriodStartsAt,
      cancelledAt: orgSubscriptions.cancelledAt,
      subCreatedAt: orgSubscriptions.createdAt,
    })
    .from(organizations)
    .leftJoin(
      orgSubscriptions,
      eq(orgSubscriptions.organizationId, organizations.id),
    )
    .leftJoin(
      subscriptionPlans,
      eq(subscriptionPlans.planCode, orgSubscriptions.planCode),
    )
    .orderBy(desc(organizations.createdAt));

  return rows.map((r) => {
    const isComp = r.isInternalComp ?? false;
    const billingState = deriveBillingState(r.status, isComp);

    // Pick the most truthful "since" anchor we actually store. There is
    // no comp-granted-at column on the subscription row (that date lives
    // in lifecycle events, surfaced on the detail page), so comped rows
    // fall back to subscription start.
    let sinceDate: Date | null;
    let sinceLabel: string;
    switch (billingState) {
      case "trial":
        sinceDate = r.trialStartedAt ?? r.subCreatedAt;
        sinceLabel = r.trialStartedAt ? "trial started" : "subscribed";
        break;
      case "paying":
      case "comped":
      case "grace":
        sinceDate = r.currentPeriodStartsAt ?? r.subCreatedAt;
        sinceLabel = r.currentPeriodStartsAt ? "period started" : "subscribed";
        break;
      case "cancelled":
        sinceDate = r.cancelledAt ?? r.subCreatedAt;
        sinceLabel = r.cancelledAt ? "cancelled" : "subscribed";
        break;
      case "no-plan":
        sinceDate = r.orgCreatedAt;
        sinceLabel = "org created";
        break;
      default:
        sinceDate = r.subCreatedAt ?? r.orgCreatedAt;
        sinceLabel = r.subCreatedAt ? "subscribed" : "org created";
    }

    return {
      id: r.id,
      organizationCode: r.organizationCode,
      name: r.name,
      organizationType: r.organizationType,
      status: r.status ?? "no-subscription",
      billingState,
      planCode: r.planCode,
      planDisplayName: r.planDisplayName,
      monthlyPriceMinor: r.monthlyPriceMinor,
      currency: r.currency,
      isInternalComp: isComp,
      sinceDate,
      sinceLabel,
    };
  });
}

// ============================================================================
// Per-org billing audit trail — operator actions from audit_events
// ============================================================================

export interface BillingAuditEntry {
  id: string;
  /** e.g. platform.subscription.comp_granted / trial_extended / cancelled */
  action: string;
  actorEmail: string | null;
  actorName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Operator billing actions for one org. Subscription-os actions write
 * audit_events with entity_type='organization', entity_id=<org id> and
 * action 'platform.subscription.*' (comp_granted / trial_extended /
 * cancelled) — that prefix is the queryable plan-history trail today.
 */
export async function getOrgBillingAuditTrail(
  organizationId: string,
  limit = 50,
): Promise<BillingAuditEntry[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorEmail: appUsers.email,
      actorName: appUsers.fullName,
      before: auditEvents.before,
      after: auditEvents.after,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(appUsers, eq(appUsers.id, auditEvents.actorUserId))
    .where(
      and(
        eq(auditEvents.entityId, organizationId),
        sql`${auditEvents.action} LIKE 'platform.subscription.%'`,
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorEmail: r.actorEmail,
    actorName: r.actorName,
    before: r.before as Record<string, unknown> | null,
    after: r.after as Record<string, unknown> | null,
    metadata: r.metadata as Record<string, unknown> | null,
    createdAt: r.createdAt,
  }));
}
