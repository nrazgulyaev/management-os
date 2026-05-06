import Link from "next/link";
import { Home, Building, FileText, CreditCard, Folder } from "lucide-react";

/**
 * Server-side buyer portal shell. Distinct from `PortalShell` (investors)
 * and `DevelopmentShell` (operators). Buyers never see internal jargon
 * (no "Development OS", no "Capital account", no "Wallet").
 */
export function BuyerShell({
  buyerName,
  buyerCode,
  children,
}: {
  buyerName: string;
  buyerCode: string;
  children: React.ReactNode;
}) {
  const navItems = [
    { href: "/buyer-portal/dashboard", label: "Dashboard", Icon: Home },
    { href: "/buyer-portal/units", label: "My Villas", Icon: Building },
    { href: "/buyer-portal/reports", label: "Progress reports", Icon: FileText },
    { href: "/buyer-portal/payments", label: "Payments", Icon: CreditCard },
    { href: "/buyer-portal/documents", label: "Documents", Icon: Folder },
  ];
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/buyer-portal/dashboard"
            className="font-display text-xl tracking-wide text-stone-900"
          >
            ARCONIQUE
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <div className="font-medium text-stone-900">{buyerName}</div>
              <div className="text-xs text-stone-500 font-mono">{buyerCode}</div>
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
                  className="flex items-center gap-2 px-3 py-2 rounded text-sm text-stone-700 hover:bg-stone-100"
                >
                  <item.Icon className="w-4 h-4" strokeWidth={1.75} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
