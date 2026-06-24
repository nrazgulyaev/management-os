import "server-only";

import { and, isNotNull, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { orgSubscriptions } from "@/lib/db/schema/subscriptions";
import {
  canTransition,
  mapStripeStatus,
  reconcileEventTypeForStatus,
  type SubscriptionStatus,
} from "@/lib/billing/lifecycle-pure";
import {
  recordLifecycleEvent,
  transitionSubscription,
} from "@/lib/billing/lifecycle";
import { StripeClient } from "@/lib/payment-processors/providers/stripe/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P3.G / 7.D — Stripe subscription reconciliation cron.
 *
 * Webhook delivery (`/api/webhooks/billing/stripe`) is the primary inbound
 * channel for Stripe subscription events. This cron is the SAFETY NET: it
 * re-applies the live Stripe subscription status onto our
 * `org_subscriptions` rows so a dropped/late webhook can't leave our FSM
 * drifted from Stripe (e.g. Stripe shows `canceled` but we still show
 * `active`, or Stripe shows `past_due` but we never entered grace).
 *
 * Strategy — pull-per-row (bounded, no Stripe cursor needed):
 *   - select every org_subscription with a `stripe_subscription_id`
 *   - retrieve each live subscription from Stripe
 *   - map Stripe.status → our SubscriptionStatus
 *   - if it differs AND the FSM transition is legal, apply it (org-scoped
 *     via the row's organizationId) and record the drift; otherwise record
 *     a drift_observed event so operators can see un-appliable divergence.
 *
 * Idempotent: when Stripe and our row already agree, no write happens.
 * Org scoping: every read/write is keyed on the row's organizationId — the
 * cron never trusts ambient context. Uses the platform-level Stripe key
 * (subscriptions are billed on the platform account, same as
 * /api/billing/checkout); when the key is absent the cron is an honest
 * no-op (Stripe-not-configured), not a silent success.
 */
export async function runStripeEventPoller(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();

  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? "";
  const webhookSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET ?? "";
  if (!secretKey) {
    return {
      status: "success",
      summary:
        "no-op: STRIPE_SECRET_KEY not configured (reconciliation requires live Stripe keys).",
      metrics: { scanned: 0, reconciled: 0, drift_unappliable: 0, stripe_configured: 0 },
    };
  }

  const client = new StripeClient({
    provider: "stripe",
    secretKey,
    publishableKey,
    webhookSecret,
    mode: secretKey.startsWith("sk_live_") ? "live" : "test",
  });

  // Only rows we can reconcile: linked to a Stripe subscription and not in a
  // terminal state (cancelled/archived/purged need no further Stripe sync).
  const rows = await db
    .select()
    .from(orgSubscriptions)
    .where(
      and(
        isNotNull(orgSubscriptions.stripeSubscriptionId),
        sql`${orgSubscriptions.status} NOT IN ('archived', 'purged')`,
        sql`${orgSubscriptions.isInternalComp} = false`,
      ),
    );

  let reconciled = 0;
  let driftUnappliable = 0;
  let errors = 0;

  for (const row of rows) {
    const stripeSubId = row.stripeSubscriptionId;
    if (!stripeSubId) continue;

    let live: { status: number; body: string };
    try {
      live = await client.retrieveSubscription(stripeSubId);
    } catch {
      errors++;
      continue;
    }
    if (live.status < 200 || live.status >= 300) {
      // 404 = Stripe no longer has this subscription; other = transient.
      errors++;
      continue;
    }

    // StripeClient returns the raw response body as a string — parse it.
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(live.body) as Record<string, unknown>;
    } catch {
      errors++;
      continue;
    }
    const stripeStatus =
      typeof body.status === "string" ? body.status : null;
    if (!stripeStatus) {
      errors++;
      continue;
    }

    const target = mapStripeStatus(stripeStatus);
    if (target === null) continue; // incomplete* — no settled equivalent.

    const current = row.status as SubscriptionStatus;
    if (current === target) continue; // already aligned — idempotent no-op.

    if (!canTransition(current, target)) {
      // Stripe diverges but the move isn't legal from our state (e.g. we're
      // already 'cancelling' and Stripe says 'active'). Surface it instead
      // of forcing an illegal FSM jump.
      await recordLifecycleEvent({
        organizationId: row.organizationId,
        subscriptionId: row.id,
        eventType: "plan_changed",
        actorKind: "cron",
        payload: {
          drift_observed: true,
          stripeStatus,
          internalStatus: current,
          stripeSubscriptionId: stripeSubId,
          source: "stripe_event_poller",
        },
      });
      driftUnappliable++;
      continue;
    }

    // Apply the reconciling transition (org-scoped via the row's org).
    const setColumns: Record<string, unknown> = {};
    if (target === "active") setColumns.gracePeriodEndsAt = null;
    try {
      await transitionSubscription({
        organizationId: row.organizationId,
        subscriptionId: row.id,
        toStatus: target,
        eventType: reconcileEventTypeForStatus(target),
        actorKind: "cron",
        setColumns,
        payload: {
          reconciled: true,
          stripeStatus,
          fromStatus: current,
          stripeSubscriptionId: stripeSubId,
          source: "stripe_event_poller",
        },
      });
      reconciled++;
    } catch {
      // Transition lost a race (a webhook applied it first) — fine, skip.
      errors++;
    }
  }

  return {
    status: "success",
    summary: `Stripe reconciliation: ${rows.length} linked subscription(s) scanned, ${reconciled} reconciled, ${driftUnappliable} un-appliable drift, ${errors} error(s).`,
    metrics: {
      scanned: rows.length,
      reconciled,
      drift_unappliable: driftUnappliable,
      errors,
      stripe_configured: 1,
    },
  };
}
