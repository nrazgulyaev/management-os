/**
 * Sprint 2 — per-product apex landing.
 *
 * Rendered at `/` when the request host is one of the four product
 * subdomains (matched in middleware.ts → `x-product` header). The
 * existing apex page reads `headers()`, sees a product header, and
 * short-circuits its marketing content to render this instead.
 *
 * Branding per product uses the Stage 10.6.C.1 hero tokens:
 *   - management   → emerald-soft gradient
 *   - development  → gold-soft gradient
 *   - subscription → coral-soft gradient (Sprint 3 fills with real
 *                    sales content; placeholder for now)
 *   - platform     → ink-deep (the platform-admin tone)
 *
 * For the `platform` subdomain we don't render — the consumer (page)
 * should `redirect("/platform")` instead, letting the (platform-app)
 * layout's super_admin gate run. This component handles the three
 * non-redirecting cases.
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProductLandingKind =
  | "management"
  | "development"
  | "subscription";

interface CtaSpec {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
}

interface LandingContent {
  eyebrow: string;
  title: string;
  tagline: string;
  ctas: CtaSpec[];
  bgClass: string;
  isDark?: boolean;
  footer?: string;
}

const CONTENT: Record<ProductLandingKind, LandingContent> = {
  management: {
    eyebrow: "Arconique Management OS",
    title: "Operate every villa as an investment-grade asset.",
    tagline:
      "Bookings, housekeeping, maintenance, owner statements, AI assistants — one operating system, audit-ready by default.",
    ctas: [
      { label: "Log in", href: "/login", variant: "primary" },
      { label: "Try demo cabinets", href: "/dashboard/demo", variant: "secondary" },
    ],
    bgClass: "bg-gradient-emerald-soft",
    footer: "management.arconique.com — the Management OS workspace.",
  },
  development: {
    eyebrow: "Arconique Development OS",
    title: "Build, sell, hand over villas — full-cycle.",
    tagline:
      "Project cycle, BoQ, procurement, investors, sales, and AI agents — the development operating system used by Arconique builders.",
    ctas: [
      { label: "Log in", href: "/login", variant: "primary" },
      { label: "Investor portal", href: "/investor-portal/login", variant: "secondary" },
    ],
    bgClass: "bg-gradient-gold-soft",
    footer: "development.arconique.com — the Development OS workspace.",
  },
  subscription: {
    eyebrow: "Arconique",
    title: "Sales site under construction.",
    tagline:
      "The public sales surface lands in Sprint 3. Pricing, signup, and product overviews live here.",
    ctas: [
      { label: "Pricing", href: "/pricing", variant: "primary" },
      { label: "Contact us", href: "/contact", variant: "secondary" },
    ],
    bgClass: "bg-gradient-coral-soft",
    footer: "subscription.arconique.com — the public sales surface.",
  },
};

export function ProductLanding({ product }: { product: ProductLandingKind }) {
  const c = CONTENT[product];
  return (
    <main
      className={cn(
        "min-h-[100dvh] flex items-center justify-center px-6 py-16",
        c.bgClass,
      )}
      data-stage10="product-landing"
      data-product={product}
    >
      <div className="max-w-2xl w-full flex flex-col items-center text-center gap-6">
        <span className="text-[11px] uppercase tracking-[0.18em] text-ink-tertiary font-medium">
          {c.eyebrow}
        </span>
        <h1 className="text-display text-[40px] md:text-[64px] leading-[1.04] font-medium text-ink tracking-tight">
          {c.title}
        </h1>
        <p className="text-ink-secondary text-base md:text-lg leading-relaxed max-w-xl">
          {c.tagline}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          {c.ctas.map((cta) => {
            const isPrimary = cta.variant !== "secondary";
            return (
              <Link
                key={cta.href}
                href={cta.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-3xl px-6 h-12 text-sm font-medium transition-colors shadow-soft-card",
                  isPrimary
                    ? "bg-ink text-ink-inverse hover:bg-ink/90"
                    : "bg-surface text-ink border border-line-soft hover:bg-muted",
                )}
              >
                {cta.label}
                <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
              </Link>
            );
          })}
        </div>
        {c.footer && (
          <p className="text-xs text-ink-tertiary mt-6">{c.footer}</p>
        )}
      </div>
    </main>
  );
}
