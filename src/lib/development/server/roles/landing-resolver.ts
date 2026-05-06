import "server-only";

import {
  getCabinetPreferences,
  getUserPrimaryRole,
} from "./role-queries";
import { resolveLandingPageForUser } from "./role-helpers";

/**
 * Stage 5.F — Server-side landing-page resolver.
 *
 * Called from auth callback / middleware after login. Looks up the
 * user's primary role + cabinet preferences and returns the path to
 * redirect to.
 *
 * **UX-only.** RLS still enforces what data each user sees on each
 * cabinet — this only picks the initial landing.
 */
export async function resolveLandingPageForUserId(
  userId: string,
  fallback = "/development-os/dashboard",
): Promise<string> {
  const [primaryRole, prefs] = await Promise.all([
    getUserPrimaryRole(userId),
    getCabinetPreferences(userId),
  ]);
  return resolveLandingPageForUser({
    primaryRole,
    customDefaultCabinet: prefs?.defaultCabinetKey ?? null,
    fallback,
  });
}
