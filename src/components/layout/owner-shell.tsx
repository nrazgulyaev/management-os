"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ownerNav } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { stopImpersonating } from "@/features/owner-portal/impersonation-actions";

export interface OwnerShellOwnerContext {
  name: string;
  initials: string;
  villasCount: number;
  isImpersonating: boolean;
}

export function OwnerShell({
  children,
  ownerContext,
}: {
  children: React.ReactNode;
  ownerContext: OwnerShellOwnerContext;
}) {
  const pathname = usePathname();
  return (
    // data-product="owner" scopes the owner-portal component CSS
    // (owner-portal.css uses [data-product="owner"] selectors + the --c-*
    // token alias). The owner cabinet is served on the management host, so
    // the html element is data-product="management" — this nested scope is
    // what makes the calendar / villa / docs / settings primitives resolve.
    <div data-product="owner" className="min-h-screen bg-canvas">
      {ownerContext.isImpersonating && (
        <div
          style={{
            background: "var(--terra, #c4583c)",
            color: "var(--cream-warm, #f8f3eb)",
            fontSize: 12,
            padding: "6px 24px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 16,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ fontWeight: 600 }}>OWNER VIEW · DEMO</span>
          <span style={{ opacity: 0.85 }}>Viewing as {ownerContext.name}</span>
          <form action={stopImpersonating}>
            <button
              type="submit"
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.4)",
                color: "inherit",
                fontSize: 11,
                padding: "2px 10px",
                borderRadius: 999,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Operator view →
            </button>
          </form>
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-line-soft bg-canvas/90 backdrop-blur">
        <div className="max-w-[1120px] mx-auto flex items-center justify-between px-6 md:px-8 h-16">
          <Logo subtitle="Owner Portal" title="Arconique Owner Portal" />
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
                    "px-3 py-2 rounded-sm text-sm whitespace-nowrap transition-colors",
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
              <span className="text-sm text-ink">{ownerContext.name}</span>
              <span className="text-[11px] text-ink-tertiary">
                {ownerContext.villasCount}{" "}
                {ownerContext.villasCount === 1 ? "villa" : "villas"}
              </span>
            </div>
            <div className="h-9 w-9 rounded-full bg-gold/90 text-ink-inverse text-sm font-medium inline-flex items-center justify-center">
              {ownerContext.initials}
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
