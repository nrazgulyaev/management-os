import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  Briefcase,
  ClipboardList,
  FileText,
  HardHat,
  Layers,
  LineChart,
  PencilRuler,
  Receipt,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { HeroSection } from "@/components/marketing/hero-section";
import { Button } from "@/components/ui/button";
import {
  ScrollReveal,
  ScrollStagger,
  ScrollStaggerItem,
} from "@/components/motion/scroll-reveal";

/**
 * Stage 10.I.3 — Development OS product page.
 *
 * Replaces the previous /development page (308-redirected via
 * next.config). Deep marketing for the Dev OS product surface.
 */

export const metadata = {
  title: "Development OS · Arconique",
  description:
    "Build the next villa, condotel, or mixed-use development. Project management, BOQ, drawings, procurement, quality, sales pipeline, investor portal — every line item must reconcile.",
};

export default function DevelopmentOSPage() {
  return (
    <>
      <HeroSection
        eyebrow="Arconique Development OS"
        title={
          <>
            Build the next one.{" "}
            <em className="not-italic text-gold italic">Reconciled.</em>
          </>
        }
        description="Project management, BOQ, drawings, procurement, quality, sales, investor portal, distributions. The operating layer for villa + condotel developments where every stakeholder needs the same source of truth."
        primaryCta={{ label: "Start free trial", href: "/signup?product=dev" }}
        secondaryCta={{ label: "See pricing", href: "/pricing/development-os" }}
        kind="pillar"
      />

      {/* Use cases */}
      <section className="border-b border-line-soft py-20 md:py-28">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8">
          <ScrollReveal>
            <div className="max-w-2xl mb-12 md:mb-16">
              <span className="text-label">Built for</span>
              <h2 className="mt-4 font-display text-3xl md:text-5xl tracking-[-0.02em] text-ink leading-[1.05]">
                Developers running multi-stakeholder projects.
              </h2>
            </div>
          </ScrollReveal>
          <ScrollStagger className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
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
                Every workflow a development needs.
              </h2>
              <p className="mt-5 text-base md:text-lg text-ink-secondary leading-relaxed">
                Project lifecycle, capital ledger, sales pipeline,
                procurement, quality, investor portal — twelve workflows
                under one tenant.
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
            <div className="rounded-3xl border border-line-soft bg-gradient-gold-soft shadow-elevated-card p-10 md:p-16 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
              <div className="max-w-xl">
                <span className="text-label">Get started</span>
                <h2 className="mt-3 font-display text-2xl md:text-4xl tracking-[-0.02em] text-ink leading-[1.1]">
                  14-day free trial. No credit card. Real workflows.
                </h2>
                <p className="mt-4 text-sm md:text-base text-ink-secondary leading-relaxed">
                  Provision a Development OS workspace, set up a project,
                  invite your QS + investors, walk the audit trail.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <Button asChild size="lg">
                  <Link href="/signup?product=dev">
                    Start free trial
                    <ArrowUpRight
                      className="w-4 h-4"
                      strokeWidth={1.75}
                    />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/pricing/development-os">See pricing</Link>
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
    icon: HardHat,
    title: "Real estate developers",
    description:
      "Multi-million-dollar villa + condotel developments where every stakeholder needs the same view of cost, schedule, and quality.",
  },
  {
    icon: Layers,
    title: "Multi-project portfolios",
    description:
      "Developers running 2–10 active projects who need cross-project cashflow + capital views without spreadsheet sprawl.",
  },
  {
    icon: Briefcase,
    title: "Construction companies",
    description:
      "Firms that own delivery + want their procurement, QS, QA/QC, and site reports in one place — not siloed across tools.",
  },
];

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Project management",
    description:
      "Project lifecycle, work packages, decisions log, change orders, risk register. Integrates with the schedule + cashflow surfaces.",
  },
  {
    icon: PencilRuler,
    title: "BOQ + drawings",
    description:
      "Bill of quantities with hierarchical sections + revision control. Drawings registry tied to revisions; one issued-for-construction drawing per slot, DB-enforced.",
  },
  {
    icon: ShieldCheck,
    title: "Quality standards",
    description:
      "Acceptance criteria registry. Method statements with procedure steps. QA/QC inspection workflow with vendor reassignment + reinspection.",
  },
  {
    icon: Receipt,
    title: "Procurement",
    description:
      "Purchase request → quotation → comparison → PO. Vendor performance tracking. Side-by-side quotation comparison with price spread + selected-vendor highlighting.",
  },
  {
    icon: Banknote,
    title: "Capital ledger",
    description:
      "Investor commitments + capital calls + waterfall distributions. Per-investor wallet with line-by-line history. Distribution preview before declaration.",
  },
  {
    icon: Briefcase,
    title: "Sales pipeline",
    description:
      "Lead → reservation → contract. Buyer portal for prospects. Discount-proposal workflow. Lead-source attribution + per-channel conversion analytics.",
  },
  {
    icon: Users,
    title: "Investor portal",
    description:
      "Self-service investor dashboard. Capital account view, distribution history, document downloads, request submission. Trust by visibility.",
  },
  {
    icon: FileText,
    title: "Document extraction",
    description:
      "AI-powered extraction from invoices, bank statements, contracts. Operator review before posting. Cross-checks against the source PDF.",
  },
  {
    icon: Sparkles,
    title: "AI cost analysts",
    description:
      "QS Cost Analyst + Construction Supervisor + Risk Radar agents. Read-only on construction data; surface anomalies in costs, schedule, quality.",
  },
  {
    icon: LineChart,
    title: "Cashflow forecasting",
    description:
      "Project-by-project cashflow with capital + commitments + forecast lines. Burn-down charts, S-curves, forecast vs. actual variance.",
  },
  {
    icon: ClipboardList,
    title: "Cabinet system",
    description:
      "Specialist views: QS, project manager, site supervisor, procurement manager, sales manager, marketing, accountant, warehouse manager. Each surface curated to the role.",
  },
  {
    icon: HardHat,
    title: "Site operations",
    description:
      "Daily site reports, vendor engagements, safety incidents, photo log. Field-staff PWA for site-supervisor capture-at-source.",
  },
];

function UseCaseCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof HardHat;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-line-soft bg-surface p-7 flex flex-col gap-3 h-full shadow-soft-card hover:shadow-elevated-card transition-shadow">
      <span className="w-9 h-9 rounded-sm bg-gold-weak flex items-center justify-center">
        <Icon className="w-4 h-4 text-gold" strokeWidth={1.75} />
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
  icon: typeof HardHat;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-line-soft bg-surface p-7 flex flex-col gap-3 h-full shadow-soft-card hover:shadow-elevated-card transition-shadow">
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
