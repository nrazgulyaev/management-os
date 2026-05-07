"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  conversationThreads,
  messageTemplates,
  autoResponseRules,
  MESSAGING_CHANNELS,
  type MessagingChannel,
} from "@/lib/db/schema/messaging";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import {
  encryptCredentials,
  decryptCredentials,
  isEncryptedBlob,
  redactCredentials,
} from "@/lib/channel-manager/credentials-crypto";
import { stayLinkKmsSecret, isProduction } from "@/lib/env";
import type { MessagingCredentials } from "./types";

/**
 * Stage 6.P2.F — Messaging credentials store + write actions for
 * threads, templates, and auto-response rules.
 *
 * Mirrors the channel-manager actions pattern from P1.E. Per-org
 * scope via the `ARCONIQUE_DEFAULT` org bootstrap; full multi-tenant
 * routing lands when org-switcher cookie work continues in P5/P6.
 *
 * Credentials live in `oauth_connections` (introduced by migration
 * 0075). Per-channel + per-user grants — operators can connect a
 * personal Gmail OAuth or a shared WhatsApp Meta number; both are
 * keyed by channel + user_id.
 */

const DEV_FALLBACK_SECRET =
  "arconique:DEV-ONLY:do-not-use-in-prod:32-bytes-minimum";

function resolveSecret(): string {
  const s = stayLinkKmsSecret();
  if (s) return s;
  if (isProduction()) {
    throw new Error(
      "Messaging credentials encryption refused: STAY_LINK_KMS_SECRET missing in production.",
    );
  }
  return DEV_FALLBACK_SECRET;
}

async function resolveActiveOrgId(): Promise<string> {
  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!org) {
    throw new Error("ARCONIQUE_DEFAULT organization not found");
  }
  return org.id;
}

// ---------------------------------------------------------------------------
// Credential round-trip helpers (encrypt → store → decrypt at runtime)
// ---------------------------------------------------------------------------

/**
 * Encrypt a credentials object for storage. Caller persists the
 * resulting blob to oauth_connections.access_token (the column accepts
 * a JSON string of the encrypted envelope shape).
 */
export async function encryptMessagingCredentials(
  credentials: MessagingCredentials,
): Promise<string> {
  await requireInternalUser();
  const enc = encryptCredentials(JSON.stringify(credentials), resolveSecret());
  return JSON.stringify(enc);
}

/**
 * Decrypt back to a MessagingCredentials object. Returns null on
 * legacy / malformed input rather than throwing — service-layer
 * callers degrade to DryRun on null.
 */
export async function decryptMessagingCredentials(
  storedBlob: string | null | undefined,
): Promise<MessagingCredentials | null> {
  if (!storedBlob) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(storedBlob);
  } catch {
    return null;
  }
  if (!isEncryptedBlob(parsed)) return null;
  try {
    const json = decryptCredentials(parsed, resolveSecret());
    return JSON.parse(json) as MessagingCredentials;
  } catch {
    return null;
  }
}

export async function getRedactedMessagingCredentials(
  storedBlob: string | null | undefined,
): Promise<Record<string, unknown>> {
  const creds = await decryptMessagingCredentials(storedBlob);
  if (!creds) return {};
  return redactCredentials(creds as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Thread management
// ---------------------------------------------------------------------------

const updateThreadStatusSchema = z.object({
  threadId: z.string().uuid(),
  status: z.enum(["active", "archived", "spam", "pending_assignment"]),
});

export async function updateThreadStatus(
  input: z.input<typeof updateThreadStatusSchema>,
): Promise<{ ok: boolean; error?: string }> {
  await requireInternalUser();
  const parsed = updateThreadStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const db = requireDb();
  await db
    .update(conversationThreads)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(conversationThreads.id, parsed.data.threadId));
  return { ok: true };
}

const assignThreadSchema = z.object({
  threadId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
});

export async function assignThread(
  input: z.input<typeof assignThreadSchema>,
): Promise<{ ok: boolean; error?: string }> {
  await requireInternalUser();
  const parsed = assignThreadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const db = requireDb();
  await db
    .update(conversationThreads)
    .set({
      assignedToUserId: parsed.data.userId,
      assignedAt: parsed.data.userId ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(conversationThreads.id, parsed.data.threadId));
  return { ok: true };
}

export async function markThreadRead(
  threadId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireInternalUser();
  const db = requireDb();
  await db
    .update(conversationThreads)
    .set({ unreadCount: 0, updatedAt: new Date() })
    .where(eq(conversationThreads.id, threadId));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const createTemplateSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "lowercase letters, digits, underscore only"),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  supportedChannels: z
    .array(
      z.enum(MESSAGING_CHANNELS as unknown as [MessagingChannel, ...MessagingChannel[]]),
    )
    .min(1),
  contentPerChannel: z.record(z.string(), z.string()),
  variables: z.array(z.string()).default([]),
  whatsappTemplateName: z.string().optional(),
});

export async function createMessageTemplate(
  input: z.input<typeof createTemplateSchema>,
): Promise<{ ok: boolean; templateId?: string; error?: string }> {
  await requireInternalUser();
  const parsed = createTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const db = requireDb();
  const orgId = await resolveActiveOrgId();
  try {
    const [row] = await db
      .insert(messageTemplates)
      .values({
        organizationId: orgId,
        code: parsed.data.code,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        supportedChannels: parsed.data.supportedChannels,
        contentPerChannel: parsed.data.contentPerChannel as never,
        variables: parsed.data.variables,
        whatsappTemplateName: parsed.data.whatsappTemplateName ?? null,
        whatsappTemplateStatus: parsed.data.whatsappTemplateName
          ? "pending"
          : null,
        status: "active",
      })
      .returning({ id: messageTemplates.id });
    return { ok: true, templateId: row.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "insert failed",
    };
  }
}

export async function archiveMessageTemplate(
  templateId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireInternalUser();
  const db = requireDb();
  await db
    .update(messageTemplates)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(messageTemplates.id, templateId));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Auto-response rules
// ---------------------------------------------------------------------------

const createRuleSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  channels: z
    .array(
      z.enum(MESSAGING_CHANNELS as unknown as [MessagingChannel, ...MessagingChannel[]]),
    )
    .min(1),
  triggerType: z.enum([
    "keyword",
    "first_message",
    "after_hours",
    "no_response_timeout",
  ]),
  triggerConfig: z.record(z.string(), z.unknown()),
  actionType: z.enum([
    "send_template",
    "send_text",
    "assign_to_user",
    "add_tag",
  ]),
  actionConfig: z.record(z.string(), z.unknown()),
  throttleWindowMinutes: z.number().int().min(0).default(60),
  priority: z.number().int().default(100),
});

export async function createAutoResponseRule(
  input: z.input<typeof createRuleSchema>,
): Promise<{ ok: boolean; ruleId?: string; error?: string }> {
  await requireInternalUser();
  const parsed = createRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const db = requireDb();
  const orgId = await resolveActiveOrgId();
  try {
    const [row] = await db
      .insert(autoResponseRules)
      .values({
        organizationId: orgId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        channels: parsed.data.channels,
        triggerType: parsed.data.triggerType,
        triggerConfig: parsed.data.triggerConfig as never,
        actionType: parsed.data.actionType,
        actionConfig: parsed.data.actionConfig as never,
        throttleWindowMinutes: parsed.data.throttleWindowMinutes,
        priority: parsed.data.priority,
        isActive: true,
      })
      .returning({ id: autoResponseRules.id });
    return { ok: true, ruleId: row.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "insert failed",
    };
  }
}

export async function setRuleActive(
  ruleId: string,
  isActive: boolean,
): Promise<{ ok: boolean }> {
  await requireInternalUser();
  const db = requireDb();
  await db
    .update(autoResponseRules)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(autoResponseRules.id, ruleId));
  return { ok: true };
}
