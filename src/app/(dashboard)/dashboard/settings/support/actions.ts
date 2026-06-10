"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import {
  supportThreads,
  supportMessages,
  SUPPORT_THREAD_PRIORITIES,
} from "@/lib/db/schema/support";

/**
 * PLATFORM SUPPORT INBOX — org-side write layer (migration 0165).
 *
 * Two actions invoked from /dashboard/settings/support:
 *   - createSupportThreadAction — "New thread" form (subject + priority +
 *     first message in one shot).
 *   - postSupportReplyAction    — reply inside an existing thread.
 *
 * Every action: requireInternalUser (org-member gate) + requireOrgId (every
 * INSERT carries organization_id; every read/UPDATE ANDs the org into the
 * WHERE — a thread id from another tenant 404s, it never leaks) + zod +
 * recordAuditEvent. Errors return { ok: false, error } so the forms can
 * render them honestly instead of throwing into an error boundary.
 */

export type SupportActionResult =
  | { ok: true; threadId: string }
  | { ok: false; error: string };

const createThreadSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  priority: z.enum(SUPPORT_THREAD_PRIORITIES),
  message: z.string().trim().min(1).max(8000),
});

export async function createSupportThreadAction(
  input: z.input<typeof createThreadSchema>,
): Promise<SupportActionResult> {
  try {
    const parsed = createThreadSchema.parse(input);
    const ctx = await requireInternalUser();
    const organizationId = await requireOrgId();
    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured." };
    const actorUserId = ctx.appUser?.id ?? null;

    const [thread] = await db
      .insert(supportThreads)
      .values({
        organizationId,
        createdByUserId: actorUserId,
        subject: parsed.subject,
        priority: parsed.priority,
        status: "open",
      })
      .returning({ id: supportThreads.id });

    await db.insert(supportMessages).values({
      threadId: thread.id,
      authorUserId: actorUserId,
      authorSide: "org",
      body: parsed.message,
    });

    await recordAuditEvent({
      actorUserId,
      action: "support.thread.create",
      entityType: "support_thread",
      entityId: thread.id,
      after: { subject: parsed.subject, priority: parsed.priority, status: "open" },
      metadata: { organizationId },
    });

    revalidatePath("/dashboard/settings/support");
    revalidatePath("/platform/support");
    return { ok: true, threadId: thread.id };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input." };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not create the thread.",
    };
  }
}

const replySchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().trim().min(1).max(8000),
});

export async function postSupportReplyAction(
  input: z.input<typeof replySchema>,
): Promise<SupportActionResult> {
  try {
    const parsed = replySchema.parse(input);
    const ctx = await requireInternalUser();
    const organizationId = await requireOrgId();
    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured." };
    const actorUserId = ctx.appUser?.id ?? null;

    // Org-scoped lookup — another tenant's thread id is indistinguishable
    // from a nonexistent one.
    const [thread] = await db
      .select({ id: supportThreads.id, status: supportThreads.status })
      .from(supportThreads)
      .where(
        and(
          eq(supportThreads.id, parsed.threadId),
          eq(supportThreads.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!thread) return { ok: false, error: "Thread not found." };
    if (thread.status === "closed") {
      return {
        ok: false,
        error: "This thread is closed. Start a new thread if you need more help.",
      };
    }

    await db.insert(supportMessages).values({
      threadId: thread.id,
      authorUserId: actorUserId,
      authorSide: "org",
      body: parsed.body,
    });

    // A customer reply puts a "waiting on customer" thread back into the
    // platform queue.
    const nextStatus = thread.status === "pending" ? "open" : thread.status;
    await db
      .update(supportThreads)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(
        and(
          eq(supportThreads.id, thread.id),
          eq(supportThreads.organizationId, organizationId),
        ),
      );

    await recordAuditEvent({
      actorUserId,
      action: "support.message.post",
      entityType: "support_thread",
      entityId: thread.id,
      after: { authorSide: "org", statusAfter: nextStatus },
      metadata: { organizationId },
    });

    revalidatePath("/dashboard/settings/support");
    revalidatePath(`/dashboard/settings/support/${thread.id}`);
    revalidatePath("/platform/support");
    revalidatePath(`/platform/support/${thread.id}`);
    return { ok: true, threadId: thread.id };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input." };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not post the reply.",
    };
  }
}
