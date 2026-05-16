"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardNav } from "@/config/navigation";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";
import { AppSwitcher } from "./app-switcher";

export function DashboardSidebar() {
  const pathname = usePathname();
  // Arconique OS redesign — warm-off-white sidebar (bg-bg), AppSwitcher
  // block between the brand mark and the nav, active-item pill in
  // ink-deep+white per COMPONENTS.md §10. Hidden at <md (mobile uses
  // MobileTabbar from the shell).
  return (
    <aside className="hidden md:flex flex-col w-[248px] shrink-0 border-r border-line bg-bg">
      <div className="px-5 h-16 flex items-center border-b border-line">
        <Logo
          href="/dashboard"
          subtitle="Management OS"
          title="Arconique Management OS"
        />
      </div>
      <div className="px-3 pt-3 pb-1">
        <AppSwitcher className="w-full" />
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-5">
        {dashboardNav.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-1">
            {group.label && (
              <span className="text-[10.5px] uppercase tracking-[0.10em] text-ink-3 font-medium px-2 mb-2">
                {group.label}
              </span>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname === item.href ||
                    pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    // Redesign nav-row — 8px-padded, 12px-radius rows.
                    // Active: ink-deep bg + white text. Inactive:
                    // ink-2 text, ink-3 icon, hover surface-warm.
                    "group relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] transition-colors",
                    active
                      ? "bg-ink-deep text-white"
                      : "text-ink-2 hover:text-ink hover:bg-surface-warm",
                  )}
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        active ? "text-white" : "text-ink-3",
                      )}
                      strokeWidth={1.75}
                    />
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && !active && (
                    <span className="text-[10.5px] font-medium tabular-nums px-2 py-0.5 rounded-full bg-terra-soft text-terra-deep">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <Link
          href="/dashboard/settings"
          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-ink-2 hover:text-ink hover:bg-surface-warm rounded-xl transition-colors"
        >
          <Settings className="w-4 h-4 text-ink-3" strokeWidth={1.75} />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
