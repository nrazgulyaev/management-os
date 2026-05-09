import "server-only";

/**
 * Stage 7.D — Stripe subscription webhook → lifecycle FSM bridge.
 *
 * Maps Stripe subscription/invoice events into our `org_subscriptions`
 * FSM transitions. Idempotent — Stripe retries the same event with the
 * same `event.id`; we dedupe via the existing `payment_webhook_events`
 * table (Stage 6.P3).
 *
 * Supported events:
 *   - customer.subscription.created    → activate (or trial)
 *   - customer.subscription.updated    → reflect plan change
 *   - customer.subscription.deleted    → cancelling
 *   - customer.subscription.trial_will_end → trial_warned
 *   - invoice.paid                     → renewed (period extended)
 *   - invoice.payment_failed           → entered_grace
 *   - invoice.payment_action_required  → trial_warned (payment-action prompt)
 *
 * NOTE: this module is loaded by the `/api/webhooks/billing/stripe`
 * route and is intentionally pure (no fetch). The route file owns the
 * signature verification + dedupe.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { orgSubscriptions } from "@/lib/db/schema/subscriptions";
import {
  recordLifecycleEvent,
  transitionSubscription,
  type SubscriptionStatus,
} from "./lifecycle";
import { markOrgTrialConverted } from "@/features/billing/trial-conversion";

export type StripeWebhookEventType =
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "customer.subscription.trial_will_end"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "invoice.payment_action_required";

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export type BridgeResult =
  | { ok: true; appliedTransitions: number; events: number }
  | { ok: false; reason: string };

/**
 * Resolve the org_subscriptions row for a Stripe subscription id.
 * Returns null when no matching row exists (Stripe sent us an event for
 * a subscription we don't track — log + ignore).
 */
async function findSubscriptionByStripeId(stripeSubId: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.stripeSubscriptionId, stripeSubId))
    .limit(1);
  return row ?? null;
}

/**
 * Extract the Stripe subscription id from a webhook event payload.
 */
function extractStripeSubId(event: StripeWebhookEvent): string | null {
  const obj = event.data.object;
  // For customer.subscription.* events, obj.id is the sub id.
  // For invoice.* events, obj.subscription is the sub id.
  const direct = obj.id;
  const fromInvoice = obj.subscription;
  if (
    typeof direct === "string" &&
    event.type.startsWith("customer.subscription")
  ) {
    return direct;
  }
  if (typeof fromInvoice === "string") return fromInvoice;
  return null;
}

/**
 * Apply a Stripe webhook event to our FSM.
 */
export async function applyStripeWebhook(
  event: StripeWebhookEvent,
): Promise<BridgeResult> {
  const stripeSubId = extractStripeSubId(event);
  if (!stripeSubId) {
    return { ok: false, reason: "no_subscription_id_in_event" };
  }
  const sub = await findSubscriptionByStripeId(stripeSubId);
  if (!sub) {
    return { ok: false, reason: "subscription_not_tracked" };
  }
  const fromStatus = sub.status as SubscriptionStatus;

  switch (event.type) {
    case "customer.subscription.created": {
      // Trialing or active depending on the trial_end timestamp.
      const obj = event.data.object as Record<string, unknown>;
      const trialEnd = obj.trial_end as number | null | undefined;
      const targetStatus: SubscriptionStatus =
        typeof trialEnd === "number" && trialEnd * 1000 > Date.now()
          ? "trial"
          : "active";
      if (fromStatus === targetStatus) {
        await recordLifecycleEvent({
          organizationId: sub.organizationId,
          subscriptionId: sub.id,
          eventType: targetStatus === "trial" ? "trial_started" : "activated",
          actorKind: "stripe_webhook",
          payload: { stripeEventId: event.id },
        });
        return { ok: true, appliedTransitions: 0, events: 1 };
      }
      await transitionSubscription({
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        toStatus: targetStatus,
        eventType: targetStatus === "trial" ? "trial_started" : "activated",
        actorKind: "stripe_webhook",
        payload: { stripeEventId: event.id, trialEnd },
      });
      // Stage 11.A.2 — flip organizations.trial_status='active' →
      // 'converted' once Stripe confirms the subscription is active
      // (no trial period). Best-effort; never throws.
      if (targetStatus === "active") {
        try {
          await markOrgTrialConverted(sub.organizationId);
        } catch {
          // audit-only; main mutation already succeeded
        }
      }
      return { ok: true, appliedTransitions: 1, events: 1 };
    }

    case "customer.subscription.deleted": {
      // Stripe deletes the subscription at end-of-period when the user
      // cancels. Map to 'cancelling' (period-end runs the FSM advance).
      if (!["active", "trial", "grace"].includes(fromStatus)) {
        return { ok: true, appliedTransitions: 0, events: 0 };
      }
      await transitionSubscription({
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        toStatus: "cancelling",
        eventType: "cancellation_requested",
        actorKind: "stripe_webhook",
        payload: { stripeEventId: event.id },
      });
      return { ok: true, appliedTransitions: 1, events: 1 };
    }

    case "customer.subscription.updated": {
      // Plan/price change. Record event; the gating layer reads
      // `plan_code` next time so no FSM move is required.
      await recordLifecycleEvent({
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        eventType: "plan_changed",
        actorKind: "stripe_webhook",
        payload: { stripeEventId: event.id },
      });
      return { ok: true, appliedTransitions: 0, events: 1 };
    }

    case "invoice.paid": {
      // Renewal succeeded. Move grace -> active if needed; otherwise
      // record renewed event.
      if (fromStatus === "grace") {
        await transitionSubscription({
          organizationId: sub.organizationId,
          subscriptionId: sub.id,
          toStatus: "active",
          eventType: "left_grace",
          actorKind: "stripe_webhook",
          setColumns: { gracePeriodEndsAt: null },
          payload: { stripeEventId: event.id },
        });
        // Stage 11.A.2 — first paid invoice after grace also flips
        // organizations.trial_status to 'converted' (idempotent on the
        // org row; already-converted orgs no-op).
        try {
          await markOrgTrialConverted(sub.organizationId);
        } catch {
          // audit-only
        }
        return { ok: true, appliedTransitions: 1, events: 1 };
      }
      await recordLifecycleEvent({
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        eventType: "renewed",
        actorKind: "stripe_webhook",
        payload: { stripeEventId: event.id },
      });
      // Stage 11.A.2 — every successful invoice payment also confirms
      // the trial → paid conversion. Idempotent.
      try {
        await markOrgTrialConverted(sub.organizationId);
      } catch {
        // audit-only
      }
      return { ok: true, appliedTransitions: 0, events: 1 };
    }

    case "invoice.payment_failed": {
      if (fromStatus !== "active" && fromStatus !== "trial") {
        return { ok: true, appliedTransitions: 0, events: 0 };
      }
      // Compute grace_period_ends_at = now + plan.default_grace_period_days.
      const graceDays = 3; // pulled from plan in the cron path; default here.
      const graceEnd = new Date();
      graceEnd.setUTCDate(graceEnd.getUTCDate() + graceDays);
      await transitionSubscription({
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        toStatus: "grace",
        eventType: "entered_grace",
        actorKind: "stripe_webhook",
        setColumns: { gracePeriodEndsAt: graceEnd },
        payload: { stripeEventId: event.id },
      });
      return { ok: true, appliedTransitions: 1, events: 1 };
    }

    case "customer.subscription.trial_will_end":
    case "invoice.payment_action_required": {
      await recordLifecycleEvent({
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        eventType: "trial_warned",
        actorKind: "stripe_webhook",
        payload: { stripeEventId: event.id, eventType: event.type },
      });
      return { ok: true, appliedTransitions: 0, events: 1 };
    }

    default:
      return { ok: false, reason: `unsupported_event_type:${event.type}` };
  }
}

void and; // re-export-tracker — no functional use here.
