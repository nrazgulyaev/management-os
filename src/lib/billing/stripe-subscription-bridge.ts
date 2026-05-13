import "server-only";

/**
 * Stage 7.D + Sprint 3c — Stripe subscription webhook → lifecycle FSM
 * bridge, plus per-event `organizations.products_enabled` sync.
 *
 * Maps Stripe subscription/invoice events into our `org_subscriptions`
 * FSM transitions. Idempotent — Stripe retries the same event with the
 * same `event.id`; we dedupe via the existing `payment_webhook_events`
 * table (Stage 6.P3).
 *
 * Supported events:
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
 * route and is intentionally pure (no fetch). The route file owns the
 * signature verification + dedupe.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { orgSubscriptions } from "@/lib/db/schema/subscriptions";
import { organizations } from "@/lib/db/schema/saas";
import {
  recordLifecycleEvent,
  transitionSubscription,
  type SubscriptionStatus,
} from "./lifecycle";
import { markOrgTrialConverted } from "@/features/billing/trial-conversion";
import { recordAuditEvent } from "@/features/audit/services";
import {
  PRODUCT_SLUGS,
  type ProductSlug,
} from "@/lib/products";

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

// ============================================================================
// Sprint 3c — products_enabled sync from Stripe metadata
// ============================================================================

const VALID_SLUGS = new Set<string>(PRODUCT_SLUGS);

/**
 * Parse a comma-separated `products_enabled` metadata string into a
 * validated `ProductSlug[]` array.
 *
 *   "mgmt,dev"  → ["mgmt", "dev"]
 *   "mgmt"      → ["mgmt"]
 *   "mgmt,bad"  → ["mgmt"]  (unknown values silently dropped)
 *   ""          → []
 *   undefined   → null      (signals "metadata absent")
 *
 * Returning `null` (vs `[]`) lets the caller distinguish "Stripe sent
 * us an empty list — apply it" from "Stripe didn't send the field —
 * leave org.products_enabled alone".
 */
export function parseProductsEnabledMetadata(
  raw: unknown,
): ProductSlug[] | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  return trimmed
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => VALID_SLUGS.has(s))
    .map((s) => s as ProductSlug);
}

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
}

void and; // re-export-tracker — no functional use here.
