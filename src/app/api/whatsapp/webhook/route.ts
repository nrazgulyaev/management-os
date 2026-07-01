import { NextResponse, type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  whatsappMessages,
  whatsappWebhookEvents,
} from "@/lib/db/schema/whatsapp";
import { getWhatsAppProvider} from "@/lib/whatsapp/providers";
import { resolveOrgFromReceivingNumber } from "@/lib/development/whatsapp/phone-resolver";

/**
 * WhatsApp inbound webhook endpoint.
 *
 * Critical invariants:
 *   1. Returns 200 OK quickly (< 5s) — providers retry on slow/fail.
 *   2. ALWAYS logs the webhook event before doing anything else
 *      (recoverability — if signature verification crashes we still
 *      have the raw payload for forensics).
 *   3. Signature verification is MANDATORY in production. Rejects
 *      unsigned / invalid-signature requests with 401.
 *   4. Replay protection — duplicate `external_message_sid` is
 *      tolerated by the unique partial index in `whatsapp_messages`;
 *      the webhook returns 200 OK and marks the event as
 *      `rejected_replay`.
 *   5. Heavy AI / persistence work happens in the cron-driven
 *      `inbound-processor.ts` — webhook only persists the row and
 *      returns.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const provider = getWhatsAppProvider();
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "DB unavailable" },
      { status: 503 },
    );
  }

  // 1) Read raw body + headers.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Unreadable body" },
      { status: 400 },
    );
  }
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  const sourceIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const fullUrl = request.url;

  // Try to parse JSON or fall back to form params (Twilio sends form).
  let payloadObj: Record<string, unknown> = {};
  try {
    payloadObj = JSON.parse(rawBody);
  } catch {
    const form = new URLSearchParams(rawBody);
    for (const [k, v] of form) payloadObj[k] = v;
  }

  // 2) Log the event immediately (raw payload preserved).
  const [eventRow] = await db
    .insert(whatsappWebhookEvents)
    .values({
      provider: provider.name,
      eventType: detectEventType(payloadObj),
      signatureProvided: headers["x-twilio-signature"] ?? null,
      signatureVerified: false,
      sourceIp: sourceIp ?? undefined,
      rawPayload: payloadObj as typeof whatsappWebhookEvents.$inferInsert["rawPayload"],
      processingStatus: "pending",
    })
    .returning({ id: whatsappWebhookEvents.id });
  const eventId = eventRow.id;

  // 3) Verify signature (mandatory).
  let isValid = false;
  try {
    isValid = await provider.verifyWebhookSignature({
      headers,
      rawBody,
      fullUrl,
    });
  } catch {
    isValid = false;
  }
  if (!isValid) {
    await db
      .update(whatsappWebhookEvents)
      .set({
        signatureVerified: false,
        processingStatus: "rejected_invalid_signature",
        processedAt: new Date(),
      })
      .where(eq(whatsappWebhookEvents.id, eventId));
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 },
    );
  }

  // 4) Parse the inbound message via the provider's wire-format aware parser.
  const parsed = provider.parseInboundMessage(payloadObj);
  if (!parsed) {
    // Could be a status callback (delivered/read) for an outbound
    // message. Stage 3.D doesn't fully wire status updates — log and
    // ack 200.
    await db
      .update(whatsappWebhookEvents)
      .set({
        signatureVerified: true,
        processingStatus: "processed",
        processedAt: new Date(),
        processingError: "Not an inbound message (status callback?)",
      })
      .where(eq(whatsappWebhookEvents.id, eventId));
    return NextResponse.json({ ok: true });
  }

  // MULTI-TENANT ROUTING — attribute the inbound to the org that OWNS the
  // WhatsApp number it was sent TO (parsed.toPhone → an arconique_inbound/
  // outbound registry row carrying the tenant's org). Stamped at insert so the
  // message is immediately visible to the right tenant (getWhatsappMessages
  // strict-filters org); best-effort — an unregistered number leaves it null
  // and the cron processor re-attempts + the legacy single-tenant fallback
  // applies. Never throws.
  const organizationId = await resolveOrgFromReceivingNumber(parsed.toPhone);

  // 5) Replay protection — try to insert; if external_sid already
  // exists for the same provider, the unique partial index rejects.
  let messageId: string | null = null;
  let isReplay = false;
  try {
    const [inserted] = await db
      .insert(whatsappMessages)
      .values({
        provider: provider.name,
        externalMessageSid: parsed.externalMessageSid,
        direction: "inbound",
        organizationId: organizationId ?? undefined,
        fromPhone: parsed.fromPhone,
        toPhone: parsed.toPhone,
        messageType: parsed.messageType,
        body: parsed.body ?? null,
        mediaUrls: parsed.mediaUrls ?? null,
        status: "received",
        webhookReceivedAt: new Date(),
        webhookSignatureVerified: true,
        webhookRawPayload:
          payloadObj as typeof whatsappMessages.$inferInsert["webhookRawPayload"],
        occurredAt: parsed.receivedAt,
      })
      .returning({ id: whatsappMessages.id });
    messageId = inserted.id;
  } catch (err) {
    // Unique-violation = replay.
    if (
      err instanceof Error &&
      /unique|duplicate/i.test(err.message)
    ) {
      isReplay = true;
    } else {
      await db
        .update(whatsappWebhookEvents)
        .set({
          signatureVerified: true,
          processingStatus: "failed",
          processingError: err instanceof Error ? err.message : "insert failed",
          processedAt: new Date(),
        })
        .where(eq(whatsappWebhookEvents.id, eventId));
      return NextResponse.json(
        { error: "Failed to persist message" },
        { status: 500 },
      );
    }
  }

  if (isReplay) {
    // Look up the existing message id for the audit link.
    const [existing] = await db
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.provider, provider.name),
          eq(
            whatsappMessages.externalMessageSid,
            parsed.externalMessageSid,
          ),
        ),
      )
      .limit(1);
    await db
      .update(whatsappWebhookEvents)
      .set({
        signatureVerified: true,
        processingStatus: "rejected_replay",
        processedAt: new Date(),
        relatedMessageId: existing?.id ?? null,
      })
      .where(eq(whatsappWebhookEvents.id, eventId));
    // Twilio expects 200 OK even on dedup — otherwise it retries.
    return NextResponse.json({ ok: true, replay: true });
  }

  // 6) Mark webhook event processed and link to the new message.
  await db
    .update(whatsappWebhookEvents)
    .set({
      signatureVerified: true,
      processingStatus: "processed",
      processedAt: new Date(),
      relatedMessageId: messageId,
    })
    .where(eq(whatsappWebhookEvents.id, eventId));

  // 7) Heavy work happens in the cron — return immediately.
  return NextResponse.json({ ok: true, messageId });
}

function detectEventType(payload: Record<string, unknown>): string {
  if (payload.MessageSid) return "message_received";
  if (payload.MessageStatus) return "message_status";
  return "unknown";
}

// Twilio sometimes uses GET for webhook verification — accept and 200.
export async function GET() {
  return NextResponse.json({ ok: true });
}
