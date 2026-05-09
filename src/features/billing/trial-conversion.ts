import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import { recordSecurityEvent } from "@/features/security-baseline/security-events";

/**
 * Stage 11.A.2 — Trial → converted state transition.
 *
 * The Stripe subscription bridge (Stage 7.D) handles `org_subscriptions`
 * lifecycle on `customer.subscription.created` + `invoice.paid` events,
 * but never touches `organizations.trial_status`. Without this hook,
 * the trial banner stays visible forever after a customer subscribes
 * (the cron `trial_status` flips active→expired, never active→converted).
 *
 * Call this helper from the bridge whenever a subscription becomes
 * active (subscription.created with no trial_end OR invoice.paid that
 * settles the first invoice). Idempotent — already-converted orgs are
 * a no-op.
 *
 * Also accepts trial_status='expired' as input: a customer who lets
 * the trial lapse + comes back later to subscribe should also flip to
 * 'converted'. Only 'cancelled' is rejected — that's an explicit
 * operator-side state requiring manual review.
 */

export interface MarkOrgTrialConvertedResult {
  changed: boolean;
  fromStatus: string;
  reason?: string;
}

const ELIGIBLE_FROM_STATES = ["active", "expired"] as const;

export async function markOrgTrialConverted(
  organizationId: string,
): Promise<MarkOrgTrialConvertedResult> {
  const db = getDb();
  if (!db) {
    return {
      changed: false,
      fromStatus: "unknown",
      reason: "db_not_configured",
    };
  }

  const [row] = await db
    .select({ trialStatus: organizations.trialStatus })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!row) {
    return {
      changed: false,
      fromStatus: "unknown",
      reason: "organization_not_found",
    };
  }

  // Already converted: no-op.
  if (row.trialStatus === "converted") {
    return { changed: false, fromStatus: "converted", reason: "already_converted" };
  }

  // 'none' (org provisioned before 10.I.5 trial machinery) — no trial
  // to convert from. Pass through silently; the org keeps full access.
  if (row.trialStatus === "none") {
    return { changed: false, fromStatus: "none", reason: "no_trial_to_convert" };
  }

  // 'cancelled' is operator-initiated. Don't auto-resurrect via webhook;
  // require manual review.
  if (row.trialStatus === "cancelled") {
    return {
      changed: false,
      fromStatus: "cancelled",
      reason: "cancelled_requires_manual_review",
    };
  }

  // Eligible: 'active' or 'expired'.
  if (
    !(ELIGIBLE_FROM_STATES as readonly string[]).includes(row.trialStatus)
  ) {
    return {
      changed: false,
      fromStatus: row.trialStatus,
      reason: "ineligible_state",
    };
  }

  await db
    .update(organizations)
    .set({ trialStatus: "converted" })
    .where(
      and(
        eq(organizations.id, organizationId),
        // Belt-and-braces: only flip from the eligible source states.
        inArray(organizations.trialStatus, [...ELIGIBLE_FROM_STATES]),
      ),
    );

  // Audit event — best-effort, doesn't fail the main mutation.
  try {
    await recordSecurityEvent({
      eventType: "login_succeeded", // re-use existing union member; Stage 11.A doesn't extend the SecurityEventType
      severity: "info",
      metadata: {
        via: "stripe_webhook_trial_converted",
        organizationId,
        previousTrialStatus: row.trialStatus,
        newTrialStatus: "converted",
      },
    });
  } catch {
    // never throw from the audit path
  }

  return { changed: true, fromStatus: row.trialStatus };
}
