"use client";

/**
 * Phase 2.1 PR 1 — Development OS mobile tabbar (template 01).
 *
 * Sister of `src/components/dashboard/mobile-tabbar.tsx`. Five slots:
 * Today · Projects · BOQ · AI · More. Reuses the dashboard MoreSheet
 * (pure UI, product-agnostic) with the Dev nav tree.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEV_DASHBOARD_NAV, DEV_PRIMARY_MOBILE_TABS } from "@/config/navigation/development";
import { MobileTabbarMoreSheet } from "@/components/dashboard/mobile-tabbar-more-sheet";

interface PrimaryTab {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const TABS: Record<string, { label: string; icon: React.ReactNode }> = {
  "/development-os": {
    label: "Today",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 12L12 3l9 9" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  "/development-os/projects": {
    label: "Projects",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  "/development-os/boq": {
    label: "BOQ",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    ),
  },
  "/development-os/ai-agents": {
    label: "AI",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v6m0 10v6M4.22 4.22l4.24 4.24m7.08 7.08l4.24 4.24M1 12h6m10 0h6M4.22 19.78l4.24-4.24m7.08-7.08l4.24-4.24" />
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
  if (href === "/development-os") return pathname === "/development-os";
  return pathname === href || pathname.startsWith(href + "/");
}

export function DevelopmentMobileTabbar() {
  const pathname = usePathname() ?? "";
  const [moreOpen, setMoreOpen] = React.useState(false);

  const tabs: PrimaryTab[] = DEV_PRIMARY_MOBILE_TABS.map((href) => {
    const def = TABS[href];
    return {
      href,
      label: def?.label ?? href,
      icon: def?.icon ?? null,
    };
  });

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
        groups={DEV_DASHBOARD_NAV}
        primaryHrefs={DEV_PRIMARY_MOBILE_TABS}
      />
    </>
  );
}
