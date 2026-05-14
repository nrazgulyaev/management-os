import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Calendar,
  Camera,
  Globe,
  HeartHandshake,
  Mic,
  Sparkles,
  Star,
  Wrench,
} from "lucide-react";
import {
  ActionPillButton,
  ConcentricRings,
  DotGridStreak,
  PhotographicHero,
} from "@/components/landing";
import { PRICING_PLANS } from "@/lib/marketing/pricing-tiers";
import { cn } from "@/lib/utils";

/**
 * Sprint LD-1 — /products/management-os rebuild.
 *
 * Award-winning landing inspired by three references:
 *  1. VaultX/Mineral — photographic hero with floating preview cards
 *  2. Financial Dashboard — "Hey, need help?" AI band + mic
 *  3. Donezo — emerald accent, mixed card sizes, dark accent cards
 *
 * Composition top → bottom: photographic hero · AI band · cabinet
 * rail · feature grid · phone mock band · social proof (dot grid +
 * concentric rings) · pricing teaser (read from pricing-tiers.ts) ·
 * coral CTA band.
 */

export const metadata = {
  title: "Management OS · Arconique",
  description:
    "Run the entire Bali villa portfolio from one place. Bookings, owner statements, concierge AI — three months to deploy, no villa managers at 2am.",
};

const mgmtPlan = PRICING_PLANS.find((p) => p.key === "management-only")!;

export default function ManagementOSPage() {
  return (
    <>
      {/* ──────────────────────────────────────────────────────────
         Section 1 — Photographic hero
         ────────────────────────────────────────────────────────── */}
      <PhotographicHero
        bgImageSrc="/landing/hero-villa-golden.webp"
        headline={
          <>
            Run the entire Bali villa portfolio{" "}
            <em className="not-italic text-gold/95 italic">
              from one place.
            </em>
          </>
        }
        subhead="Bookings · Owner statements · AI concierge. Three months to deploy. Zero villa managers needed at 2am."
        primaryCta={{ label: "Start 14-day trial", href: "/onboarding" }}
        secondaryCta={{ label: "See live demo", href: "/demo" }}
        floatingCards={[
          {
            title: "Tonight occupancy",
            value: "23 / 28 villas",
            subtitle: "82% — peak season",
            tone: "emerald",
          },
          {
            title: "Owner statement",
            value: "Oct 2025 ready",
            subtitle: "14 owners · auto-sent",
            tone: "gold",
          },
          {
            title: "Concierge AI",
            value: "18 active sessions",
            subtitle: "4 languages · 24/7",
            tone: "coral",
          },
          {
            title: "Today's arrivals",
            value: "6 guests",
            subtitle: "Readiness 100%",
            tone: "sage",
          },
        ]}
        rating={{
          stars: 5,
          count: 200,
          label: "Bali villa portfolios trust Arconique",
        }}
      />

      {/* ──────────────────────────────────────────────────────────
         Section 2 — AI-native band (Hey, need help?)
         ────────────────────────────────────────────────────────── */}
      <section className="border-y border-line-soft bg-gradient-ink-deep text-ink-inverse py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-10 md:gap-14 items-center">
            <div className="flex flex-col gap-5">
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                AI-native by default
              </span>
              <h2 className="font-display text-[44px] md:text-[64px] lg:text-[80px] leading-[1.02] tracking-[-0.02em]">
                Hey, need help?
              </h2>
              <p className="text-base md:text-lg opacity-85 leading-relaxed max-w-xl">
                Just ask Concierge AI — in any language, any channel,
                24/7. Guests get answers in seconds. You get the audit
                trail.
              </p>
              <div className="mt-2 flex flex-col sm:flex-row gap-3 sm:gap-4">
                <ActionPillButton
                  label="Start your trial"
                  href="/onboarding"
                  variant="primary"
                  arrow
                  className="!bg-white !text-ink hover:!bg-white/90"
                />
                <ActionPillButton
                  label="Browse all agents"
                  href="/products/management-os#ai"
                  variant="ghost"
                  icon={Sparkles}
                  className="!text-ink-inverse hover:!opacity-80"
                />
              </div>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="relative w-[260px] h-[260px] md:w-[320px] md:h-[320px]">
                <div className="absolute inset-0 rounded-full border border-white/15" />
                <div className="absolute inset-6 rounded-full border border-white/15" />
                <div className="absolute inset-12 rounded-full border border-white/15" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white text-ink inline-flex items-center justify-center shadow-elevated-card">
                    <Mic className="w-8 h-8 md:w-10 md:h-10" strokeWidth={1.5} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            id="ai"
            className="mt-12 md:mt-16 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4"
          >
            {MGMT_AGENTS.map((a) => (
              <AgentCard
                key={a.title}
                title={a.title}
                description={a.description}
                live={a.live}
                icon={a.icon}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
         Section 3 — Cabinet rail
         ────────────────────────────────────────────────────────── */}
      <section className="border-b border-line-soft py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 flex flex-col gap-10 md:gap-14">
          <div className="flex items-end justify-between gap-6">
            <div className="max-w-2xl">
              <span className="text-label">Cabinets</span>
              <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
                Every operator. Every cabinet.
              </h2>
              <p className="mt-4 text-base md:text-lg text-ink-secondary leading-relaxed">
                Five Mgmt-OS cabinets, each tuned to one role. Tap any
                card to walk through the live demo.
              </p>
            </div>
          </div>
          <div className="-mx-6 md:-mx-8 overflow-x-auto pb-4">
            <ul className="px-6 md:px-8 flex gap-4 md:gap-5 snap-x snap-mandatory">
              {MGMT_CABINETS.map((c) => (
                <li
                  key={c.name}
                  className="snap-start shrink-0 w-[280px] md:w-[320px]"
                >
                  <CabinetPreviewCard cabinet={c} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
         Section 4 — Feature grid (6)
         ────────────────────────────────────────────────────────── */}
      <section className="border-b border-line-soft py-20 md:py-28 bg-muted/20">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 flex flex-col gap-10 md:gap-14">
          <div className="max-w-2xl">
            <span className="text-label">What you get</span>
            <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
              Six workflows. Zero add-ons.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {MGMT_FEATURES.map((f) => (
              <FeatureCard key={f.title} feature={f} />
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
         Section 5 — Phone preview band
         ────────────────────────────────────────────────────────── */}
      <section className="border-b border-line-soft py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 flex flex-col gap-10 md:gap-14">
          <div className="max-w-2xl mx-auto text-center">
            <span className="text-label">Field-first</span>
            <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
              Built for the field. From the field.
            </h2>
            <p className="mt-5 text-base md:text-lg text-ink-secondary leading-relaxed">
              Cleaners, security, supervisors get their own
              offline-first PWA. No login friction. No 4G timeouts.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-3xl flex items-center justify-center">
            <div className="relative w-[280px] md:w-[340px] h-[572px] md:h-[700px] rounded-[44px] bg-ink shadow-elevated-card overflow-hidden border-8 border-ink">
              <Image
                src="/landing/phone-housekeeping.webp"
                alt="Housekeeping mobile PWA preview"
                fill
                sizes="(min-width: 768px) 340px, 280px"
                className="object-cover"
              />
            </div>
            <FloatingFieldCard
              className="hidden md:flex left-[6%] top-[18%]"
              title="Today"
              value="6 / 8 tasks ✓"
              tone="emerald"
            />
            <FloatingFieldCard
              className="hidden md:flex right-[8%] top-[14%]"
              title="Photo synced"
              value="18:42"
              tone="sage"
            />
            <FloatingFieldCard
              className="hidden md:flex left-[8%] bottom-[18%]"
              title="Voice note"
              value="AI transcribed"
              tone="coral"
            />
            <FloatingFieldCard
              className="hidden md:flex right-[6%] bottom-[14%]"
              title="Tomorrow"
              value="4 turnovers ready"
              tone="gold"
            />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
         Section 6 — Social proof (dot grid + concentric rings)
         ────────────────────────────────────────────────────────── */}
      <section className="border-b border-line-soft py-20 md:py-28 bg-muted/20">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-stretch">
          <DotGridStreak
            totalDots={200}
            filledDots={200}
            label="Bali villas under management"
            sublabel="across 14 owner accounts on Arconique"
            tone="emerald"
          />
          <ConcentricRings
            rings={[
              { label: "$14K", value: "MTD revenue", fill: "ink-deep" },
              { label: "$9K", value: "Net to owner", fill: "emerald" },
              { label: "$6K", value: "Direct bookings", fill: "gold" },
              { label: "$4K", value: "Repeat guests", fill: "coral" },
            ]}
            heading="Average villa, after migration"
            subline="Composite of 200+ Bali villas. Direct bookings + repeat-guest share grow once the concierge AI is on."
          />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
         Section 7 — Pricing teaser (from pricing-tiers.ts)
         ────────────────────────────────────────────────────────── */}
      <section className="border-b border-line-soft py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 flex flex-col gap-10 md:gap-14">
          <div className="max-w-2xl mx-auto text-center">
            <span className="text-label">Pricing</span>
            <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
              From ${mgmtPlan.tiers[0].monthlyUsd}/mo · 14-day trial · No
              credit card.
            </h2>
            <p className="mt-5 text-base md:text-lg text-ink-secondary leading-relaxed">
              {mgmtPlan.tagline}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {mgmtPlan.tiers
              .filter((t) => t.key !== "enterprise")
              .map((t) => (
                <PricingTeaserCard
                  key={t.key}
                  name={t.name}
                  monthlyUsd={t.monthlyUsd}
                  pitch={t.pitch}
                  highlight={t.highlight}
                  features={t.features.slice(0, 4)}
                />
              ))}
          </div>
          <div className="flex justify-center">
            <ActionPillButton
              label="See full pricing"
              href="/pricing"
              variant="secondary"
              arrow
              size="lg"
            />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
         Section 8 — Trial CTA band (coral)
         ────────────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <div className="rounded-3xl bg-gradient-coral-soft shadow-elevated-card p-10 md:p-16 flex flex-col items-center text-center gap-6">
            <span className="text-label">Get started</span>
            <h2 className="font-display text-3xl md:text-5xl lg:text-6xl tracking-[-0.02em] text-ink leading-[1.05] max-w-3xl">
              14 days. Every cabinet. No credit card.
            </h2>
            <p className="text-base md:text-lg text-ink-secondary leading-relaxed max-w-xl">
              Cancel anytime. Your data exports as CSV/XLSX if you
              leave — no lock-in, no penalty.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <ActionPillButton
                label="Start your trial"
                href="/onboarding"
                variant="primary"
                arrow
                size="lg"
              />
              <ActionPillButton
                label="See live demo"
                href="/demo"
                variant="secondary"
                size="lg"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ===========================================================================
// Data
// ===========================================================================

interface MgmtAgent {
  title: string;
  description: string;
  live: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const MGMT_AGENTS: MgmtAgent[] = [
  {
    title: "Concierge AI",
    description:
      "Guest-facing. Multilingual. WhatsApp + email + chat. Routes to humans on the edge cases.",
    live: true,
    icon: HeartHandshake,
  },
  {
    title: "Tax Assistant",
    description:
      "Auto-categorises every transaction, splits VAT, drafts journal entries the bookkeeper just approves.",
    live: true,
    icon: Sparkles,
  },
  {
    title: "Front-Office Copilot",
    description:
      "Arrival exceptions, SLA breaches, overdue follow-ups. One AI watching the front desk for you.",
    live: false,
    icon: BellRing,
  },
  {
    title: "Housekeeping Scheduler",
    description:
      "Tomorrow's turnovers, predicted late tasks, supply forecasts. Plans the day before you wake up.",
    live: false,
    icon: Calendar,
  },
];

interface MgmtCabinet {
  name: string;
  description: string;
  href: string;
  asset: string;
  tone: "emerald" | "coral" | "gold" | "sage" | "ink";
}

const MGMT_CABINETS: MgmtCabinet[] = [
  {
    name: "Front Office",
    description: "Tonight's occupancy + arrivals + readiness board.",
    href: "/dashboard/front-office",
    asset: "/landing/cabinet-preview-frontoffice.webp",
    tone: "emerald",
  },
  {
    name: "Concierge",
    description: "Active sessions, handoffs, service-order revenue.",
    href: "/dashboard/concierge",
    asset: "/landing/cabinet-preview-concierge.webp",
    tone: "coral",
  },
  {
    name: "Owner Portal",
    description: "Statements, distributions, owner-stay bookings.",
    href: "/owner",
    asset: "/landing/cabinet-preview-owner.webp",
    tone: "gold",
  },
  {
    name: "Housekeeping",
    description: "Today's turnovers, photos, supply runs.",
    href: "/dashboard/housekeeping",
    asset: "/landing/cabinet-preview-housekeeping.webp",
    tone: "sage",
  },
  {
    name: "Security",
    description: "Camera health, patrols, auth-event timeline.",
    href: "/dashboard/security",
    asset: "/landing/cabinet-preview-security.webp",
    tone: "ink",
  },
];

interface MgmtFeature {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  href?: string;
}

const MGMT_FEATURES: MgmtFeature[] = [
  {
    title: "Multi-channel sync",
    description:
      "Booking.com, Airbnb, direct, and 4 more. Per-villa-per-channel sync with conflict detection.",
    icon: Globe,
    href: "/features/channel-manager",
  },
  {
    title: "Owner statements automation",
    description:
      "One click, sent to owner. Line-by-line audit trail backed by Stripe + bank reconciliation.",
    icon: HeartHandshake,
    href: "/features/owner-statements",
  },
  {
    title: "AI Concierge for guests",
    description:
      "Multilingual, 24/7. Escalates only what truly needs you. Every reply auditable.",
    icon: Sparkles,
    href: "/features/concierge-ai",
  },
  {
    title: "Mobile cleaner PWA",
    description:
      "Offline-first photo upload, voice notes auto-transcribed, geo-tagged completion stamp.",
    icon: Camera,
    href: "/features/mobile-pwa",
  },
  {
    title: "Direct booking website",
    description:
      "Your villa, your URL. Stripe-backed checkout. Channel-conflict-aware availability.",
    icon: Calendar,
    href: "/features/direct-bookings",
  },
  {
    title: "Security & access control",
    description:
      "Digital locks, patrol logs, auth-event timeline. Camera registry — never streams video.",
    icon: Wrench,
    href: "/features/security",
  },
];

// ===========================================================================
// Local components
// ===========================================================================

function AgentCard({
  title,
  description,
  live,
  icon: Icon,
}: MgmtAgent) {
  return (
    <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-md p-5 md:p-6 flex items-start gap-4 hover:bg-white/10 transition-colors">
      <span className="shrink-0 w-10 h-10 rounded-full bg-white/15 inline-flex items-center justify-center">
        <Icon className="w-4 h-4 text-ink-inverse" strokeWidth={1.75} />
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm md:text-base font-medium">{title}</h3>
          <span
            className={cn(
              "text-[10px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full",
              live
                ? "bg-success/30 text-success"
                : "bg-white/15 opacity-80",
            )}
          >
            {live ? "Live" : "Coming soon"}
          </span>
        </div>
        <p className="text-xs md:text-sm opacity-80 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function CabinetPreviewCard({ cabinet }: { cabinet: MgmtCabinet }) {
  return (
    <Link
      href={cabinet.href}
      className="group block w-full h-full rounded-3xl border border-line-soft bg-surface shadow-soft-card hover:shadow-elevated-card transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
    >
      <div className="relative h-[360px] md:h-[400px] w-full">
        <Image
          src={cabinet.asset}
          alt={`${cabinet.name} cabinet preview`}
          fill
          sizes="(min-width: 768px) 320px, 280px"
          className="object-cover"
        />
      </div>
      <div className="p-5 md:p-6 flex flex-col gap-2">
        <h3 className="text-base font-medium text-ink">{cabinet.name}</h3>
        <p className="text-xs md:text-sm text-ink-secondary leading-relaxed line-clamp-2">
          {cabinet.description}
        </p>
        <span className="mt-2 inline-flex items-center gap-1 text-xs text-ink-tertiary group-hover:text-ink transition-colors">
          Tour the cabinet
          <ArrowRight
            className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
            strokeWidth={1.75}
          />
        </span>
      </div>
    </Link>
  );
}

function FeatureCard({ feature }: { feature: MgmtFeature }) {
  const Icon = feature.icon;
  const body = (
    <>
      <span className="w-10 h-10 rounded-full bg-gradient-emerald-soft border border-line-soft inline-flex items-center justify-center">
        <Icon className="w-4 h-4 text-ink" strokeWidth={1.75} />
      </span>
      <h3 className="font-medium text-base text-ink">{feature.title}</h3>
      <p className="text-sm text-ink-secondary leading-relaxed">
        {feature.description}
      </p>
      {feature.href && (
        <span className="mt-auto inline-flex items-center gap-1 text-xs text-ink-tertiary">
          Learn more
          <ArrowRight className="w-3 h-3" strokeWidth={1.75} />
        </span>
      )}
    </>
  );
  const cls =
    "rounded-3xl border border-line-soft bg-surface p-7 flex flex-col gap-3 h-full shadow-soft-card hover:shadow-elevated-card transition-shadow";
  return feature.href ? (
    <Link href={feature.href} className={cn(cls, "hover:border-line-strong")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function FloatingFieldCard({
  title,
  value,
  tone,
  className,
}: {
  title: string;
  value: string;
  tone: "emerald" | "gold" | "coral" | "sage";
  className?: string;
}) {
  const dot =
    tone === "emerald"
      ? "bg-success"
      : tone === "gold"
        ? "bg-gold"
        : tone === "coral"
          ? "bg-warning"
          : "bg-info";
  return (
    <div
      className={cn(
        "absolute w-[180px] rounded-2xl bg-white/95 backdrop-blur-md border border-line-soft shadow-elevated-card p-4 flex-col gap-1.5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full", dot)} aria-hidden />
        <span className="text-[10px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
          {title}
        </span>
      </div>
      <p className="text-sm font-mono tabular-nums text-ink leading-tight">
        {value}
      </p>
    </div>
  );
}

function PricingTeaserCard({
  name,
  monthlyUsd,
  pitch,
  highlight,
  features,
}: {
  name: string;
  monthlyUsd: number | null;
  pitch: string;
  highlight?: boolean;
  features: string[];
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border bg-surface p-7 flex flex-col gap-4 h-full shadow-soft-card",
        highlight
          ? "border-ink ring-1 ring-ink"
          : "border-line-soft hover:shadow-elevated-card transition-shadow",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-medium text-ink">{name}</h3>
        {highlight && (
          <span className="text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-ink text-ink-inverse">
            Recommended
          </span>
        )}
      </div>
      <p className="text-[28px] md:text-[36px] leading-none font-mono tabular-nums text-ink">
        {monthlyUsd === null ? (
          "Custom"
        ) : (
          <>
            ${monthlyUsd}
            <span className="text-sm text-ink-tertiary"> /mo</span>
          </>
        )}
      </p>
      <p className="text-xs text-ink-secondary leading-relaxed">{pitch}</p>
      <ul className="flex flex-col gap-1.5 text-xs text-ink-secondary mt-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Star
              className="w-3 h-3 mt-0.5 fill-current text-gold shrink-0"
              strokeWidth={0}
            />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
