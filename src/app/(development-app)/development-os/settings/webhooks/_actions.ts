"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgId } from "@/features/auth/require-org";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  getWebhookSubscriptionById,
  listDeliveryLogForSubscription,
} from "@/lib/development/server/webhooks/webhook-queries";
import {
  testFireWebhook,
  rotateSigningSecret,
  unsubscribeWebhook,
} from "@/lib/development/server/webhooks/webhook-actions";

/**
 * Org-scoped co-located adapters for the webhooks admin surface.
 *
 * SECURITY: the underlying webhook actions/queries key off a raw
 * subscriptionId and do NOT verify org ownership — mounting the UI
 * directly onto them would let an admin in org A test-fire / rotate /
 * unsubscribe / read deliveries for another org's subscription. Each
 * adapter first loads the subscription and asserts it belongs to the
 * caller's org, THEN delegates. The client never supplies an org id.
 */

const PATH = "/development-os/settings/webhooks";

const idSchema = z.object({ subscriptionId: z.string().uuid() });

async function assertOwned(subscriptionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const sub = await getWebhookSubscriptionById(subscriptionId);
  if (!sub || sub.organizationId !== organizationId) {
    return { ok: false, error: "Subscription not found in this organization" };
  }
  return { ok: true };
}

export async function testFireWebhookScoped(
  input: z.input<typeof idSchema>,
): Promise<{ ok: true; status?: number | string } | { ok: false; error: string }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const owned = await assertOwned(parsed.data.subscriptionId);
  if (!owned.ok) return owned;
  const result = await testFireWebhook({
    subscriptionId: parsed.data.subscriptionId,
  });
  if (!result.ok) return { ok: false, error: result.error ?? "Test fire failed" };
  revalidatePath(PATH);
  const r = result.result as
    | { status?: string; httpStatusCode?: number | null }
    | undefined;
  const status = r?.httpStatusCode ?? r?.status ?? undefined;
  return { ok: true, status };
}

export async function rotateSigningSecretScoped(
  input: z.input<typeof idSchema>,
): Promise<{ ok: true; signingSecret: string } | { ok: false; error: string }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const owned = await assertOwned(parsed.data.subscriptionId);
  if (!owned.ok) return owned;
  const result = await rotateSigningSecret({
    subscriptionId: parsed.data.subscriptionId,
  });
  if (!result.ok) return { ok: false, error: result.error ?? "Rotate failed" };
  revalidatePath(PATH);
  return { ok: true, signingSecret: result.signingSecret };
}

export async function unsubscribeWebhookScoped(
  input: z.input<typeof idSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const owned = await assertOwned(parsed.data.subscriptionId);
  if (!owned.ok) return owned;
  const result = await unsubscribeWebhook({
    subscriptionId: parsed.data.subscriptionId,
    reason: "Unsubscribed from settings",
  });
  if (!result.ok) return { ok: false, error: result.error ?? "Unsubscribe failed" };
  revalidatePath(PATH);
  return { ok: true };
}

export interface DeliveryLogRow {
  id: string;
  eventType: string;
  status: string;
  httpStatusCode: number | null;
  attemptNumber: number | null;
  scheduledAt: string | null;
  deliveredAt: string | null;
  errorMessage: string | null;
}

export async function loadDeliveryLogScoped(
  input: z.input<typeof idSchema>,
): Promise<{ ok: true; rows: DeliveryLogRow[] } | { ok: false; error: string }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const owned = await assertOwned(parsed.data.subscriptionId);
  if (!owned.ok) return owned;
  const log = await listDeliveryLogForSubscription(parsed.data.subscriptionId, 50);
  const rows: DeliveryLogRow[] = log.map((d) => ({
    id: d.id,
    eventType: d.eventType,
    status: d.status,
    httpStatusCode: d.httpStatusCode ?? null,
    attemptNumber: d.attemptNumber ?? null,
    scheduledAt: d.scheduledAt ? new Date(d.scheduledAt).toISOString() : null,
    deliveredAt: d.deliveredAt ? new Date(d.deliveredAt).toISOString() : null,
    errorMessage: d.errorMessage ?? null,
  }));
  return { ok: true, rows };
}
