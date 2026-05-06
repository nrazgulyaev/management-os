"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { villaWifiCredentials } from "@/lib/db/schema/villa-guides";
import { hashStayToken, hashIpForLog } from "./token";
import { canAccessStayWithoutVerification } from "./verification";
import { getStayByToken } from "./services";
import { rateLimitStayTokenAccess } from "./rate-limit";
import { recordSecurityEvent } from "./security";
import { decryptForGuest } from "@/features/villa-guides/wifi-crypto";
import { presentStubLockToGuest } from "./smart-lock-stub";
import { getActiveStubLockForBooking } from "./smart-lock-stub";

export type RevealOutcome =
  | { ok: true; value: string }
  | { ok: false; reason: "not_verified" | "rate_limited" | "not_found" | "decrypt_failed" | "unavailable" };

/**
 * Server-side reveal of a Wi-Fi password. Requires a fully-verified
 * stay token + the per-IP rate limit. Logs `wifi_viewed` exactly once
 * per call. Plaintext is returned to the caller (the guest UI), never
 * to a tool result or audit metadata.
 */
export async function revealWifiPasswordAction(input: {
  token: string;
  wifiId: string;
}): Promise<RevealOutcome> {
  const { token, wifiId } = input;
  const tokenPrefix = token.slice(0, 8);
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;

  const rl = await rateLimitStayTokenAccess({ tokenPrefix, ip });
  if (!rl.allowed) return { ok: false, reason: "rate_limited" };

  const resolved = await getStayByToken(token);
  if (!resolved.ok) return { ok: false, reason: "not_found" };

  const tokenHash = hashStayToken(token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) return { ok: false, reason: "not_verified" };

  const db = getDb();
  if (!db) return { ok: false, reason: "unavailable" };
  const [row] = await db
    .select()
    .from(villaWifiCredentials)
    .where(eq(villaWifiCredentials.id, wifiId))
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };

  // Authorize: row must be in the guest's villa scope.
  const inScope =
    row.villaId === resolved.stay.villaId ||
    (row.villaId === null && row.projectId === resolved.stay.projectId);
  if (!inScope) return { ok: false, reason: "not_found" };

  let plaintext: string | null = null;
  if (row.passwordCiphertext) {
    const dec = await decryptForGuest(row.passwordCiphertext);
    if (!dec.ok || dec.plaintext === null) {
      return { ok: false, reason: "decrypt_failed" };
    }
    plaintext = dec.plaintext;
  } else if (row.displayPassword) {
    // Legacy fallback — only until the migration sweep clears the column.
    plaintext = row.displayPassword;
  } else {
    return { ok: false, reason: "not_found" };
  }

  await recordSecurityEvent({
    eventType: "wifi_viewed",
    severity: "low",
    guestStayTokenId: resolved.stay.tokenId,
    bookingId: resolved.stay.bookingId,
    ipHash: hashIpForLog(ip),
    userAgent: ua,
    metadata: {
      wifiCredentialId: row.id,
      keyVersion: row.passwordKeyVersion ?? null,
    },
  });

  return { ok: true, value: plaintext };
}

/**
 * Server-side reveal of the smart-lock stub code. Requires verified
 * access + visibility window; logs `lock_code_viewed`.
 */
export async function revealLockCodeAction(input: {
  token: string;
}): Promise<RevealOutcome> {
  const { token } = input;
  const tokenPrefix = token.slice(0, 8);
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;

  const rl = await rateLimitStayTokenAccess({ tokenPrefix, ip });
  if (!rl.allowed) return { ok: false, reason: "rate_limited" };

  const resolved = await getStayByToken(token);
  if (!resolved.ok) return { ok: false, reason: "not_found" };

  const tokenHash = hashStayToken(token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) return { ok: false, reason: "not_verified" };

  const lock = await getActiveStubLockForBooking(resolved.stay.bookingId);
  const view = presentStubLockToGuest(lock);
  if (!view || !view.visible || !view.codeDisplay) {
    return { ok: false, reason: "unavailable" };
  }

  await recordSecurityEvent({
    eventType: "lock_code_viewed",
    severity: "low",
    guestStayTokenId: resolved.stay.tokenId,
    bookingId: resolved.stay.bookingId,
    ipHash: hashIpForLog(ip),
    userAgent: ua,
  });

  return { ok: true, value: view.codeDisplay };
}
