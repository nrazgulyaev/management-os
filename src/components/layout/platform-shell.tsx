import * as React from "react";

/**
 * Platform Admin OS shell.
 *
 * Minimal wrapper that stamps `data-product="management"` on the
 * platform-admin surface so the DS chrome resolves. The Platform Admin OS
 * (the /platform route group) is served on whichever product host the
 * super_admin signed in on (management / development / subscription — see
 * middleware.ts PLATFORM-ROUTING-FIX), and RootLayout only stamps a
 * `data-product` for the three public product surfaces, so /platform
 * traffic previously fell through to bare :root tokens.
 *
 * `management` is the closest palette: it's the operational/admin cream
 * chrome the platform-admin pages were authored against and the default
 * the surface already inherited. This nested scope mirrors the owner-shell
 * pattern (it sets data-product="owner" even on the management host) and
 * activates the [data-product="management"] component CSS + token palette.
 *
 * Deliberately presentation-only: the layout owns auth (super_admin gate),
 * the impersonation banner and the bg-canvas background, so this stays a
 * thin wrapper with no behaviour of its own.
 */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  return <div data-product="management">{children}</div>;
}
