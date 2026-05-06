/**
 * Pure helpers for guest-journey events + the owner-visible
 * projection (Prompt 102). No DB / no `server-only` import.
 *
 * Events are append-only signals that flow into two places:
 *   1. the admin-facing journey timeline at /dashboard/guest-journey
 *   2. the owner-visible feed (owner_visible_events) — but ONLY when
 *      `owner_visible=true` AND the event survives the strip pass
 *      below (no guest emails / phones / token hashes).
 */
import { maskGuestName } from "@/features/owner-intelligence/calendar-pure";

export type JourneyEventType =
  | "token_issued"
  | "guide_opened"
  | "wifi_opened"
  | "checkin_opened"
  | "service_suggested"
  | "service_clicked"
  | "service_ordered"
  | "concierge_opened"
  | "expected_arrival_submitted"
  | "expected_checkout_submitted"
  | "review_requested"
  | "review_clicked"
  | "checkout_thanked";

export type JourneyEventSourceType =
  | "rule"
  | "guest_action"
  | "admin_action"
  | "system";

export type JourneyEventSeverity =
  | "info"
  | "success"
  | "warning"
  | "critical";

export interface JourneyEventShape {
  id?: string;
  bookingId: string | null;
  stayTokenId: string | null;
  eventType: JourneyEventType;
  sourceType: JourneyEventSourceType | null;
  sourceId: string | null;
  title: string;
  description: string | null;
  eventAt: Date;
  ownerVisible: boolean;
  severity: JourneyEventSeverity;
  metadataJson: Record<string, unknown> | null;
}

/**
 * Pure: assemble a journey event from a suggestion record. Used
 * when the admin or the runner records that we surfaced a CTA.
 */
export function buildJourneyEventFromSuggestion(args: {
  bookingId: string;
  stayTokenId: string | null;
  suggestionId: string;
  suggestionTitle: string;
  suggestionType: string;
  ownerVisible?: boolean;
}): JourneyEventShape {
  return {
    bookingId: args.bookingId,
    stayTokenId: args.stayTokenId,
    eventType: "service_suggested",
    sourceType: "rule",
    sourceId: args.suggestionId,
    title: args.suggestionTitle,
    description: `Suggestion type: ${args.suggestionType}`,
    eventAt: new Date(),
    ownerVisible: args.ownerVisible ?? false,
    severity: "info",
    metadataJson: { suggestionType: args.suggestionType },
  };
}

/**
 * Pure: a journey event is owner-safe iff:
 *   - it is flagged `owner_visible = true`, AND
 *   - its `description` / `metadataJson` do not carry guest emails,
 *     phones, token strings, lock codes, or other forbidden tokens.
 *
 * The strip pass below sanitises before persisting. This predicate
 * is used by tests as a fail-safe.
 */
const FORBIDDEN_OWNER_FIELDS = [
  "email",
  "phone",
  "token",
  "tokenHash",
  "token_hash",
  "passwordCiphertext",
  "password_ciphertext",
  "codeDisplay",
  "code_display",
  "displayPassword",
  "display_password",
  "rawToken",
  "raw_token",
  "storagePath",
  "storage_path",
  "cameraUrl",
  "camera_url",
];

export function isJourneyEventOwnerSafe(
  event: Pick<JourneyEventShape, "ownerVisible" | "description" | "metadataJson">,
): boolean {
  if (!event.ownerVisible) return false;
  const flat = JSON.stringify({
    description: event.description ?? "",
    metadata: event.metadataJson ?? {},
  }).toLowerCase();
  for (const banned of FORBIDDEN_OWNER_FIELDS) {
    if (flat.includes(banned.toLowerCase())) return false;
  }
  return true;
}

/**
 * Pure: drop forbidden fields from a journey event before persisting
 * the owner-visible projection. Returns a NEW shape — we never
 * mutate the input.
 */
export function sanitizeJourneyEventForOwner(
  event: JourneyEventShape & { guestFullName?: string | null },
): JourneyEventShape {
  const meta = event.metadataJson ?? {};
  const cleanMeta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN_OWNER_FIELDS.includes(k)) continue;
    if (FORBIDDEN_OWNER_FIELDS.some((f) => k.toLowerCase().includes(f.toLowerCase()))) {
      continue;
    }
    cleanMeta[k] = v;
  }
  if (event.guestFullName) {
    cleanMeta.guestLabel = maskGuestName(event.guestFullName);
  }
  return {
    ...event,
    description: redactForbiddenSubstrings(event.description ?? null),
    metadataJson: cleanMeta,
  };
}

function redactForbiddenSubstrings(s: string | null): string | null {
  if (!s) return s;
  // Strip @-mentions and phone-shaped tokens.
  const noEmails = s.replace(/[\w.+-]+@[\w.-]+/g, "[redacted]");
  const noPhones = noEmails.replace(/\+?\d[\d\s\-().]{6,}\d/g, "[redacted]");
  return noPhones;
}

/**
 * Pure: project a journey event onto the owner_visible_events row
 * shape. Returns null when the event is not owner-safe.
 */
export interface OwnerVisibleEventDraft {
  ownerId: string;
  villaId: string | null;
  projectId: string | null;
  sourceType: string;
  sourceId: string | null;
  eventDate: string;
  eventEndDate: string | null;
  title: string;
  description: string | null;
  severity: JourneyEventSeverity;
  ownerVisible: true;
  sortOrder: number;
}

export function buildOwnerVisibleEventFromJourneyEvent(args: {
  event: JourneyEventShape & { guestFullName?: string | null };
  ownerId: string;
  villaId: string | null;
  projectId: string | null;
  sortOrder?: number;
}): OwnerVisibleEventDraft | null {
  if (!args.event.ownerVisible) return null;
  const sanitized = sanitizeJourneyEventForOwner(args.event);
  if (!isJourneyEventOwnerSafe(sanitized)) return null;
  const date = sanitized.eventAt.toISOString().slice(0, 10);
  return {
    ownerId: args.ownerId,
    villaId: args.villaId,
    projectId: args.projectId,
    sourceType: "review",
    sourceId: sanitized.sourceId,
    eventDate: date,
    eventEndDate: null,
    title: sanitized.title,
    description: sanitized.description,
    severity: sanitized.severity,
    ownerVisible: true,
    sortOrder: args.sortOrder ?? 100,
  };
}
