"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { ownerThreads, ownerMessages } from "@/lib/db/schema/owner-threads";
import { canManageEntity } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import { callGuestConcierge } from "@/features/guest-ai-concierge/provider";
import {
  getOwnerThreadForMgmt,
  getOwnerGroundingContext,
  type MgmtOwnerThreadDetail,
  type MgmtOwnerThreadMessage,
} from "@/features/owner-portal/mgmt-threads";

/**
 * W2 owner-concierge — MGMT-side staff actions for the owner inbox.
 *
 *  - loadOwnerThreadForMgmtAction  : open a thread + transcript (staff view)
 *  - generateOwnerReplyDraftAction : real-LLM AI draft, grounded in the
 *                                    owner's statement / payout / villa facts.
 *                                    HITL — fills the textarea, NEVER auto-sends.
 *  - postMgmtThreadReplyAction     : staff posts a reply as actor_kind='mgmt_staff'.
 *
 * All three are gated on `owners.write` (canManageEntity("owner")) — the same
 * permission that lets staff manage owners. The owner-facing reply path lives
 * in thread-actions.ts (postOwnerThreadReplyAction) and is owner-auth gated.
 */

const idSchema = z.string().uuid();

const DASHBOARD_PATH = "/dashboard/owners/threads";

export type MgmtThreadResult =
  | { ok: true; thread: MgmtOwnerThreadDetail }
  | { ok: false; error: string };

/** Open a single owner thread (staff cabinet). */
export async function loadOwnerThreadForMgmtAction(
  threadId: string,
): Promise<MgmtThreadResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  if (!idSchema.safeParse(threadId).success) {
    return { ok: false, error: "Invalid thread." };
  }
  try {
    const thread = await getOwnerThreadForMgmt(threadId);
    if (!thread) return { ok: false, error: "Conversation not found." };
    return { ok: true, thread };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not load conversation.",
    };
  }
}

export type DraftResult =
  | { ok: true; draft: string }
  | { ok: false; error: string };

const DRAFT_SYSTEM =
  "You are an owner-relations concierge for a luxury villa management company, " +
  "drafting the NEXT reply for a human staff member to review before sending to " +
  "a property OWNER (an investor — not a guest). Write a warm, concise, " +
  "professional reply to the owner's latest message, grounded ONLY in the " +
  "conversation and the OWNER CONTEXT facts provided. Never invent figures, " +
  "payout dates, policies, or commitments that are not in the context. If you " +
  "lack the information, draft a polite holding reply that promises a staff " +
  "member will confirm the specifics. Do not promise refunds, comps, or policy " +
  "exceptions. Output only the reply text — no preamble, no quotes, no sign-off " +
  "placeholders like [Name].";

function actorLabel(m: MgmtOwnerThreadMessage, ownerName: string): string {
  switch (m.actorKind) {
    case "owner":
      return ownerName;
    case "mgmt_staff":
      return "Management";
    case "concierge_agent":
      return "Concierge AI";
    case "system":
      return "System";
    default:
      return "Management";
  }
}

/**
 * Generate an AI draft reply for the active owner thread, for staff to
 * review/edit before sending (HITL). Wraps the live concierge provider
 * (callGuestConcierge) grounded in the owner's statement/payout/villa
 * context; returns ok:false when AI is unconfigured / dry-run so staff just
 * type manually. NEVER auto-sends.
 */
export async function generateOwnerReplyDraftAction(
  threadId: string,
): Promise<DraftResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  if (!idSchema.safeParse(threadId).success) {
    return { ok: false, error: "Invalid thread." };
  }

  let thread: MgmtOwnerThreadDetail | null;
  try {
    thread = await getOwnerThreadForMgmt(threadId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not load conversation.",
    };
  }
  if (!thread) return { ok: false, error: "Conversation not found." };

  const convo = thread.messages.filter((m) => m.actorKind !== "system");
  if (convo.length === 0) {
    return { ok: false, error: "No messages to draft from yet." };
  }

  const context = await getOwnerGroundingContext(thread.ownerId).catch(() => ({
    ownerName: thread.ownerName,
    facts: [] as string[],
  }));

  const transcript = convo
    .map((m) => `${actorLabel(m, thread.ownerName)}: ${m.body}`)
    .join("\n");

  const contextBlock =
    context.facts.length > 0
      ? `OWNER CONTEXT (facts — do not contradict, do not invent beyond these):\n${context.facts
          .map((f) => `- ${f}`)
          .join("\n")}`
      : "OWNER CONTEXT: none available — keep the reply general and offer to confirm specifics.";

  const userPrompt =
    `Thread subject: ${thread.subject} (kind: ${thread.kind})\n` +
    `Owner: ${context.ownerName}\n\n` +
    `${contextBlock}\n\n` +
    `Conversation so far:\n\n${transcript}\n\n` +
    `Draft Management's next reply to the owner.`;

  const res = await callGuestConcierge(DRAFT_SYSTEM, userPrompt);
  if (!res.ok || !res.text) {
    return {
      ok: false,
      error: res.errorMessage ?? "AI is unavailable — type a reply manually.",
    };
  }
  return { ok: true, draft: res.text.trim() };
}

const replySchema = z.string().trim().min(1, "Write a message.").max(4000);

/**
 * Staff posts a reply into an owner thread.
 *
 *   1. authorize (owners.write)
 *   2. insert owner_messages(actor_kind='mgmt_staff', actor_id=staff)
 *   3. bump thread last_message_at; reset unread_count (staff has actioned it)
 *   4. audit-log the reply
 *
 * Returns the refreshed thread so the UI can re-render the transcript.
 */
export async function postMgmtThreadReplyAction(
  threadId: string,
  content: string,
): Promise<MgmtThreadResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  if (!idSchema.safeParse(threadId).success) {
    return { ok: false, error: "Invalid thread." };
  }
  const parsed = replySchema.safeParse(content);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Write a message.",
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const organizationId = await requireOrgId();

  // The thread must exist AND belong to the caller's org.
  const [exists] = await db
    .select({ id: ownerThreads.id })
    .from(ownerThreads)
    .where(
      and(
        eq(ownerThreads.id, threadId),
        eq(ownerThreads.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!exists) return { ok: false, error: "Conversation not found." };

  const me = await getCurrentAppUser();

  await db.insert(ownerMessages).values({
    threadId,
    actorKind: "mgmt_staff",
    actorId: me?.id ?? null,
    body: parsed.data,
  });

  // Bump the thread. A staff reply means the latest inbound owner message has
  // been actioned, so reset the owner-unread counter on the mgmt side.
  await db
    .update(ownerThreads)
    .set({
      lastMessageAt: new Date(),
      unreadCount: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ownerThreads.id, threadId),
        eq(ownerThreads.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_thread.staff_reply",
    entityType: "owner_thread",
    entityId: threadId,
    after: { length: parsed.data.length },
  });

  // Touch the owner-facing inbox too so the owner sees the reply.
  revalidatePath(DASHBOARD_PATH);
  revalidatePath("/owner/inbox");

  const thread = await getOwnerThreadForMgmt(threadId);
  if (!thread) return { ok: false, error: "Reply sent, but reload failed." };
  return { ok: true, thread };
}

/** Update an owner thread's status (open / resolved / escalated / archived). */
const statusSchema = z.enum(["open", "resolved", "escalated", "archived"]);

export async function setOwnerThreadStatusAction(
  threadId: string,
  status: string,
): Promise<MgmtThreadResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  if (!idSchema.safeParse(threadId).success) {
    return { ok: false, error: "Invalid thread." };
  }
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedStatus.success) {
    return { ok: false, error: "Invalid status." };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const updated = await db
    .update(ownerThreads)
    .set({ status: parsedStatus.data, updatedAt: new Date() })
    .where(
      and(
        eq(ownerThreads.id, threadId),
        eq(ownerThreads.organizationId, organizationId),
      ),
    )
    .returning({ id: ownerThreads.id });
  if (updated.length === 0) {
    return { ok: false, error: "Conversation not found." };
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_thread.status_change",
    entityType: "owner_thread",
    entityId: threadId,
    after: { status: parsedStatus.data },
  });

  revalidatePath(DASHBOARD_PATH);
  const thread = await getOwnerThreadForMgmt(threadId);
  if (!thread) return { ok: false, error: "Updated, but reload failed." };
  return { ok: true, thread };
}
