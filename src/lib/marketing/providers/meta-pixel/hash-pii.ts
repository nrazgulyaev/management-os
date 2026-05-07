/**
 * Stage 6.P4.B — Meta Pixel PII hashing helpers.
 *
 * Meta's Conversions API requires every PII field in `user_data` to
 * be SHA-256 hashed (lowercase hex) AFTER normalization. The
 * normalization rules are domain-specific:
 *
 *   - email:        lowercase, strip whitespace, then sha256
 *   - phone:        strip non-digits (no + prefix), then sha256
 *   - first_name /
 *     last_name:    lowercase, strip whitespace, sha256
 *   - city / state: lowercase, strip whitespace + non-alpha, sha256
 *   - country:      lowercase, ISO-3166-1 alpha-2 (e.g. "us"), sha256
 *   - zip:          lowercase, strip whitespace, sha256 (US: 5 digits)
 *
 * Pure helpers — no I/O, no platform dependencies. Importable from
 * tests + non-server contexts.
 *
 * Reference: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 */

import { createHash, createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Strip all non-digit characters. Optional `+` is also dropped —
 *  Meta wants raw digits. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** City / state — strip whitespace + punctuation. */
export function normalizeCityOrState(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** ISO-3166-1 alpha-2 country code, lowercased. */
export function normalizeCountry(country: string): string {
  return country.trim().toLowerCase().slice(0, 2);
}

export function normalizeZip(zip: string): string {
  return zip.trim().toLowerCase().replace(/\s/g, "");
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** SHA-256 hex digest, lowercase. Empty input → empty string (NOT
 *  the hash of an empty string — Meta wants the field omitted). */
export function sha256Hex(value: string): string {
  if (!value) return "";
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// hashUserData — main entry
// ---------------------------------------------------------------------------

export interface RawUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  externalId?: string;
  /** GA4 client_id / Meta _fbp — passed through un-hashed. */
  clientUserAgent?: string;
  fbc?: string;
  fbp?: string;
  /** Server-side IP — passed through un-hashed. */
  clientIpAddress?: string;
}

export interface HashedUserData {
  /** Meta uses snake_case + array-of-hash fields. */
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  ct?: string[];
  st?: string[];
  country?: string[];
  zp?: string[];
  external_id?: string[];
  client_user_agent?: string;
  fbc?: string;
  fbp?: string;
  client_ip_address?: string;
}

/**
 * Hash every PII field in the user-data bag using Meta's
 * normalization-then-sha256 rules. Fields with empty / missing
 * values are omitted (NOT hashed-empty-string) so Meta's
 * deduplication match-rate doesn't collapse.
 */
export function hashUserData(raw: RawUserData): HashedUserData {
  const out: HashedUserData = {};

  if (raw.email) {
    const h = sha256Hex(normalizeEmail(raw.email));
    if (h) out.em = [h];
  }
  if (raw.phone) {
    const h = sha256Hex(normalizePhone(raw.phone));
    if (h) out.ph = [h];
  }
  if (raw.firstName) {
    const h = sha256Hex(normalizeName(raw.firstName));
    if (h) out.fn = [h];
  }
  if (raw.lastName) {
    const h = sha256Hex(normalizeName(raw.lastName));
    if (h) out.ln = [h];
  }
  if (raw.city) {
    const h = sha256Hex(normalizeCityOrState(raw.city));
    if (h) out.ct = [h];
  }
  if (raw.state) {
    const h = sha256Hex(normalizeCityOrState(raw.state));
    if (h) out.st = [h];
  }
  if (raw.country) {
    const h = sha256Hex(normalizeCountry(raw.country));
    if (h) out.country = [h];
  }
  if (raw.zip) {
    const h = sha256Hex(normalizeZip(raw.zip));
    if (h) out.zp = [h];
  }
  if (raw.externalId) {
    // external_id is not strictly PII but Meta still expects it hashed.
    const h = sha256Hex(raw.externalId.trim().toLowerCase());
    if (h) out.external_id = [h];
  }

  // Pass-through fields (already non-PII or aggregate).
  if (raw.clientUserAgent) out.client_user_agent = raw.clientUserAgent;
  if (raw.fbc) out.fbc = raw.fbc;
  if (raw.fbp) out.fbp = raw.fbp;
  if (raw.clientIpAddress) out.client_ip_address = raw.clientIpAddress;

  return out;
}

/**
 * Generate Meta's `appsecret_proof` — HMAC-SHA256 of the access
 * token keyed with the app secret, hex-encoded. Required when the
 * `app_secret` is set on the credentials.
 *
 * Reference: https://developers.facebook.com/docs/graph-api/securing-requests
 */
export function generateAppsecretProof(
  accessToken: string,
  appSecret: string,
): string {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}
