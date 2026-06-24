import "server-only";

/**
 * Stage 7.D + Sprint 3c — Stripe subscription webhook → lifecycle FSM
 * bridge, plus per-event `organizations.products_enabled` sync.
 *
 * Maps Stripe subscription/invoice events into our `org_subscriptions`
 * FSM transitions. Idempotent — Stripe retries the same event with the
 * same `event.id`; we dedupe by inserting the event.id into
 * `payment_webhook_events` (provider_key='stripe_billing') under its
 * partial UNIQUE (provider_key, external_event_id) index and treating the
 * insert as the gate (ON CONFLICT DO NOTHING → 0 rows → already processed,
 * skip). See `claimStripeEvent`.
 *
 * Supported events:
 *   - checkout.session.completed       → LINK Stripe sub/customer ids to
 *                                        org_subscriptions + activate
 *                                        + sync products_enabled
 *   - customer.subscription.created    → activate (or trial)
 *                                        + sync products_enabled
 *   - customer.subscription.updated    → record plan change
 *                                        + sync products_enabled
 *   - customer.subscription.deleted    → cancelling
 *                                        (products_enabled untouched —
 *                                        customer keeps access until
 *                                        period_end via the FSM)
 *   - customer.subscription.trial_will_end → trial_warned
 *   - invoice.paid                     → renewed (period extended)
 *   - invoice.payment_failed           → entered_grace
 *   - invoice.payment_action_required  → trial_warned (payment-action prompt)
 *
 * Sprint 3c — products_enabled sync rationale: Sprint 3b's checkout
 * endpoint stamps `subscription_data[metadata][products_enabled]` on
 * every Checkout Session, so by the time `customer.subscription.created`
 * fires the field is on `subscription.metadata.products_enabled` as a
 * comma-separated string (e.g. `"mgmt,dev"` for a Bundle subscription).
 * The bridge parses + validates against the closed `ProductSlug` enum,
 * applies via UPDATE on `organizations.products_enabled`, and emits a
 * `billing.products_enabled.changed` audit event with before/after diff.
 *
 * NOTE: this module is loaded by the `/api/webhooks/billing/stripe`
 * route and performs no fetch. The route file owns the signature
 * verification; this module owns the event.id dedupe + DB mutations.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  orgSubscriptions,
  subscriptionLifecycleEvents,
} from "@/lib/db/schema/subscriptions";
import { paymentWebhookEvents } from "@/lib/db/schema/payments";
import { organizations } from "@/lib/db/schema/saas";
import {
  recordLifecycleEvent,
  transitionSubscription,
  type SubscriptionStatus,
} from "./lifecycle";
import { markOrgTrialConverted } from "@/features/billing/trial-conversion";
import { recordAuditEvent } from "@/features/audit/services";
import {
  parseProductsEnabledMetadata,
} from "./stripe-subscription-bridge-pure";

// Re-export so existing call sites (and tests via the bridge module)
// continue to work alongside the server-only barrier.
export { parseProductsEnabledMetadata };

export type StripeWebhookEventType =
  | "checkout.session.completed"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "customer.subscription.trial_will_end"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "invoice.payment_action_required";

/** Provider key under which Stripe billing events dedupe. */
const STRIPE_BILLING_PROVIDER_KEY = "stripe_billing";

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

// ============================================================================
// Sprint 3c — products_enabled sync from Stripe metadata
// ============================================================================

/**
 * Read the subscription's `metadata.products_enabled` and apply it to
 * `organizations.products_enabled`. Idempotent — if the value is
 * already aligned, only an audit event is emitted (or, if the audit
 * write itself would be a no-op, nothing happens).
 *
 * Behaviour:
 *   - metadata present + valid + DIFFERS from current →
 *       UPDATE organizations + emit `billing.products_enabled.changed`
 *       audit event with before/after diff. Returns `"updated"`.
 *   - metadata present + valid + matches current →
 *       no DB write. No audit (idempotent). Returns `"noop"`.
 *   - metadata absent (legacy subscription / direct API creation) →
 *       no DB write, but emit `billing.products_enabled.missing`
 *       audit so operators can spot bridge events without packaging
 *       context. Returns `"missing"`.
 *   - metadata present but parses to empty after validation →
 *       treated same as `"missing"` (defensive — refusing to nuke an
 *       org's products_enabled on garbage input).
 *
 * Never throws. Audit failures are swallowed by `recordAuditEvent`.
 */
async function applyProductsEnabledFromSubscription(opts: {
  organizationId: string;
  subscriptionId: string;
  stripeEventId: string;
  subscriptionMetadata: unknown;
}): Promise<"updated" | "noop" | "missing"> {
  const meta =
    opts.subscriptionMetadata &&
    typeof opts.subscriptionMetadata === "object"
      ? (opts.subscriptionMetadata as Record<string, unknown>)
      : null;
  const parsed = parseProductsEnabledMetadata(meta?.products_enabled);
  if (parsed === null || parsed.length === 0) {
    await recordAuditEvent({
      actorUserId: null,
      action: "billing.products_enabled.missing",
      entityType: "organization",
      entityId: opts.organizationId,
      metadata: {
        stripeEventId: opts.stripeEventId,
        subscriptionId: opts.subscriptionId,
        rawMetadata: meta?.products_enabled ?? null,
      },
    });
    return "missing";
  }
  const db = getDb();
  if (!db) return "noop";
  const [orgRow] = await db
    .select({ productsEnabled: organizations.productsEnabled })
    .from(organizations)
    .where(eq(organizations.id, opts.organizationId))
    .limit(1);
  const current = orgRow?.productsEnabled ?? [];
  // Compare as plain string sets — DB column is text[], parsed value is
  // the narrower ProductSlug[]; we want set equality, not type equality.
  const currentSet = new Set<string>(current);
  const targetSet = new Set<string>(parsed);
  const same =
    currentSet.size === targetSet.size &&
    [...currentSet].every((s) => targetSet.has(s));
  if (same) return "noop";

  await db
    .update(organizations)
    .set({ productsEnabled: parsed, updatedAt: new Date() })
    .where(eq(organizations.id, opts.organizationId));

  await recordAuditEvent({
    actorUserId: null,
    action: "billing.products_enabled.changed",
    entityType: "organization",
    entityId: opts.organizationId,
    before: { productsEnabled: current },
    after: { productsEnabled: parsed },
    metadata: {
      stripeEventId: opts.stripeEventId,
      subscriptionId: opts.subscriptionId,
    },
  });
  return "updated";
}

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
 * MED AUTHZ/idempotency — dedupe by Stripe `event.id`.
 *
 * Stripe retries the same event (same `event.id`) on any non-2xx or
 * timeout. Without an id-level guard a redelivered webhook double-applies
 * (e.g. a second `invoice.paid` re-runs the trial→converted flip, a second
 * `customer.subscription.deleted` re-records a cancellation).
 *
 * The `payment_webhook_events` table carries a partial UNIQUE index on
 * `(provider_key, external_event_id)` — we make the INSERT the gate:
 * `ON CONFLICT DO NOTHING` + assert a row came back. rowCount === 0 means
 * "already processed" → caller skips. This is atomic at READ COMMITTED:
 * two concurrent redeliveries race on the unique index, exactly one wins
 * the insert, the loser gets 0 rows and skips. Org scoping is preserved —
 * the event row is anchored to the resolved organizationId when known.
 *
 * Returns `true` when this call claimed the event (proceed), `false` when
 * it was already processed (skip). Defaults to `true` (process) if the DB
 * is unavailable so we never silently drop events when dedup can't run.
 */
async function claimStripeEvent(
  eventId: string,
  eventType: string,
  payload: unknown,
  organizationId: string | null,
): Promise<boolean> {
  const db = getDb();
  if (!db) return true;
  const inserted = await db
    .insert(paymentWebhookEvents)
    .values({
      organizationId: organizationId ?? null,
      providerKey: STRIPE_BILLING_PROVIDER_KEY,
      externalEventId: eventId,
      eventType,
      payloadJson: (payload ?? {}) as Record<string, unknown>,
      // Claim as 'processing' — promoted to 'processed' only AFTER the side
      // effects succeed (see applyStripeWebhook), so a crash mid-apply leaves a
      // reclaimable row instead of a terminal 'processed' that loses the event.
      status: "processing",
    })
    .onConflictDoNothing({
      target: [
        paymentWebhookEvents.providerKey,
        paymentWebhookEvents.externalEventId,
      ],
      // The unique index is partial (WHERE external_event_id IS NOT NULL),
      // so the conflict arbiter must carry the same predicate to match it.
      where: sql`${paymentWebhookEvents.externalEventId} IS NOT NULL`,
    })
    .returning({ id: paymentWebhookEvents.id });
  // rowCount === 1 → we claimed it; rowCount === 0 → already in-flight/done.
  return inserted.length === 1;
}

/** Promote a claimed event from 'processing' → 'processed' after the side
 *  effects committed. Only now is the event terminally deduped. */
async function markStripeEventProcessed(eventId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(paymentWebhookEvents)
    .set({ status: "processed", processedAt: new Date() })
    .where(
      and(
        eq(paymentWebhookEvents.providerKey, STRIPE_BILLING_PROVIDER_KEY),
        eq(paymentWebhookEvents.externalEventId, eventId),
      ),
    );
}

/** Drop a 'processing' claim when the apply failed / was not terminal, so
 *  Stripe's redelivery of the same event.id can re-process it (no durable
 *  event loss). Only deletes a row still in 'processing'. */
async function releaseStripeEventClaim(eventId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .delete(paymentWebhookEvents)
    .where(
      and(
        eq(paymentWebhookEvents.providerKey, STRIPE_BILLING_PROVIDER_KEY),
        eq(paymentWebhookEvents.externalEventId, eventId),
        eq(paymentWebhookEvents.status, "processing"),
      ),
    );
}

/**
 * HIGH DEAD_END — `checkout.session.completed` handler.
 *
 * Without this, a successful Checkout never links Stripe's subscription
 * back to our `org_subscriptions` row, so `customer.subscription.*` events
 * arrive with `stripe_subscription_id = NULL` on our side and
 * `findSubscriptionByStripeId` returns null → the paid plan can NEVER
 * activate.
 *
 * On a completed Checkout Session we:
 *   - resolve the org from `client_reference_id` (we stamp it = orgId) or
 *     `metadata.organization_id` (defence-in-depth — both are stamped by
 *     /api/billing/checkout). NEVER trusted from a client request — this is
 *     a signature-verified Stripe payload.
 *   - UPSERT the org's subscription row, stamping `stripe_subscription_id`,
 *     `stripe_customer_id`, `plan_code`, `billing_cycle`, and status, plus
 *     sync `organizations.products_enabled` from the session metadata.
 *
 * Idempotent: keyed on `organization_id`; a redelivery (also caught by the
 * event.id gate) re-UPSERTs to the same values.
 */
async function applyCheckoutSessionCompleted(
  event: StripeWebhookEvent,
): Promise<BridgeResult> {
  const obj = event.data.object as Record<string, unknown>;
  const meta =
    obj.metadata && typeof obj.metadata === "object"
      ? (obj.metadata as Record<string, unknown>)
      : {};
  const orgId =
    (typeof obj.client_reference_id === "string"
      ? obj.client_reference_id
      : null) ??
    (typeof meta.organization_id === "string"
      ? (meta.organization_id as string)
      : null);
  if (!orgId) {
    return { ok: false, reason: "no_org_in_checkout_session" };
  }

  // Only subscription-mode sessions produce a subscription to link.
  const stripeSubId =
    typeof obj.subscription === "string" ? obj.subscription : null;
  const stripeCustomerId =
    typeof obj.customer === "string" ? obj.customer : null;
  if (!stripeSubId) {
    // One-off / setup-mode session — nothing to link. Record + done.
    await recordLifecycleEvent({
      organizationId: orgId,
      subscriptionId: null,
      eventType: "plan_changed",
      actorKind: "stripe_webhook",
      payload: { stripeEventId: event.id, note: "checkout_no_subscription" },
    });
    return { ok: true, appliedTransitions: 0, events: 1 };
  }

  const planCode =
    typeof meta.plan_code === "string" ? (meta.plan_code as string) : null;
  const billingCycle =
    meta.billing_cycle === "annual" ? "annual" : "monthly";

  const db = getDb();
  if (!db) return { ok: false, reason: "db_unavailable" };

  // Activation lands as 'active' immediately on a paid checkout (Stripe has
  // already collected payment for the first period). A subsequent
  // customer.subscription.created event will reconcile trial vs active if a
  // trial was configured.
  const linked = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: orgSubscriptions.id })
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.organizationId, orgId))
      .limit(1);

    let subscriptionRowId: string | null = null;
    if (existing) {
      await tx
        .update(orgSubscriptions)
        .set({
          stripeSubscriptionId: stripeSubId,
          ...(stripeCustomerId
            ? { stripeCustomerId: stripeCustomerId }
            : {}),
          ...(planCode ? { planCode } : {}),
          billingCycle,
          status: "active",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orgSubscriptions.id, existing.id),
            eq(orgSubscriptions.organizationId, orgId),
          ),
        );
      subscriptionRowId = existing.id;
    } else if (planCode) {
      // No row yet (org never had a trial provisioned) — create one. We can
      // only insert when we know the plan_code (NOT NULL + FK).
      const [created] = await tx
        .insert(orgSubscriptions)
        .values({
          organizationId: orgId,
          planCode,
          billingCycle,
          status: "active",
          stripeSubscriptionId: stripeSubId,
          stripeCustomerId: stripeCustomerId ?? null,
        })
        .returning({ id: orgSubscriptions.id });
      subscriptionRowId = created?.id ?? null;
    }

    if (subscriptionRowId) {
      await tx.insert(subscriptionLifecycleEvents).values({
        organizationId: orgId,
        subscriptionId: subscriptionRowId,
        eventType: "activated",
        fromStatus: null,
        toStatus: "active",
        actorKind: "stripe_webhook",
        payload: {
          stripeEventId: event.id,
          stripeSubscriptionId: stripeSubId,
          via: "checkout.session.completed",
        },
      });
    }
    return subscriptionRowId !== null;
  });

  if (!linked) {
    // No existing row AND no plan_code in metadata — we can't safely create
    // a subscription row. Emit an operator-visible audit instead of silently
    // dropping the link, then return ok (200) so Stripe doesn't retry.
    await recordAuditEvent({
      actorUserId: null,
      action: "billing.checkout.unlinked",
      entityType: "organization",
      entityId: orgId,
      metadata: {
        stripeEventId: event.id,
        stripeSubscriptionId: stripeSubId,
        reason: "no_existing_subscription_and_no_plan_code",
      },
    });
    return { ok: true, appliedTransitions: 0, events: 0 };
  }

  // Sync products_enabled from the checkout session metadata so product
  // gating is in place immediately (the bridge also re-syncs on the
  // subsequent customer.subscription.created event — idempotent).
  await applyProductsEnabledFromSubscription({
    organizationId: orgId,
    subscriptionId: stripeSubId,
    stripeEventId: event.id,
    subscriptionMetadata: meta,
  });

  // Stage 11.A.2 parity — a paid checkout converts the trial. Best-effort.
  try {
    await markOrgTrialConverted(orgId);
  } catch {
    // audit-only; the link UPSERT already succeeded
  }

  return { ok: true, appliedTransitions: 1, events: 1 };
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
 * Best-effort resolve the organization id for an event so the dedup row in
 * `payment_webhook_events` is org-anchored. Never throws; returns null when
 * the org can't be resolved (the dedup row falls back to a null org anchor,
 * which the partial UNIQUE index still enforces on (provider_key, event_id)).
 */
async function resolveEventOrg(event: StripeWebhookEvent): Promise<string | null> {
  const obj = event.data.object as Record<string, unknown>;
  if (event.type === "checkout.session.completed") {
    const meta =
      obj.metadata && typeof obj.metadata === "object"
        ? (obj.metadata as Record<string, unknown>)
        : {};
    if (typeof obj.client_reference_id === "string") {
      return obj.client_reference_id;
    }
    if (typeof meta.organization_id === "string") {
      return meta.organization_id as string;
    }
    return null;
  }
  const stripeSubId = extractStripeSubId(event);
  if (!stripeSubId) return null;
  const sub = await findSubscriptionByStripeId(stripeSubId);
  return sub?.organizationId ?? null;
}

/**
 * Apply a Stripe webhook event to our FSM.
 */
export async function applyStripeWebhook(
  event: StripeWebhookEvent,
): Promise<BridgeResult> {
  // MED idempotency — claim this event.id BEFORE applying any side effect.
  // A redelivery (same event.id) loses the race on the unique index and
  // short-circuits here, so no event ever double-applies. We resolve the
  // org best-effort to anchor the dedup row (checkout sessions carry it in
  // client_reference_id / metadata; sub/invoice events via the tracked sub).
  const orgForDedup = await resolveEventOrg(event);
  const claimed = await claimStripeEvent(
    event.id,
    event.type,
    event.data.object,
    orgForDedup,
  );
  if (!claimed) {
    return { ok: true, appliedTransitions: 0, events: 0 };
  }

  // Run the side effects, then finalize the claim: promote to 'processed' only
  // if it succeeded; release the 'processing' claim on failure / non-terminal
  // result so a Stripe redelivery can re-process it (no durable event loss).
  let result: BridgeResult;
  try {
    result = await (async (): Promise<BridgeResult> => {
      // HIGH DEAD_END — link the org's subscription once Checkout completes.
      // Handled before the subscription-id extraction below because at this
      // point our org_subscriptions row has no stripe_subscription_id yet.
      if (event.type === "checkout.session.completed") {
        return applyCheckoutSessionCompleted(event);
      }

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

      // Sprint 3c — sync products_enabled from subscription metadata
      // BEFORE the FSM transition so the org's product gating is in
      // place by the time the activation audit event fires.
      await applyProductsEnabledFromSubscription({
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        stripeEventId: event.id,
        subscriptionMetadata: obj.metadata,
      });

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
      //
      // Sprint 3c — products_enabled may have changed too (e.g.
      // operator switched Mgmt-only Pro → Bundle Pro in Stripe).
      // Sync from subscription metadata. Bundle ↔ standalone moves
      // surface here as an org row update + an audit event.
      const obj = event.data.object as Record<string, unknown>;
      await applyProductsEnabledFromSubscription({
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        stripeEventId: event.id,
        subscriptionMetadata: obj.metadata,
      });
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
    })();
  } catch (e) {
    await releaseStripeEventClaim(event.id);
    throw e;
  }
  if (result.ok) await markStripeEventProcessed(event.id);
  else await releaseStripeEventClaim(event.id);
  return result;
}
