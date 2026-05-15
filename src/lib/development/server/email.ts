"use server";

import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devNotificationDeliveryLog } from "@/lib/db/schema/sales";
import { env, isResendConfigured } from "@/lib/env";
import { requireOrgId } from "@/features/auth/require-org";
import { getOrganizationByCode } from "./organizations/organization-queries";

/**
 * TENANT-1 — `sendDevOsEmail` runs from BOTH authenticated server actions
 * (team/actions, invoice-actions, investor-access-actions) AND from
 * non-authenticated cron contexts (cron/notification-dispatch-job).
 *
 * Cron callers have no auth session, so `requireOrgId()` throws. To
 * keep one dispatch surface working in both contexts the helper below
 * resolves the organization in this priority order:
 *
 *   1. `metadata.organizationId` if explicitly passed by the caller
 *      (cron callers should adopt this);
 *   2. `requireOrgId()` if an auth session is present;
 *   3. fallback to `ARCONIQUE_DEFAULT` organization (legacy single-tenant
 *      behaviour — same fallback used by the original HF-5 helpers).
 *
 * TODO(cron): wire `cron/notification-dispatch-job.ts` to derive the
 * org from `dev_notification_rules.organizationId` (rule rows already
 * have the column) and pass it through `metadata.organizationId`,
 * after which the ARCONIQUE_DEFAULT fallback can be removed.
 */
async function resolveEmailOrgId(
  metadataOrgId: string | undefined,
): Promise<string> {
  if (metadataOrgId) return metadataOrgId;
  try {
    return await requireOrgId();
  } catch {
    const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
    if (!org) {
      throw new Error(
        "TENANT-1: cannot resolve organization for email (no session, no metadata.organizationId, no ARCONIQUE_DEFAULT)",
      );
    }
    return org.id;
  }
}

/**
 * Stage 2.2.B Cp2 — shared Dev OS email helper.
 *
 * Single dispatch path for every external email Dev OS sends (invoices,
 * notification rules, ad-hoc reviewer-sent drafts). Always writes a
 * `dev_notification_delivery_log` row first as `queued`, then transitions
 * to `sent` / `failed` / `queued` (dry-run) based on the provider response.
 *
 * Dry-run behavior:
 *   - When `EMAIL_DRY_RUN=1` (or missing), or when Resend env is not set,
 *     the helper does NOT call the provider. The delivery log entry stays
 *     at `queued` with `error_reason='dry_run'` so the activity is visible
 *     to operators while no email leaves the system.
 *
 * Failure resilience:
 *   - Provider errors are caught; the delivery row is updated to
 *     `failed` with a short reason. The function never throws.
 */

export interface DevOsEmailMessage {
  to: string;
  toName?: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  fromName?: string;
  replyTo?: string;
  attachments?: Array<{
    /** Display filename in the email client. */
    filename: string;
    /** Base64-encoded content. */
    content: string;
    contentType?: string;
  }>;
  /** Audit metadata — kept on the delivery log row. */
  metadata?: {
    triggerEntityType: string;
    triggerEntityId: string;
    ruleId?: string | null;
    templateName?: string;
    recipientContactId?: string;
    recipientUserId?: string;
    /**
     * TENANT-1: optional explicit org id. Cron and webhook callers
     * should populate this; user-action callers can omit and let
     * `requireOrgId()` resolve from the session.
     */
    organizationId?: string;
  };
}

export type DevOsEmailResult =
  | { status: "sent"; deliveryId: string; externalMessageId?: string }
  | { status: "dry_run"; deliveryId: string }
  | { status: "failed"; deliveryId: string; errorReason: string };

interface ResendResponse {
  id?: string;
  message?: string;
}

/**
 * `EMAIL_DRY_RUN` is read on every call (not memoized) so tests can flip
 * it via `process.env` between runs without restarting the worker.
 */
function isEmailDryRun(): boolean {
  const flag = process.env.EMAIL_DRY_RUN;
  if (flag === undefined) return true;
  return flag === "1" || flag.toLowerCase() === "true";
}

/**
 * Test seam — lets unit tests inject a fake provider that captures sent
 * messages instead of hitting the network.
 */
type ProviderFn = (msg: DevOsEmailMessage) => Promise<
  | { ok: true; externalMessageId?: string }
  | { ok: false; errorReason: string }
>;

let providerOverride: ProviderFn | null = null;

export async function _setEmailProviderForTest(
  provider: ProviderFn | null,
): Promise<void> {
  providerOverride = provider;
}

async function callResend(
  msg: DevOsEmailMessage,
): Promise<
  | { ok: true; externalMessageId?: string }
  | { ok: false; errorReason: string }
> {
  if (providerOverride) return providerOverride(msg);

  const fromName = msg.fromName ?? "Arconique";
  const fromAddress = env.server.RESEND_FROM_EMAIL!;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.server.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: [msg.to],
        subject: msg.subject,
        text: msg.bodyText,
        html: msg.bodyHtml,
        reply_to: msg.replyTo,
        attachments: msg.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          content_type: a.contentType,
        })),
      }),
    });

    if (!res.ok) {
      let reason = `resend_http_${res.status}`;
      try {
        const body = (await res.json()) as ResendResponse;
        if (body.message) reason = body.message;
      } catch {
        // ignore
      }
      return { ok: false, errorReason: reason };
    }
    const body = (await res.json()) as ResendResponse;
    return { ok: true, externalMessageId: body.id };
  } catch (err) {
    return {
      ok: false,
      errorReason: err instanceof Error ? err.message : "resend_unknown_error",
    };
  }
}

/**
 * Send (or dry-run) a Dev OS email. Always logs to
 * `dev_notification_delivery_log`. Never throws.
 */
export async function sendDevOsEmail(
  message: DevOsEmailMessage,
): Promise<DevOsEmailResult> {
  const db = getDb();
  if (!db) {
    // Without a DB we can't log; surface a stable failure shape.
    return {
      status: "failed",
      deliveryId: "",
      errorReason: "database_not_configured",
    };
  }

  const triggerEntityType = message.metadata?.triggerEntityType ?? "ad_hoc";
  const triggerEntityId = message.metadata?.triggerEntityId ?? "00000000-0000-0000-0000-000000000000";
  const organizationId = await resolveEmailOrgId(
    message.metadata?.organizationId,
  );

  const [logRow] = await db
    .insert(devNotificationDeliveryLog)
    .values({
      organizationId,
      ruleId: message.metadata?.ruleId ?? null,
      triggerEntityType,
      triggerEntityId,
      recipientContactId: message.metadata?.recipientContactId ?? null,
      recipientUserId: message.metadata?.recipientUserId ?? null,
      recipientAddress: message.to,
      channel: "email",
      templateName: message.metadata?.templateName ?? "ad_hoc",
      subject: message.subject,
      body: message.bodyText,
      status: "queued",
    })
    .returning({ id: devNotificationDeliveryLog.id });
  const deliveryId = logRow?.id ?? "";

  // Dry-run path: log only, no external call.
  if (isEmailDryRun() || !isResendConfigured()) {
    await db
      .update(devNotificationDeliveryLog)
      .set({
        status: "queued",
        errorReason: isEmailDryRun() ? "dry_run" : "resend_not_configured",
      })
      .where(
        and(
          eq(devNotificationDeliveryLog.id, deliveryId),
          eq(devNotificationDeliveryLog.organizationId, organizationId),
        ),
      );
    return { status: "dry_run", deliveryId };
  }

  const sent = await callResend(message);
  if (sent.ok) {
    await db
      .update(devNotificationDeliveryLog)
      .set({
        status: "sent",
        sentAt: new Date(),
        externalMessageId: sent.externalMessageId ?? null,
      })
      .where(
        and(
          eq(devNotificationDeliveryLog.id, deliveryId),
          eq(devNotificationDeliveryLog.organizationId, organizationId),
        ),
      );
    return {
      status: "sent",
      deliveryId,
      externalMessageId: sent.externalMessageId,
    };
  }

  await db
    .update(devNotificationDeliveryLog)
    .set({ status: "failed", errorReason: sent.errorReason })
    .where(
      and(
        eq(devNotificationDeliveryLog.id, deliveryId),
        eq(devNotificationDeliveryLog.organizationId, organizationId),
      ),
    );
  return { status: "failed", deliveryId, errorReason: sent.errorReason };
}
