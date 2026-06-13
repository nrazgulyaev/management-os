"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageEntity } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import {
  appendMessage,
  getConciergeSessionOrganizationId,
  listMessagesForSession,
} from "./services";
import { callGuestConcierge } from "./provider";
import type { GuestAiConciergeMessage } from "@/lib/db/schema/guest-ai-concierge";

const idSchema = z.string().uuid();

/**
 * Shared gate for every mgmt-cabinet concierge action: checks the verb
 * (canManageEntity) AND the tenant — a cross-org sessionId reads as
 * "Session not found" so neither the transcript can be read nor a staff
 * reply written into another tenant's conversation. NULL session org =
 * legacy/unbackfilled → allowed. Returns the caller org for downstream
 * org-scoped reads.
 */
async function guardConciergeSession(
  sessionId: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  if (!(await canManageEntity("guest"))) {
    return { ok: false, error: "Not authorised." };
  }
  if (!idSchema.safeParse(sessionId).success) {
    return { ok: false, error: "Invalid session." };
  }
  const organizationId = await requireOrgId();
  const sessionOrg = await getConciergeSessionOrganizationId(sessionId);
  if (sessionOrg && sessionOrg !== organizationId) {
    return { ok: false, error: "Session not found." };
  }
  return { ok: true, organizationId };
}

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
  const guard = await guardConciergeSession(sessionId);
  if (!guard.ok) return guard;
  try {
    const rows = await listMessagesForSession(sessionId, 200, guard.organizationId);
    return { ok: true, messages: toThread(rows) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not load transcript.",
    };
  }
}

export type DraftResult =
  | { ok: true; draft: string }
  | { ok: false; error: string };

const DRAFT_SYSTEM =
  "You are a villa-stay concierge drafting the NEXT reply for a human staff " +
  "member to review before sending. Write a warm, concise, professional reply " +
  "to the guest's latest message, grounded ONLY in the conversation. Do not " +
  "invent prices, availability, addresses, or policies you were not told. If " +
  "you lack the information, draft a polite holding reply that promises to " +
  "check. Output only the reply text — no preamble, no quotes.";

/**
 * Generate an AI draft reply for the active concierge session, for staff to
 * review/edit before sending (HITL). Wraps the live concierge provider
 * (callGuestConcierge); returns ok:false when AI is unconfigured / dry-run so
 * the staff just types manually. Never auto-sends.
 */
export async function generateConciergeDraftAction(
  sessionId: string,
): Promise<DraftResult> {
  const guard = await guardConciergeSession(sessionId);
  if (!guard.ok) return guard;
  let messages: ThreadMessage[];
  try {
    messages = toThread(await listMessagesForSession(sessionId, 200, guard.organizationId));
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not load transcript.",
    };
  }
  const convo = messages.filter((m) => m.author !== "system");
  if (convo.length === 0) {
    return { ok: false, error: "No messages to draft from yet." };
  }
  const transcript = convo
    .map((m) => `${m.author === "guest" ? "Guest" : "Concierge"}: ${m.content}`)
    .join("\n");
  const res = await callGuestConcierge(
    DRAFT_SYSTEM,
    `Conversation so far:\n\n${transcript}\n\nDraft the concierge's next reply to the guest.`,
  );
  if (!res.ok || !res.text) {
    return {
      ok: false,
      error: res.errorMessage ?? "AI is unavailable — type a reply manually.",
    };
  }
  return { ok: true, draft: res.text.trim() };
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
  // Tenant-scoped gate: blocks writing a staff reply into another org's
  // session (a cross-org sessionId reads as not-found here).
  const guard = await guardConciergeSession(sessionId);
  if (!guard.ok) return guard;
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
    const rows = await listMessagesForSession(sessionId, 200, guard.organizationId);
    revalidatePath("/dashboard/concierge");
    return { ok: true, messages: toThread(rows) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not send reply.",
    };
  }
}
