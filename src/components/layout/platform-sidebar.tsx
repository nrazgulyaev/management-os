"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * pixel-platform-console — dark operator-console sidebar.
 *
 * Mirrors the `cabinets/super-admin/Platform Console.html` mock chrome:
 * brand mark, an "Operator" workspace card, then grouped nav (Customers /
 * Platform). Every entry maps to a real `(platform-app)` route — no dead
 * links (the mock's "Billing · Stripe" item now maps to /platform/billing,
 * the honest pre-PSP billing console — plans / MRR / comp grants only,
 * invoices + payments unlock when Xendit/Stripe land at launch; "Support"
 * went live with migration 0165).
 *
 * All colors are the cross-product alias utilities (bg-surface / bg-muted /
 * text-ink-* / border-line-soft / border-accent) which the
 * `data-surface="platform-os"` remap in tokens.css resolves to the carbon
 * + cool-blue palette. Hidden below lg — the pages remain fully usable
 * full-width on mobile via their own headers.
 */

interface NavItem {
  href: string;
  label: string;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/platform", label: "Console" }],
  },
  {
    label: "Customers",
    items: [
      { href: "/platform/organizations", label: "Organizations" },
      { href: "/platform/support", label: "Support" },
      { href: "/platform/revenue", label: "Revenue" },
      { href: "/platform/usage", label: "Usage" },
      { href: "/platform/plans", label: "Plans & pricing" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/platform/billing", label: "Billing" },
      { href: "/platform/agents", label: "AI agents" },
      { href: "/platform/feature-flags", label: "Feature flags" },
      { href: "/platform/users", label: "Users" },
      { href: "/platform/audit", label: "Audit log" },
      { href: "/platform/system-health", label: "System health" },
    ],
  },
];

function isItemActive(href: string, pathname: string): boolean {
  if (href === "/platform") return pathname === "/platform";
  return pathname === href || pathname.startsWith(href + "/");
}

export function PlatformSidebar() {
  const pathname = usePathname() ?? "";

  // `/platform/<orgCode>` (the per-org console) is a dynamic segment that
  // matches no explicit nav entry — attribute it to Organizations so the
  // operator always sees where they are.
  const anyExplicitActive = NAV.some((g) =>
    g.items.some((i) => isItemActive(i.href, pathname)),
  );
  const orgConsoleFallback =
    !anyExplicitActive &&
    pathname.startsWith("/platform/") &&
    pathname !== "/platform";

  return (
    <aside className="hidden lg:flex flex-col w-[256px] shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-line-soft bg-surface">
      <div className="px-[18px] pt-[18px] pb-3.5">
        <Logo
          href="/platform"
          subtitle="Platform Admin OS"
          title="Arconique Platform Admin OS"
        />
      </div>

      {/* Operator workspace card (mock .sb-workspace) */}
      <div className="mx-[18px] mb-3 rounded-[10px] bg-muted px-3 py-2.5">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-tertiary">
          Operator
        </div>
        <div className="text-display text-[15px] text-ink mt-0.5">
          Platform Admin OS
        </div>
        <div className="text-[11px] text-ink-tertiary mt-0.5 font-mono">
          super_admin · all tenants
        </div>
      </div>

      <nav className="flex-1 pb-6">
        {NAV.map((group) => (
          <div
            key={group.label}
            className="py-2 border-b border-line-soft last:border-b-0"
          >
            <div className="px-[18px] pt-2.5 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-tertiary">
              {group.label}
            </div>
            {group.items.map((item) => {
              const active =
                isItemActive(item.href, pathname) ||
                (orgConsoleFallback &&
                  item.href === "/platform/organizations");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-[7px] text-[13.5px] border-l-2 transition-colors",
                    active
                      ? "border-accent bg-muted text-ink font-medium"
                      : "border-transparent text-ink-secondary hover:bg-muted hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-line-soft">
        <SignOutButton variant="item" />
      </div>
    </aside>
  );
}
