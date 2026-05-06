"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Stage 6.P0.4 — shared tab strip for the /development-os/finance hub.
 *
 * Per Q2 decision in [docs/STAGE-6-P0-AUDIT.md], /finance is the
 * bookkeeper's tabbed hub. The actual content lives at separate routes
 * (preserves the existing structure that already works); this strip
 * just provides visual continuity by showing the active tab and
 * letting the user jump between them in one click.
 *
 * The Vendors tab links to /development-os/vendors (top-level, not
 * under /finance) — the entity has its own sidebar item per existing
 * structure. Including it as a tab here is a UX courtesy for the
 * bookkeeper workflow that crosses both hubs.
 */
const TABS = [
  { key: "reports", href: "/development-os/finance", label: "Reports" },
  {
    key: "transactions",
    href: "/development-os/finance/transactions",
    label: "Transactions",
  },
  {
    key: "invoices",
    href: "/development-os/finance/invoices",
    label: "Invoices",
  },
  { key: "vendors", href: "/development-os/vendors", label: "Vendors" },
  {
    key: "categories",
    href: "/development-os/finance/categories",
    label: "Cost categories",
  },
  {
    key: "bank-accounts",
    href: "/development-os/finance/bank-accounts",
    label: "Bank accounts",
  },
] as const;

export function FinanceTabs() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    // Reports is the parent /finance — only active on exact match (not
    // on every /finance/* descendant, since those are their own tabs).
    if (href === "/development-os/finance") {
      return pathname === "/development-os/finance";
    }
    return pathname === href || pathname?.startsWith(href + "/");
  }

  return (
    <nav
      className="flex items-center gap-1 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 border-b border-line-soft"
      aria-label="Finance hub"
      data-testid="finance-tabs"
    >
      {TABS.map((t) => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "shrink-0 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px min-h-[44px] inline-flex items-center",
              active
                ? "text-ink border-ink"
                : "text-ink-secondary border-transparent hover:text-ink hover:border-line-strong",
            )}
            aria-current={active ? "page" : undefined}
            data-testid={`finance-tab-${t.key}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
