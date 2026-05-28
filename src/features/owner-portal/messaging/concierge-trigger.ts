/**
 * Packet C PR 3 — owner-concierge post-insert trigger.
 *
 * Fire-and-forget wrapper around the owner-concierge agent. Any
 * action that inserts an `owner_messages` row with
 * `actor_kind = 'owner'` should call `triggerOwnerConcierge()` at
 * the end of its success path:
 *
 *     if (actorKind === "owner") {
 *       void triggerOwnerConcierge({
 *         organizationId,
 *         ownerId,
 *         threadId,
 *         triggerMessageId,
 *         messageBody,
 *         threadKind,
 *       }).catch((err) => console.error("[owner-concierge] trigger failed", err));
 *     }
 *
 * The agent decides routing (auto-reply vs human) and, when it
 * auto-replies, the wrapper inserts a new owner_messages row with
 * actor_kind = 'concierge_agent'.
 *
 * Today the agent body (`route()` in src/features/ai-agents/owners/
 * owner-concierge.ts) always returns route='human' / confidence=0,
 * so this wrapper is effectively a no-op + a structured audit log
 * entry. When the real model lands, the auto-reply branch fires
 * automatically.
 *
 * NOTE: No production action currently writes to owner_messages —
 * the existing postStaffMessage stub in features/concierge/
 * queries.ts is also unwired. This trigger is shipped against that
 * future writer.
 */

import "server-only";

import { getDb } from "@/lib/db/client";
import { ownerMessages, ownerThreads } from "@/lib/db/schema/owner-threads";
import { auditEvents } from "@/lib/db/schema/audit";
import { route as runOwnerConciergeAgent } from "@/features/ai-agents/owners/owner-concierge";
import type { OwnerConciergeInput } from "@/features/ai-agents/owners/owner-concierge";
import { eq, sql } from "drizzle-orm";

export interface TriggerOwnerConciergeInput {
  organizationId: string;
  ownerId: string;
  threadId: string;
  /** id of the just-inserted owner_messages row that triggered this. */
  triggerMessageId: string;
  messageBody: string;
  threadKind: OwnerConciergeInput["threadKind"];
}

export interface TriggerOwnerConciergeResult {
  routed: "auto-reply" | "human";
  replyMessageId: string | null;
}

export async function triggerOwnerConcierge(
  input: TriggerOwnerConciergeInput,
): Promise<TriggerOwnerConciergeResult> {
  const db = getDb();
  if (!db) return { routed: "human", replyMessageId: null };

  const agentOut = await runOwnerConciergeAgent({
    organizationId: input.organizationId,
    ownerId: input.ownerId,
    threadId: input.threadId,
    messageBody: input.messageBody,
    threadKind: input.threadKind,
  });

  let replyMessageId: string | null = null;
  if (agentOut.route === "auto-reply" && agentOut.draftBody) {
    const [inserted] = await db
      .insert(ownerMessages)
      .values({
        threadId: input.threadId,
        actorKind: "concierge_agent",
        actorId: null,
        body: agentOut.draftBody,
        inlineActions: agentOut.inlineActions ?? null,
      })
      .returning({ id: ownerMessages.id });
    replyMessageId = inserted?.id ?? null;
    // Bump thread last_message_at + unread_count.
    await db
      .update(ownerThreads)
      .set({
        lastMessageAt: new Date(),
        unreadCount: sql`${ownerThreads.unreadCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(ownerThreads.id, input.threadId));
  }

  // Structured audit even when routed=human so we can measure agent
  // coverage over time.
  try {
    await db.insert(auditEvents).values({
      action: "owner.concierge.triggered",
      entityType: "owner_thread",
      entityId: input.threadId,
      metadata: {
        ownerId: input.ownerId,
        triggerMessageId: input.triggerMessageId,
        route: agentOut.route,
        confidence: agentOut.confidence,
        replyMessageId,
      },
    });
  } catch {
    // Swallow — the trigger has already done its job.
  }

  return { routed: agentOut.route, replyMessageId };
}
