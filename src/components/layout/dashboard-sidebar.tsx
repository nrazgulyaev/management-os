"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardNav } from "@/config/navigation";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";

export function DashboardSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:flex flex-col w-[260px] shrink-0 border-r border-line-soft bg-canvas">
      <div className="px-5 h-16 flex items-center border-b border-line-soft">
        <Logo />
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-6">
        {dashboardNav.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-1">
            {group.label && (
              <span className="text-label px-2 mb-2">{group.label}</span>
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
                    "group relative flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm transition-all",
                    active
                      ? "bg-surface text-ink border border-line-soft shadow-[var(--shadow-flat)]"
                      : "text-ink-secondary hover:text-ink hover:bg-muted"
                  )}
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        active ? "text-ink" : "text-ink-tertiary"
                      )}
                      strokeWidth={1.75}
                    />
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-gold-weak text-gold">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-line-soft p-3">
        <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ink-secondary hover:text-ink hover:bg-muted rounded-sm transition-colors">
          <Settings className="w-4 h-4" strokeWidth={1.75} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
