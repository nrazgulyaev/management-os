/**
 * Stage 6.P2.D.2 — Facebook Messenger webhook parsers.
 *
 * Pure helpers — no I/O. Messenger webhook envelope:
 *
 *   {
 *     object: "page",
 *     entry: [
 *       {
 *         id: "<page_id>",
 *         time: <timestamp>,
 *         messaging: [
 *           { sender: {id}, recipient: {id}, timestamp,
 *             message?: {...},
 *             postback?: {...},
 *             referral?: {...},
 *             read?: {...},
 *             delivery?: {...} }
 *         ]
 *       }
 *     ]
 *   }
 *
 * `message.quick_reply.payload` carries the user's quick-reply choice
 * when the operator's outbound included quick_replies. We project it
 * as a `reply` content type with `contentText = title` and the
 * payload in metadata.
 *
 * `read` / `delivery` come back as receipts on previously-sent
 * outbound — surfaced via `result.statuses` for the status-sync cron.
 */

import type {
  IncomingMessage,
  MessageContentType,
} from "../../types";

export interface ParsedMessengerWebhook {
  messages: IncomingMessage[];
  statuses: Array<{
    senderExternalId: string;
    /** "read" applies to all messages up to `watermark` timestamp.
     *  "delivery" same convention. The service layer flips status on
     *  every conversation_messages row whose sentAt <= watermark. */
    type: "read" | "delivery";
    watermark: Date;
    /** Specific message IDs (delivery only — read uses watermark). */
    messageIds?: string[];
  }>;
}

export function parseMessengerWebhook(
  payload: Record<string, unknown>,
): ParsedMessengerWebhook {
  const out: ParsedMessengerWebhook = { messages: [], statuses: [] };
  if (payload["object"] !== "page") return out;
  const entries = payload["entry"];
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const messagingArr = Array.isArray(e["messaging"]) ? e["messaging"] : [];
    for (const item of messagingArr) {
      if (!item || typeof item !== "object") continue;
      const m = item as Record<string, unknown>;

      // Read receipt
      const readObj = m["read"] as Record<string, unknown> | undefined;
      if (readObj) {
        const projected = projectStatus(m, "read");
        if (projected) out.statuses.push(projected);
        continue;
      }

      // Delivery receipt
      const delivery = m["delivery"] as Record<string, unknown> | undefined;
      if (delivery) {
        const projected = projectStatus(m, "delivery");
        if (projected) out.statuses.push(projected);
        continue;
      }

      // Postback (button click)
      const postback = m["postback"] as Record<string, unknown> | undefined;
      if (postback) {
        const projected = projectPostback(m);
        if (projected) out.messages.push(projected);
        continue;
      }

      // Referral (m.me link click — not a message but worth surfacing
      // in the inbox so operators see the inbound traffic source)
      const referral = m["referral"] as Record<string, unknown> | undefined;
      if (referral && !m["message"]) {
        const projected = projectReferral(m);
        if (projected) out.messages.push(projected);
        continue;
      }

      // Standard message (text + attachments + optional quick_reply)
      const message = m["message"] as Record<string, unknown> | undefined;
      if (message) {
        const projected = projectMessage(m);
        if (projected) out.messages.push(projected);
      }
    }
  }
  return out;
}

function projectMessage(m: Record<string, unknown>): IncomingMessage | null {
  const sender = m["sender"] as Record<string, unknown> | undefined;
  const ts = m["timestamp"];
  const message = m["message"] as Record<string, unknown> | undefined;
  if (!sender || typeof ts !== "number" || !message) return null;

  const senderId = pickString(sender, "id");
  const messageId = pickString(message, "mid");
  if (!senderId || !messageId) return null;

  // Quick reply selection — flatten into a `reply` content type.
  const qr = message["quick_reply"] as Record<string, unknown> | undefined;
  if (qr) {
    return {
      channel: "facebook_messenger",
      externalMessageId: messageId,
      externalThreadId: senderId,
      senderExternalId: senderId,
      contentType: "reply",
      contentText: pickString(message, "text"),
      contentMetadata: {
        kind: "quick_reply",
        payload: pickString(qr, "payload"),
      },
      receivedAt: new Date(ts),
      rawPayload: m,
    };
  }

  // Echo: outbound sent via the API echoes back through the webhook.
  // Service layer skips ingestion (it's the row we already created).
  const isEcho = message["is_echo"] === true;

  let contentType: MessageContentType = "text";
  const contentText: string | undefined = pickString(message, "text");
  let contentMediaUrl: string | undefined;
  let contentMetadata: Record<string, unknown> | undefined;

  const attachments = message["attachments"];
  if (Array.isArray(attachments) && attachments[0]) {
    const a = attachments[0] as Record<string, unknown>;
    const type = pickString(a, "type");
    const payload = a["payload"] as Record<string, unknown> | undefined;
    if (type === "image") {
      contentType = "image";
      contentMediaUrl = payload ? pickString(payload, "url") : undefined;
    } else if (type === "video") {
      contentType = "video";
      contentMediaUrl = payload ? pickString(payload, "url") : undefined;
    } else if (type === "audio") {
      contentType = "audio";
      contentMediaUrl = payload ? pickString(payload, "url") : undefined;
    } else if (type === "file") {
      contentType = "document";
      contentMediaUrl = payload ? pickString(payload, "url") : undefined;
    } else if (type === "location") {
      contentType = "location";
      contentMetadata = {
        latitude: payload?.["coordinates"],
        ...(payload ?? {}),
      };
    } else if (type === "fallback" || type === "template") {
      contentType = "system";
      contentMetadata = { kind: type, attachment: a };
    }
  }

  if (isEcho) {
    contentMetadata = { ...(contentMetadata ?? {}), echo: true };
  }

  // Reply-to context — Messenger uses message.reply_to.mid
  const replyTo = message["reply_to"] as Record<string, unknown> | undefined;
  const replyToExternalId = replyTo ? pickString(replyTo, "mid") : undefined;

  return {
    channel: "facebook_messenger",
    externalMessageId: messageId,
    externalThreadId: senderId, // 1-to-1 per PSID
    senderExternalId: senderId,
    contentType,
    contentText,
    contentMediaUrl,
    contentMetadata,
    replyToExternalId,
    receivedAt: new Date(ts),
    rawPayload: m,
  };
}

function projectPostback(m: Record<string, unknown>): IncomingMessage | null {
  const sender = m["sender"] as Record<string, unknown> | undefined;
  const ts = m["timestamp"];
  const postback = m["postback"] as Record<string, unknown> | undefined;
  if (!sender || typeof ts !== "number" || !postback) return null;
  const senderId = pickString(sender, "id");
  if (!senderId) return null;
  // Postbacks may not have an mid — synthesise from sender + timestamp.
  const mid = pickString(postback, "mid") ?? `pb:${senderId}:${ts}`;
  return {
    channel: "facebook_messenger",
    externalMessageId: mid,
    externalThreadId: senderId,
    senderExternalId: senderId,
    contentType: "reply",
    contentText: pickString(postback, "title"),
    contentMetadata: {
      kind: "postback",
      payload: pickString(postback, "payload"),
      referral: postback["referral"],
    },
    receivedAt: new Date(ts),
    rawPayload: m,
  };
}

function projectReferral(m: Record<string, unknown>): IncomingMessage | null {
  const sender = m["sender"] as Record<string, unknown> | undefined;
  const ts = m["timestamp"];
  const referral = m["referral"] as Record<string, unknown> | undefined;
  if (!sender || typeof ts !== "number" || !referral) return null;
  const senderId = pickString(sender, "id");
  if (!senderId) return null;
  return {
    channel: "facebook_messenger",
    externalMessageId: `ref:${senderId}:${ts}`,
    externalThreadId: senderId,
    senderExternalId: senderId,
    contentType: "system",
    contentMetadata: {
      kind: "referral",
      source: pickString(referral, "source"),
      type: pickString(referral, "type"),
      ref: pickString(referral, "ref"),
    },
    receivedAt: new Date(ts),
    rawPayload: m,
  };
}

function projectStatus(
  m: Record<string, unknown>,
  type: "read" | "delivery",
): ParsedMessengerWebhook["statuses"][number] | null {
  const sender = m["sender"] as Record<string, unknown> | undefined;
  const obj = m[type] as Record<string, unknown> | undefined;
  if (!sender || !obj) return null;
  const senderId = pickString(sender, "id");
  const watermarkRaw = obj["watermark"];
  if (!senderId || typeof watermarkRaw !== "number") return null;
  const messageIds =
    type === "delivery" && Array.isArray(obj["mids"])
      ? (obj["mids"] as string[])
      : undefined;
  return {
    senderExternalId: senderId,
    type,
    watermark: new Date(watermarkRaw),
    messageIds,
  };
}

function pickString(
  o: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
