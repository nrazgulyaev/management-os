/**
 * Pure helpers for guest-journey suggestions (Prompt 102).
 * No DB / no `server-only` import.
 *
 * A "suggestion" is a CTA the guest sees inside /stay/[token]. It is
 * NEVER a charge, an order, or a confirmation — it links to an
 * existing surface (services, guide, check-in, concierge, review).
 */
import type { RuleShape, BookingContext } from "./rules-pure";

export type SuggestionType =
  | "airport_transfer"
  | "breakfast"
  | "private_chef"
  | "massage"
  | "driver"
  | "restaurant"
  | "late_checkout"
  | "review_request"
  | "guide"
  | "concierge"
  // Generic fallback — used when a rule has a templateKey but no
  // specific suggestion type.
  | "info";

export type SuggestionPriority = "low" | "normal" | "high" | "urgent";
export type SuggestionStatus =
  | "active"
  | "clicked"
  | "dismissed"
  | "expired"
  | "converted";

export interface SuggestionShape {
  id?: string;
  bookingId: string;
  stayTokenId: string | null;
  ruleId: string | null;
  villaId: string | null;
  projectId: string | null;
  suggestionType: SuggestionType;
  title: string;
  body: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  serviceId: string | null;
  suggestedFor: Date | null;
  expiresAt: Date | null;
  status: SuggestionStatus;
  priority: SuggestionPriority;
  ownerVisible: boolean;
}

/**
 * Pure: friendly title + body per suggestion type. Owner-safe (no
 * guest names baked in).
 */
export function publicSuggestionLabel(type: SuggestionType): {
  title: string;
  body: string | null;
  ctaLabel: string;
} {
  switch (type) {
    case "airport_transfer":
      return {
        title: "Need airport pickup?",
        body: "Book a meet-and-greet transfer with our team — flat rate, English-speaking driver.",
        ctaLabel: "See transfer options",
      };
    case "breakfast":
      return {
        title: "Add breakfast to your stay",
        body: "Wake up to a tropical breakfast set up at your villa each morning.",
        ctaLabel: "Order breakfast",
      };
    case "private_chef":
      return {
        title: "Private chef in your villa",
        body: "Three-course tasting menus or family-style dinner — chef shops, cooks, cleans.",
        ctaLabel: "See chef menus",
      };
    case "massage":
      return {
        title: "In-villa spa experience",
        body: "Therapist comes to your villa with everything they need.",
        ctaLabel: "Book a treatment",
      };
    case "driver":
      return {
        title: "Driver for the day",
        body: "Air-con SUV, English-speaking driver, hourly or full-day rates.",
        ctaLabel: "Reserve a driver",
      };
    case "restaurant":
      return {
        title: "Tonight's restaurant pick",
        body: "Hand-picked for tonight by our concierge team.",
        ctaLabel: "Open the suggestion",
      };
    case "late_checkout":
      return {
        title: "Need a later checkout?",
        body: "Subject to next booking — we'll confirm within 30 minutes.",
        ctaLabel: "Request late checkout",
      };
    case "review_request":
      return {
        title: "Loved your stay? Leave a quick review",
        body: "It takes less than a minute and helps the team enormously.",
        ctaLabel: "Leave a review",
      };
    case "guide":
      return {
        title: "Open your villa guide",
        body: "Wi-Fi, doors, neighbourhood, emergency contacts — everything in one place.",
        ctaLabel: "Open guide",
      };
    case "concierge":
      return {
        title: "Need anything?",
        body: "Send the concierge a message — typical reply within 30 minutes.",
        ctaLabel: "Send a request",
      };
    case "info":
      return {
        title: "A note from your host",
        body: null,
        ctaLabel: "Open",
      };
  }
}

/**
 * Pure: build a stay-token-scoped CTA href for a given suggestion
 * type. We never emit external URLs except for review requests
 * (handled in review-pure).
 *
 * Inputs:
 *   token       — the raw stay token string from /stay/[token]/...
 *   serviceKey  — the guest_services.service_key when available
 *
 * Service deep-links use a `?service=<key>` query so the catalog
 * page can highlight the row without us hard-coding service ids.
 */
export function buildSuggestionCta(
  type: SuggestionType,
  token: string,
  serviceKey?: string | null,
): { ctaHref: string; ctaLabel: string } {
  const safeToken = encodeURIComponent(token);
  const label = publicSuggestionLabel(type).ctaLabel;
  switch (type) {
    case "airport_transfer":
    case "breakfast":
    case "private_chef":
    case "massage":
    case "driver":
    case "restaurant":
      return {
        ctaHref: serviceKey
          ? `/stay/${safeToken}/services?service=${encodeURIComponent(serviceKey)}`
          : `/stay/${safeToken}/services`,
        ctaLabel: label,
      };
    case "late_checkout":
      return {
        ctaHref: `/stay/${safeToken}/check-out`,
        ctaLabel: label,
      };
    case "review_request":
      return {
        ctaHref: `/stay/${safeToken}/review`,
        ctaLabel: label,
      };
    case "guide":
      return {
        ctaHref: `/stay/${safeToken}/guide`,
        ctaLabel: label,
      };
    case "concierge":
      return {
        ctaHref: `/stay/${safeToken}/concierge`,
        ctaLabel: label,
      };
    case "info":
      return {
        ctaHref: `/stay/${safeToken}`,
        ctaLabel: label,
      };
  }
}

/**
 * Pure: visible to the guest right now?
 * - status must be 'active'
 * - expires_at, when set, must be in the future
 * - suggested_for, when set, must be at or before now (we don't
 *   render suggestions before their scheduled time)
 */
export function suggestionIsVisible(
  s: { status: string; suggestedFor: Date | null; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (s.status !== "active") return false;
  if (s.expiresAt && s.expiresAt.getTime() <= now.getTime()) return false;
  if (s.suggestedFor && s.suggestedFor.getTime() > now.getTime()) return false;
  return true;
}

const PRIORITY_RANK: Record<SuggestionPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/**
 * Pure: stable sort by `(priority, suggestedFor)`. Used to pick the
 * top-N suggestions to render in the /stay/[token] hero.
 */
export function groupSuggestionsByPriority<
  T extends {
    priority: SuggestionPriority;
    suggestedFor: Date | null;
    createdAt?: Date;
  },
>(suggestions: ReadonlyArray<T>): T[] {
  return [...suggestions].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 9;
    const pb = PRIORITY_RANK[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    const ta = a.suggestedFor?.getTime() ?? a.createdAt?.getTime() ?? 0;
    const tb = b.suggestedFor?.getTime() ?? b.createdAt?.getTime() ?? 0;
    return ta - tb;
  });
}

/**
 * Pure: assemble a suggestion shape from a rule + booking context.
 * Used by the journey runner to materialize the row before saving.
 */
export function buildSuggestionFromRule(
  rule: RuleShape & {
    payloadJson?: { title?: string; body?: string; ctaLabel?: string } | null;
  },
  ctx: BookingContext & {
    stayTokenId: string | null;
    rawToken: string | null;
    serviceKey?: string | null;
  },
  scheduledFor: Date | null,
  expiresAt: Date | null,
): Omit<SuggestionShape, "id"> {
  const type = (rule.suggestionType ?? "info") as SuggestionType;
  const labels = publicSuggestionLabel(type);
  const cta = ctx.rawToken
    ? buildSuggestionCta(type, ctx.rawToken, ctx.serviceKey ?? null)
    : { ctaHref: null as string | null, ctaLabel: labels.ctaLabel };
  const payload = rule.payloadJson ?? {};
  return {
    bookingId: ctx.id,
    stayTokenId: ctx.stayTokenId,
    ruleId: rule.id,
    villaId: ctx.villaId,
    projectId: ctx.projectId,
    suggestionType: type,
    title: payload.title ?? labels.title,
    body: payload.body ?? labels.body,
    ctaLabel: payload.ctaLabel ?? cta.ctaLabel,
    ctaHref: cta.ctaHref,
    serviceId: rule.serviceId,
    suggestedFor: scheduledFor,
    expiresAt,
    status: "active",
    priority: rule.priority,
    ownerVisible: false,
  };
}
