import "server-only";

/**
 * Stage 5.I — VAPID key access.
 *
 * Keys are env-managed:
 *   VAPID_PUBLIC_KEY  — base64url-encoded ECDH P-256 public key
 *   VAPID_PRIVATE_KEY — base64url-encoded ECDH P-256 private key
 *   VAPID_SUBJECT     — mailto:<contact> string (optional, defaults below)
 *
 * If keys are missing the dispatcher falls into dry-run mode.
 */

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function getVapidKeys(): VapidKeys | null {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  return {
    publicKey: pub,
    privateKey: priv,
    subject: process.env.VAPID_SUBJECT ?? "mailto:hello@arconique.com",
  };
}

export function isPushConfigured(): boolean {
  return getVapidKeys() !== null;
}
