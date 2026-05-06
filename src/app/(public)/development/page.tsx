import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section, Container } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollReveal, ScrollStagger, ScrollStaggerItem } from "@/components/motion/scroll-reveal";
import { DevelopmentHero } from "@/components/development/development-hero";
import { LifecycleMap } from "@/components/development/lifecycle-map";
import { ModuleCard } from "@/components/development/module-card";
import { AIAgentCard } from "@/components/development/ai-agent-card";
import { ManagementBridgePreview } from "@/components/development/management-bridge-preview";
import { lifecycleStages } from "@/lib/development/constants";
import { developmentModules } from "@/lib/development/navigation";
import { mockAIAgents } from "@/lib/development/mock-data";

export const metadata: Metadata = {
  title: "Development OS",
  description:
    "AI-powered operating system for full-cycle real estate development — land, design, permits, construction, sales, investor reporting, and handover into Management OS.",
};

const coreModuleSlugs = [
  "projects",
  "finance",
  "quantity-surveying",
  "procurement",
  "site-reports",
  "sales",
  "investors",
  "settings",
];

const coreModuleOverrides: Record<
  string,
  { title: string; description: string }
> = {
  projects: {
    title: "Project setup & land",
    description:
      "Plot due diligence, leasehold structure, zonation, design brief — every project anchored to a single record.",
  },
  finance: {
    title: "Development finance",
    description:
      "Capital calls, drawdowns, vendor payments, 12-month cash plan — investor-grade ledger from day one.",
  },
  "quantity-surveying": {
    title: "QS & estimation",
    description:
      "BoQ, cost estimation, variation orders, valuation runs — benchmarked against past projects.",
  },
  procurement: {
    title: "Procurement & warehouse",
    description:
      "RFQs, vendor scoring, purchase orders, deliveries, on-site stock and material draws.",
  },
  "site-reports": {
    title: "Construction control",
    description:
      "Daily site reports, photo logs, manpower, weather, snag lists — the field reports in, you stay informed.",
  },
  sales: {
    title: "Sales & buyer lifecycle",
    description:
      "Lead capture, qualification, reservations, contracts, payment milestones, handover prep.",
  },
  investors: {
    title: "Investor portal",
    description:
      "Per-investor commitments, drawdowns, distributions, IRR — drillable to every underlying transaction.",
  },
  settings: {
    title: "Management OS bridge",
    description:
      "After handover, the villa transitions into operations — owner pack, agreements, and asset data flow across.",
  },
};

const coreModules = coreModuleSlugs
  .map((slug) => developmentModules.find((m) => m.slug === slug))
  .filter((m): m is NonNullable<typeof m> => Boolean(m))
  .map((m) => ({ ...m, ...coreModuleOverrides[m.slug] }));

export default function DevelopmentPublicPage() {
  const liveAgents = mockAIAgents.filter((a) => a.status === "live");
  const roadmapAgents = mockAIAgents.filter((a) => a.status === "roadmap");

  return (
    <>
      <DevelopmentHero />

      <Container size="wide" className="flex flex-col gap-24 py-20 md:py-28">
        <ScrollReveal>
          <Section
            eyebrow="The lifecycle"
            title="One platform across every stage."
            description="From the first plot of land to the day the keys reach the owner — and beyond, into managed operations and ROI reporting."
          >
            <LifecycleMap stages={lifecycleStages} />
          </Section>
        </ScrollReveal>

        <ScrollReveal>
          <Section
            eyebrow="Core modules"
            title="Eight surfaces, one operating model."
            description="Each module owns one part of the build → sell → operate cycle. They share the same project, ledger, and permission graph — so nothing has to be reconciled twice."
          >
            <ScrollStagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {coreModules.map((m) => (
                <ScrollStaggerItem key={m.id}>
                  <ModuleCard module={m} />
                </ScrollStaggerItem>
              ))}
            </ScrollStagger>
          </Section>
        </ScrollReveal>

        <ScrollReveal>
          <Section
            eyebrow="AI capabilities"
            title="Two AI agents shipping first. Four more on the roadmap."
            description="We are committing only to what we will actually deliver in this wave. The rest of the AI surface area is mapped, scoped, and queued — but not announced as live."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveAgents.map((agent) => (
                <AIAgentCard key={agent.id} agent={agent} />
              ))}
            </div>

            <div className="mt-10 flex flex-col gap-4">
              <div className="flex items-end justify-between flex-wrap gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-label">Coming on the roadmap</span>
                  <p className="text-sm text-ink-secondary max-w-xl">
                    Scoped and prioritized. We will announce each as it ships
                    — not before.
                  </p>
                </div>
                <Badge tone="neutral">{roadmapAgents.length} planned</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {roadmapAgents.map((agent) => (
                  <AIAgentCard
                    key={agent.id}
                    agent={agent}
                    variant="compact"
                  />
                ))}
              </div>
            </div>
          </Section>
        </ScrollReveal>

        <ScrollReveal>
          <Section
            eyebrow="The bridge"
            title="From development into management — without losing a single record."
            description="The same villa that lived in the Development OS during construction continues its life in the Management OS once handover completes. Same identifiers, same ledger lineage, same audit trail."
          >
            <ManagementBridgePreview />
          </Section>
        </ScrollReveal>

        <ScrollReveal>
          <section className="rounded-lg border border-line-soft bg-surface px-6 md:px-10 py-10 md:py-14 flex flex-col items-start gap-5 max-w-4xl mx-auto text-left">
            <span className="text-label">Closing</span>
            <h2 className="text-display text-[26px] md:text-[36px] leading-tight font-medium text-ink">
              Vertically integrated. Data-driven. Built for the next decade of
              Bali development.
            </h2>
            <p className="text-ink-secondary text-base leading-relaxed max-w-2xl">
              Arconique builds, sells, hands over, manages, and reports on the
              same villa across its full life. The Development OS is the upper
              half of that loop. The Management OS is the lower half. Together
              they are how a modern developer should run.
            </p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Button asChild>
                <Link href="/development-os">
                  See the command center
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/villa-management">View Management OS</Link>
              </Button>
            </div>
          </section>
        </ScrollReveal>
      </Container>
    </>
  );
}
