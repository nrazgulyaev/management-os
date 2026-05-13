import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  HardHat,
  Shield,
  Workflow,
  Sparkles,
  LineChart,
  Smartphone,
  KeyRound,
} from "lucide-react";
import { HeroSection } from "@/components/marketing/hero-section";
import { TrustStrip } from "@/components/marketing/trust-strip";
import { Button } from "@/components/ui/button";
import {
  ScrollReveal,
  ScrollStagger,
  ScrollStaggerItem,
} from "@/components/motion/scroll-reveal";
import {
  ProductLanding,
  type ProductLandingKind,
} from "@/components/product-landing/product-landing";

/**
 * Stage 10.I.2 — Umbrella public homepage.
 *
 * Replaces the prior single-product Mgmt-OS landing. Surfaces both
 * products as equal entry points; deep Mgmt-OS marketing moves to
 * /products/management-os in 10.I.3, deep Dev-OS marketing moves to
 * /products/development-os.
 *
 * Brand voice: Professional / investor-grade per 10.I.1 operator
 * decision. Restrained palette, display typeface for headlines only,
 * conversion through clarity not pressure.
 *
 * Sprint 2 update — when the request arrives via a product subdomain
 * (middleware stamps `x-product: management|development|subscription
 * |platform`), this page short-circuits the umbrella marketing and
 * renders a product-specific apex landing instead. `platform` redirects
 * into the platform-admin layout which carries its own super_admin
 * gate.
 */

export const metadata = {
  title: "Arconique OS · One platform for property",
  description:
    "Two operating systems. One platform. Manage every villa and develop every project from a single source of truth — designed for investor-grade trust.",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Sprint 2 — per-product subdomain branch.
  const h = await headers();
  const product = h.get("x-product");
  if (product === "platform") {
    // Hand off to the (platform-app) layout: super_admin → /platform,
    // anonymous → /login?next=/platform, others → /no-product-access.
    redirect("/platform");
  }
  if (
    product === "management" ||
    product === "development" ||
    product === "subscription"
  ) {
    return <ProductLanding product={product as ProductLandingKind} />;
  }
  // Apex `arconique.com` (or any non-product host) — continue with the
  // existing umbrella marketing homepage. (Sprint 5 will hand the apex
  // off to the capital/ project; this code path stays as the transition
  // fallback until then.)
  return <HomePageContent />;
}

function HomePageContent() {
  return (
    <>
      <HeroSection
        eyebrow="Arconique OS"
        title={
          <>
            One platform.{" "}
            <em className="not-italic text-accent italic">
              Two operating systems.
            </em>
          </>
        }
        description="Manage every villa as an investment-grade asset. Develop every project with the same source of truth. Arconique OS is the operating layer for premium property in Southeast Asia — transparent for owners, accountable for investors, intuitive for operators."
        primaryCta={{ label: "Get started free", href: "/signup" }}
        secondaryCta={{ label: "See pricing", href: "/pricing/management-os" }}
      />

      <TrustStrip />

      {/* Two-product picker */}
      <section className="border-b border-line-soft py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <ScrollReveal>
            <div className="max-w-2xl mb-12 md:mb-16">
              <span className="text-label">Choose your product</span>
              <h2 className="mt-4 font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
                Operate, develop, or both.
              </h2>
              <p className="mt-5 text-base md:text-lg text-ink-secondary leading-relaxed">
                The two products share a tenant, an audit trail, and a
                permission model — so a single workspace can run a single
                villa or a 50-villa portfolio with five active developments.
              </p>
            </div>
          </ScrollReveal>

          <ScrollStagger className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
            <ScrollStaggerItem>
              <ProductCard
                icon={Building2}
                tone="accent"
                eyebrow="Arconique Management OS"
                title="Run the portfolio."
                description="Bookings, channels, owner statements, concierge, maintenance, dynamic pricing, AI agents. Everything that keeps a premium villa portfolio running smoothly + transparently."
                features={[
                  "Booking + channel management (7 OTAs)",
                  "Owner statements with line-by-line audit trail",
                  "Concierge AI for guest-facing automation",
                  "Maintenance intelligence + preventive scheduling",
                  "Owner-stay quotas + self-service portal",
                ]}
                learnMoreHref="/products/management-os"
                trialHref="/signup?product=mgmt"
                pricingHref="/pricing/management-os"
              />
            </ScrollStaggerItem>
            <ScrollStaggerItem>
              <ProductCard
                icon={HardHat}
                tone="gold"
                eyebrow="Arconique Development OS"
                title="Build the next one."
                description="Project management, BOQ, drawings, procurement, quality, sales pipeline, investor portal, distributions. Designed for multi-stakeholder villa + condotel developments where every line item must reconcile."
                features={[
                  "BOQ + drawings + revision control",
                  "Procurement → quotation comparison → PO",
                  "QA/QC + method statements + quality standards",
                  "Investor capital ledger + waterfall distributions",
                  "Sales pipeline + buyer portal + contracts",
                ]}
                learnMoreHref="/products/development-os"
                trialHref="/signup?product=dev"
                pricingHref="/pricing/development-os"
              />
            </ScrollStaggerItem>
          </ScrollStagger>
        </div>
      </section>

      {/* Cross-cutting features */}
      <section className="border-b border-line-soft py-20 md:py-28 bg-muted/20">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <ScrollReveal>
            <div className="max-w-2xl mb-12 md:mb-16">
              <span className="text-label">Built for both products</span>
              <h2 className="mt-4 font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
                Infrastructure-grade by default.
              </h2>
              <p className="mt-5 text-base md:text-lg text-ink-secondary leading-relaxed">
                Whether you&apos;re running villas, building them, or both,
                the same platform foundations keep your data tenant-isolated,
                auditable, and fast.
              </p>
            </div>
          </ScrollReveal>

          <ScrollStagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {CROSS_CUTTING_FEATURES.map((f) => (
              <ScrollStaggerItem key={f.title}>
                <FeatureTile
                  icon={f.icon}
                  title={f.title}
                  description={f.description}
                />
              </ScrollStaggerItem>
            ))}
          </ScrollStagger>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <ScrollReveal>
            <div className="rounded-3xl border border-line-soft bg-gradient-emerald-soft shadow-elevated-card p-10 md:p-16 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
              <div className="max-w-xl">
                <span className="text-label">Start a free trial</span>
                <h2 className="mt-3 font-display text-2xl md:text-4xl tracking-[-0.02em] text-ink leading-[1.1]">
                  14 days. No credit card. Real data, real workflows.
                </h2>
                <p className="mt-4 text-sm md:text-base text-ink-secondary leading-relaxed">
                  Provision a workspace in under a minute. Bring your villas
                  or projects. We&apos;ll show you the audit trail.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <Button asChild size="lg">
                  <Link href="/signup">
                    Get started free
                    <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/contact">Talk to sales</Link>
                </Button>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}

const CROSS_CUTTING_FEATURES = [
  {
    icon: Shield,
    title: "Multi-tenant by construction",
    description:
      "Row-level security on every table. Your org's data never leaves your row set, even under operator error.",
  },
  {
    icon: KeyRound,
    title: "Role-based access",
    description:
      "20 internal roles + cabinet-specific dashboards. Operators see what they need; investors see what they're owed.",
  },
  {
    icon: Sparkles,
    title: "AI agents integrated",
    description:
      "9 specialised AI agents (Concierge, QS Cost Analyst, Risk Radar, others). Per-tenant quotas, per-org budgets, audit trail per invocation.",
  },
  {
    icon: LineChart,
    title: "Real-time dashboards",
    description:
      "Bookings, statements, BOQ progress, cashflow forecasts. All recomputed on-the-fly with database-side aggregates.",
  },
  {
    icon: Smartphone,
    title: "Mobile-first field app",
    description:
      "PWA for housekeeping + maintenance + site supervision. Offline-capable. Photos captured at the source, geo-tagged, signed.",
  },
  {
    icon: Workflow,
    title: "API + webhooks",
    description:
      "Per-org API keys, scoped permissions, HMAC-signed webhooks. Connect your own tooling without compromising the audit trail.",
  },
];

function ProductCard({
  icon: Icon,
  tone,
  eyebrow,
  title,
  description,
  features,
  learnMoreHref,
  trialHref,
  pricingHref,
}: {
  icon: typeof Building2;
  tone: "accent" | "gold";
  eyebrow: string;
  title: string;
  description: string;
  features: string[];
  learnMoreHref: string;
  trialHref: string;
  pricingHref: string;
}) {
  const toneBg =
    tone === "accent"
      ? "bg-gradient-emerald-soft"
      : "bg-gradient-gold-soft";
  const toneIconBg =
    tone === "accent"
      ? "bg-accent text-accent-contrast"
      : "bg-gold text-white";
  return (
    <div
      className={`group rounded-3xl border border-line-soft ${toneBg} p-8 md:p-10 flex flex-col gap-6 shadow-soft-card transition-shadow hover:shadow-elevated-card`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-10 h-10 rounded-sm flex items-center justify-center ${toneIconBg}`}
        >
          <Icon className="w-5 h-5" strokeWidth={1.75} />
        </span>
        <span className="text-label">{eyebrow}</span>
      </div>

      <div>
        <h3 className="font-display text-2xl md:text-3xl tracking-[-0.02em] text-ink leading-[1.1]">
          {title}
        </h3>
        <p className="mt-3 text-sm md:text-base text-ink-secondary leading-relaxed">
          {description}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5 text-sm text-ink-secondary">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <span className="w-1 h-1 rounded-full bg-ink-tertiary mt-2 shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-2 flex flex-col sm:flex-row gap-2 flex-wrap">
        <Button asChild>
          <Link href={trialHref}>
            Start free trial
            <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={learnMoreHref}>Learn more</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href={pricingHref}>Pricing</Link>
        </Button>
      </div>
    </div>
  );
}

function FeatureTile({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-line-soft bg-surface p-7 flex flex-col gap-3 h-full shadow-soft-card hover:shadow-elevated-card transition-shadow">
      <span className="w-11 h-11 rounded-full bg-muted flex items-center justify-center">
        <Icon className="w-5 h-5 text-ink-secondary" strokeWidth={1.75} />
      </span>
      <h3 className="font-medium text-base text-ink">{title}</h3>
      <p className="text-sm text-ink-secondary leading-relaxed">
        {description}
      </p>
    </div>
  );
}
