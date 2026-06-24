/**
 * Stage 7.C — Pure lifecycle FSM helpers (no server-only).
 *
 * Split out so tests can import the transition table without pulling in
 * the database client. The server-only module re-exports these.
 */

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "grace"
  | "suspended"
  | "cancelling"
  | "cancelled"
  | "archived"
  | "purged";

export type LifecycleEventType =
  | "trial_started"
  | "trial_warned"
  | "activated"
  | "renewed"
  | "payment_failed"
  | "entered_grace"
  | "left_grace"
  | "suspended"
  | "cancellation_requested"
  | "cancelled"
  | "archived"
  | "purged"
  | "reactivated"
  | "plan_changed"
  | "comp_granted"
  | "comp_revoked";

export type ActorKind =
  | "system"
  | "cron"
  | "admin"
  | "self_service"
  | "stripe_webhook";

export const TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trial: ["active", "grace", "cancelling"],
  active: ["grace", "cancelling", "active"], // self-loop for renewal
  grace: ["active", "suspended", "cancelling"],
  suspended: ["active", "archived"],
  cancelling: ["active", "cancelled"],
  cancelled: ["archived"],
  archived: ["active", "purged"],
  purged: [],
};

export function canTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  if (from === to && from === "active") return true; // renewal is a self-loop
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Stripe subscription `status` → our internal `SubscriptionStatus`.
 *
 * Used by the reconciliation cron (`stripe-event-poller-job`) to map the
 * live Stripe status onto our FSM. Returns `null` for Stripe statuses that
 * have no settled internal equivalent yet (`incomplete*`) so the caller
 * leaves the row untouched rather than forcing an illegal transition.
 *
 *   active                → active
 *   trialing              → trial
 *   past_due | unpaid     → grace   (renewal/charge problem; FSM grace)
 *   canceled              → cancelled
 *   paused                → suspended
 *   incomplete*           → null    (no equivalent; leave alone)
 */
export function mapStripeStatus(
  stripeStatus: string,
): SubscriptionStatus | null {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trial";
    case "past_due":
    case "unpaid":
      return "grace";
    case "canceled":
      return "cancelled";
    case "paused":
      return "suspended";
    case "incomplete":
    case "incomplete_expired":
    default:
      return null;
  }
}

/**
 * Lifecycle event type to record for a given target status during
 * reconciliation. Kept here (pure) so it stays in lockstep with the FSM.
 */
export function reconcileEventTypeForStatus(
  to: SubscriptionStatus,
): LifecycleEventType {
  switch (to) {
    case "active":
      return "activated";
    case "trial":
      return "trial_started";
    case "grace":
      return "entered_grace";
    case "cancelled":
      return "cancelled";
    case "cancelling":
      return "cancellation_requested";
    case "suspended":
      return "suspended";
    case "archived":
      return "archived";
    case "purged":
      return "purged";
    default:
      return "plan_changed";
  }
}
