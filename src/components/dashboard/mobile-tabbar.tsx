"use client";

/**
 * Phase 2.1 PR 1 — Management OS mobile tabbar (template 01).
 *
 * Replaces the desktop sidebar at ≤900px (CSS rule lives in
 * `src/styles/components.css`; show/hide bridge inside the same
 * media query in shell.css). Five slots: Today · Bookings · Guests ·
 * Finance · More. The `More` slot opens a Radix bottom sheet listing
 * every other cabinet from `MGMT_DASHBOARD_NAV`.
 *
 * Active state matched against `usePathname()` with prefix logic
 * (own item → exact-or-startsWith) so nested cabinet pages still
 * highlight the right tab.
 *
 * Per spec: `primaryMobileTabs` in `src/config/navigation/management.ts`
 * lists the 4 primary hrefs; label + icon mapping lives here so the
 * config stays JSON-shaped (HF-12 pattern — no component refs in
 * config files).
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MGMT_DASHBOARD_NAV, MGMT_PRIMARY_MOBILE_TABS } from "@/config/navigation/management";
import { MobileTabbarMoreSheet } from "./mobile-tabbar-more-sheet";

interface PrimaryTab {
  href: string;
  label: string;
  icon: React.ReactNode;
}

// Icons hardcoded here (template-matched). Labels mirror the
// "Composition" row in `_handoff/templates/mobile-tabbar.html`.
const TABS: Record<string, { label: string; icon: React.ReactNode }> = {
  "/dashboard": {
    label: "Today",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 12L12 3l9 9" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  "/dashboard/bookings": {
    label: "Bookings",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  "/dashboard/guests": {
    label: "Guests",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
      </svg>
    ),
  },
  "/dashboard/finance": {
    label: "Finance",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
};

const MORE_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </svg>
);

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export function MobileTabbar() {
  const pathname = usePathname() ?? "";
  const [moreOpen, setMoreOpen] = React.useState(false);

  const tabs: PrimaryTab[] = MGMT_PRIMARY_MOBILE_TABS.map((href) => {
    const def = TABS[href];
    return {
      href,
      label: def?.label ?? href,
      icon: def?.icon ?? null,
    };
  });

  // "More" is active iff none of the 4 primary tabs match.
  const moreActive = !tabs.some((t) => isActive(pathname, t.href));

  return (
    <>
      <nav className="mobile-tabbar" aria-label="Primary mobile navigation">
        {tabs.map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`mt-item${active ? " on" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="ic">{t.icon}</span>
              <span className="lbl">{t.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={`mt-item${moreActive ? " on" : ""}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <span className="ic">{MORE_ICON}</span>
          <span className="lbl">More</span>
        </button>
      </nav>
      <MobileTabbarMoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        groups={MGMT_DASHBOARD_NAV}
        primaryHrefs={MGMT_PRIMARY_MOBILE_TABS}
      />
    </>
  );
}
