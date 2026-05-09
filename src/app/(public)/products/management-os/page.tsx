import Link from "next/link";
import {
  ArrowUpRight,
  Building,
  Calendar,
  ClipboardCheck,
  CreditCard,
  Gauge,
  HeartHandshake,
  Home,
  KeyRound,
  Sparkles,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { HeroSection } from "@/components/marketing/hero-section";
import { Button } from "@/components/ui/button";
import {
  ScrollReveal,
  ScrollStagger,
  ScrollStaggerItem,
} from "@/components/motion/scroll-reveal";

/**
 * Stage 10.I.3 — Management OS product page.
 *
 * Replaces the previous /villa-management page (308-redirected via
 * next.config). Deep marketing for the Mgmt OS product surface.
 */

export const metadata = {
  title: "Management OS · Arconique",
  description:
    "Operate every villa as an investment-grade asset. Bookings, owner statements, concierge AI, maintenance intelligence — one source of truth for premium villa portfolios.",
};

export default function ManagementOSPage() {
  return (
    <>
      <HeroSection
        eyebrow="Arconique Management OS"
        title={
          <>
            Run the portfolio.{" "}
            <em className="not-italic text-accent italic">Investment-grade.</em>
          </>
        }
        description="Bookings, channels, owner statements, concierge, maintenance, dynamic pricing, AI agents. Built for premium villa portfolios where every line item must reconcile and every guest interaction must hold up to investor scrutiny."
        primaryCta={{ label: "Start free trial", href: "/signup?product=mgmt" }}
        secondaryCta={{ label: "See pricing", href: "/pricing/management-os" }}
        kind="pillar"
      />

      {/* Use cases */}
      <section className="border-b border-line-soft py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <ScrollReveal>
            <div className="max-w-2xl mb-12 md:mb-16">
              <span className="text-label">Built for</span>
              <h2 className="mt-4 font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
                Operators who answer to investors.
              </h2>
            </div>
          </ScrollReveal>
          <ScrollStagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {USE_CASES.map((u) => (
              <ScrollStaggerItem key={u.title}>
                <UseCaseCard
                  icon={u.icon}
                  title={u.title}
                  description={u.description}
                />
              </ScrollStaggerItem>
            ))}
          </ScrollStagger>
        </div>
      </section>

      {/* Feature deep dive */}
      <section className="border-b border-line-soft py-20 md:py-28 bg-muted/20">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <ScrollReveal>
            <div className="max-w-2xl mb-12 md:mb-16">
              <span className="text-label">Capabilities</span>
              <h2 className="mt-4 font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
                Every workflow a portfolio needs.
              </h2>
              <p className="mt-5 text-base md:text-lg text-ink-secondary leading-relaxed">
                Twelve workflows shipped + active. No bolt-ons, no
                third-party glue, no per-feature pricing.
              </p>
            </div>
          </ScrollReveal>
          <ScrollStagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {FEATURES.map((f) => (
              <ScrollStaggerItem key={f.title}>
                <FeatureCard
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
            <div className="rounded-md border border-line-soft bg-surface p-10 md:p-16 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
              <div className="max-w-xl">
                <span className="text-label">Get started</span>
                <h2 className="mt-3 font-display text-2xl md:text-4xl tracking-[-0.02em] text-ink leading-[1.1]">
                  14-day free trial. No credit card. Real workflows.
                </h2>
                <p className="mt-4 text-sm md:text-base text-ink-secondary leading-relaxed">
                  Provision a Management OS workspace, connect a villa,
                  walk the audit trail with us.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <Button asChild size="lg">
                  <Link href="/signup?product=mgmt">
                    Start free trial
                    <ArrowUpRight
                      className="w-4 h-4"
                      strokeWidth={1.75}
                    />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/pricing/management-os">See pricing</Link>
                </Button>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}

const USE_CASES = [
  {
    icon: Home,
    title: "Bali villa portfolios",
    description:
      "Multi-villa hosts who promised investors line-by-line transparency, not a quarterly PDF.",
  },
  {
    icon: Building,
    title: "Boutique hotels",
    description:
      "Properties that outgrew a PMS but aren't ready for enterprise hospitality stacks.",
  },
  {
    icon: KeyRound,
    title: "Vacation rental managers",
    description:
      "Operators running 5–50 properties who need real channel management without per-listing fees.",
  },
  {
    icon: Users,
    title: "Property management cos.",
    description:
      "Companies running portfolios on behalf of owners who need owner-portal trust + line-item audit.",
  },
];

const FEATURES = [
  {
    icon: Calendar,
    title: "Bookings + channel manager",
    description:
      "Booking.com, Airbnb, Trip.com, Agoda, Expedia, VRBO, Hotels.com. Per-villa-per-channel connections, conflict detection, idempotent sync.",
  },
  {
    icon: CreditCard,
    title: "Owner statements",
    description:
      "Line-by-line audit trail. Every revenue + expense + adjustment traceable to its source. Statement transparency by default.",
  },
  {
    icon: HeartHandshake,
    title: "Concierge AI",
    description:
      "Guest-facing AI handoff system. Routes WhatsApp + email + chat. Escalates to human on edge cases. Audit-trail per session.",
  },
  {
    icon: Wrench,
    title: "Maintenance intelligence",
    description:
      "Preventive scheduling, damage reports, vendor coordination. Photo-tagged tasks, geo-checked, signed at completion.",
  },
  {
    icon: Home,
    title: "Owner stays",
    description:
      "Owner-stay quotas, equivalence groups, relocation policies. Self-service portal so owners book their own villa without a phone call.",
  },
  {
    icon: ClipboardCheck,
    title: "Front office",
    description:
      "Arrivals + departures + readiness boards. In-house guest list. Check-in/check-out request inbox. All on a single screen for the front desk.",
  },
  {
    icon: TrendingUp,
    title: "Dynamic pricing",
    description:
      "Rule-set engine for per-villa-per-date rate adjustment. Quote tester before push. Channel-side rate sync.",
  },
  {
    icon: Gauge,
    title: "Direct bookings",
    description:
      "Guest-facing booking flow on your domain. Stripe + manual payment. Owner-portal booking included.",
  },
  {
    icon: Sparkles,
    title: "9 AI agents",
    description:
      "Concierge, Reservations, Marketing, Pricing, Booking-Anomaly, Owner-Stay, Maintenance, Voice, Inbox. Per-org budgets, audit per invocation.",
  },
  {
    icon: Building,
    title: "Multi-property support",
    description:
      "Single workspace, dozens of villas, multiple projects. Org-scoped RLS keeps tenant data isolated by construction.",
  },
  {
    icon: ClipboardCheck,
    title: "Audit log",
    description:
      "Every meaningful mutation across projects, villas, owners, bookings, channels, guests, shares, documents writes an audit row.",
  },
  {
    icon: KeyRound,
    title: "Mobile field app",
    description:
      "PWA for housekeeping + maintenance. Photo capture at the source, geo-tagged, signed. Offline-capable.",
  },
];

function UseCaseCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Home;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-6 flex flex-col gap-3 h-full">
      <span className="w-9 h-9 rounded-sm bg-accent-weak flex items-center justify-center">
        <Icon className="w-4 h-4 text-accent" strokeWidth={1.75} />
      </span>
      <h3 className="font-medium text-sm text-ink">{title}</h3>
      <p className="text-xs text-ink-secondary leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Home;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-6 flex flex-col gap-3 h-full">
      <span className="w-9 h-9 rounded-sm bg-muted flex items-center justify-center">
        <Icon className="w-4 h-4 text-ink-secondary" strokeWidth={1.75} />
      </span>
      <h3 className="font-medium text-base text-ink">{title}</h3>
      <p className="text-sm text-ink-secondary leading-relaxed">
        {description}
      </p>
    </div>
  );
}
