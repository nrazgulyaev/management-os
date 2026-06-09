import Link from "next/link";
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
import type { PortalStrings } from "@/lib/investor-portal/translations";

/**
 * Sidebar + topbar shell used by every authenticated investor portal
 * page. Pure server component (no client JS) — relies on standard link
 * navigation; the sign-out and language selector are server actions on
 * the profile page.
 */
export function PortalShell({
  strings,
  investorName,
  investorCode,
  children,
}: {
  strings: PortalStrings;
  investorName: string;
  investorCode: string;
  children: React.ReactNode;
}) {
  const navItems: { href: string; label: string; Icon: typeof Wallet }[] = [
    { href: "/investor-portal/dashboard", label: strings.navDashboard, Icon: LayoutDashboard },
    { href: "/investor-portal/commitments", label: strings.navCommitments, Icon: Briefcase },
    { href: "/investor-portal/capital-calls", label: "Capital calls", Icon: PhoneCall },
    { href: "/investor-portal/distributions", label: strings.navDistributions, Icon: HandCoins },
    { href: "/investor-portal/requests", label: "My requests", Icon: Inbox },
    { href: "/investor-portal/forecasts", label: "Forecasts", Icon: TrendingUp },
    { href: "/investor-portal/documents", label: strings.navDocuments, Icon: FileText },
    { href: "/investor-portal/profile", label: strings.navProfile, Icon: User },
  ];
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line-soft bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/investor-portal/dashboard"
            className="font-display text-xl tracking-wide text-ink"
          >
            ARCONIQUE
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <div className="font-medium text-ink">{investorName}</div>
              <div className="text-xs text-ink-tertiary font-mono">{investorCode}</div>
            </div>
          </div>
        </div>
      </header>
      <div className="flex-1 mx-auto max-w-7xl w-full px-6 py-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <nav className="hidden md:block">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-secondary hover:bg-muted transition-colors"
                >
                  <item.Icon className="w-4 h-4" strokeWidth={1.75} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="space-y-8">{children}</main>
      </div>
      <footer className="border-t border-line-soft bg-surface mt-12">
        <div className="mx-auto max-w-7xl px-6 py-4 text-xs text-ink-tertiary flex items-center justify-between">
          <span>{strings.appTitle}</span>
          <span>Read-only · Contact your account manager for changes.</span>
        </div>
      </footer>
    </div>
  );
}
