"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";

// Stage 10.I.3 — Products column added. Old "Platform" group split:
// product entries land in Products; the role-specific surfaces (owner /
// investor / guest / operations) move to Resources for lower priority.
const groups = [
  {
    label: "Products",
    links: [
      { label: "Management OS", href: "/products/management-os" },
      { label: "Development OS", href: "/products/development-os" },
      { label: "Pricing — Management OS", href: "/pricing/management-os" },
      { label: "Pricing — Development OS", href: "/pricing/development-os" },
    ],
  },
  {
    label: "Resources",
    links: [
      { label: "Owner portal", href: "/owner-portal" },
      { label: "Investor reporting", href: "/investor-reporting" },
      { label: "Guest experience", href: "/guest-experience" },
      { label: "Operations", href: "/operations" },
      { label: "Portfolio", href: "/portfolio" },
      { label: "Case studies", href: "/case-studies" },
    ],
  },
  {
    label: "Access",
    links: [
      { label: "Get started free", href: "/signup" },
      { label: "Sign in", href: "/login" },
      { label: "Contact", href: "/contact" },
      { label: "Owner portal", href: "/owner" },
      { label: "Staff field", href: "/field" },
    ],
  },
];

export function PublicFooter() {
  const pathname = usePathname();
  // CHROME-CLEANUP-1 — Per-product landings render their own
  // <MgmtFooter> / <DevFooter> inside the page body. Skip the
  // global PublicFooter on those routes to avoid duplicate chrome.
  if (pathname?.startsWith("/products/")) {
    return null;
  }
  return (
    <footer className="border-t border-line-soft bg-canvas">
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-6">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-4 text-sm text-ink-secondary leading-relaxed max-w-xs">
              The investor-grade operating system for premium Bali villa
              portfolios.
            </p>
          </div>
          {groups.map((g) => (
            <div key={g.label}>
              <h4 className="text-label mb-4">{g.label}</h4>
              <ul className="flex flex-col gap-2.5">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-ink-secondary hover:text-ink transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 pt-8 border-t border-line-soft flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-xs text-ink-tertiary">
            © {new Date().getFullYear()} Arconique. Managed from Bali.
          </p>
          <div className="flex gap-5 text-xs text-ink-tertiary">
            <Link href="/contact" className="hover:text-ink">
              Contact
            </Link>
            <span className="opacity-40">Privacy</span>
            <span className="opacity-40">Terms</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
