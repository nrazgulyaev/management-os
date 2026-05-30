"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerThreads, ownerMessages } from "@/lib/db/schema/owner-threads";
import { requireOwnerWrite } from "@/features/owner-portal/require-owner-write";
import { getOwnerOrgId } from "@/features/owner-portal/owner-context";
import { triggerOwnerConcierge } from "@/features/owner-portal/messaging/concierge-trigger";
import type { OwnerActionState } from "@/features/owner-portal/notification-prefs-types";

/**
 * Owner posts a reply into one of their threads.
 *
 *   1. authorize (requireOwnerWrite — impersonating super-admins are
 *      read-only) AND verify the thread belongs to this owner
 *   2. insert owner_messages(actor_kind='owner')
 *   3. bump the thread (last_message_at, unread_count, updated_at)
 *   4. fire-and-forget the owner-concierge trigger
 *
 * NOTE on the trigger: no owner-concierge agent is seeded in
 * agent_configurations yet, and the agent body returns route='human'
 * (no-op). So today this only writes a structured audit entry and
 * auto-activates when a real agent lands. It does NOT block the reply.
 */

/** DB thread.kind → the agent's narrower threadKind enum. */
function toAgentThreadKind(
  dbKind: string,
): "statement_dispute" | "personal_stay" | "q_review" | "general" {
  switch (dbKind) {
    case "dispute":
      return "statement_dispute";
    case "personal_stay_request":
      return "personal_stay";
    case "tax_question":
      return "q_review";
    default:
      return "general";
  }
}

const replySchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().trim().min(1, "Write a message.").max(4000),
});

export async function postOwnerThreadReplyAction(
  _prev: OwnerActionState | null,
  formData: FormData,
): Promise<OwnerActionState> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = replySchema.safeParse({
    threadId: formData.get("threadId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid reply." };
  }
  const { threadId, body } = parsed.data;

  // Authorize: the thread must belong to this owner.
  const [thread] = await db
    .select({ id: ownerThreads.id, ownerId: ownerThreads.ownerId, kind: ownerThreads.kind })
    .from(ownerThreads)
    .where(eq(ownerThreads.id, threadId))
    .limit(1);
  if (!thread || thread.ownerId !== auth.ownerId) {
    return { ok: false, error: "Conversation not found." };
  }

  // Insert the owner's message.
  const [msg] = await db
    .insert(ownerMessages)
    .values({
      threadId,
      actorKind: "owner",
      actorId: auth.appUserId,
      body,
    })
    .returning({ id: ownerMessages.id });

  // Bump the thread. unread_count tracks owner-unread on the mgmt side;
  // an owner reply increments it so staff see a new inbound message.
  await db
    .update(ownerThreads)
    .set({
      lastMessageAt: new Date(),
      unreadCount: sql`${ownerThreads.unreadCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(ownerThreads.id, threadId));

  // Fire-and-forget the concierge trigger (no-op until an agent is
  // seeded; never blocks or fails the reply).
  const orgId = await getOwnerOrgId(auth.ownerId).catch(() => null);
  if (orgId) {
    void triggerOwnerConcierge({
      organizationId: orgId,
      ownerId: auth.ownerId,
      threadId,
      triggerMessageId: msg.id,
      messageBody: body,
      threadKind: toAgentThreadKind(thread.kind),
    }).catch((err) => {
      console.error("[owner-concierge] trigger failed", err);
    });
  }

  revalidatePath("/owner/inbox");
  return { ok: true };
}
