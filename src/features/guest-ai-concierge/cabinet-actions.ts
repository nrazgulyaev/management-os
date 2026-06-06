"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageEntity } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { recordAuditEvent } from "@/features/audit/services";
import {
  appendMessage,
  listMessagesForSession,
} from "./services";
import type { GuestAiConciergeMessage } from "@/lib/db/schema/guest-ai-concierge";

const idSchema = z.string().uuid();

export type ThreadAuthor = "guest" | "ai" | "staff" | "system";

export interface ThreadMessage {
  id: string;
  author: ThreadAuthor;
  content: string;
  safetyStatus: string;
  model: string | null;
  createdAt: string | null;
}

export type ThreadResult =
  | { ok: true; messages: ThreadMessage[] }
  | { ok: false; error: string };

function authorOf(m: GuestAiConciergeMessage): ThreadAuthor {
  if (m.role === "user") return "guest";
  if (m.role === "system") return "system";
  // assistant — staff takeover replies are tagged with model "staff"
  return m.model === "staff" ? "staff" : "ai";
}

function toThread(rows: GuestAiConciergeMessage[]): ThreadMessage[] {
  return rows.map((m) => ({
    id: m.id,
    author: authorOf(m),
    content: m.content,
    safetyStatus: m.safetyStatus ?? "ok",
    model: m.model ?? null,
    createdAt:
      m.createdAt instanceof Date
        ? m.createdAt.toISOString()
        : (m.createdAt as string | null) ?? null,
  }));
}

/**
 * Load the full transcript for a concierge session (management cabinet).
 * Gated to staff who can manage guests.
 */
export async function loadConciergeThreadAction(
  sessionId: string,
): Promise<ThreadResult> {
  if (!(await canManageEntity("guest"))) {
    return { ok: false, error: "Not authorised." };
  }
  if (!idSchema.safeParse(sessionId).success) {
    return { ok: false, error: "Invalid session." };
  }
  try {
    const rows = await listMessagesForSession(sessionId, 200);
    return { ok: true, messages: toThread(rows) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not load transcript.",
    };
  }
}

const replySchema = z.string().trim().min(1, "Type a reply.").max(2000);

/**
 * Human takeover: a staff member replies inside the guest's concierge
 * conversation. Stored as an assistant message tagged model="staff" so
 * the guest sees it as a concierge reply and the cabinet renders it as
 * a staff bubble. Returns the refreshed transcript.
 */
export async function postConciergeStaffReplyAction(
  sessionId: string,
  content: string,
): Promise<ThreadResult> {
  if (!(await canManageEntity("guest"))) {
    return { ok: false, error: "Not authorised." };
  }
  if (!idSchema.safeParse(sessionId).success) {
    return { ok: false, error: "Invalid session." };
  }
  const parsed = replySchema.safeParse(content);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Type a reply." };
  }
  const me = await getCurrentAppUser();
  try {
    await appendMessage({
      sessionId,
      role: "assistant",
      content: parsed.data,
      safetyStatus: "ok",
      model: "staff",
      toolContextJson: { author: "staff", staffUserId: me?.id ?? null },
    });
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "concierge.staff_reply",
      entityType: "concierge_session",
      entityId: sessionId,
      after: { length: parsed.data.length },
    });
    const rows = await listMessagesForSession(sessionId, 200);
    revalidatePath("/dashboard/concierge");
    return { ok: true, messages: toThread(rows) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not send reply.",
    };
  }
}
