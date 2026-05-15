import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Camera,
  ClipboardList,
  FileSpreadsheet,
  Mic,
  Sparkles,
  Star,
  Users,
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
 * Sprint LD-1 — /products/development-os rebuild.
 *
 * Same award-winning shape as the Mgmt-OS landing, retuned for the
 * developer buyer:
 *   - construction-sunrise photographic hero
 *   - 4 dev-side AI agents, all LIVE today
 *   - 6 cabinet rail (CFO Bookkeeper, QS, PM, Procurement, Site
 *     Supervisor, Investor Portal)
 *   - 6-feature grid emphasising BOQ + investor portal
 *   - laptop-mock band showing the investor portal (since the
 *     investor is the dev-OS buyer's buyer)
 *   - dot-grid (14/14 projects) + concentric rings (cost
 *     composition)
 *   - pricing teaser from PRICING_PLANS development-only column
 *   - final coral CTA band
 */

export const metadata = {
  title: "Development OS · Arconique",
  description:
    "Build the next villa. On budget. On schedule. With investors in the loop. BOQ · Procurement · QA/QC · Investor Portal — the development OS for boutique Bali developers.",
};

const devPlan = PRICING_PLANS.find((p) => p.key === "development-only")!;

export default function DevelopmentOSPage() {
  return (
    <>
      {/* ──────────────────────────────────────────────────────────
         Section 1 — Photographic hero
         ────────────────────────────────────────────────────────── */}
      <PhotographicHero
        bgImageSrc="/landing/hero-construction-sunrise.webp"
        headline={
          <>
            Build the next villa.{" "}
            <em className="not-italic text-gold/95 italic">
              On budget.
            </em>{" "}
            On schedule. With investors in the loop.
          </>
        }
        subhead="BOQ · Procurement · QA/QC · Investor Portal. The development OS for boutique Bali developers."
        primaryCta={{ label: "Start 14-day trial", href: "/onboarding" }}
        secondaryCta={{ label: "See live demo", href: "/demo" }}
        floatingCards={[
          {
            title: "Project budget",
            value: "87% on track",
            subtitle: "12 WPs · 3 watch-listed",
            tone: "emerald",
          },
          {
            title: "BOQ variance",
            value: "+1.2% MTD",
            subtitle: "AI-flagged · 2 items",
            tone: "gold",
          },
          {
            title: "QS anomalies",
            value: "3 flagged today",
            subtitle: "qs-cost-analyst",
            tone: "coral",
          },
          {
            title: "Investor IRR",
            value: "23.4%",
            subtitle: "YTD · 14 LPs",
            tone: "ink-deep",
          },
        ]}
        rating={{
          stars: 5,
          count: 14,
          label: "Bali developers using Arconique today",
        }}
      />

      {/* ──────────────────────────────────────────────────────────
         Section 2 — AI-native band
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
                QS-Cost Analyst, Tax Assistant, Procurement Analyst,
                Daily Construction Digest — all already live, all
                tuned to your project.
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
                  href="/products/development-os#ai"
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
            {DEV_AGENTS.map((a) => (
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
          <div className="max-w-2xl">
            <span className="text-label">Cabinets</span>
            <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
              Every operator. Every cabinet.
            </h2>
            <p className="mt-4 text-base md:text-lg text-ink-secondary leading-relaxed">
              Six Dev-OS cabinets, each tuned to one role. Tap any
              card to walk through the live demo.
            </p>
          </div>
          <div className="-mx-6 md:-mx-8 overflow-x-auto pb-4">
            <ul className="px-6 md:px-8 flex gap-4 md:gap-5 snap-x snap-mandatory">
              {DEV_CABINETS.map((c) => (
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
         Section 4 — Feature grid
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
            {DEV_FEATURES.map((f) => (
              <FeatureCard key={f.title} feature={f} />
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
         Section 5 — Investor preview band (laptop mock)
         ────────────────────────────────────────────────────────── */}
      <section className="border-b border-line-soft py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 flex flex-col gap-10 md:gap-14">
          <div className="max-w-2xl mx-auto text-center">
            <span className="text-label">Investors</span>
            <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
              Investors don't email you for updates anymore.
            </h2>
            <p className="mt-5 text-base md:text-lg text-ink-secondary leading-relaxed">
              Bilingual report-grade portal. Distributions, NAV,
              forecasts. Whenever they want.
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-4xl flex items-center justify-center">
            <div className="relative w-full max-w-3xl aspect-[3/2] rounded-2xl bg-ink shadow-elevated-card overflow-hidden border-[10px] border-ink">
              <Image
                src="/landing/laptop-investor.webp"
                alt="Investor portal dashboard preview"
                fill
                sizes="(min-width: 768px) 720px, 100vw"
                className="object-cover"
              />
            </div>
            <FloatingMockCard
              className="hidden md:flex -left-2 lg:left-6 top-[18%]"
              title="Distribution Oct 2025"
              value="$124,500"
              tone="emerald"
            />
            <FloatingMockCard
              className="hidden md:flex -right-2 lg:right-6 top-[14%]"
              title="Commitment called"
              value="78%"
              tone="gold"
            />
            <FloatingMockCard
              className="hidden md:flex -right-2 lg:right-6 bottom-[14%]"
              title="IRR YTD"
              value="23.4%"
              tone="coral"
            />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
         Section 6 — Social proof
         ────────────────────────────────────────────────────────── */}
      <section className="border-b border-line-soft py-20 md:py-28 bg-muted/20">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-stretch">
          <DotGridStreak
            totalDots={14}
            filledDots={14}
            label="Active development projects"
            sublabel="across $24M total commitment under Arconique today"
            tone="gold"
            columns={14}
          />
          <ConcentricRings
            rings={[
              { label: "$14M", value: "Hard cost", fill: "ink-deep" },
              { label: "$3M", value: "Soft cost", fill: "gold" },
              { label: "$1M", value: "Financing", fill: "emerald" },
              { label: "$0.5M", value: "Operating", fill: "coral" },
            ]}
            heading="Average project cost composition"
            subline="Composite of 14 active developments. The bigger the outer ring, the more leverage on hard-cost discipline."
          />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
         Section 7 — Pricing teaser
         ────────────────────────────────────────────────────────── */}
      <section className="border-b border-line-soft py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 flex flex-col gap-10 md:gap-14">
          <div className="max-w-2xl mx-auto text-center">
            <span className="text-label">Pricing</span>
            <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
              From ${devPlan.tiers[0].monthlyUsd}/mo · 14-day trial · No
              credit card.
            </h2>
            <p className="mt-5 text-base md:text-lg text-ink-secondary leading-relaxed">
              {devPlan.tagline}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {devPlan.tiers
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
         Section 8 — Trial CTA band
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
              leave the Dev OS — no lock-in, no penalty.
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

interface DevAgent {
  title: string;
  description: string;
  live: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const DEV_AGENTS: DevAgent[] = [
  {
    title: "QS Cost Analyst",
    description:
      "Catches unit-cost outliers before they ship to PO. Flags BOQ anomalies daily.",
    live: true,
    icon: BarChart3,
  },
  {
    title: "Procurement Analyst",
    description:
      "Compares quotations side-by-side, picks the right vendor, flags price drifts.",
    live: true,
    icon: ClipboardList,
  },
  {
    title: "Daily Construction Digest",
    description:
      "Yesterday's exceptions, today's plan. Filed at 06:00 to your PM inbox.",
    live: true,
    icon: Sparkles,
  },
  {
    title: "Weekly Construction Plan",
    description:
      "Forward-looking week plan with resource calls, risk callouts, schedule pivots.",
    live: true,
    icon: FileSpreadsheet,
  },
];

interface DevCabinet {
  name: string;
  description: string;
  href: string;
  asset: string;
}

const DEV_CABINETS: DevCabinet[] = [
  {
    name: "CFO Bookkeeper",
    description: "P&L, cash, AR/AP — one cabinet, with the AI tax assistant.",
    href: "/development-os/cabinets/cfo-accountant",
    asset: "/landing/cabinet-preview-cfo.webp",
  },
  {
    name: "QS",
    description: "BOQ under review, anomalies, change orders, specs.",
    href: "/development-os/cabinets/qs",
    asset: "/landing/cabinet-preview-qs.webp",
  },
  {
    name: "Project Manager",
    description: "Portfolio at-risk, kanban pipeline, daily digest.",
    href: "/development-os/cabinets/project-manager",
    asset: "/landing/cabinet-preview-pm.webp",
  },
  {
    name: "Procurement",
    description: "PR queue, RFQ matrix, deliveries, spend MTD.",
    href: "/development-os/cabinets/procurement-manager",
    asset: "/landing/cabinet-preview-procurement.webp",
  },
  {
    name: "Site Supervisor",
    description: "Daily reports, photo evidence, QA/QC inbox.",
    href: "/development-os/cabinets/site-supervisor",
    asset: "/landing/cabinet-preview-sitesupervisor.webp",
  },
  {
    name: "Investor Portal",
    description: "Capital flow, distributions, bilingual reports.",
    href: "/investor-portal/dashboard",
    asset: "/landing/cabinet-preview-investor.webp",
  },
];

interface DevFeature {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  href?: string;
}

const DEV_FEATURES: DevFeature[] = [
  {
    title: "BOQ live tracking",
    description:
      "Excel-paste import, hierarchical sections, revision control. AI-flagged anomalies before they ship.",
    icon: FileSpreadsheet,
    href: "/features/development-os#boq-live-tracking",
  },
  {
    title: "AI cost analyst",
    description:
      "Catches outliers before they ship. Reads unit costs against historical baselines + flags drift.",
    icon: Sparkles,
    href: "/features/development-os#ai-cost-analyst",
  },
  {
    title: "Photo-evidence QA",
    description:
      "Every report cross-referenced. Geo-tagged, signed at completion, photo-tagged inspection trail.",
    icon: Camera,
    href: "/features/development-os#qa-qc",
  },
  {
    title: "Procurement RFQ matrix",
    description:
      "Compare 5 suppliers side-by-side. Price spread + selected-vendor highlighting baked in.",
    icon: ClipboardList,
    href: "/features/development-os#procurement-rfq",
  },
  {
    title: "Investor portal",
    description:
      "Distributions, NAV, bilingual reports. Self-service for LPs — no quarterly email cycle.",
    icon: Users,
    href: "/features/development-os#investor-portal",
  },
  {
    title: "Mobile site supervisor PWA",
    description:
      "Offline reports + voice notes auto-transcribed. Field-first capture, no 4G timeouts.",
    icon: Camera,
    href: "/features/development-os#site-supervisor-pwa",
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
}: DevAgent) {
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
              live ? "bg-success/30 text-success" : "bg-white/15 opacity-80",
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

function CabinetPreviewCard({ cabinet }: { cabinet: DevCabinet }) {
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

function FeatureCard({ feature }: { feature: DevFeature }) {
  const Icon = feature.icon;
  const body = (
    <>
      <span className="w-10 h-10 rounded-full bg-gradient-gold-soft border border-line-soft inline-flex items-center justify-center">
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

function FloatingMockCard({
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
        "absolute w-[200px] rounded-2xl bg-white/95 backdrop-blur-md border border-line-soft shadow-elevated-card p-4 flex-col gap-1.5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full", dot)} aria-hidden />
        <span className="text-[10px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
          {title}
        </span>
      </div>
      <p className="text-base font-mono tabular-nums text-ink leading-tight">
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
