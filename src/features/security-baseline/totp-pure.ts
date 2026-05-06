/**
 * Prompt 111 — Dependency-free TOTP (RFC 6238) verifier + otpauth URL
 * generator.  No DB, no `server-only` — every function is unit-testable.
 *
 * Compatible with Google Authenticator, 1Password, Authy, and Yubico:
 *   - HMAC-SHA1
 *   - 6 digits
 *   - 30-second step
 *   - ±1 window by default
 *
 * Secrets are base32-encoded per RFC 4648.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STEP_SECONDS = 30;
const DIGITS = 6;
const DEFAULT_WINDOW = 1;
const SECRET_BYTE_LENGTH = 20; // 160 bits — RFC 4226 minimum for HOTP/TOTP.

// -----------------------------------------------------------------------------
// Base32 (RFC 4648 alphabet, no padding output for otpauth compatibility).
// -----------------------------------------------------------------------------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0b11111];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0b11111];
  }
  return out;
}

export function base32Decode(s: string): Buffer {
  const cleaned = s.replace(/=+$/g, "").toUpperCase().replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`base32Decode: invalid character "${cleaned[i]}"`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// -----------------------------------------------------------------------------
// Secret + URI generation.
// -----------------------------------------------------------------------------

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTE_LENGTH));
}

/**
 * Pure: build an otpauth:// URI for an authenticator app.
 *
 *   otpauth://totp/<issuer>:<account>?secret=<base32>&issuer=<issuer>
 *     &algorithm=SHA1&digits=6&period=30
 */
export function buildOtpauthUrl(input: {
  issuer: string;
  account: string;
  secret: string;
}): string {
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.account)}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// -----------------------------------------------------------------------------
// HOTP / TOTP code generation + verification.
// -----------------------------------------------------------------------------

function hotp(secret: Buffer, counter: number): string {
  const counterBuf = Buffer.alloc(8);
  // Write the counter as a big-endian 64-bit integer.  JS bitwise ops
  // are only 32-bit safe, so we split high/low halves.
  const hi = Math.floor(counter / 0x100000000);
  const lo = counter >>> 0;
  counterBuf.writeUInt32BE(hi, 0);
  counterBuf.writeUInt32BE(lo, 4);
  const hmac = createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = truncated % 10 ** DIGITS;
  return code.toString().padStart(DIGITS, "0");
}

export function generateTotpCode(
  secret: string,
  nowMs: number = Date.now(),
): string {
  const counter = Math.floor(nowMs / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secret), counter);
}

/**
 * Pure: verify a TOTP code.  Walks ±`window` 30-second steps to
 * tolerate clock drift.  Uses `timingSafeEqual` to defeat timing
 * oracles.
 *
 * Returns the matched step offset (`0` for the current window, ±1
 * for the adjacent ones, etc.) or `null` when no window matched.
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  opts: { nowMs?: number; window?: number } = {},
): number | null {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return null;
  const window = opts.window ?? DEFAULT_WINDOW;
  const nowMs = opts.nowMs ?? Date.now();
  const baseCounter = Math.floor(nowMs / 1000 / STEP_SECONDS);
  const secretBytes = base32Decode(secret);
  const submitted = Buffer.from(cleaned, "utf8");
  for (let offset = -window; offset <= window; offset++) {
    const candidate = Buffer.from(hotp(secretBytes, baseCounter + offset), "utf8");
    if (
      candidate.length === submitted.length &&
      timingSafeEqual(candidate, submitted)
    ) {
      return offset;
    }
  }
  return null;
}

// Re-exports used by tests.
export const TOTP_STEP_SECONDS = STEP_SECONDS;
export const TOTP_DIGITS = DIGITS;
