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
