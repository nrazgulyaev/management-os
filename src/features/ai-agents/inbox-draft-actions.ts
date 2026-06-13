"use server";

/**
 * Block 03 — the inbox→agent loop for the UNIFIED inbox.
 *
 * The omnichannel inbox (/development-os/inbox) historically only had a
 * plain "type + Send" reply form; AI-drafting lived solely in the guest
 * concierge cabinet. This module lifts that loop into the unified inbox so
 * an inbound message on ANY channel (WhatsApp / Telegram / IG / Messenger /
 * Email / SMS) can be:
 *
 *   1. AI-DRAFTED  — generateInboxDraftAction → returns text for review.
 *   2. SENT (HITL) — sendInboxReplyAction → the human presses Send.
 *
 * Both honor the per-org `inbox` agent config (mode / tone / knowledge
 * sources) resolved via getAgentRuntimeConfig:
 *
 *   - mode 'off'  → drafting is refused (operator turned the agent off).
 *   - mode 'semi' → AI drafts; a human must Send (the default, HITL).
 *   - mode 'auto' → AI drafts AND may send without a human, surfaced via
 *                   the `autoSendEligible` flag so the UI can offer a
 *                   one-press "AI draft + send" affordance. Still audit
 *                   logged; never silent.
 *
 * Provider + credentials are REUSED — callGuestConcierge (the live
 * Anthropic single-shot) for the draft, and the same env-resolved channel
 * credentials the existing sendReplyAction uses for dispatch. No new
 * messaging integration.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOrgId } from "@/features/auth/require-org";
import { requirePermission } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { recordAuditEvent } from "@/features/audit/services";
import { callGuestConcierge } from "@/features/guest-ai-concierge/provider";
import {
  getThreadById,
  listThreadMessages,
  listTemplates,
} from "@/lib/messaging/queries";
import { sendOutboundMessage } from "@/lib/messaging/service";
import { decryptMessagingCredentials } from "@/lib/messaging/credentials-store";
import { envKeyForChannel } from "@/lib/messaging/channel-env";
import type { MessagingChannel } from "@/lib/db/schema/messaging";
import {
  getAgentEligibility,
  getAgentRuntimeConfig,
} from "./agent-config-actions";
import type { AgentMode } from "./agent-config-keys";
import {
  retrieveInboxProjectMemory,
  formatInboxMemoryBlock,
  bumpInboxMemoryAccess,
} from "./inbox-project-memory";

// The unified-inbox AI drafter is the `inbox` configurable agent.
const INBOX_AGENT_KEY = "inbox";

const idSchema = z.string().uuid();

const BASE_SYSTEM =
  "You are an omnichannel-inbox assistant drafting the NEXT reply for a " +
  "human teammate to review before sending. Write a clear, professional " +
  "reply to the contact's latest message, grounded ONLY in the information " +
  "available to you. Do NOT invent prices, availability, addresses, booking " +
  "references, or policies you were not told. If you lack the information, " +
  "draft a polite holding reply that promises to check. Output only the " +
  "reply text — no preamble, no quotes, no signature unless the conversation " +
  "establishes one.";

const CHANNEL_LABEL: Record<MessagingChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  facebook_messenger: "Messenger",
  email: "Email",
  sms: "SMS",
  internal_note: "Internal note",
};

export type InboxDraftResult =
  | { ok: true; draft: string; mode: AgentMode; autoSendEligible: boolean }
  | { ok: false; error: string; reason?: "agent_off" };

/**
 * Generate an AI draft reply for a unified-inbox thread. HITL: never sends.
 * Honors the per-org `inbox` agent mode (off refuses), tone, and knowledge
 * sources. Returns `autoSendEligible` so the UI may offer one-press send
 * when the operator has chosen mode 'auto'.
 */
export async function generateInboxDraftAction(
  threadId: string,
): Promise<InboxDraftResult> {
  await requirePermission("channels.write");
  if (!idSchema.safeParse(threadId).success) {
    return { ok: false, error: "Invalid thread." };
  }

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return { ok: false, error: "No organization context available." };
  }

  // Plan-tier eligibility is the upper bound; the per-org mode is the knob.
  const eligibility = await getAgentEligibility(orgId, INBOX_AGENT_KEY);
  if (!eligibility.eligible) {
    return {
      ok: false,
      reason: "agent_off",
      error:
        eligibility.reason === "disabled_by_org"
          ? "The inbox agent is disabled for your workspace. Enable it in Settings → AI agents → Agent Inbox."
          : "AI drafting is not included in your current plan. Upgrade to enable the inbox agent.",
    };
  }

  const cfg = await getAgentRuntimeConfig(orgId, INBOX_AGENT_KEY);
  if (cfg.mode === "off") {
    return {
      ok: false,
      reason: "agent_off",
      error:
        "The inbox agent is turned off for your workspace. Set mode to Semi or Auto in Settings → AI agents → Agent Inbox.",
    };
  }

  const thread = await getThreadById(threadId);
  if (!thread) return { ok: false, error: "Thread not found." };

  const messages = await listThreadMessages(threadId, { limit: 60 });
  const convo = messages.filter((m) => m.contentText && m.contentText.trim());
  if (convo.length === 0) {
    return { ok: false, error: "No messages to draft from yet." };
  }

  const transcript = convo
    .map((m) => {
      const who =
        m.direction === "inbound"
          ? (m.senderDisplayName ?? "Contact")
          : "Us";
      return `${who}: ${m.contentText}`;
    })
    .join("\n");

  // Compose the system prompt from the no-code config. Custom prompt (if
  // set) replaces the base; tone + knowledge-source rules are appended.
  const parts: string[] = [cfg.customPrompt?.trim() || BASE_SYSTEM];
  if (cfg.tone) {
    parts.push(`Tone: ${cfg.tone}.`);
  }
  // Knowledge-source guardrails. `conversation` is always the spine; the
  // others widen or narrow what the drafter may lean on.
  const allowed: string[] = [];
  if (cfg.knowledgeSources.conversation) allowed.push("the conversation above");

  // AI FOLLOW-ON (b) — when project_memory is on, RETRIEVE real facts from
  // ai_project_memory (org-scoped, narrowed to this contact + org-wide) and
  // inject them into the prompt. Previously this branch only appended a
  // guardrail note without fetching anything. If the store has no matching
  // facts we keep the honest note and add no fabricated context.
  let memoryBlock = "";
  if (cfg.knowledgeSources.project_memory) {
    allowed.push("known property/project facts already established with this contact");
    const facts = await retrieveInboxProjectMemory({
      organizationId: thread.organizationId,
      contactId: thread.contactId,
      limit: 6,
    });
    memoryBlock = formatInboxMemoryBlock(facts);
    if (facts.length > 0) {
      // Best-effort access bookkeeping — never blocks the draft.
      await bumpInboxMemoryAccess(facts.map((f) => f.id));
    }
  }

  let templateHint = "";
  if (cfg.knowledgeSources.templates) {
    const templates = await listTemplates({ activeOnly: true });
    if (templates.length > 0) {
      const names = templates.slice(0, 12).map((t) => t.name).join(", ");
      allowed.push("the workspace's approved message templates");
      templateHint = `\n\nApproved template topics you may mirror in style: ${names}.`;
    }
  }
  if (allowed.length > 0) {
    parts.push(
      `You may ground your reply only in: ${allowed.join("; ")}. Do not use any other source.`,
    );
  }
  // The retrieved project-memory facts (if any) are appended as a distinct
  // block after the guardrails so the drafter sees them verbatim.
  const systemPrompt = parts.join(" ") + memoryBlock;

  const primaryChannel =
    (thread.primaryChannel as MessagingChannel | null) ??
    (thread.channelsUsed[0] as MessagingChannel | undefined) ??
    null;
  const channelLabel = primaryChannel ? CHANNEL_LABEL[primaryChannel] : "this channel";

  const res = await callGuestConcierge(
    systemPrompt,
    `Channel: ${channelLabel}.${templateHint}\n\nConversation so far:\n\n${transcript}\n\nDraft our next reply to the contact.`,
  );
  if (!res.ok || !res.text) {
    return {
      ok: false,
      error: res.errorMessage ?? "AI is unavailable — type a reply manually.",
    };
  }

  // Audit the draft generation (read-shaped, but useful for AI-usage trails).
  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "inbox.ai_draft_generated",
    entityType: "conversation_thread",
    entityId: threadId,
    after: { mode: cfg.mode, channel: primaryChannel },
  });

  return {
    ok: true,
    draft: res.text.trim(),
    mode: cfg.mode,
    autoSendEligible: cfg.mode === "auto",
  };
}

const sendSchema = z.object({
  threadId: z.string().uuid(),
  channel: z.enum([
    "whatsapp",
    "telegram",
    "instagram",
    "facebook_messenger",
    "email",
    "sms",
  ]),
  recipientExternalId: z.string().min(1),
  text: z.string().trim().min(1).max(4000),
  subject: z.string().max(200).optional(),
  /** Set when the operator used the mode='auto' one-press send. */
  aiAuto: z.boolean().optional(),
});

export type InboxSendResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Send a reply (the AI draft, after a human reviewed it) out the unified
 * inbox. HITL — invoked by an explicit human action. When `aiAuto` is set
 * the send originated from the mode='auto' one-press affordance; we
 * re-check the agent mode server-side so a stale client can't auto-send
 * past an operator who has since switched the agent to semi/off.
 */
export async function sendInboxReplyAction(
  input: z.input<typeof sendSchema>,
): Promise<InboxSendResult> {
  await requirePermission("channels.write");
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return { ok: false, error: "No organization context available." };
  }

  // Org-ownership guard: the caller supplies threadId; resolve the thread and
  // reject any cross-org id (reads as "not found") BEFORE we dispatch or roll
  // up thread state. The DB role bypasses RLS, so this is the tenant boundary.
  const thread = await getThreadById(parsed.data.threadId);
  if (!thread || thread.organizationId !== orgId) {
    return { ok: false, error: "Thread not found." };
  }

  // Auto-send guard: if the client claims this is an auto-mode send, confirm
  // the agent is still in auto. A semi/off agent can only be sent by a human
  // pressing Send (which carries aiAuto=false) — never the auto path.
  if (parsed.data.aiAuto) {
    const cfg = await getAgentRuntimeConfig(orgId, INBOX_AGENT_KEY);
    if (cfg.mode !== "auto") {
      return {
        ok: false,
        error:
          "Auto-send is no longer enabled for the inbox agent — review the draft and press Send.",
      };
    }
  }

  const me = await getCurrentAppUser();
  const channel = parsed.data.channel as MessagingChannel;
  const envKey = envKeyForChannel(channel);
  const credentials = envKey
    ? await decryptMessagingCredentials(process.env[envKey] ?? null)
    : null;

  const result = await sendOutboundMessage({
    organizationId: orgId,
    threadId: parsed.data.threadId,
    channel,
    credentials,
    recipientExternalId: parsed.data.recipientExternalId,
    text: parsed.data.text,
    subject: parsed.data.subject,
    senderUserId: me?.id,
  });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: parsed.data.aiAuto ? "inbox.ai_reply_auto_sent" : "inbox.ai_reply_sent",
    entityType: "conversation_thread",
    entityId: parsed.data.threadId,
    after: {
      channel,
      ok: result.ok,
      ai_auto: Boolean(parsed.data.aiAuto),
      length: parsed.data.text.length,
    },
  });

  revalidatePath(`/development-os/inbox/${parsed.data.threadId}`);
  revalidatePath("/development-os/inbox");
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Send failed." };
  }
  return { ok: true };
}
