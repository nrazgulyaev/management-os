/**
 * Prompt 109 — Pure helpers for the public direct-booking guest
 * message thread.  No DB / no `server-only` import.
 *
 * Guests can send a short message to the concierge.  We persist the
 * raw `body` for staff audit, but the public surface always renders
 * `body_redacted` — the seam below is the only thing that produces
 * a redacted body.
 */

import { isTerminalStage, type PublicGuestStage } from "./guest-status-pure";

// -----------------------------------------------------------------------------
// Redaction
// -----------------------------------------------------------------------------

const EMAIL_PATTERN =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// International phone with optional + and spaces / dashes.
const PHONE_PATTERN =
  /\+?\d[\d\s\-().]{6,}\d/g;
// 6-digit access codes (e.g. door PINs).  Avoid matching long
// numbers — only standalone 6-digit groups.
const SIX_DIGIT_CODE_PATTERN =
  /(?<![\w-])(\d{6})(?![\w-])/g;
// Any ≥ 24-char base64-ish or hex-ish blob — likely a token / hash /
// provider id.
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_\-+/=]{24,}\b/g;
// "password is foo" / "wifi password: foo" / "code is 1234".
const PASSWORD_PHRASE_PATTERN =
  /\b(?:password|passcode|pin|access\s*code)\b\s*(?:is|:|=)\s*\S+/gi;
// Provider ids — "ses_xxx", "pi_xxx", "ch_xxx", "evt_xxx",
// "man_<uuid>".
const PROVIDER_ID_PATTERN = /\b(?:ses|pi|ch|evt|seti|sub|cs|man)_[A-Za-z0-9]+/g;
// Webhook ids — "wh_xxx" / explicit "webhook id 123".
const WEBHOOK_ID_PATTERN = /\b(?:wh_[A-Za-z0-9]+|webhook[\s_-]?id[:\s]+\S+)/gi;

const REDACTION_TOKEN = "[redacted]";

/**
 * Pure: produce the guest-safe body of a message.
 *
 * Strips emails, phone numbers, 6-digit codes, long tokens / hashes,
 * `password is …` / `pin is …` phrases, provider IDs, webhook IDs.
 * Trims and collapses excessive whitespace.
 */
export function redactGuestMessage(body: string): string {
  if (!body) return "";
  // Order matters — password phrase first so the trailing token isn't
  // separately replaced by another rule and produce
  // "password is [redacted] [redacted]".
  let out = body.replace(PASSWORD_PHRASE_PATTERN, `${REDACTION_TOKEN}`);
  out = out.replace(EMAIL_PATTERN, REDACTION_TOKEN);
  out = out.replace(PROVIDER_ID_PATTERN, REDACTION_TOKEN);
  out = out.replace(WEBHOOK_ID_PATTERN, REDACTION_TOKEN);
  out = out.replace(LONG_TOKEN_PATTERN, REDACTION_TOKEN);
  out = out.replace(PHONE_PATTERN, REDACTION_TOKEN);
  out = out.replace(SIX_DIGIT_CODE_PATTERN, REDACTION_TOKEN);
  return out.replace(/\s+/g, " ").trim();
}

// -----------------------------------------------------------------------------
// Stage gating
// -----------------------------------------------------------------------------

export function guestCanMessage(stage: PublicGuestStage): boolean {
  if (isTerminalStage(stage)) return false;
  if (stage === "failed") return false;
  return true;
}

// -----------------------------------------------------------------------------
// Preview
// -----------------------------------------------------------------------------

export interface MessagePreviewEntry {
  authorType: "guest" | "staff" | "system";
  bodyRedacted: string;
  createdAt: string;
}

export interface MessagePreview {
  totalCount: number;
  unreadCount: number;
  lastAuthor: "guest" | "staff" | "system" | null;
  lastBody: string | null;
  lastAt: string | null;
}

/**
 * Pure: build a guest-safe preview for the status page card.  Only
 * the latest entry's redacted body is surfaced; everything older is
 * counted but not echoed.
 */
export function buildMessagePreview(
  messages: ReadonlyArray<MessagePreviewEntry>,
  guestUnread: number,
): MessagePreview {
  if (messages.length === 0) {
    return {
      totalCount: 0,
      unreadCount: 0,
      lastAuthor: null,
      lastBody: null,
      lastAt: null,
    };
  }
  const sorted = [...messages].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
  const latest = sorted[0];
  return {
    totalCount: messages.length,
    unreadCount: Math.max(0, guestUnread),
    lastAuthor: latest.authorType,
    lastBody: latest.bodyRedacted,
    lastAt: latest.createdAt,
  };
}

/**
 * Pure: validate a guest-submitted message body.  Returns null when
 * valid; otherwise a short reason string.
 */
export function validateGuestMessageBody(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length < 2) return "too_short";
  if (trimmed.length > 4000) return "too_long";
  return null;
}
