"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { stopImpersonatingInvestor } from "@/features/investor-portal/impersonation-actions";

export interface InvestorShellContext {
  name: string;
  initials: string;
  investorCode: string;
  isImpersonating: boolean;
}

const NAV = [
  { href: "/investor-portal", label: "Overview" },
  { href: "/investor-portal/capital", label: "Capital ledger" },
  { href: "/investor-portal/distributions", label: "Distributions" },
  { href: "/investor-portal/nav", label: "NAV" },
  { href: "/investor-portal/construction", label: "Construction" },
  { href: "/investor-portal/documents", label: "Documents" },
  { href: "/investor-portal/q4-brief", label: "Q-brief" },
];

export function InvestorShell({
  children,
  ctx,
}: {
  children: React.ReactNode;
  ctx: InvestorShellContext;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-canvas">
      {ctx.isImpersonating && (
        <div
          style={{
            background: "var(--forest, #2c3a26)",
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
          <span style={{ fontWeight: 600 }}>INVESTOR VIEW · DEMO</span>
          <span style={{ opacity: 0.85 }}>Viewing as {ctx.name}</span>
          <form action={stopImpersonatingInvestor}>
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
        <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6 md:px-8 h-16">
          <div className="flex items-center gap-3">
            <Logo />
            <span
              style={{
                fontSize: 9,
                letterSpacing: "0.1em",
                background: "var(--forest, #2c3a26)",
                color: "var(--cream-warm, #f8f3eb)",
                padding: "2px 8px",
                borderRadius: 999,
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Investor
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((item) => {
              const active =
                item.href === "/investor-portal"
                  ? pathname === "/investor-portal"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-2 rounded-sm text-sm transition-colors",
                    active ? "text-ink" : "text-ink-secondary hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col text-right leading-tight">
              <span className="text-sm text-ink">{ctx.name}</span>
              <span className="text-[11px] text-ink-tertiary font-mono">
                {ctx.investorCode}
              </span>
            </div>
            <div className="h-9 w-9 rounded-full bg-forest/90 text-cream-warm text-sm font-medium inline-flex items-center justify-center">
              {ctx.initials}
            </div>
            <SignOutButton variant="icon" />
          </div>
        </div>
        <nav className="md:hidden border-t border-line-soft overflow-x-auto no-scrollbar">
          <div className="flex gap-1 px-4 py-2">
            {NAV.map((item) => {
              const active =
                item.href === "/investor-portal"
                  ? pathname === "/investor-portal"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors",
                    active ? "bg-ink text-ink-inverse" : "text-ink-secondary bg-muted",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="max-w-[1200px] mx-auto px-6 md:px-8 py-10">{children}</main>
    </div>
  );
}
