"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireSuperAdmin } from "@/features/auth/require-super-admin";
import { recordAuditEvent } from "@/features/audit/services";
import {
  supportThreads,
  supportMessages,
  SUPPORT_THREAD_STATUSES,
} from "@/lib/db/schema/support";

/**
 * PLATFORM SUPPORT INBOX — operator-side write layer (migration 0165).
 *
 * Two super-admin actions invoked from /platform/support:
 *   - postPlatformSupportReplyAction — reply as the platform team
 *     (author_side 'platform').
 *   - setSupportThreadStatusAction   — explicit lifecycle transitions
 *     (mark pending / close / reopen).
 *
 * Every action re-checks super_admin (defense-in-depth — the (platform-app)
 * layout already gates, but server actions can be invoked from anywhere;
 * same pattern as lib/platform-flags/actions.ts) and emits an audit_events
 * row with the `platform.*` prefix so it surfaces in /platform/audit.
 * Deliberately NOT org-scoped: the operator console spans all tenants.
 */

export type PlatformSupportActionResult =
  | { ok: true }
  | { ok: false; error: string };

const replySchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().trim().min(1).max(8000),
});

export async function postPlatformSupportReplyAction(
  input: z.input<typeof replySchema>,
): Promise<PlatformSupportActionResult> {
  try {
    const parsed = replySchema.parse(input);
    const ctx = await requireSuperAdmin();
    const actorUserId = ctx.appUser?.id ?? null;
    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured." };

    const [thread] = await db
      .select({
        id: supportThreads.id,
        status: supportThreads.status,
        organizationId: supportThreads.organizationId,
      })
      .from(supportThreads)
      .where(eq(supportThreads.id, parsed.threadId))
      .limit(1);
    if (!thread) return { ok: false, error: "Thread not found." };
    if (thread.status === "closed") {
      return { ok: false, error: "Thread is closed — reopen it before replying." };
    }

    await db.insert(supportMessages).values({
      threadId: thread.id,
      authorUserId: actorUserId,
      authorSide: "platform",
      body: parsed.body,
    });
    await db
      .update(supportThreads)
      .set({ updatedAt: new Date() })
      .where(eq(supportThreads.id, thread.id));

    await recordAuditEvent({
      actorUserId,
      action: "platform.support.message.post",
      entityType: "support_thread",
      entityId: thread.id,
      after: { authorSide: "platform" },
      metadata: { organizationId: thread.organizationId },
    });

    revalidatePath("/platform/support");
    revalidatePath(`/platform/support/${thread.id}`);
    revalidatePath("/dashboard/settings/support");
    revalidatePath(`/dashboard/settings/support/${thread.id}`);
    return { ok: true };
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

const statusSchema = z.object({
  threadId: z.string().uuid(),
  status: z.enum(SUPPORT_THREAD_STATUSES),
});

export async function setSupportThreadStatusAction(
  input: z.input<typeof statusSchema>,
): Promise<PlatformSupportActionResult> {
  try {
    const parsed = statusSchema.parse(input);
    const ctx = await requireSuperAdmin();
    const actorUserId = ctx.appUser?.id ?? null;
    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured." };

    const [thread] = await db
      .select({
        id: supportThreads.id,
        status: supportThreads.status,
        organizationId: supportThreads.organizationId,
      })
      .from(supportThreads)
      .where(eq(supportThreads.id, parsed.threadId))
      .limit(1);
    if (!thread) return { ok: false, error: "Thread not found." };
    if (thread.status === parsed.status) return { ok: true };

    await db
      .update(supportThreads)
      .set({
        status: parsed.status,
        closedAt: parsed.status === "closed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(supportThreads.id, thread.id));

    await recordAuditEvent({
      actorUserId,
      action: "platform.support.thread.status",
      entityType: "support_thread",
      entityId: thread.id,
      before: { status: thread.status },
      after: { status: parsed.status },
      metadata: { organizationId: thread.organizationId },
    });

    revalidatePath("/platform/support");
    revalidatePath(`/platform/support/${thread.id}`);
    revalidatePath("/dashboard/settings/support");
    revalidatePath(`/dashboard/settings/support/${thread.id}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input." };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not update the status.",
    };
  }
}
