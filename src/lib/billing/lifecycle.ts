import "server-only";

/**
 * Stage 7.C — Subscription lifecycle FSM.
 *
 * Centralizes the legal state transitions + the helper that records each
 * transition to `subscription_lifecycle_events`.
 *
 * State diagram:
 *
 *   trial -> active (renewed/charged)
 *         -> grace (charge failed at trial end)
 *         -> cancelling (user cancels during trial)
 *
 *   active -> grace (renewal charge failed)
 *          -> cancelling (user cancels via portal)
 *          -> active (renewed)
 *
 *   grace -> active (payment retry succeeded / payment method updated)
 *         -> suspended (grace_period_ends_at passed without payment)
 *         -> cancelling (user cancels during grace)
 *
 *   suspended -> active (reactivation + payment)
 *             -> archived (after archive_after_days)
 *
 *   cancelling -> active (user changes mind before period_end)
 *              -> cancelled (period_ends_at passes)
 *
 *   cancelled -> archived (after archive_after_days)
 *
 *   archived -> active (rare — admin reactivation, before purge)
 *            -> purged (after purge_after_days)
 *
 *   purged -> (terminal, irreversible)
 */

import { eq } from "drizzle-orm";
import { getDb, requireDb } from "@/lib/db/client";
import {
  orgSubscriptions,
  subscriptionLifecycleEvents,
} from "@/lib/db/schema/subscriptions";
// Pure FSM types + helpers — re-exported for callers + tests.
import {
  canTransition,
  type ActorKind,
  type LifecycleEventType,
  type SubscriptionStatus,
} from "./lifecycle-pure";

export {
  canTransition,
  type ActorKind,
  type LifecycleEventType,
  type SubscriptionStatus,
};

export interface TransitionInput {
  organizationId: string;
  subscriptionId: string;
  toStatus: SubscriptionStatus;
  eventType: LifecycleEventType;
  actorKind?: ActorKind;
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
  /** Optional patch — additional columns to update alongside `status`. */
  setColumns?: Record<string, unknown>;
}

/**
 * Move a subscription to a new state + record the audit event in a
 * single transaction. Throws when the transition isn't legal.
 */
export async function transitionSubscription(
  input: TransitionInput,
): Promise<void> {
  const db = requireDb();
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: orgSubscriptions.status })
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.id, input.subscriptionId))
      .limit(1);
    if (!current) {
      throw new Error(`Subscription ${input.subscriptionId} not found`);
    }
    const fromStatus = current.status as SubscriptionStatus;
    if (!canTransition(fromStatus, input.toStatus)) {
      throw new Error(
        `Illegal transition: ${fromStatus} -> ${input.toStatus}`,
      );
    }

    await tx
      .update(orgSubscriptions)
      .set({
        status: input.toStatus,
        updatedAt: new Date(),
        ...(input.setColumns ?? {}),
      })
      .where(eq(orgSubscriptions.id, input.subscriptionId));

    await tx.insert(subscriptionLifecycleEvents).values({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      eventType: input.eventType,
      fromStatus,
      toStatus: input.toStatus,
      actorUserId: input.actorUserId ?? null,
      actorKind: input.actorKind ?? "system",
      payload: input.payload ?? null,
    });
  });
}

/**
 * Read-only — fetch the active subscription row (most recent by
 * createdAt). Returns null when no row exists.
 */
export async function getOrgSubscriptionRow(organizationId: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, organizationId))
    .orderBy(orgSubscriptions.createdAt)
    .limit(1);
  return row ?? null;
}

/** Record a non-transition event (warnings, plan_changed, etc.). */
export async function recordLifecycleEvent(args: {
  organizationId: string;
  subscriptionId: string | null;
  eventType: LifecycleEventType;
  actorKind?: ActorKind;
  actorUserId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const db = requireDb();
  await db.insert(subscriptionLifecycleEvents).values({
    organizationId: args.organizationId,
    subscriptionId: args.subscriptionId,
    eventType: args.eventType,
    actorKind: args.actorKind ?? "system",
    actorUserId: args.actorUserId ?? null,
    payload: args.payload ?? null,
  });
}
