"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { ownerThreads, ownerMessages } from "@/lib/db/schema/owner-threads";
import { ownerActivityLog } from "@/lib/db/schema/owner-activity-log";
import { requireOwnerWrite } from "@/features/owner-portal/require-owner-write";
import { getOwnerOrgId } from "@/features/owner-portal/owner-context";
import { recordAuditEvent } from "@/features/audit/services";
import {
  COMPOSE_CATEGORY_VALUES,
  type OwnerActionState,
} from "@/features/owner-portal/thread-compose-types";

/**
 * Owner starts a NEW conversation with Management (inbox compose).
 *
 * Genuinely-missing surface: the owner inbox could only reply into
 * existing threads (postOwnerThreadReplyAction); there was no way to
 * open a fresh thread. This mirrors the thread-creation pattern in
 * engagement-actions (pre-approve / Q-review), but for a free-form
 * owner-initiated message.
 *
 *   1. authorize (requireOwnerWrite — impersonating super-admins are
 *      read-only; the returned ownerId is the only owner this session
 *      may write for, so there is no cross-owner / cross-tenant path)
 *   2. resolve the org anchor (owner → ownership_shares → project.org)
 *   3. insert owner_threads (subject + category, unread for mgmt)
 *   4. insert the first owner_messages(actor_kind='owner')
 *   5. mirror to owner_activity_log + audit-log the create
 *   6. redirect into the new thread on the inbox
 *
 * No new table — reuses owner_threads / owner_messages (drizzle 0114)
 * + owner_activity_log. No money columns are touched.
 */

const composeSchema = z.object({
  subject: z.string().trim().min(3, "Add a short subject.").max(160),
  category: z.enum(COMPOSE_CATEGORY_VALUES),
  body: z.string().trim().min(1, "Write your message.").max(4000),
});

export async function createOwnerThreadAction(
  _prev: OwnerActionState | null,
  formData: FormData,
): Promise<OwnerActionState> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = composeSchema.safeParse({
    subject: formData.get("subject"),
    category: formData.get("category"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form.",
    };
  }
  const { subject, category, body } = parsed.data;

  // Org anchor (TENANCY 0158) — owner_threads.organization_id is NOT NULL.
  const organizationId = await getOwnerOrgId(auth.ownerId);
  if (!organizationId) {
    return { ok: false, error: "Could not resolve your organisation." };
  }

  // Open the thread. unread_count starts at 1 so mgmt sees a new inbound.
  const [thread] = await db
    .insert(ownerThreads)
    .values({
      organizationId,
      ownerId: auth.ownerId,
      subject,
      kind: category,
      relatedEntityType: "owner_compose",
      status: "open",
      unreadCount: 1,
    })
    .returning({ id: ownerThreads.id });

  // Seed the owner's first message.
  await db.insert(ownerMessages).values({
    threadId: thread.id,
    actorKind: "owner",
    actorId: auth.appUserId,
    body,
  });

  // Owner-facing narrative entry (Home recent-activity stream).
  await db.insert(ownerActivityLog).values({
    organizationId,
    ownerId: auth.ownerId,
    kind: "message_received",
    relatedEntityType: "owner_thread",
    relatedEntityId: thread.id,
    subject: `New message · ${subject}`,
    body: body.slice(0, 160),
    linkUrl: `/owner/inbox?thread=${thread.id}`,
  });

  await recordAuditEvent({
    actorUserId: auth.appUserId,
    organizationId,
    action: "owner_thread.create",
    entityType: "owner_thread",
    entityId: thread.id,
    after: { subject, category, ownerId: auth.ownerId },
  });

  revalidatePath("/owner");
  revalidatePath("/owner/inbox");
  redirect(`/owner/inbox?thread=${thread.id}`);
}
