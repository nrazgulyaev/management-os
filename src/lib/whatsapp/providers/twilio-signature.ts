import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure helpers for Twilio webhook signature verification. Extracted
 * from `twilio.ts` so unit tests can exercise the HMAC math without
 * pulling in `server-only`. Same pattern as
 * `distribution-preview-helpers.ts` and other Stage 3 helper splits.
 *
 * Twilio signature recipe:
 *   1. Concatenate the full URL with each POST param appended in
 *      alphabetical order (key + value, no separator).
 *   2. HMAC-SHA1 with the auth token.
 *   3. Base64-encode the result.
 *   4. Compare with constant-time equals.
 */

export function buildTwilioCanonical(
  fullUrl: string,
  formBody: string,
): string {
  const params = new URLSearchParams(formBody);
  const sorted = [...params.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  let canonical = fullUrl;
  for (const [k, v] of sorted) canonical += k + v;
  return canonical;
}

export function computeTwilioSignature(
  authToken: string,
  fullUrl: string,
  formBody: string,
): string {
  const canonical = buildTwilioCanonical(fullUrl, formBody);
  return createHmac("sha1", authToken).update(canonical, "utf8").digest("base64");
}

export function verifyTwilioSignature(args: {
  authToken: string | undefined;
  fullUrl: string;
  formBody: string;
  providedSignature: string | undefined;
}): boolean {
  if (!args.authToken || !args.providedSignature) return false;
  const expected = computeTwilioSignature(
    args.authToken,
    args.fullUrl,
    args.formBody,
  );
  try {
    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(args.providedSignature);
    if (expectedBuf.length !== providedBuf.length) return false;
    return timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}
