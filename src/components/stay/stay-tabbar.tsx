"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ConciergeBell, MessageCircle, Compass, BookOpen, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "home" | "services" | "concierge" | "explore" | "guide";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; sub: string | null }[] = [
  { id: "home", label: "Stay", icon: Home, sub: null },
  { id: "services", label: "Services", icon: ConciergeBell, sub: "services" },
  { id: "concierge", label: "Concierge", icon: MessageCircle, sub: "concierge" },
  { id: "explore", label: "Explore", icon: Compass, sub: "neighborhood" },
  { id: "guide", label: "Guide", icon: BookOpen, sub: "guide" },
];

// Map a pathname segment to the active tab. Sub-screens reached from
// home (check-in / house-rules / wifi / emergency / requests) keep the
// Stay tab lit, mirroring the mockup's TAB_OF map.
function resolveActive(segment: string | null): TabId {
  switch (segment) {
    case "services":
      return "services";
    case "concierge":
      return "concierge";
    case "neighborhood":
      return "explore";
    case "guide":
      return "guide";
    default:
      return "home";
  }
}

/**
 * StayTabBar — the guest stay portal bottom navigation (mockup: 5 tabs
 * Stay · Services · Concierge · Explore · Guide) plus the floating SOS
 * button. Client component so the active tab + SOS visibility track the
 * route. The check-in full-flow hides the tab bar; concierge + emergency
 * hide the SOS (per the mockup).
 */
export function StayTabBar({ basePath }: { basePath: string }) {
  const pathname = usePathname() ?? "";
  // basePath is `/stay/<token>` or `/stay/demo`. The trailing segment
  // after it identifies the current sub-screen.
  const rel = pathname.startsWith(basePath)
    ? pathname.slice(basePath.length).replace(/^\//, "")
    : "";
  const segment = rel.split("/")[0] || null;
  const active = resolveActive(segment);

  const hideTabbar = segment === "check-in" || segment === "verify";
  const hideSos = segment === "concierge" || segment === "emergency";

  const href = (id: TabId) => {
    const tab = TABS.find((t) => t.id === id);
    return tab?.sub ? `${basePath}/${tab.sub}` : basePath;
  };

  return (
    <>
      {!hideSos && (
        <Link
          href={`${basePath}/emergency`}
          aria-label="Emergency"
          className="fixed right-4 bottom-[104px] z-40 w-[52px] h-[52px] rounded-full bg-surface border border-line flex items-center justify-center shadow-[var(--shadow-card)]"
        >
          <ShieldAlert className="w-[22px] h-[22px] text-danger" strokeWidth={1.8} />
        </Link>
      )}
      {!hideTabbar && (
        <nav className="fixed left-0 right-0 bottom-0 z-[35] h-[88px] glass border-t border-line-soft flex items-start justify-around px-2 pt-3">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const on = active === tab.id;
            return (
              <Link
                key={tab.id}
                href={href(tab.id)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1.5 text-[10.5px] font-medium tracking-tight",
                  on ? "text-terra" : "text-ink-4",
                )}
              >
                <Icon className="w-6 h-6" strokeWidth={1.7} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
