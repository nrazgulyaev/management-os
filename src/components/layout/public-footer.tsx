import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import {
  developmentUrl,
  managementUrl,
  subscriptionUrl,
} from "@/lib/marketing/cross-product-links";

// Stage 10.I.3 — Products column added. Old "Platform" group split:
// product entries land in Products; the role-specific surfaces (owner /
// investor / guest / operations) move to Resources for lower priority.
// All cross-product entries are absolute URLs so the footer renders
// safely from any host without triggering RSC prefetch CORS failures.
// `/login` is shared across all three products; `/contact` lives only
// on subscription.
const groups = [
  {
    label: "Products",
    links: [
      { label: "Management OS", href: managementUrl("/products/management-os") },
      { label: "Development OS", href: developmentUrl("/products/development-os") },
      { label: "Pricing — Management OS", href: subscriptionUrl("/pricing/management-os") },
      { label: "Pricing — Development OS", href: subscriptionUrl("/pricing/development-os") },
    ],
  },
  {
    label: "Resources",
    links: [
      { label: "Owner portal", href: subscriptionUrl("/owner-portal") },
      { label: "Investor reporting", href: subscriptionUrl("/investor-reporting") },
      { label: "Guest experience", href: subscriptionUrl("/guest-experience") },
      { label: "Operations", href: subscriptionUrl("/operations") },
      { label: "Portfolio", href: subscriptionUrl("/portfolio") },
      { label: "Case studies", href: subscriptionUrl("/case-studies") },
    ],
  },
  {
    label: "Access",
    links: [
      { label: "Get started free", href: subscriptionUrl("/signup") },
      { label: "Sign in", href: "/login" },
      { label: "Contact", href: subscriptionUrl("/contact") },
      { label: "Owner portal", href: managementUrl("/owner") },
      { label: "Staff field", href: managementUrl("/field") },
    ],
  },
];

export function PublicFooter() {
  // HF-18 — exclusion now lives at the layout level
  // (src/app/(public)/products/layout.tsx) so it correctly handles
  // middleware-rewritten subdomain traffic. PublicFooter renders
  // unconditionally; the products sub-layout overrides the parent
  // (public) layout that mounts <PublicFooter>.
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
                {g.links.map((l) => {
                  const isExternal = /^https?:\/\//.test(l.href);
                  const className =
                    "text-sm text-ink-secondary hover:text-ink transition-colors";
                  return (
                    <li key={l.href}>
                      {isExternal ? (
                        <a href={l.href} className={className}>
                          {l.label}
                        </a>
                      ) : (
                        <Link href={l.href} className={className}>
                          {l.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 pt-8 border-t border-line-soft flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-xs text-ink-tertiary">
            © {new Date().getFullYear()} Arconique. Managed from Bali.
          </p>
          <div className="flex gap-5 text-xs text-ink-tertiary">
            <a href={subscriptionUrl("/contact")} className="hover:text-ink">
              Contact
            </a>
            <span className="opacity-40">Privacy</span>
            <span className="opacity-40">Terms</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
