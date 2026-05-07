/**
 * Stage 6.P2.E — Pure email helpers.
 *
 * No I/O, no Drizzle, no `server-only`. Three categories:
 *   1. RFC 822 builder — assembles the raw text Gmail's send endpoint
 *      expects (base64url-encoded by the caller).
 *   2. Gmail JSON parsers — Gmail returns messages as
 *      `{id, threadId, payload: {headers, body, parts}}`; the
 *      `decodeGmailMessage` helper projects this into IncomingMessage.
 *   3. Threading helpers — extract Message-ID + In-Reply-To + References
 *      from header lists so the service layer can reconstruct conversations.
 */

import type {
  IncomingMessage,
  MessageContentType,
} from "../../types";

// ---------------------------------------------------------------------------
// RFC 822 builder — outbound
// ---------------------------------------------------------------------------

export interface BuildRfc822Input {
  from: string;
  to: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  /** Sets In-Reply-To + References for threading. */
  inReplyTo?: string;
  /** Optional references chain (older replies in the thread). */
  references?: string[];
  /** Optional CC / BCC. */
  cc?: string;
  bcc?: string;
}

/**
 * Build a minimal RFC 822 message. Output is plain text, not yet
 * base64url-encoded — caller does that for Gmail's `raw` field.
 *
 * Multipart encoding: when both bodyHtml and bodyText are provided,
 * a `multipart/alternative` envelope is generated with both parts.
 * When only one is provided, a single-part message is emitted.
 *
 * Header values containing non-ASCII or whitespace are wrapped in
 * `=?UTF-8?B?...?=` quoted-printable per RFC 2047. We keep this
 * minimal — operators sending Subject lines with emoji should still
 * see them rendered correctly client-side.
 */
export function buildRfc822(input: BuildRfc822Input): string {
  const headers: string[] = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    `MIME-Version: 1.0`,
  ];
  if (input.cc) headers.push(`Cc: ${input.cc}`);
  if (input.bcc) headers.push(`Bcc: ${input.bcc}`);
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references && input.references.length > 0) {
    headers.push(`References: ${input.references.join(" ")}`);
  }

  if (input.bodyHtml && input.bodyText) {
    // multipart/alternative — both representations.
    const boundary = generateBoundary();
    headers.push(
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    );
    const body = [
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      input.bodyText,
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      input.bodyHtml,
      `--${boundary}--`,
      ``,
    ].join("\r\n");
    return headers.join("\r\n") + "\r\n" + body;
  }

  if (input.bodyHtml) {
    headers.push(`Content-Type: text/html; charset="UTF-8"`);
    headers.push(`Content-Transfer-Encoding: 7bit`);
    return headers.join("\r\n") + "\r\n\r\n" + input.bodyHtml;
  }

  // Default: text/plain (or empty body).
  headers.push(`Content-Type: text/plain; charset="UTF-8"`);
  headers.push(`Content-Transfer-Encoding: 7bit`);
  return headers.join("\r\n") + "\r\n\r\n" + (input.bodyText ?? "");
}

/**
 * Base64url encode. Gmail's `messages.send` endpoint requires `raw`
 * to be base64url (the URL-safe variant — `-` and `_` instead of
 * `+` and `/`, no padding).
 */
export function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Decode a base64url string back to UTF-8. Gmail's responses use this
 * encoding for body parts.
 */
export function fromBase64Url(s: string): string {
  const pad = s.length % 4;
  const padded = s + "=".repeat(pad === 0 ? 0 : 4 - pad);
  return Buffer.from(
    padded.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

// RFC 2047 encoding — minimal for headers with non-ASCII.
function encodeHeader(value: string): string {
  // Heuristic: only encode when non-ASCII bytes present.
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

function generateBoundary(): string {
  // Simple 16-byte random hex — collision-safe for any practical
  // multipart message size.
  const bytes = new Uint8Array(8);
  // crypto.getRandomValues is universal across Node + Edge.
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback for ancient environments.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return (
    "----arconique-" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

// ---------------------------------------------------------------------------
// Gmail JSON parsers — inbound
// ---------------------------------------------------------------------------

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    size?: number;
    data?: string; // base64url
    attachmentId?: string;
  };
  parts?: GmailPart[];
}

export interface GmailMessageResponse {
  id: string;
  threadId: string;
  /** Gmail's labels — INBOX, UNREAD, SENT, etc. */
  labelIds?: string[];
  internalDate?: string; // Unix ms as string
  payload?: GmailPart;
  snippet?: string;
}

/**
 * Pull a header value by case-insensitive name from a header array.
 * Gmail's payload.headers is an array of `{name, value}` so we can't
 * just index by key.
 */
export function getHeader(
  headers: GmailHeader[] | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h.name.toLowerCase() === lower) return h.value;
  }
  return undefined;
}

/**
 * Walk the parts tree to find the first text/html and text/plain bodies.
 * Gmail nests multipart messages — a multipart/alternative typically
 * has [text/plain, text/html] direct children, but multipart/mixed
 * with attachments wraps that further.
 */
export function extractBodyParts(payload: GmailPart | undefined): {
  text?: string;
  html?: string;
  attachments: Array<{
    filename?: string;
    mimeType?: string;
    attachmentId?: string;
    size?: number;
  }>;
} {
  const result: {
    text?: string;
    html?: string;
    attachments: Array<{
      filename?: string;
      mimeType?: string;
      attachmentId?: string;
      size?: number;
    }>;
  } = { attachments: [] };
  if (!payload) return result;
  walk(payload, result);
  return result;
}

function walk(
  part: GmailPart,
  out: ReturnType<typeof extractBodyParts>,
): void {
  const mimeType = (part.mimeType ?? "").toLowerCase();
  const data = part.body?.data;

  // Attachment: has filename + attachmentId.
  if (part.filename && part.body?.attachmentId) {
    out.attachments.push({
      filename: part.filename,
      mimeType: part.mimeType,
      attachmentId: part.body.attachmentId,
      size: part.body.size,
    });
    return;
  }

  if (mimeType === "text/plain" && data && !out.text) {
    out.text = fromBase64Url(data);
  } else if (mimeType === "text/html" && data && !out.html) {
    out.html = fromBase64Url(data);
  }

  if (Array.isArray(part.parts)) {
    for (const child of part.parts) walk(child, out);
  }
}

/**
 * Project a Gmail messages.get response into the unified
 * `IncomingMessage` shape. Returns null when the load-bearing fields
 * (id, threadId, From header) are missing — caller filters those out.
 */
export function projectGmailMessage(
  resp: GmailMessageResponse,
  ownerEmailAddress: string,
): IncomingMessage | null {
  if (!resp.id || !resp.threadId) return null;
  const headers = resp.payload?.headers;
  const fromRaw = getHeader(headers, "From");
  const subject = getHeader(headers, "Subject");
  const messageId = getHeader(headers, "Message-ID") ?? getHeader(headers, "Message-Id");
  const inReplyTo = getHeader(headers, "In-Reply-To");
  const dateHeader = getHeader(headers, "Date");

  if (!fromRaw) return null;

  const { displayName, address } = parseAddress(fromRaw);

  // Skip our own outbound messages — Gmail returns them too with the
  // `SENT` label. The service layer can filter on labelIds; we project
  // them anyway and surface direction via metadata so the caller can
  // decide.
  const isOutbound =
    !!ownerEmailAddress &&
    address.toLowerCase() === ownerEmailAddress.toLowerCase();

  const body = extractBodyParts(resp.payload);

  // Content type: plain text wins over html for the main `contentText`
  // field (operators read in dashboards; HTML renders separately).
  // Falls back to snippet when neither part is present.
  let contentType: MessageContentType = "text";
  let contentText = body.text ?? body.html ?? resp.snippet ?? "";
  if (body.attachments.length > 0 && !body.text && !body.html) {
    // Pure-attachment message — first attachment dictates type.
    const a = body.attachments[0];
    const mt = (a.mimeType ?? "").toLowerCase();
    if (mt.startsWith("image/")) contentType = "image";
    else if (mt.startsWith("audio/")) contentType = "audio";
    else if (mt.startsWith("video/")) contentType = "video";
    else contentType = "document";
    contentText = subject ?? "";
  }

  // Internal date is Unix ms in a string — fall back to Date header
  // when missing.
  const receivedAt =
    resp.internalDate && /^\d+$/.test(resp.internalDate)
      ? new Date(Number(resp.internalDate))
      : dateHeader
        ? new Date(dateHeader)
        : new Date();

  return {
    channel: "email",
    externalMessageId: messageId ?? resp.id,
    externalThreadId: resp.threadId,
    senderExternalId: address,
    senderDisplayName: displayName,
    contentType,
    contentText,
    contentMetadata: {
      subject,
      gmailId: resp.id,
      labelIds: resp.labelIds,
      isOutbound,
      bodyHtml: body.html,
      attachments: body.attachments,
      inReplyTo,
    },
    replyToExternalId: inReplyTo,
    receivedAt: isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    rawPayload: resp as unknown as Record<string, unknown>,
  };
}

/**
 * Parse an RFC 5322 mailbox like:
 *   `"Alice Tester" <alice@example.com>`
 *   `Alice Tester <alice@example.com>`
 *   `alice@example.com`
 * Returns `{displayName?, address}`.
 */
export function parseAddress(raw: string): {
  displayName?: string;
  address: string;
} {
  const match = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(raw);
  if (match) {
    return {
      displayName: match[1]?.trim() || undefined,
      address: match[2].trim(),
    };
  }
  return { address: raw.trim() };
}
