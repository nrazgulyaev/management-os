"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { fieldNav } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { Bell, User } from "lucide-react";

export function FieldShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line-soft bg-canvas/90 backdrop-blur">
        <div className="max-w-[520px] mx-auto flex items-center justify-between px-5 h-14">
          <Logo variant="mark" />
          <div className="flex items-center gap-2">
            <button
              aria-label="Notifications"
              className="h-9 w-9 rounded-full border border-line-soft bg-surface hover:bg-muted inline-flex items-center justify-center text-ink-secondary"
            >
              <Bell className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <button
              aria-label="Profile"
              className="h-9 w-9 rounded-full bg-ink text-ink-inverse text-xs font-medium inline-flex items-center justify-center"
            >
              SW
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-[520px] w-full mx-auto px-5 py-6 pb-24">
        {children}
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-line-soft bg-canvas/95 backdrop-blur">
        <div className="max-w-[520px] mx-auto px-5 h-16 flex items-center justify-around">
          {fieldNav.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/field"
                ? pathname === "/field"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 text-[11px] px-3 py-2 rounded-md transition-colors",
                  active
                    ? "text-ink"
                    : "text-ink-tertiary hover:text-ink"
                )}
              >
                {Icon && <Icon className="w-5 h-5" strokeWidth={1.75} />}
                <span>{item.label}</span>
              </Link>
            );
          })}
          <Link
            href="/login"
            className="flex flex-col items-center gap-0.5 text-[11px] px-3 py-2 rounded-md text-ink-tertiary hover:text-ink transition-colors"
          >
            <User className="w-5 h-5" strokeWidth={1.75} />
            <span>Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
