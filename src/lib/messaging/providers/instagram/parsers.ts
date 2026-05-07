/**
 * Stage 6.P2.D.1 — Instagram webhook parsers.
 *
 * Pure helpers — no I/O. Instagram webhook envelope:
 *
 *   {
 *     object: "instagram",
 *     entry: [
 *       {
 *         id: "<ig_business_account_id>",
 *         time: <timestamp>,
 *         messaging?: [...],     // DMs + reactions + story mentions
 *         changes?: [...]        // comments + media changes
 *       }
 *     ]
 *   }
 *
 * `messaging[]` items shape:
 *   { sender: {id}, recipient: {id}, timestamp, message?: {...},
 *     reaction?: {...}, postback?: {...}, story_mention?: {...} }
 *
 * `changes[]` items shape:
 *   { field: "comments", value: { id, text, from: {id, username},
 *     media: { id, media_product_type } } }
 *
 * Output shape: split arrays for messages vs reactions so the service
 * layer can route both — reactions on previously-sent outbound aren't
 * new messages, they're per-message engagement signals.
 */

import type {
  IncomingMessage,
  MessageContentType,
} from "../../types";

export interface ParsedInstagramWebhook {
  messages: IncomingMessage[];
  reactions: Array<{
    targetExternalMessageId: string;
    senderExternalId: string;
    action: "react" | "unreact";
    emoji?: string;
    timestamp: Date;
  }>;
}

export function parseInstagramWebhook(
  payload: Record<string, unknown>,
): ParsedInstagramWebhook {
  const out: ParsedInstagramWebhook = { messages: [], reactions: [] };
  if (payload["object"] !== "instagram") return out;
  const entries = payload["entry"];
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    // Direct messaging stream
    const messagingArr = Array.isArray(e["messaging"]) ? e["messaging"] : [];
    for (const item of messagingArr) {
      if (!item || typeof item !== "object") continue;
      const m = item as Record<string, unknown>;
      const reaction = m["reaction"];
      if (reaction && typeof reaction === "object") {
        const projectedReaction = projectReaction(m);
        if (projectedReaction) out.reactions.push(projectedReaction);
        continue;
      }
      const projected = projectMessagingItem(m);
      if (projected) out.messages.push(projected);
    }

    // Comments / media stream
    const changesArr = Array.isArray(e["changes"]) ? e["changes"] : [];
    for (const change of changesArr) {
      if (!change || typeof change !== "object") continue;
      const c = change as Record<string, unknown>;
      if (c["field"] === "comments") {
        const value = c["value"] as Record<string, unknown> | undefined;
        if (value) {
          const projected = projectComment(value);
          if (projected) out.messages.push(projected);
        }
      }
    }
  }
  return out;
}

function projectMessagingItem(
  m: Record<string, unknown>,
): IncomingMessage | null {
  const sender = m["sender"] as Record<string, unknown> | undefined;
  const recipient = m["recipient"] as Record<string, unknown> | undefined;
  const ts = m["timestamp"];
  if (!sender || !recipient || typeof ts !== "number") return null;

  const senderId = pickString(sender, "id");
  const recipientId = pickString(recipient, "id");
  if (!senderId || !recipientId) return null;

  // Story mention: sender mentioned the business in their story.
  // No `message.mid` is sent — we synthesise a mention: prefix.
  const message = m["message"] as Record<string, unknown> | undefined;
  if (!message) {
    // Postbacks (button clicks on Ice Breakers) come as `postback`
    // rather than `message`. Project as a reply with the payload.
    const postback = m["postback"] as Record<string, unknown> | undefined;
    if (postback) {
      const id = pickString(postback, "mid") ?? `pb:${senderId}:${ts}`;
      return {
        channel: "instagram",
        externalMessageId: id,
        externalThreadId: senderId, // 1-to-1 with the IG user
        senderExternalId: senderId,
        contentType: "reply",
        contentText: pickString(postback, "title"),
        contentMetadata: {
          payload: pickString(postback, "payload"),
          source: "postback",
        },
        receivedAt: new Date(ts),
        rawPayload: m,
      };
    }
    return null;
  }

  const messageId = pickString(message, "mid");
  if (!messageId) return null;

  // Story mention shape
  const attachments = message["attachments"];
  const isStoryMention =
    Array.isArray(attachments) &&
    attachments.some(
      (a) =>
        a &&
        typeof a === "object" &&
        (a as Record<string, unknown>)["type"] === "story_mention",
    );

  let contentType: MessageContentType = "text";
  const contentText: string | undefined = pickString(message, "text");
  let contentMediaUrl: string | undefined;
  let contentMetadata: Record<string, unknown> | undefined;
  let replyToExternalId: string | undefined;

  if (isStoryMention) {
    contentType = "system";
    contentMetadata = { kind: "story_mention", attachments };
  } else if (Array.isArray(attachments) && attachments[0]) {
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
    } else if (type === "share" || type === "story_reply") {
      contentType = "system";
      contentMetadata = { kind: type, attachment: a };
    } else if (type === "fallback") {
      contentType = "system";
      contentMetadata = { kind: "fallback", attachment: a };
    }
  }

  // IG threads with the business — replyTo lives in `reply_to.mid` when
  // the inbound is a reply to a previously-sent business message.
  const replyTo = message["reply_to"] as
    | Record<string, unknown>
    | undefined;
  if (replyTo) {
    replyToExternalId = pickString(replyTo, "mid");
  }

  // Bridge `is_echo`: outbound sent via the API echoes back through
  // the webhook for sync. Mark in metadata so the service layer can
  // skip ingestion (it's the same row we just created on send).
  if (message["is_echo"] === true) {
    contentMetadata = { ...(contentMetadata ?? {}), echo: true };
  }

  return {
    channel: "instagram",
    externalMessageId: messageId,
    externalThreadId: senderId, // IG DM threads are 1-to-1 per user
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

function projectReaction(
  m: Record<string, unknown>,
): ParsedInstagramWebhook["reactions"][number] | null {
  const sender = m["sender"] as Record<string, unknown> | undefined;
  const reaction = m["reaction"] as Record<string, unknown> | undefined;
  const ts = m["timestamp"];
  if (!sender || !reaction || typeof ts !== "number") return null;
  const senderId = pickString(sender, "id");
  const targetMid = pickString(reaction, "mid");
  const action = pickString(reaction, "action");
  if (!senderId || !targetMid) return null;
  if (action !== "react" && action !== "unreact") return null;
  return {
    targetExternalMessageId: targetMid,
    senderExternalId: senderId,
    action,
    emoji: pickString(reaction, "emoji"),
    timestamp: new Date(ts),
  };
}

function projectComment(
  value: Record<string, unknown>,
): IncomingMessage | null {
  const id = pickString(value, "id");
  const text = pickString(value, "text");
  if (!id) return null;
  const from = value["from"] as Record<string, unknown> | undefined;
  const senderId = from ? pickString(from, "id") : undefined;
  const senderName = from ? pickString(from, "username") : undefined;
  if (!senderId) return null;
  const media = value["media"] as Record<string, unknown> | undefined;
  return {
    channel: "instagram",
    externalMessageId: `comment:${id}`,
    // Comments live on a media item, not on a thread — synthesise the
    // thread ID from the media ID so all comments on the same post
    // group together.
    externalThreadId: media ? `media:${pickString(media, "id") ?? id}` : `media:${id}`,
    senderExternalId: senderId,
    senderDisplayName: senderName,
    contentType: "text",
    contentText: text,
    contentMetadata: {
      kind: "comment",
      mediaProductType: media
        ? pickString(media, "media_product_type")
        : undefined,
      mediaId: media ? pickString(media, "id") : undefined,
    },
    receivedAt: new Date(),
    rawPayload: value,
  };
}

function pickString(
  o: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
