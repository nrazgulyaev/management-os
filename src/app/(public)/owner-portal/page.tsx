import Link from "next/link";
import { HeroSection } from "@/components/marketing/hero-section";
import { EditorialSection } from "@/components/marketing/editorial-section";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { OwnerStatementPreview } from "@/components/owner/owner-statement-preview";
import { ScrollReveal } from "@/components/motion/scroll-reveal";

export const metadata = { title: "Owner portal" };

export default function OwnerPortalMarketingPage() {
  return (
    <>
      <HeroSection
        kind="pillar"
        eyebrow="Owner portal"
        title="Your villa, the way a private bank shows your assets."
        description="Real-time occupancy, monthly statements, pooled-profit distribution, documents, approvals — designed to feel like a family-office quarterly, not an admin panel."
        primaryCta={{ label: "Open the demo owner portal", href: "/owner" }}
        secondaryCta={{ label: "How we build trust", href: "/investor-reporting" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl">
          <MetricCard
            label="YTD occupancy (modelled)"
            value="83.2"
            unit="%"
            delta={{ value: 4.6, label: "YoY" }}
          />
          <MetricCard
            label="YTD net payouts (demo)"
            value="Rp 7.42B"
            delta={{ value: 8.7, label: "YoY" }}
          />
          <MetricCard
            label="Annualised yield (modelled)"
            value="11.4"
            unit="%"
            delta={{ value: 0.8, label: "vs plan" }}
          />
        </div>
      </HeroSection>

      <EditorialSection
        eyebrow="Inside the portal"
        title="Designed to read like a quarterly, not an admin panel."
        description="Calm typography, editorial layouts, tabular numbers, drill-down into every line of every statement. No operations clutter, no internal jargon."
        columns={[
          {
            title: "Portfolio dashboard",
            body: "Occupancy, ADR, RevPAR, revenue, and net payout across every villa and pool you participate in.",
          },
          {
            title: "Monthly statements",
            body: "Revenue, OTA and payment fees, taxes, utilities, maintenance, management fee, reserves, and net payout. Signed PDFs, archived forever.",
          },
          {
            title: "Drill-down",
            body: "Click any line. See the source bookings, receipts, and allocation rule versions that produced the number.",
          },
          {
            title: "Approvals & documents",
            body: "Sign renovation budgets, approve capex, download contracts and tax certificates.",
          },
        ]}
      />

      {/* Demo statement preview embedded */}
      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 md:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-16">
          <div className="lg:col-span-4">
            <span className="text-label">Sample statement</span>
            <h2 className="text-display text-[32px] md:text-[40px] leading-[1.05] font-medium text-ink mt-3">
              Every line traces back to a transaction.
            </h2>
            <p className="mt-5 text-ink-secondary leading-relaxed">
              The owner portal renders each monthly statement with the same
              typography, hierarchy, and integrity controls as a printed
              audit-grade report. Hash-signed on publish. Amendments produce a
              new statement, never a silent rewrite.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/owner/statements">Open in owner portal</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/investor-reporting">Reporting principles</Link>
              </Button>
            </div>
          </div>
          <div className="lg:col-span-8">
            <ScrollReveal>
              <OwnerStatementPreview editorial={false} />
            </ScrollReveal>
          </div>
        </div>
      </section>

      <EditorialSection
        eyebrow="Trust model"
        title="Every number cited. Every document signed. Every change audited."
        invert
      >
        <ol className="flex flex-col gap-4">
          {[
            {
              t: "Statements are immutable",
              b: "Once published, a statement's hash is recorded. Corrections produce amendment statements, never silent rewrites.",
            },
            {
              t: "Separation of duties",
              b: "Statements are drafted by the Finance Manager and approved by the Director. Payouts require both signatures.",
            },
            {
              t: "AI that quotes, never invents",
              b: "The Investor Assistant answers your questions by citing exact lines of your statement. If the data isn't there, it says so.",
            },
            {
              t: "Your data, scoped",
              b: "Row-level security enforces that you only see your villas, your pools, your documents. Even our staff follow the same boundaries.",
            },
          ].map((item, i) => (
            <li
              key={i}
              className="grid grid-cols-[auto_1fr] gap-5 rounded-md border border-line-soft bg-surface p-5"
            >
              <span className="font-mono tabular-nums text-ink-tertiary text-sm">
                0{i + 1}
              </span>
              <div>
                <h3 className="text-ink font-medium">{item.t}</h3>
                <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">
                  {item.b}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </EditorialSection>

      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 text-center">
          <h2 className="text-display text-[34px] md:text-[48px] leading-[1.04] font-medium max-w-3xl mx-auto">
            View a live demo of the owner portal.
          </h2>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/owner">Open the owner demo</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
