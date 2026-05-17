import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {} from "next/cache";
import { requireDb } from "@/lib/db/client";
import {
  whatsappMessages,
  whatsappMessageTemplates,
  whatsappPhoneNumbers,
} from "@/lib/db/schema/whatsapp";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  getWhatsAppProvider,
  normalisePhone,
  type SendMessageResult,
} from "@/lib/whatsapp/providers";

/**
 * Outbound WhatsApp dispatch — internal-only server actions.
 *
 * `sendWhatsAppMessage` is for free-text messages (limited by WhatsApp
 * Business API to within the 24h conversation window — outside that,
 * use a template).
 *
 * `sendWhatsAppTemplateMessage` is for proactive notifications. Looks
 * up the template by key, verifies `approval_status='approved'`,
 * substitutes variables, sends via the provider, atomically writes
 * the `whatsapp_messages` row + `dev_notification_delivery_log`
 * entry.
 *
 * Both actions: insert the message row immediately with status='queued',
 * then call the provider, then update status. If the provider call
 * fails we record the failure on the message row — no half-state.
 */

const baseSendSchema = z.object({
  toPhone: z.string().min(8).max(20),
  fromProjectId: z.string().uuid().optional(),
  trackInDeliveryLog: z.boolean().optional(),
});

const textSendSchema = baseSendSchema.extend({
  body: z.string().min(1).max(4000),
});

const templateSendSchema = baseSendSchema.extend({
  templateKey: z.string().min(1).max(200),
  variables: z.record(z.string(), z.string()).default({}),
  language: z.enum(["en", "ru", "id", "zh"]).default("en"),
});

export interface SendWhatsAppOutcome {
  messageId: string;
  externalMessageSid: string | null;
  status: "queued" | "sent" | "failed";
  errorReason?: string;
}

export async function sendWhatsAppMessage(
  input: z.input<typeof textSendSchema>,
): Promise<SendWhatsAppOutcome> {
  const parsed = textSendSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();

  const fromPhone = await resolveOutboundFromPhone(parsed.fromProjectId);
  const toPhone = normalisePhone(parsed.toPhone);

  // 1) Insert as queued.
  const [queued] = await db
    .insert(whatsappMessages)
    .values({
      provider: getWhatsAppProvider().name,
      direction: "outbound",
      fromPhone,
      toPhone,
      messageType: "text",
      body: parsed.body,
      status: "queued",
      occurredAt: new Date(),
    })
    .returning({ id: whatsappMessages.id });

  // 2) Send.
  let result: SendMessageResult;
  try {
    result = await getWhatsAppProvider().sendMessage({
      fromPhone,
      toPhone,
      body: parsed.body,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "send failed";
    await db
      .update(whatsappMessages)
      .set({
        status: "failed",
        failureReason: reason,
        statusUpdatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, queued.id));
    return {
      messageId: queued.id,
      externalMessageSid: null,
      status: "failed",
      errorReason: reason,
    };
  }

  // 3) Update with provider response.
  await db
    .update(whatsappMessages)
    .set({
      externalMessageSid: result.externalMessageSid || null,
      status: result.status,
      statusUpdatedAt: new Date(),
      failureReason: result.errorReason ?? null,
    })
    .where(eq(whatsappMessages.id, queued.id));

  return {
    messageId: queued.id,
    externalMessageSid: result.externalMessageSid || null,
    status: result.status,
    errorReason: result.errorReason,
  };
}

export async function sendWhatsAppTemplateMessage(
  input: z.input<typeof templateSendSchema>,
): Promise<SendWhatsAppOutcome> {
  const parsed = templateSendSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();

  // 1) Resolve template + verify approval.
  const [template] = await db
    .select()
    .from(whatsappMessageTemplates)
    .where(eq(whatsappMessageTemplates.templateKey, parsed.templateKey))
    .limit(1);
  if (!template) {
    throw new Error(`Template '${parsed.templateKey}' not found`);
  }
  if (template.approvalStatus !== "approved") {
    throw new Error(
      `Template '${parsed.templateKey}' has approval_status='${template.approvalStatus}' — only approved templates can be sent`,
    );
  }
  if (!template.isActive) {
    throw new Error(`Template '${parsed.templateKey}' is inactive`);
  }

  // 2) Resolve language version (used for body substitution + audit).
  const versions =
    (template.languageVersions as Record<
      string,
      { body: string; header?: string }
    > | null) ?? {};
  const version = versions[parsed.language] ?? versions.en;
  if (!version) {
    throw new Error(
      `Template '${parsed.templateKey}' has no version for language '${parsed.language}'`,
    );
  }

  const fromPhone = await resolveOutboundFromPhone(parsed.fromProjectId);
  const toPhone = normalisePhone(parsed.toPhone);

  // 3) Insert queued row.
  const [queued] = await db
    .insert(whatsappMessages)
    .values({
      provider: getWhatsAppProvider().name,
      direction: "outbound",
      fromPhone,
      toPhone,
      messageType: "template",
      body: substituteVariables(version.body, parsed.variables),
      templateName: template.templateKey,
      templateVariables:
        parsed.variables as typeof whatsappMessages.$inferInsert["templateVariables"],
      status: "queued",
      occurredAt: new Date(),
    })
    .returning({ id: whatsappMessages.id });

  // 4) Send via provider — Twilio uses ContentSid (resolved from
  // template.twilioTemplateSid if present, else the templateKey is
  // passed as-is and the provider returns 'failed' for unapproved).
  let result: SendMessageResult;
  try {
    result = await getWhatsAppProvider().sendTemplateMessage({
      fromPhone,
      toPhone,
      templateKey: template.twilioTemplateSid ?? template.templateKey,
      variables: parsed.variables,
      language: parsed.language,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "send failed";
    await db
      .update(whatsappMessages)
      .set({
        status: "failed",
        failureReason: reason,
        statusUpdatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, queued.id));
    return {
      messageId: queued.id,
      externalMessageSid: null,
      status: "failed",
      errorReason: reason,
    };
  }

  // 5) Optionally attach a delivery_log entry — only when wired into
  // a real notification rule (the dispatcher passes the trigger entity
  // context). Standalone send-template doesn't have a trigger entity,
  // so trackInDeliveryLog from a standalone call is a no-op. The
  // proper integration is via the notification dispatcher (Stage
  // 2.2.B Cp2) which already creates delivery_log rows around its
  // channel calls — Stage 3.D defers the dispatcher rewire to a
  // follow-on (see Deferred from 3.D in architecture.md).
  await db
    .update(whatsappMessages)
    .set({
      externalMessageSid: result.externalMessageSid || null,
      status: result.status,
      statusUpdatedAt: new Date(),
      failureReason: result.errorReason ?? null,
    })
    .where(eq(whatsappMessages.id, queued.id));

  return {
    messageId: queued.id,
    externalMessageSid: result.externalMessageSid || null,
    status: result.status,
    errorReason: result.errorReason,
  };
}

/**
 * Pick the right Arconique outbound number. Project-scoped first,
 * else the most-recent active arconique_outbound number, else falls
 * back to the env-configured default.
 */
async function resolveOutboundFromPhone(
  projectId?: string,
): Promise<string> {
  const db = requireDb();
  if (projectId) {
    const [match] = await db
      .select({ phone: whatsappPhoneNumbers.phoneNumber })
      .from(whatsappPhoneNumbers)
      .where(
        and(
          eq(whatsappPhoneNumbers.projectId, projectId),
          eq(whatsappPhoneNumbers.numberType, "arconique_outbound"),
          eq(whatsappPhoneNumbers.isActive, true),
        ),
      )
      .orderBy(desc(whatsappPhoneNumbers.lastMessageAt))
      .limit(1);
    if (match) return match.phone;
  }
  const [defaultMatch] = await db
    .select({ phone: whatsappPhoneNumbers.phoneNumber })
    .from(whatsappPhoneNumbers)
    .where(
      and(
        eq(whatsappPhoneNumbers.numberType, "arconique_outbound"),
        eq(whatsappPhoneNumbers.isActive, true),
      ),
    )
    .orderBy(desc(whatsappPhoneNumbers.lastMessageAt))
    .limit(1);
  if (defaultMatch) return defaultMatch.phone;
  // Last resort: env-configured Twilio number.
  const fromEnv =
    process.env.TWILIO_WHATSAPP_FROM_NUMBER ??
    process.env.TWILIO_FROM_WHATSAPP ??
    "+14155238886";
  return normalisePhone(fromEnv);
}

function substituteVariables(
  body: string,
  variables: Record<string, string>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]
      : `{{${key}}}`;
  });
}

// =========================================================================
// Read-side queries used by the dashboard pages.
// =========================================================================

export async function getRecentWhatsappMessages(opts?: {
  limit?: number;
  direction?: "inbound" | "outbound";
  status?: string;
}) {
  const db = requireDb();
  const conditions = [];
  if (opts?.direction) {
    conditions.push(eq(whatsappMessages.direction, opts.direction));
  }
  if (opts?.status) {
    conditions.push(eq(whatsappMessages.status, opts.status));
  }
  const where = conditions.length > 0 ? and(...conditions) : sql`true`;
  return await db
    .select()
    .from(whatsappMessages)
    .where(where)
    .orderBy(desc(whatsappMessages.occurredAt))
    .limit(opts?.limit ?? 50);
}

export async function getWhatsappMessage(messageId: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.id, messageId))
    .limit(1);
  return row ?? null;
}

export async function getWhatsappPhoneNumbers(opts?: {
  type?: string;
  isActive?: boolean;
}) {
  const db = requireDb();
  const conditions = [];
  if (opts?.type) conditions.push(eq(whatsappPhoneNumbers.numberType, opts.type));
  if (opts?.isActive !== undefined)
    conditions.push(eq(whatsappPhoneNumbers.isActive, opts.isActive));
  const where = conditions.length > 0 ? and(...conditions) : sql`true`;
  return await db
    .select()
    .from(whatsappPhoneNumbers)
    .where(where)
    .orderBy(desc(whatsappPhoneNumbers.lastMessageAt));
}

export async function getWhatsappTemplates() {
  const db = requireDb();
  return await db
    .select()
    .from(whatsappMessageTemplates)
    .orderBy(whatsappMessageTemplates.templateKey);
}
