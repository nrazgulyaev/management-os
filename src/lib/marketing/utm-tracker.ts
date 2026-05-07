/**
 * Stage 6.P4.B — UTM parameter tracking helpers.
 *
 * Pure functions — no I/O, no platform dependencies. Importable from
 * tests + non-server contexts (the JS Tag layer that lands in P4.F
 * uses these to build touchpoint payloads on the client).
 *
 * Three responsibilities:
 *   1. Parse a URL into its UTM bag.
 *   2. Classify the (utm + referrer) combination into a
 *      `TouchpointChannel` enum value — the same enum stored on
 *      `attribution_touchpoints.channel` (P4.A).
 *   3. Serialize a touchpoint record from the parsed signals.
 */

import type {
  AttributionTouchpointRecord,
  TouchpointChannel,
} from "./types";

// ---------------------------------------------------------------------------
// parseUtmParams
// ---------------------------------------------------------------------------

export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

/**
 * Extract the standard 5 UTM params from a URL. Returns empty object
 * when none are present. Trims values + drops empty strings so
 * `?utm_source=` doesn't leak as `source: ""`.
 *
 * Accepts both full URLs and bare query strings (`?utm_source=foo`
 * or `utm_source=foo`).
 */
export function parseUtmParams(url: string): UtmParams {
  if (!url) return {};
  let search: string;
  try {
    // Try as full URL first.
    const u = new URL(url);
    search = u.search;
  } catch {
    // Fall back to treating `url` as a bare query string.
    search = url.startsWith("?") ? url : `?${url}`;
  }
  const params = new URLSearchParams(search);
  const out: UtmParams = {};
  const fields: Array<[keyof UtmParams, string]> = [
    ["source", "utm_source"],
    ["medium", "utm_medium"],
    ["campaign", "utm_campaign"],
    ["content", "utm_content"],
    ["term", "utm_term"],
  ];
  for (const [outKey, paramKey] of fields) {
    const v = params.get(paramKey);
    if (v) {
      const trimmed = v.trim();
      if (trimmed) out[outKey] = trimmed;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// classifyChannel
// ---------------------------------------------------------------------------

export interface ClassifyChannelInput {
  utm?: UtmParams;
  referrer?: string;
  landingUrl?: string;
}

const SOCIAL_DOMAINS = new Set([
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "tiktok.com",
  "pinterest.com",
  "reddit.com",
  "snapchat.com",
]);

const SEARCH_DOMAINS = new Set([
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "yahoo.com",
  "yandex.ru",
  "yandex.com",
  "baidu.com",
]);

/**
 * Map (utm + referrer) into a `TouchpointChannel` using GA4-style
 * default channel-grouping rules. Conservative — when in doubt
 * returns `referral` or `other` rather than a paid channel.
 */
export function classifyChannel(input: ClassifyChannelInput): TouchpointChannel {
  const utm = input.utm ?? {};
  const medium = (utm.medium ?? "").toLowerCase();
  const source = (utm.source ?? "").toLowerCase();

  // 1. UTM medium is the most reliable signal.
  if (medium === "cpc" || medium === "ppc" || medium === "paid_search") {
    return "paid_search";
  }
  if (medium === "paid_social" || medium === "paidsocial") return "paid_social";
  if (medium === "social" || medium === "social-network") {
    // social with paid signal in source → paid_social
    if (/(ads|paid|sponsored)/.test(source)) return "paid_social";
    return "organic_social";
  }
  if (medium === "organic" || medium === "search") return "organic_search";
  if (medium === "email") return "email";
  if (medium === "display" || medium === "banner") return "display";
  if (medium === "video" || medium === "youtube") return "video";
  if (medium === "affiliate") return "affiliate";
  if (medium === "referral") return "referral";

  // 2. UTM source without medium — best-effort.
  if (source.includes("google") && !medium) {
    return source.includes("ads") ? "paid_search" : "organic_search";
  }
  if (source.includes("facebook") || source.includes("instagram")) {
    return source.includes("ads") ? "paid_social" : "organic_social";
  }

  // 3. No UTM — fall back to referrer.
  const refDomain = extractDomain(input.referrer);
  if (!refDomain) {
    // No UTM, no referrer → direct visit.
    return "direct";
  }
  if (SEARCH_DOMAINS.has(refDomain)) return "organic_search";
  if (SOCIAL_DOMAINS.has(refDomain)) return "organic_social";

  // Self-referral (visitor came from another page on our site) →
  // treat as direct so the attribution engine doesn't double-count.
  const landingDomain = extractDomain(input.landingUrl);
  if (landingDomain && refDomain === landingDomain) return "direct";

  return "referral";
}

/** Extract the lowercase domain from a URL string. Strips the
 *  leading `www.`. Returns undefined for bad input. */
export function extractDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// serializeTouchpoint
// ---------------------------------------------------------------------------

export interface SerializeTouchpointInput {
  utm?: UtmParams;
  referrer?: string;
  landingUrl?: string;
  sessionId?: string;
  clientId?: string;
  userExternalId?: string;
  touchpointAt?: Date;
  userAgent?: string;
  deviceType?: string;
  country?: string;
  rawPayload?: Record<string, unknown>;
}

/**
 * Serialize the parsed signals into an `AttributionTouchpointRecord`
 * — the shape the service layer inserts into
 * `attribution_touchpoints` (P4.A schema).
 *
 * Defaults:
 *   - `touchpointAt` → `new Date()` if omitted
 *   - `channel` → computed via `classifyChannel`
 *   - empty UTM string fields are stripped from the output
 */
export function serializeTouchpoint(
  input: SerializeTouchpointInput,
): AttributionTouchpointRecord {
  const utm = input.utm ?? {};
  const channel = classifyChannel({
    utm,
    referrer: input.referrer,
    landingUrl: input.landingUrl,
  });
  return {
    sessionId: input.sessionId,
    clientId: input.clientId,
    userExternalId: input.userExternalId,
    touchpointAt: input.touchpointAt ?? new Date(),
    channel,
    source: utm.source,
    medium: utm.medium,
    campaign: utm.campaign,
    content: utm.content,
    term: utm.term,
    referrerUrl: input.referrer,
    landingUrl: input.landingUrl,
    userAgent: input.userAgent,
    deviceType: input.deviceType,
    country: input.country,
    rawPayload: input.rawPayload,
  };
}
