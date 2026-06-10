import * as React from "react";
import { PlatformSidebar } from "@/components/layout/platform-sidebar";

/**
 * Platform Admin OS shell.
 *
 * Stamps `data-product="platform"` + `data-surface="platform-os"` on the
 * platform-admin surface so the dark operator-console DS chrome resolves.
 * The Platform Admin OS (the /platform route group) is served on whichever
 * product host the super_admin signed in on (management / development /
 * subscription — see middleware.ts PLATFORM-ROUTING-FIX), and RootLayout
 * only stamps a `data-product` for the three public product surfaces, so
 * /platform traffic previously fell through to bare :root tokens.
 *
 * pixel-platform-console: the console is the ONLY dark surface in the
 * product family — carbon surfaces + a cool-blue (#5B9DFF) accent +
 * Space Grotesk / IBM Plex Mono typefaces (cabinets/super-admin/Platform
 * Console.html). The `platform` palette block in tokens.css carries the
 * dark scale; the `data-surface="platform-os"` marker remaps the generic
 * cross-product aliases (--canvas / --surface / --muted / ink scale /
 * lines / semantics / accent + KPI gradients) onto it, so every shared
 * primitive (PageHeader, DashboardKpi, ListTableCard, Table, Badge…)
 * renders dark without per-page restyling. This mirrors the dev-os
 * `data-surface="development-os"` remap pattern.
 *
 * Chrome: mounts the mock's dark sidebar (PlatformSidebar — grouped nav
 * over the real /platform/* routes, hidden below lg). The layout still
 * owns auth (super_admin gate) and the impersonation banner; this shell
 * stays presentation-only.
 */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-product="platform"
      data-surface="platform-os"
      className="flex min-h-screen bg-canvas"
    >
      <PlatformSidebar />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
