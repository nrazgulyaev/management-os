"use server";

/**
 * Stage 7.F.C.2 — WhatsApp credential form actions.
 *
 * Pragmatic compromise: the runtime WhatsApp provider remains env-based
 * (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM_NUMBER)
 * to preserve backward compat with every cron + send path. The form
 * here:
 *
 *   1. Persists per-org Twilio credentials to `oauth_connections` rows
 *      with `provider='twilio_whatsapp'`, ready for a future runtime
 *      swap to per-org routing (out of scope for 7.F).
 *   2. Fires a real test message via the existing env-based provider so
 *      operators can verify their setup before rollout.
 *
 * The settings page surfaces the env-vs-DB story prominently so
 * operators don't expect their saved creds to take effect immediately.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { oauthConnections } from "@/lib/db/schema/bulk-import";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import {
  encryptCredentials,
  type EncryptedCredentialsBlob,
} from "@/lib/channel-manager/credentials-crypto";
import { stayLinkKmsSecret } from "@/lib/env";
import { getWhatsAppProvider } from "@/lib/whatsapp/providers";

const credentialsSchema = z.object({
  organizationId: z.string().uuid(),
  twilioAccountSid: z.string().regex(/^AC[a-f0-9]{32}$/, "Twilio Account SID format: AC + 32 hex chars"),
  twilioAuthToken: z.string().min(20),
  whatsappFromNumber: z.string().regex(/^whatsapp:\+\d{8,16}$/, "Format: whatsapp:+<digits>"),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type WhatsappCredentialsInput = z.infer<typeof credentialsSchema>;

/**
 * Persist Twilio credentials to oauth_connections (per-org). Idempotent
 * upsert on (org, provider='twilio_whatsapp').
 */
export async function saveWhatsappCredentialsAction(
  input: WhatsappCredentialsInput,
): Promise<{ ok: true; connectionId: string } | { ok: false; error: string }> {
  await requirePermission("whatsapp.admin");
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid form input",
    };
  }
  const secret = stayLinkKmsSecret();
  if (!secret) {
    return {
      ok: false,
      error: "STAY_LINK_KMS_SECRET is not configured.",
    };
  }
  const db = requireDb();
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  // Encrypt the auth token + from-number bundle as a single blob.
  const credentialBundle = JSON.stringify({
    twilioAccountSid: parsed.data.twilioAccountSid,
    twilioAuthToken: parsed.data.twilioAuthToken,
    whatsappFromNumber: parsed.data.whatsappFromNumber,
  });
  const encrypted: EncryptedCredentialsBlob = encryptCredentials(
    credentialBundle,
    secret,
  );

  // Upsert via SELECT-then-INSERT/UPDATE (no ON CONFLICT key for our shape).
  const [existing] = await db
    .select({ id: oauthConnections.id })
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.organizationId, parsed.data.organizationId),
        eq(oauthConnections.userId, me.id),
        eq(oauthConnections.provider, "twilio_whatsapp"),
      ),
    )
    .limit(1);

  let connectionId: string;
  if (existing) {
    await db
      .update(oauthConnections)
      .set({
        accessToken: JSON.stringify(encrypted),
        refreshToken: null,
        scopes: ["whatsapp:send", "whatsapp:read"],
        accountName: parsed.data.whatsappFromNumber,
        accountEmail: null,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(oauthConnections.id, existing.id));
    connectionId = existing.id;
  } else {
    const [row] = await db
      .insert(oauthConnections)
      .values({
        organizationId: parsed.data.organizationId,
        userId: me.id,
        provider: "twilio_whatsapp",
        accountEmail: null,
        accountName: parsed.data.whatsappFromNumber,
        accessToken: JSON.stringify(encrypted),
        refreshToken: null,
        scopes: ["whatsapp:send", "whatsapp:read"],
        isActive: true,
      })
      .returning({ id: oauthConnections.id });
    connectionId = row.id;
  }

  await recordAuditEvent({
    actorUserId: me.id,
    action: "whatsapp.credentials.save",
    entityType: "oauth_connection",
    entityId: connectionId,
    after: {
      provider: "twilio_whatsapp",
      whatsappFromNumber: parsed.data.whatsappFromNumber,
      // Auth token is encrypted; never log plaintext.
    },
  });

  revalidatePath("/development-os/settings/whatsapp");
  return { ok: true, connectionId };
}

const testMessageSchema = z.object({
  toPhoneNumber: z
    .string()
    .regex(/^whatsapp:\+\d{8,16}$/, "Format: whatsapp:+<digits>"),
  message: z.string().min(1).max(1000).default("Hello from Arconique OS — test message."),
});

export async function sendWhatsappTestMessageAction(
  input: z.input<typeof testMessageSchema>,
): Promise<
  | { ok: true; messageSid: string | null; provider: string }
  | { ok: false; error: string }
> {
  await requirePermission("whatsapp.admin");
  const parsed = testMessageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const provider = getWhatsAppProvider();
  // Read fromPhone from env (the runtime is still env-based; per-org
  // routing is the future swap).
  const fromPhone = process.env.TWILIO_WHATSAPP_FROM_NUMBER ?? "";
  if (!fromPhone) {
    return {
      ok: false,
      error: "TWILIO_WHATSAPP_FROM_NUMBER not configured.",
    };
  }
  try {
    const result = await provider.sendMessage({
      fromPhone,
      toPhone: parsed.data.toPhoneNumber,
      body: parsed.data.message,
    });
    return {
      ok: true,
      messageSid: result.externalMessageSid ?? null,
      provider: provider.name,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
