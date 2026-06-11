"use client";

/**
 * Arconique OS redesign — sidebar app switcher.
 *
 * Two-button segmented control between Management OS and Development
 * OS. Replaces the localStorage-backed switcher from the prototype:
 * active product is implicit from the URL (/dashboard vs /development-os),
 * so this is a route-driven control with zero client state of its own.
 *
 * Reference: design_handoff_arconique_os/COMPONENTS.md §10
 * ("App switcher — two-button segmented control between Management
 * and Development. State stored in route, not localStorage").
 *
 * Renders as plain <a> (NOT next/link): the inactive tab always points
 * at the OTHER product, which lives on a different subdomain in
 * production. A <Link> makes the router prefetch the RSC payload, the
 * middleware answers with a cross-subdomain redirect, and the browser
 * kills the follow-up fetch on CORS — console errors on every page
 * where the switcher is visible. A full-document <a> navigation follows
 * the same redirect without CORS. Middle-click / cmd-click / back all
 * keep working with anchors.
 */

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface AppSwitcherProps {
  className?: string;
  /** Override what "Mgmt OS" lands on (defaults to /dashboard). */
  mgmtHref?: string;
  /** Override what "Dev OS" lands on (defaults to /development-os). */
  devHref?: string;
}

export function AppSwitcher({
  className,
  mgmtHref = "/dashboard",
  devHref = "/development-os",
}: AppSwitcherProps) {
  const pathname = usePathname() ?? "";
  const onDev = pathname.startsWith("/development-os");
  const onMgmt = !onDev;

  return (
    <div
      role="tablist"
      aria-label="Active product"
      className={cn(
        "inline-flex items-stretch rounded-full bg-surface-warm border border-line p-1 text-[12.5px] font-medium",
        className,
      )}
      data-primitive="app-switcher"
    >
      <a
        href={mgmtHref}
        role="tab"
        aria-selected={onMgmt}
        className={cn(
          "flex-1 inline-flex items-center justify-center px-3 py-1.5 rounded-full transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-terra",
          onMgmt
            ? "bg-ink-deep text-white"
            : "text-ink-2 hover:text-ink",
        )}
      >
        Mgmt
      </a>
      <a
        href={devHref}
        role="tab"
        aria-selected={onDev}
        className={cn(
          "flex-1 inline-flex items-center justify-center px-3 py-1.5 rounded-full transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-terra",
          onDev
            ? "bg-ink-deep text-white"
            : "text-ink-2 hover:text-ink",
        )}
      >
        Dev
      </a>
    </div>
  );
}
