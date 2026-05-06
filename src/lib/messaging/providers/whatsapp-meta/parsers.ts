/**
 * Stage 6.P2.B — WhatsApp Meta Cloud webhook parsers.
 *
 * Pure helpers — no I/O. Meta's webhook payload nests deeply:
 *
 *   {
 *     object: "whatsapp_business_account",
 *     entry: [{
 *       id: "<biz_account_id>",
 *       changes: [{
 *         field: "messages",
 *         value: {
 *           messaging_product: "whatsapp",
 *           metadata: { display_phone_number, phone_number_id },
 *           contacts: [{ profile: { name }, wa_id: "<phone>" }],
 *           messages: [
 *             { from, id, timestamp, type: "text", text: { body }, ... },
 *             { from, id, timestamp, type: "image", image: { ... }, ... }
 *           ],
 *           statuses: [
 *             { id, status: "sent" | "delivered" | "read" | "failed",
 *               timestamp, recipient_id }
 *           ]
 *         }
 *       }]
 *     }]
 *   }
 *
 * The walker descends through entry/changes/value and collects every
 * `messages[]` item across nested entries. `statuses[]` are surfaced
 * as a separate array because they're not new messages — they're
 * receipts on previously-sent outbound.
 */

import type {
  IncomingMessage,
  MessageContentType,
} from "../../types";

export interface ParsedWebhookResult {
  messages: IncomingMessage[];
  /** Per-message receipts (sent → delivered → read) for outbound. */
  statuses: Array<{
    externalMessageId: string;
    status: "sent" | "delivered" | "read" | "failed";
    timestamp: Date;
    errorTitle?: string;
    errorMessage?: string;
  }>;
}

export function parseMetaWebhook(
  payload: Record<string, unknown>,
): ParsedWebhookResult {
  const out: ParsedWebhookResult = { messages: [], statuses: [] };
  if (payload["object"] !== "whatsapp_business_account") return out;
  const entries = payload["entry"];
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = (entry as Record<string, unknown>)["changes"];
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      if ((change as Record<string, unknown>)["field"] !== "messages") continue;
      const value = (change as Record<string, unknown>)["value"] as
        | Record<string, unknown>
        | undefined;
      if (!value) continue;

      const contactsArr = Array.isArray(value["contacts"]) ? value["contacts"] : [];
      const contactsByWaId = new Map<string, { name?: string }>();
      for (const c of contactsArr) {
        if (c && typeof c === "object") {
          const co = c as Record<string, unknown>;
          const waId = pickString(co, "wa_id");
          const profile = co["profile"] as Record<string, unknown> | undefined;
          if (waId) {
            contactsByWaId.set(waId, {
              name: profile ? pickString(profile, "name") : undefined,
            });
          }
        }
      }

      const messagesArr = Array.isArray(value["messages"]) ? value["messages"] : [];
      for (const m of messagesArr) {
        if (m && typeof m === "object") {
          const projected = projectMessage(
            m as Record<string, unknown>,
            contactsByWaId,
          );
          if (projected) out.messages.push(projected);
        }
      }

      const statusesArr = Array.isArray(value["statuses"]) ? value["statuses"] : [];
      for (const s of statusesArr) {
        if (s && typeof s === "object") {
          const projected = projectStatus(s as Record<string, unknown>);
          if (projected) out.statuses.push(projected);
        }
      }
    }
  }
  return out;
}

function projectMessage(
  m: Record<string, unknown>,
  contacts: Map<string, { name?: string }>,
): IncomingMessage | null {
  const id = pickString(m, "id");
  const from = pickString(m, "from");
  if (!id || !from) return null;
  const type = pickString(m, "type") ?? "text";

  const contentType: MessageContentType = mapMetaTypeToInternal(type);
  let contentText: string | undefined;
  let contentMediaUrl: string | undefined;
  let contentMetadata: Record<string, unknown> | undefined;

  switch (type) {
    case "text": {
      const t = m["text"] as Record<string, unknown> | undefined;
      contentText = t ? pickString(t, "body") : undefined;
      break;
    }
    case "image":
    case "document":
    case "audio":
    case "video":
    case "sticker": {
      const media = m[type] as Record<string, unknown> | undefined;
      if (media) {
        // Meta returns an `id` + `mime_type` + optional `caption`. The
        // actual media URL is fetched via /v18.0/{media_id} once with
        // the access token. We stash the media id in metadata; the
        // service layer fetches when needed.
        contentMetadata = {
          mediaId: pickString(media, "id"),
          mimeType: pickString(media, "mime_type"),
          sha256: pickString(media, "sha256"),
        };
        contentText = pickString(media, "caption");
      }
      break;
    }
    case "location": {
      const loc = m["location"] as Record<string, unknown> | undefined;
      if (loc) {
        contentMetadata = {
          latitude: loc["latitude"],
          longitude: loc["longitude"],
          name: pickString(loc, "name"),
          address: pickString(loc, "address"),
        };
      }
      break;
    }
    case "contacts": {
      contentMetadata = { contacts: m["contacts"] };
      break;
    }
    case "reaction": {
      const r = m["reaction"] as Record<string, unknown> | undefined;
      contentMetadata = {
        emoji: r ? pickString(r, "emoji") : undefined,
        reactedTo: r ? pickString(r, "message_id") : undefined,
      };
      break;
    }
    case "button":
    case "interactive": {
      // Quick reply / button click — capture the user's selection.
      contentMetadata = { interactive: m[type] };
      const interactive = m[type] as Record<string, unknown> | undefined;
      if (interactive) {
        const button = interactive["button_reply"] as
          | Record<string, unknown>
          | undefined;
        if (button) contentText = pickString(button, "title");
      }
      break;
    }
  }

  // Reply context — Meta nests this under `context.id`.
  const ctx = m["context"] as Record<string, unknown> | undefined;
  const replyToExternalId = ctx ? pickString(ctx, "id") : undefined;

  // Timestamp — Meta sends Unix seconds as a string.
  const tsRaw = pickString(m, "timestamp");
  const tsEpoch = tsRaw ? Number(tsRaw) : NaN;
  const receivedAt = isFinite(tsEpoch) ? new Date(tsEpoch * 1000) : new Date();

  const senderProfile = contacts.get(from);

  return {
    channel: "whatsapp",
    externalMessageId: id,
    externalThreadId: from, // WhatsApp threads are 1-1 per phone number
    senderExternalId: from,
    senderDisplayName: senderProfile?.name,
    contentType,
    contentText,
    contentMediaUrl,
    contentMetadata,
    replyToExternalId,
    receivedAt,
    rawPayload: m,
  };
}

function projectStatus(s: Record<string, unknown>): {
  externalMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  errorTitle?: string;
  errorMessage?: string;
} | null {
  const id = pickString(s, "id");
  const statusRaw = pickString(s, "status");
  if (!id || !statusRaw) return null;
  const status =
    statusRaw === "sent" ||
    statusRaw === "delivered" ||
    statusRaw === "read" ||
    statusRaw === "failed"
      ? statusRaw
      : null;
  if (!status) return null;
  const tsRaw = pickString(s, "timestamp");
  const tsEpoch = tsRaw ? Number(tsRaw) : NaN;
  const timestamp = isFinite(tsEpoch) ? new Date(tsEpoch * 1000) : new Date();
  let errorTitle: string | undefined;
  let errorMessage: string | undefined;
  if (status === "failed") {
    const errors = s["errors"];
    if (Array.isArray(errors) && errors[0] && typeof errors[0] === "object") {
      const e = errors[0] as Record<string, unknown>;
      errorTitle = pickString(e, "title");
      errorMessage = pickString(e, "message");
    }
  }
  return { externalMessageId: id, status, timestamp, errorTitle, errorMessage };
}

function mapMetaTypeToInternal(metaType: string): MessageContentType {
  switch (metaType) {
    case "text":
      return "text";
    case "image":
      return "image";
    case "document":
      return "document";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "location":
      return "location";
    case "contacts":
      return "contact";
    case "sticker":
      return "sticker";
    case "reaction":
      return "reaction";
    case "button":
    case "interactive":
      return "reply";
    case "system":
      return "system";
    default:
      return "text";
  }
}

function pickString(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
