import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getGuestStaySummaryByToken,
  type GuestStaySummary,
  type GuestStayResolveReason,
} from "./services";
import { recordStayAccessEvent } from "./access-log";
import { rateLimitStayTokenAccess } from "./rate-limit";
import { canAccessStayWithoutVerification } from "./verification";
import { hashStayToken } from "./token";

/**
 * Shared 3-block access gate for every `/stay/[token]` content page.
 *
 * Factored out of the six sibling pages (page.tsx, wifi, check-in,
 * concierge, requests, services) so the remaining content pages
 * (offline, house-rules, neighborhood, guide, emergency) apply the
 * SAME protection instead of reading the summary with a bare
 * `if (!ok) notFound()`. Without this gate a raw token URL leaks
 * check-in instructions and emergency / concierge phone numbers
 * pre-verification.
 *
 * The three blocks, in order, mirror the siblings exactly:
 *   1. rate-limit the (tokenPrefix, ip) pair before any resolver DB work;
 *   2. require OTP verification — redirect to `/stay/{token}/verify`
 *      when the token has not been verified;
 *   3. resolve the guest-safe summary and log the access event.
 *
 * Returns a discriminated union so each page keeps rendering its own
 * UI (a rate-limit screen, an unavailable screen / notFound, or the
 * real content). The verification redirect throws (NEXT_REDIRECT) and
 * therefore never returns.
 */
export type GatedStayResult =
  | { kind: "rate_limited"; blockedUntil: string }
  | { kind: "unavailable"; reason: GuestStayResolveReason }
  | { kind: "ok"; summary: GuestStaySummary };

/** Access-event types a content page may record on a successful open. */
export type GatedStaySuccessEvent =
  | { eventType: "opened" }
  | { eventType: "guide_opened"; section?: string }
  | { eventType: "wifi_viewed" };

export async function resolveGatedStay(
  token: string,
  successEvent: GatedStaySuccessEvent = { eventType: "opened" },
): Promise<GatedStayResult> {
  const hdrs = await headers();
  const ua = hdrs.get("user-agent") ?? null;
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // Block 1 — rate limit before any resolver DB work.
  const tokenPrefix = token.slice(0, 8);
  const rl = await rateLimitStayTokenAccess({ tokenPrefix, ip });
  if (!rl.allowed) {
    return { kind: "rate_limited", blockedUntil: rl.blockedUntil.toISOString() };
  }

  // Block 2 — verification gate. Redirect (throws) when unverified.
  const tokenHash = hashStayToken(token);
  const access = await canAccessStayWithoutVerification({ tokenHash });
  if (!access.allowed) {
    redirect(`/stay/${token}/verify`);
  }

  // Block 3 — resolve the guest-safe summary + log the access event.
  const result = await getGuestStaySummaryByToken(token);
  if (!result.ok) {
    await recordStayAccessEvent({
      eventType:
        result.reason === "expired"
          ? "expired_token"
          : result.reason === "revoked"
            ? "revoked_token"
            : "invalid_token",
      ip,
      userAgent: ua,
    });
    return { kind: "unavailable", reason: result.reason };
  }

  const { summary } = result;
  await recordStayAccessEvent({
    guestStayTokenId: summary.base.tokenId,
    bookingId: summary.base.bookingId,
    eventType: successEvent.eventType,
    ip,
    userAgent: ua,
    metadata:
      successEvent.eventType === "guide_opened" && successEvent.section
        ? { section: successEvent.section }
        : null,
  });

  return { kind: "ok", summary };
}
