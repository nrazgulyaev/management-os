import Link from "next/link";
import { ArrowRight, MessageSquare, FileSpreadsheet, Building2, Hammer, Wallet, Boxes } from "lucide-react";
import { HeroSection } from "@/components/marketing/hero-section";
import { EditorialSection } from "@/components/marketing/editorial-section";
import { PlatformPreview } from "@/components/marketing/platform-preview";
import { TrustStrip } from "@/components/marketing/trust-strip";
import { PillarGrid } from "@/components/marketing/pillar-grid";
import { ManagementModels } from "@/components/marketing/management-models";
import { ProjectCard } from "@/components/marketing/project-card";
import { CaseStudyCard } from "@/components/marketing/case-study-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollReveal, ScrollStagger, ScrollStaggerItem } from "@/components/motion/scroll-reveal";
import { mockProjects } from "@/lib/mock/projects";
import { caseStudies } from "@/lib/mock/case-studies";

export default function HomePage() {
  return (
    <>
      <HeroSection
        eyebrow="Arconique Management OS"
        title={
          <>
            Manage every villa as an{" "}
            <em className="not-italic text-accent italic">
              investment-grade
            </em>{" "}
            hospitality asset.
          </>
        }
        description="One operating system for premium Bali villa portfolios — from booking and housekeeping to investor statements and pooled-profit distribution. Designed for trust, built for transparency."
        primaryCta={{ label: "Request management proposal", href: "/contact" }}
        secondaryCta={{ label: "View owner portal preview", href: "/owner" }}
      >
        <PlatformPreview />
      </HeroSection>

      <TrustStrip />

      {/* Problem */}
      <EditorialSection
        eyebrow="The problem"
        title="Premium villa management runs on a dozen disconnected tools."
        description="WhatsApp groups for housekeeping, spreadsheets for finance, OTA dashboards for revenue, paper checklists for cleaners, scattered receipts from suppliers, opaque PDFs once a month. Owners can't audit the numbers. Investors lose confidence. Staff lose hours."
      >
        <ScrollStagger className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: MessageSquare,
              title: "Chat-driven operations",
              body: "Turnover lists in WhatsApp threads. Photos lost in scrolls. No accountability.",
            },
            {
              icon: FileSpreadsheet,
              title: "Spreadsheet finance",
              body: "Manual closes, copy-pasted from OTA exports. Errors creep in. Statements drift.",
            },
            {
              icon: Hammer,
              title: "Maintenance amnesia",
              body: "Tickets in inboxes. Preventive schedules forgotten. Same issues recur.",
            },
            {
              icon: Boxes,
              title: "Procurement guesswork",
              body: "Stock counted by feel. Receipts lost. Expense allocation argued every month.",
            },
            {
              icon: Building2,
              title: "Disconnected ownership",
              body: "Pool members, hybrid owners, individuals — all forced into the same statement.",
            },
            {
              icon: Wallet,
              title: "Opaque payouts",
              body: "Owners receive a number, not a story. Disputes follow.",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <ScrollStaggerItem
                key={item.title}
                className="rounded-md border border-line-soft bg-surface p-5"
              >
                <Icon
                  className="w-4 h-4 text-ink-tertiary"
                  strokeWidth={1.75}
                />
                <h3 className="text-ink font-medium text-base mt-3">
                  {item.title}
                </h3>
                <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
                  {item.body}
                </p>
              </ScrollStaggerItem>
            );
          })}
        </ScrollStagger>
      </EditorialSection>

      {/* Solution */}
      <EditorialSection
        eyebrow="The solution"
        title="One operating system, from booking to owner payout."
        description="Arconique Management OS connects every part of villa operations on one data core: bookings, guests, housekeeping, maintenance, procurement, smart access, finance, taxes, payouts, statements, and AI assistants — all permission-aware and investor-grade."
        invert
      >
        <PillarGrid />
      </EditorialSection>

      {/* Management models */}
      <EditorialSection
        eyebrow="Ownership models"
        title="Individual. Pooled. Hybrid. All native, never bolted on."
        description="The platform models all three ownership structures from day one. Switch the toggle to see how the same monthly close produces a different statement for each."
      >
        <ManagementModels />
      </EditorialSection>

      {/* AI section */}
      <EditorialSection
        eyebrow="AI, bounded"
        title="Eight permission-aware assistants. Never an invented number."
        description="Every AI answer cites the source row. Retrieval runs in your auth context — assistants cannot read what you cannot read. Mutating actions require explicit human approval."
        invert
      >
        <ScrollStagger className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { n: "Investor Assistant", d: "Explains your statement with citations. Refuses speculation about returns." },
            { n: "Finance Analyst", d: "Variance detection, narrative drafting, reconciliation flags." },
            { n: "Operations Copilot", d: "Today's turnover risk, SLA prediction, task reassignment proposals." },
            { n: "Guest Concierge", d: "Token-scoped, boutique tone. Never reveals smart-lock codes." },
            { n: "Maintenance Assistant", d: "Resolution drafts grounded in playbooks and warranty notes." },
            { n: "Procurement Assistant", d: "Low-stock forecasts, supplier scoring, draft POs (never auto-sent)." },
            { n: "CRM Assistant", d: "Drafts replies, classifies leads, matches villas to briefs." },
            { n: "Report Writer", d: "Investor letters and ops reports — citations attached, second-eye approval." },
          ].map((a) => (
            <ScrollStaggerItem
              key={a.n}
              className="rounded-md border border-line-soft bg-surface p-5"
            >
              <div className="flex items-center gap-2">
                <span className="text-ink font-medium">{a.n}</span>
                <Badge tone="outline">Permission-aware</Badge>
              </div>
              <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
                {a.d}
              </p>
            </ScrollStaggerItem>
          ))}
        </ScrollStagger>
        <div className="mt-6 text-xs text-ink-tertiary">
          AI providers are not yet wired in this preview build. The assistant
          layer arrives with Versions 3–7 of the implementation roadmap.
        </div>
      </EditorialSection>

      {/* Portfolio */}
      <EditorialSection
        eyebrow="Portfolio"
        title="Three projects on the same operating system."
        description="Eternal Villas, Enso Villas, and Ahau Gardens — each modelling a distinct ownership structure. All three run on one data core, one design language, one trust model."
      >
        <ScrollStagger className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {mockProjects.map((p) => (
            <ScrollStaggerItem key={p.id}>
              <ProjectCard project={p} />
            </ScrollStaggerItem>
          ))}
        </ScrollStagger>
      </EditorialSection>

      {/* Case studies */}
      <EditorialSection
        eyebrow="Case studies"
        title="Modelled scenarios you can audit."
        description="Each project illustrates a distinct management thesis. Numbers are modelled or labelled as demo — full audited figures available under NDA on request."
        invert
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {caseStudies.map((s) => (
            <CaseStudyCard key={s.slug} study={s} />
          ))}
        </div>
      </EditorialSection>

      {/* Final CTA */}
      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-24 md:py-32">
          <ScrollReveal className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16 items-end">
            <div className="md:col-span-7">
              <span className="text-label">Apply to onboard</span>
              <h2 className="text-display text-[40px] md:text-[68px] leading-[1.04] font-medium text-ink mt-4 tracking-tight">
                The operating system for your villa portfolio.
              </h2>
            </div>
            <div className="md:col-span-5 flex flex-col gap-5">
              <p className="text-ink-secondary text-base md:text-lg leading-relaxed">
                Designed for premium Bali portfolios, fractional ownership
                models, and high-trust hospitality operations. We onboard a
                small number of new owners each quarter.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/contact">
                    Request management proposal
                    <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/owner">View owner portal preview</Link>
                </Button>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
