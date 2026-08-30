/**
 * ICAL-EXPORT-1 — feed-token primitives. Thin neutral-named delegation to the
 * guest-stays token module (documented there as pure, side-effect-free
 * primitives): 32-byte base64url token, SHA-256 hex hash persisted, 8-char
 * display prefix. Raw tokens are shown once and never stored.
 */
export {
  generateStayToken as generateFeedToken,
  hashStayToken as hashFeedToken,
  tokenPrefixFromToken as feedTokenPrefix,
} from "@/features/guest-stays/token";
