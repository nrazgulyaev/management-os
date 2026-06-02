"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerThreads, ownerMessages } from "@/lib/db/schema/owner-threads";
import { ownerStatements } from "@/lib/db/schema/finance";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { recordAuditEvent } from "@/features/audit/services";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const replySchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().trim().min(1, "Write a reply.").max(4000),
});

/**
 * Mgmt/Director posts a reply into a dispute thread (FC-OWNER-STATEMENTS §4.4).
 * Org-scoped: the thread must be a dispute on a statement in the caller's org.
 * Writes owner_messages(actor_kind='mgmt_staff'), bumps the thread, and
 * revalidates both the Mgmt dispute view and the owner inbox (cross-surface).
 */
export async function postDisputeReplyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const user = await getCurrentAppUser();
  if (!user) return { ok: false, error: "Sign in required." };
  const orgId = await requireOrgId();

  const parsed = replySchema.safeParse({
    threadId: formData.get("threadId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid reply." };
  }
  const { threadId, body } = parsed.data;

  // Authorize: dispute thread on a statement in this org.
  const [thread] = await db
    .select({ id: ownerThreads.id })
    .from(ownerThreads)
    .innerJoin(ownerStatements, eq(ownerStatements.id, ownerThreads.relatedEntityId))
    .where(
      and(
        eq(ownerThreads.id, threadId),
        eq(ownerThreads.kind, "dispute"),
        eq(ownerStatements.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!thread) return { ok: false, error: "Dispute not found." };

  await db.insert(ownerMessages).values({
    threadId,
    actorKind: "mgmt_staff",
    actorId: user.id,
    body,
  });
  await db
    .update(ownerThreads)
    .set({
      lastMessageAt: new Date(),
      unreadCount: sql`${ownerThreads.unreadCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(ownerThreads.id, threadId));

  await recordAuditEvent({
    actorUserId: user.id,
    action: "statement.dispute.replied",
    entityType: "owner_thread",
    entityId: threadId,
  });

  revalidatePath(`/dashboard/finance/disputes/${threadId}`);
  revalidatePath("/dashboard/finance/disputes");
  revalidatePath("/owner/inbox");
  return { ok: true };
}
