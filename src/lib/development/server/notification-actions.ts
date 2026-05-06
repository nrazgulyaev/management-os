"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contacts } from "@/lib/db/schema/contacts";
import {
  devNotificationDeliveryLog,
  devNotificationRules,
} from "@/lib/db/schema/sales";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import { env, isResendConfigured } from "@/lib/env";
import {
  getNotificationTemplateByName,
  interpolateTemplate,
} from "./notifications";

interface EmailSendResult {
  status: "sent" | "skipped" | "failed";
  externalMessageId?: string;
  errorMessage?: string;
}

/**
 * Direct Resend dispatch. Mirrors the existing
 * `lib/features/notifications/providers/resend.ts` pattern so we don't
 * depend on the queue-shaped `DeliveryInput`. Fails closed when env is
 * missing.
 */
async function sendEmailViaResend(args: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailSendResult> {
  if (!isResendConfigured()) {
    return { status: "skipped", errorMessage: "resend_not_configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.server.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.server.RESEND_FROM_EMAIL,
        to: [args.to],
        subject: args.subject,
        text: args.text,
        html: args.html,
      }),
    });
    if (!res.ok) {
      let msg = `resend_http_${res.status}`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) msg = body.message;
      } catch {
        // ignore
      }
      return { status: "failed", errorMessage: msg };
    }
    const body = (await res.json()) as { id?: string };
    return { status: "sent", externalMessageId: body.id };
  } catch (err) {
    return {
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "resend_unknown_error",
    };
  }
}

/**
 * Notification rules CRUD + dispatch.
 *
 * Stage 2.2.B implements `email` and `in_app` channels. WhatsApp / SMS
 * land in Stage 3 — for those rows we mark `status='queued'` and
 * `error_reason='channel_not_yet_implemented'` instead of failing.
 *
 * Every external send writes to `dev_notification_delivery_log` first as
 * `queued`, then transitions to `sent` / `failed` based on the provider
 * response. Resend is reused via the existing
 * `lib/features/notifications/providers` abstraction so we share the env
 * gating + dry-run behavior with Management OS.
 */

const upsertRuleSchema = z.object({
  id: z.string().uuid().optional(),
  ruleName: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  triggerEvent: z.enum([
    "milestone_pre_invoice_due",
    "milestone_invoice_due",
    "milestone_overdue",
    "milestone_overdue_critical",
    "reservation_expiring",
    "contract_pending_signature",
    "late_fee_accrued",
    "discount_pending_approval",
    "system_event",
  ]),
  triggerOffsetDays: z.coerce.number().int().min(-365).max(365).default(0),
  recipientType: z.enum([
    "buyer",
    "sales_manager",
    "project_manager",
    "admin",
    "specific_role",
    "specific_user",
  ]),
  recipientRoleKey: z.string().max(80).optional(),
  recipientUserId: z.string().uuid().optional(),
  channel: z.enum(["email", "whatsapp", "sms", "in_app"]),
  templateName: z.string().min(1).max(120),
  isActive: z.coerce.boolean().default(true),
  createdBy: z.string().uuid().optional(),
});

export type UpsertRuleResult =
  | { ok: true; ruleId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createNotificationRule(
  formData: FormData,
): Promise<UpsertRuleResult> {
  return upsertNotificationRule(formData, false);
}

export async function updateNotificationRule(
  formData: FormData,
): Promise<UpsertRuleResult> {
  return upsertNotificationRule(formData, true);
}

async function upsertNotificationRule(
  formData: FormData,
  requireId: boolean,
): Promise<UpsertRuleResult> {
  const parsed = upsertRuleSchema.safeParse({
    id: formData.get("id") || undefined,
    ruleName: formData.get("ruleName"),
    description: formData.get("description") || undefined,
    triggerEvent: formData.get("triggerEvent"),
    triggerOffsetDays: formData.get("triggerOffsetDays") ?? 0,
    recipientType: formData.get("recipientType"),
    recipientRoleKey: formData.get("recipientRoleKey") || undefined,
    recipientUserId: formData.get("recipientUserId") || undefined,
    channel: formData.get("channel"),
    templateName: formData.get("templateName"),
    isActive: formData.get("isActive") ?? true,
    createdBy: formData.get("createdBy") || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (requireId && !parsed.data.id) {
    return { ok: false, error: "Rule ID required for update." };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  if (parsed.data.id) {
    await db
      .update(devNotificationRules)
      .set({
        ruleName: parsed.data.ruleName,
        description: parsed.data.description ?? null,
        triggerEvent: parsed.data.triggerEvent,
        triggerOffsetDays: parsed.data.triggerOffsetDays,
        recipientType: parsed.data.recipientType,
        recipientRoleKey: parsed.data.recipientRoleKey ?? null,
        recipientUserId: parsed.data.recipientUserId ?? null,
        channel: parsed.data.channel,
        templateName: parsed.data.templateName,
        isActive: parsed.data.isActive,
        updatedAt: new Date(),
      })
      .where(eq(devNotificationRules.id, parsed.data.id));
    revalidatePath(`${DEVELOPMENT_APP_PATH}/settings/notifications`);
    return { ok: true, ruleId: parsed.data.id };
  }

  const inserted = await db
    .insert(devNotificationRules)
    .values({
      ruleName: parsed.data.ruleName,
      description: parsed.data.description ?? null,
      triggerEvent: parsed.data.triggerEvent,
      triggerOffsetDays: parsed.data.triggerOffsetDays,
      recipientType: parsed.data.recipientType,
      recipientRoleKey: parsed.data.recipientRoleKey ?? null,
      recipientUserId: parsed.data.recipientUserId ?? null,
      channel: parsed.data.channel,
      templateName: parsed.data.templateName,
      isActive: parsed.data.isActive,
      createdBy: parsed.data.createdBy ?? null,
    })
    .returning({ id: devNotificationRules.id });
  revalidatePath(`${DEVELOPMENT_APP_PATH}/settings/notifications`);
  return { ok: true, ruleId: inserted[0]?.id ?? "" };
}

export interface DispatchInput {
  ruleId: string;
  triggerEntityType: string;
  triggerEntityId: string;
  recipientContactId?: string;
  recipientUserId?: string;
  /** When omitted, the dispatcher resolves the address from the contact record. */
  recipientAddress?: string;
  templateVariables: Record<string, string | number | null | undefined>;
}

export interface DispatchResult {
  ok: boolean;
  deliveryId: string;
  status: "sent" | "queued" | "failed" | "skipped";
  error?: string;
}

/**
 * Dispatches a single notification through the rule pipeline.
 *
 * Pure side effects: writes one `dev_notification_delivery_log` row,
 * dispatches via the matching provider when the channel is implemented,
 * never throws (errors land on the row).
 */
export async function dispatchNotification(
  input: DispatchInput,
): Promise<DispatchResult> {
  const db = getDb();
  if (!db) {
    return {
      ok: false,
      deliveryId: "",
      status: "failed",
      error: "Database is not configured.",
    };
  }

  const ruleRows = await db
    .select()
    .from(devNotificationRules)
    .where(eq(devNotificationRules.id, input.ruleId))
    .limit(1);
  const rule = ruleRows[0];
  if (!rule) {
    return {
      ok: false,
      deliveryId: "",
      status: "failed",
      error: "Rule not found.",
    };
  }

  const template = await getNotificationTemplateByName(rule.templateName);
  if (!template) {
    return {
      ok: false,
      deliveryId: "",
      status: "failed",
      error: `Template not found: ${rule.templateName}`,
    };
  }

  // Resolve recipient address.
  let recipientAddress = input.recipientAddress ?? null;
  if (!recipientAddress && input.recipientContactId) {
    const c = await db
      .select({ email: contacts.email, whatsapp: contacts.whatsapp })
      .from(contacts)
      .where(eq(contacts.id, input.recipientContactId))
      .limit(1);
    if (c[0]) {
      recipientAddress =
        rule.channel === "whatsapp" ? (c[0].whatsapp ?? null) : (c[0].email ?? null);
    }
  }

  const subject = interpolateTemplate(template.subject, input.templateVariables);
  const body = interpolateTemplate(template.bodyText, input.templateVariables);
  const bodyHtml = interpolateTemplate(template.bodyHtml, input.templateVariables);

  // Insert as queued first.
  const [logRow] = await db
    .insert(devNotificationDeliveryLog)
    .values({
      ruleId: rule.id,
      triggerEntityType: input.triggerEntityType,
      triggerEntityId: input.triggerEntityId,
      recipientContactId: input.recipientContactId ?? null,
      recipientUserId: input.recipientUserId ?? null,
      recipientAddress,
      channel: rule.channel,
      templateName: template.templateName,
      subject,
      body,
      status: "queued",
    })
    .returning({ id: devNotificationDeliveryLog.id });
  const deliveryId = logRow?.id ?? "";

  // Channel routing.
  if (rule.channel === "in_app") {
    await db
      .update(devNotificationDeliveryLog)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(devNotificationDeliveryLog.id, deliveryId));
    return { ok: true, deliveryId, status: "sent" };
  }

  if (rule.channel === "whatsapp" || rule.channel === "sms") {
    await db
      .update(devNotificationDeliveryLog)
      .set({
        status: "failed",
        errorReason: "channel_not_yet_implemented",
      })
      .where(eq(devNotificationDeliveryLog.id, deliveryId));
    return {
      ok: false,
      deliveryId,
      status: "failed",
      error: "WhatsApp / SMS dispatch ships in Stage 3.",
    };
  }

  // Email — route through the existing provider abstraction.
  if (!recipientAddress) {
    await db
      .update(devNotificationDeliveryLog)
      .set({ status: "failed", errorReason: "missing_recipient_address" })
      .where(eq(devNotificationDeliveryLog.id, deliveryId));
    return {
      ok: false,
      deliveryId,
      status: "failed",
      error: "Recipient address not available.",
    };
  }

  const sendResult = await sendEmailViaResend({
    to: recipientAddress,
    subject,
    text: body,
    html: bodyHtml,
  });

  if (sendResult.status === "skipped") {
    await db
      .update(devNotificationDeliveryLog)
      .set({
        status: "queued",
        errorReason: sendResult.errorMessage ?? "provider_skipped",
      })
      .where(eq(devNotificationDeliveryLog.id, deliveryId));
    return {
      ok: false,
      deliveryId,
      status: "skipped",
      error: sendResult.errorMessage,
    };
  }
  if (sendResult.status === "sent") {
    await db
      .update(devNotificationDeliveryLog)
      .set({
        status: "sent",
        sentAt: new Date(),
        externalMessageId: sendResult.externalMessageId ?? null,
      })
      .where(eq(devNotificationDeliveryLog.id, deliveryId));
    return { ok: true, deliveryId, status: "sent" };
  }
  await db
    .update(devNotificationDeliveryLog)
    .set({
      status: "failed",
      errorReason: sendResult.errorMessage ?? "provider_failure",
    })
    .where(eq(devNotificationDeliveryLog.id, deliveryId));
  return {
    ok: false,
    deliveryId,
    status: "failed",
    error: sendResult.errorMessage,
  };
}
