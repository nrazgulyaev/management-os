/**
 * Pure helpers for the v9J two-way concierge reply flow.
 *
 * No DB / no `server-only` import. Tested directly against fixtures.
 */

import { redactSensitiveText } from "./safety";
import type { HandoffPriority, HandoffType } from "./handoff-pure";

// -----------------------------------------------------------------------------
// Redaction (defence-in-depth — runs on every reply body)
// -----------------------------------------------------------------------------

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Match phone runs like +6281234567890 or (555) 123-4567 — 8-15 digits
// across optional separators, must contain at least 8 digits.
const PHONE_RE =
  /(?:\+?\d[\s\d().-]{6,18}\d)/g;
// http(s), rtsp, rtmp, ws(s) — any URL-shaped token. Camera-specific
// schemes always classify as camera URLs.
const URL_RE =
  /\b(?:https?|rtsp|rtmp|ws|wss):\/\/[^\s<>"']{4,}/gi;

function redactBase(text: string): string {
  if (!text) return text;
  let out = redactSensitiveText(text);
  out = out.replace(EMAIL_RE, "[email redacted]");
  out = out.replace(URL_RE, (match) => {
    const lower = match.toLowerCase();
    if (
      lower.startsWith("rtsp://") ||
      lower.startsWith("rtmp://") ||
      lower.includes("camera") ||
      lower.includes("cctv") ||
      lower.includes("stream")
    ) {
      return "[camera URL redacted]";
    }
    return "[link redacted]";
  });
  out = out.replace(PHONE_RE, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return match;
    return "[phone redacted]";
  });
  return out;
}

/**
 * Pure: scrub a guest-typed reply. Same rules as the staff-side
 * scrubber — both halves of the conversation pass through the same
 * filter so the timeline can never show a raw secret.
 */
export function redactGuestReply(text: string): string {
  return redactBase(text);
}

/**
 * Pure: scrub a staff-typed reply. Identical to guest redaction in
 * v9J — the asymmetry would just invite mistakes. The admin UI
 * surfaces a warning when redaction changes the text materially.
 */
export function redactStaffReply(text: string): string {
  return redactBase(text);
}

// -----------------------------------------------------------------------------
// Permission gates (status-based — DB-level perms checked elsewhere)
// -----------------------------------------------------------------------------

export type HandoffStatus =
  | "created"
  | "linked_to_request"
  | "acknowledged"
  | "resolved"
  | "cancelled";

/**
 * Pure: a guest may add follow-up messages while the handoff is open.
 * `resolved` and `cancelled` are terminal — explicitly opening a new
 * handoff is the right path for new asks.
 */
export function canGuestReply(status: HandoffStatus): boolean {
  return status === "created" ||
    status === "linked_to_request" ||
    status === "acknowledged";
}

/**
 * Pure: staff may always reply except after `cancelled` (which means
 * the handoff was closed without action). Staff can still post on
 * `resolved` to add a closing remark before the row gets archived.
 */
export function canStaffReply(status: HandoffStatus): boolean {
  return status !== "cancelled";
}

// -----------------------------------------------------------------------------
// System reply composer (ack / resolve / status update)
// -----------------------------------------------------------------------------

export interface SystemReplyDraft {
  body: string;
  bodyRedacted: string;
  replyType: "status_update" | "resolution";
  statusSnapshot: HandoffStatus;
  visibility: "guest_visible";
}

/**
 * Pure: build the system message we insert when a staff member
 * acknowledges or resolves the handoff. `actorLabel` is the
 * person's friendly display name when available — never their email
 * or phone; the caller is responsible for picking a guest-safe label.
 */
export function buildSystemStatusReply(
  status: HandoffStatus,
  actorLabel: string | null,
): SystemReplyDraft {
  const safeActor = actorLabel ? actorLabel.trim().slice(0, 80) : null;
  if (status === "acknowledged") {
    const body = safeActor
      ? `Our team (${safeActor}) acknowledged this request and is on it.`
      : "Our team acknowledged this request and is on it.";
    return {
      body,
      bodyRedacted: redactGuestReply(body),
      replyType: "status_update",
      statusSnapshot: status,
      visibility: "guest_visible",
    };
  }
  if (status === "resolved") {
    const body = safeActor
      ? `Marked resolved by ${safeActor}. Tap "Ask human concierge" if anything else comes up.`
      : `Marked resolved. Tap "Ask human concierge" if anything else comes up.`;
    return {
      body,
      bodyRedacted: redactGuestReply(body),
      replyType: "resolution",
      statusSnapshot: status,
      visibility: "guest_visible",
    };
  }
  if (status === "cancelled") {
    const body = "Cancelled.";
    return {
      body,
      bodyRedacted: redactGuestReply(body),
      replyType: "status_update",
      statusSnapshot: status,
      visibility: "guest_visible",
    };
  }
  // status_update for any other transition — kept short.
  const body = `Status: ${status.replace("_", " ")}.`;
  return {
    body,
    bodyRedacted: redactGuestReply(body),
    replyType: "status_update",
    statusSnapshot: status,
    visibility: "guest_visible",
  };
}

/**
 * Pure: detect whether redaction changed the material content of a
 * staff guest-visible reply. Used to show a warning before the post.
 */
export function redactionWouldChange(text: string): {
  changed: boolean;
  preview: string;
} {
  const redacted = redactStaffReply(text);
  return { changed: redacted !== text, preview: redacted };
}

// -----------------------------------------------------------------------------
// SLA metrics
// -----------------------------------------------------------------------------

export interface HandoffMetricRow {
  id: string;
  status: HandoffStatus;
  priority: HandoffPriority;
  handoffType: HandoffType;
  createdAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  firstStaffReplyAt: Date | null;
  villaCode: string | null;
}

export interface SlaSummary {
  total: number;
  open: number;
  urgentOpen: number;
  overdue: number;
  /** Median time, in seconds, between created_at and acknowledged_at.
   *  null when no handoff has been acknowledged. */
  medianTimeToAcknowledgeSec: number | null;
  medianTimeToFirstResponseSec: number | null;
  medianTimeToResolveSec: number | null;
}

const URGENT_OVERDUE_MS = 30 * 60 * 1000; // 30 min for urgent
const NORMAL_OVERDUE_MS = 2 * 60 * 60 * 1000; // 2h for everything else

/**
 * Pure: roll a list of handoff rows into the SLA summary. `now` is
 * injectable so tests can pin behaviour around overdue thresholds.
 */
export function calculateHandoffSlaMetrics(
  rows: ReadonlyArray<HandoffMetricRow>,
  now: Date = new Date(),
): SlaSummary {
  const total = rows.length;
  let open = 0;
  let urgentOpen = 0;
  let overdue = 0;
  const ackDurations: number[] = [];
  const firstResponseDurations: number[] = [];
  const resolveDurations: number[] = [];
  for (const r of rows) {
    const isOpen = r.status !== "resolved" && r.status !== "cancelled";
    if (isOpen) {
      open++;
      if (r.priority === "urgent") urgentOpen++;
      const age = now.getTime() - r.createdAt.getTime();
      const threshold =
        r.priority === "urgent" ? URGENT_OVERDUE_MS : NORMAL_OVERDUE_MS;
      if (age > threshold) overdue++;
    }
    if (r.acknowledgedAt) {
      ackDurations.push(
        (r.acknowledgedAt.getTime() - r.createdAt.getTime()) / 1000,
      );
    }
    if (r.firstStaffReplyAt) {
      firstResponseDurations.push(
        (r.firstStaffReplyAt.getTime() - r.createdAt.getTime()) / 1000,
      );
    }
    if (r.resolvedAt) {
      resolveDurations.push(
        (r.resolvedAt.getTime() - r.createdAt.getTime()) / 1000,
      );
    }
  }
  return {
    total,
    open,
    urgentOpen,
    overdue,
    medianTimeToAcknowledgeSec: median(ackDurations),
    medianTimeToFirstResponseSec: median(firstResponseDurations),
    medianTimeToResolveSec: median(resolveDurations),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export interface MetricBucket {
  key: string;
  label: string;
  total: number;
  open: number;
  urgentOpen: number;
  resolved: number;
  medianResolveSec: number | null;
}

export function groupHandoffMetricsByVilla(
  rows: ReadonlyArray<HandoffMetricRow>,
): MetricBucket[] {
  return groupHandoffMetrics(rows, (r) =>
    r.villaCode ? `villa:${r.villaCode}` : "villa:unknown",
  );
}

export function groupHandoffMetricsByType(
  rows: ReadonlyArray<HandoffMetricRow>,
): MetricBucket[] {
  return groupHandoffMetrics(rows, (r) => `type:${r.handoffType}`);
}

export function groupHandoffMetricsByPriority(
  rows: ReadonlyArray<HandoffMetricRow>,
): MetricBucket[] {
  return groupHandoffMetrics(rows, (r) => `priority:${r.priority}`);
}

function groupHandoffMetrics(
  rows: ReadonlyArray<HandoffMetricRow>,
  keyFn: (r: HandoffMetricRow) => string,
): MetricBucket[] {
  const map = new Map<string, HandoffMetricRow[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const list = map.get(k) ?? [];
    list.push(r);
    map.set(k, list);
  }
  const out: MetricBucket[] = [];
  for (const [key, list] of map.entries()) {
    const resolved = list.filter((r) => r.resolvedAt !== null).length;
    const open = list.filter(
      (r) => r.status !== "resolved" && r.status !== "cancelled",
    ).length;
    const urgentOpen = list.filter(
      (r) =>
        r.priority === "urgent" &&
        r.status !== "resolved" &&
        r.status !== "cancelled",
    ).length;
    const resolveDurations = list
      .filter((r) => r.resolvedAt !== null)
      .map(
        (r) =>
          (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 1000,
      );
    out.push({
      key,
      label: key.split(":").slice(1).join(":") || key,
      total: list.length,
      open,
      urgentOpen,
      resolved,
      medianResolveSec: median(resolveDurations),
    });
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

/**
 * Pure: format a duration in seconds into a friendly admin label
 * (`null` → "—"; <60s → "Ns"; <60m → "Nm"; <24h → "Nh Mm"; otherwise
 * "Nd"). Used by the metrics page; tests pin a few cases.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 60 * 60) {
    const m = Math.round(seconds / 60);
    return `${m}m`;
  }
  if (seconds < 24 * 60 * 60) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.round(seconds / (24 * 60 * 60));
  return `${d}d`;
}

/**
 * Pure: enumerate just the visible-to-guest replies for tests + the
 * guest UI projection. Provided here so the projection logic is
 * exercised without a DB.
 */
export interface ReplySnapshot {
  id: string;
  authorType: "guest" | "staff" | "system";
  visibility: "guest_visible" | "internal_only";
  bodyRedacted: string;
  replyType: "message" | "status_update" | "resolution" | "internal_note";
  createdAt: Date;
}

export function filterGuestVisible(
  replies: ReadonlyArray<ReplySnapshot>,
): ReplySnapshot[] {
  return replies.filter((r) => r.visibility === "guest_visible");
}
