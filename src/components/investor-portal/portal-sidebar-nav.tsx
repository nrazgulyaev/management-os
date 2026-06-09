"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  HandCoins,
  FileText,
  User,
  Briefcase,
  TrendingUp,
  PhoneCall,
  Inbox,
} from "lucide-react";

export interface PortalNavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: string;
}

export interface PortalNavGroup {
  title: string;
  items: PortalNavItem[];
}

export interface PortalMobileTab {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

const ICONS = {
  dashboard: LayoutDashboard,
  commitments: Briefcase,
  calls: PhoneCall,
  distributions: HandCoins,
  requests: Inbox,
  forecasts: TrendingUp,
  documents: FileText,
  profile: User,
  wallet: Wallet,
} as const;

/**
 * Client sidebar nav for the investor PortalShell — mirrors the Dev OS
 * engineering mock: grouped sections, lucide icons, an amber count badge,
 * and an active item painted with the amber wash + light-ink label.
 * Active state is path-based (so the shell host can stay a server
 * component); each link is a plain Next <Link>, preserving wiring.
 */
export function PortalSidebarNav({ groups }: { groups: PortalNavGroup[] }) {
  const pathname = usePathname();
  return (
    <div className="flex-1 overflow-y-auto px-3.5 pt-3.5">
      {groups.map((group) => (
        <div key={group.title} className="pb-3.5">
          <div className="px-2.5 pb-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-inverse/40">
            {group.title}
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active =
                item.href === pathname ||
                (item.href !== "/investor-portal/dashboard" &&
                  pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                      active
                        ? "bg-amber/[0.16] text-ink-inverse"
                        : "text-ink-inverse/70 hover:bg-ink-inverse/[0.06] hover:text-ink-inverse",
                    ].join(" ")}
                  >
                    <Icon
                      className={[
                        "h-[18px] w-[18px] shrink-0",
                        active ? "text-amber-soft" : "",
                      ].join(" ")}
                      strokeWidth={1.8}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="rounded-full bg-amber px-[7px] py-px font-mono text-[10px] font-semibold tabular-nums text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Fixed bottom tab bar for the portal on mobile (sidebar is hidden ≤md).
 * Mirrors the mock's `.ip-mtabbar`: blurred light bar, amber-deep active.
 */
export function PortalMobileTabbar({ tabs }: { tabs: PortalMobileTab[] }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[72px] items-start justify-around border-t border-line bg-bg-2/90 px-1.5 pt-2.5 backdrop-blur-lg md:hidden">
      {tabs.map((tab) => {
        const Icon = ICONS[tab.icon];
        const active =
          tab.href === pathname ||
          (tab.href !== "/investor-portal/dashboard" &&
            pathname.startsWith(tab.href));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={[
              "flex flex-1 flex-col items-center gap-1 text-[10px] font-medium",
              active ? "text-amber-deep" : "text-ink-4",
            ].join(" ")}
          >
            <Icon className="h-[23px] w-[23px]" strokeWidth={1.8} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
