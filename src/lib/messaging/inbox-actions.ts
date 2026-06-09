"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  assignThread as svcAssignThread,
  markThreadRead as svcMarkThreadRead,
  updateThreadStatus as svcUpdateThreadStatus,
  decryptMessagingCredentials,
  createMessageTemplate as svcCreateMessageTemplate,
  archiveMessageTemplate as svcArchiveMessageTemplate,
  createAutoResponseRule as svcCreateAutoResponseRule,
  setRuleActive as svcSetRuleActive,
} from "./credentials-store";
import {
  sendOutboundMessage as svcSendOutbound,
} from "./service";
import { requireDb } from "@/lib/db/client";
import { conversationThreads, type MessagingChannel } from "@/lib/db/schema/messaging";
import { eq } from "drizzle-orm";
import { requireOrgId } from "@/features/auth/require-org";
import { envKeyForChannel } from "./channel-env";

/**
 * Stage 6.P2.F — Server actions wired to the inbox UI.
 *
 * Thin wrappers over `credentials-store` + `service` exports so the
 * client-side `<form action={…}>` calls have a single, named entry
 * point per UI affordance. Keeps `revalidatePath` calls colocated
 * with the action that mutates state.
 */

export async function markThreadReadAction(threadId: string): Promise<void> {
  await svcMarkThreadRead(threadId);
  revalidatePath("/development-os/inbox");
  revalidatePath(`/development-os/inbox/${threadId}`);
}

export async function assignThreadAction(
  threadId: string,
  userId: string | null,
): Promise<void> {
  await svcAssignThread({ threadId, userId });
  revalidatePath(`/development-os/inbox/${threadId}`);
}

export async function updateThreadStatusAction(
  threadId: string,
  status: "active" | "archived" | "spam" | "pending_assignment",
): Promise<void> {
  await svcUpdateThreadStatus({ threadId, status });
  revalidatePath("/development-os/inbox");
  revalidatePath(`/development-os/inbox/${threadId}`);
}

const sendReplySchema = z.object({
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
  text: z.string().min(1).max(4000),
  subject: z.string().max(200).optional(),
});

export async function sendReplyAction(formData: FormData): Promise<void> {
  const parsed = sendReplySchema.safeParse({
    threadId: formData.get("threadId"),
    channel: formData.get("channel"),
    recipientExternalId: formData.get("recipientExternalId"),
    text: formData.get("text"),
    subject: formData.get("subject") ?? undefined,
  });
  if (!parsed.success) {
    console.error("sendReplyAction validation:", parsed.error.issues[0]?.message);
    return;
  }
  const orgId = await requireOrgId();

  // Resolve credentials from the env bootstrap. P2.F doesn't yet
  // persist per-org messaging credentials in a connection table; the
  // env var is the source of truth until P2.G's connection UI lands.
  const envKey = envKeyForChannel(parsed.data.channel as MessagingChannel);
  const credentials = envKey
    ? await decryptMessagingCredentials(process.env[envKey] ?? null)
    : null;

  const result = await svcSendOutbound({
    organizationId: orgId,
    threadId: parsed.data.threadId,
    channel: parsed.data.channel as MessagingChannel,
    credentials,
    recipientExternalId: parsed.data.recipientExternalId,
    text: parsed.data.text,
    subject: parsed.data.subject,
  });
  revalidatePath(`/development-os/inbox/${parsed.data.threadId}`);
  if (!result.ok) {
    console.error("sendReplyAction send failed:", result.error);
  }
}

// `envKeyForChannel` moved to ./channel-env (a Server Action file may only
// export async functions). It is imported above for internal use.

// Re-export template + rule actions under the inbox namespace so the
// /development-os/inbox/* pages can import a single module.

const createTemplateFormSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "lowercase letters, digits, underscore only"),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  supportedChannels: z.string().min(1),
  contentPerChannel: z.string().min(1),
  variables: z.string().optional(),
  whatsappTemplateName: z.string().optional(),
});

export async function createTemplateAction(formData: FormData): Promise<void> {
  const parsed = createTemplateFormSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    supportedChannels: formData.get("supportedChannels"),
    contentPerChannel: formData.get("contentPerChannel"),
    variables: formData.get("variables") ?? "",
    whatsappTemplateName: formData.get("whatsappTemplateName") ?? undefined,
  });
  if (!parsed.success) {
    console.error(
      "createTemplateAction validation:",
      parsed.error.issues[0]?.message,
    );
    return;
  }
  let contentPerChannel: Record<string, string>;
  try {
    contentPerChannel = JSON.parse(parsed.data.contentPerChannel) as Record<
      string,
      string
    >;
  } catch {
    console.error("createTemplateAction: contentPerChannel must be JSON");
    return;
  }
  const supportedChannels = parsed.data.supportedChannels
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as MessagingChannel[];
  const variables = (parsed.data.variables ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const r = await svcCreateMessageTemplate({
    code: parsed.data.code,
    name: parsed.data.name,
    description: parsed.data.description,
    supportedChannels,
    contentPerChannel,
    variables,
    whatsappTemplateName: parsed.data.whatsappTemplateName,
  });
  revalidatePath("/development-os/inbox/templates");
  if (!r.ok) console.error("createTemplateAction:", r.error);
}

export async function archiveTemplateAction(templateId: string): Promise<void> {
  await svcArchiveMessageTemplate(templateId);
  revalidatePath("/development-os/inbox/templates");
}

const createRuleFormSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  channels: z.string().min(1),
  triggerType: z.enum([
    "keyword",
    "first_message",
    "after_hours",
    "no_response_timeout",
  ]),
  triggerConfig: z.string().min(1),
  actionType: z.enum([
    "send_template",
    "send_text",
    "assign_to_user",
    "add_tag",
  ]),
  actionConfig: z.string().min(1),
  throttleWindowMinutes: z.coerce.number().int().min(0).default(60),
  priority: z.coerce.number().int().default(100),
});

export async function createAutoResponseRuleAction(
  formData: FormData,
): Promise<void> {
  const parsed = createRuleFormSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    channels: formData.get("channels"),
    triggerType: formData.get("triggerType"),
    triggerConfig: formData.get("triggerConfig"),
    actionType: formData.get("actionType"),
    actionConfig: formData.get("actionConfig"),
    throttleWindowMinutes: formData.get("throttleWindowMinutes") ?? 60,
    priority: formData.get("priority") ?? 100,
  });
  if (!parsed.success) {
    console.error(
      "createAutoResponseRuleAction validation:",
      parsed.error.issues[0]?.message,
    );
    return;
  }
  let triggerConfig: Record<string, unknown>;
  let actionConfig: Record<string, unknown>;
  try {
    triggerConfig = JSON.parse(parsed.data.triggerConfig) as Record<
      string,
      unknown
    >;
    actionConfig = JSON.parse(parsed.data.actionConfig) as Record<
      string,
      unknown
    >;
  } catch {
    console.error(
      "createAutoResponseRuleAction: triggerConfig + actionConfig must be JSON",
    );
    return;
  }
  const channels = parsed.data.channels
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as MessagingChannel[];
  const r = await svcCreateAutoResponseRule({
    name: parsed.data.name,
    description: parsed.data.description,
    channels,
    triggerType: parsed.data.triggerType,
    triggerConfig,
    actionType: parsed.data.actionType,
    actionConfig,
    throttleWindowMinutes: parsed.data.throttleWindowMinutes,
    priority: parsed.data.priority,
  });
  revalidatePath("/development-os/inbox/auto-responses");
  if (!r.ok) console.error("createAutoResponseRuleAction:", r.error);
}

export async function setRuleActiveAction(
  ruleId: string,
  isActive: boolean,
): Promise<void> {
  await svcSetRuleActive(ruleId, isActive);
  revalidatePath("/development-os/inbox/auto-responses");
}

/**
 * Lightweight thread-touch helper — kept here so the thread detail page
 * can call a single import for "load + mark read" semantics.
 */
export async function touchThreadAsRead(threadId: string) {
  const db = requireDb();
  await db
    .update(conversationThreads)
    .set({ unreadCount: 0, updatedAt: new Date() })
    .where(eq(conversationThreads.id, threadId));
}
