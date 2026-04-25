"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ownerNav } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";

export function OwnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line-soft bg-canvas/90 backdrop-blur">
        <div className="max-w-[1120px] mx-auto flex items-center justify-between px-6 md:px-8 h-16">
          <Logo />
          <nav className="hidden md:flex items-center gap-1">
            {ownerNav.map((item) => {
              const active =
                item.href === "/owner"
                  ? pathname === "/owner"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-2 rounded-sm text-sm transition-colors",
                    active
                      ? "text-ink"
                      : "text-ink-secondary hover:text-ink"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col text-right leading-tight">
              <span className="text-sm text-ink">Emma Whitmore</span>
              <span className="text-[11px] text-ink-tertiary">
                2 villas · Pool member
              </span>
            </div>
            <div className="h-9 w-9 rounded-full bg-gold/90 text-ink-inverse text-sm font-medium inline-flex items-center justify-center">
              EW
            </div>
            <button
              aria-label="Sign out"
              className="h-9 w-9 rounded-full border border-line-soft bg-surface hover:bg-muted inline-flex items-center justify-center text-ink-secondary transition-colors"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <nav className="md:hidden border-t border-line-soft overflow-x-auto no-scrollbar">
          <div className="flex gap-1 px-4 py-2">
            {ownerNav.map((item) => {
              const active =
                item.href === "/owner"
                  ? pathname === "/owner"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors",
                    active
                      ? "bg-ink text-ink-inverse"
                      : "text-ink-secondary bg-muted"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="max-w-[1120px] mx-auto px-6 md:px-8 py-10">
        {children}
      </main>
    </div>
  );
}
