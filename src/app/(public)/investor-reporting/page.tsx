import Link from "next/link";
import { HeroSection } from "@/components/marketing/hero-section";
import { EditorialSection } from "@/components/marketing/editorial-section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ManagementModels } from "@/components/marketing/management-models";
import { AIPayoutExplainer } from "@/components/owner/ai-payout-explainer";
import { OwnerStatementPreview } from "@/components/owner/owner-statement-preview";
import { MetricCard } from "@/components/ui/metric-card";
import { ScrollReveal } from "@/components/motion/scroll-reveal";

export const metadata = { title: "Investor reporting" };

export default function InvestorReportingPage() {
  return (
    <>
      <HeroSection
        kind="pillar"
        eyebrow="Investor reporting"
        title="The clarity of a public REIT. The privacy of a family office."
        description="Monthly statements that reconcile. Pooled-profit distributions documented to the cent. Reserves that grow visibly. An Investor Assistant that cites every number back to the source row."
        primaryCta={{ label: "See a sample statement", href: "/owner/statements" }}
        secondaryCta={{ label: "How the platform works", href: "/villa-management" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-5xl">
          <MetricCard label="Occupancy YTD" value="83.2" unit="%" delta={{ value: 4.6, label: "YoY" }} />
          <MetricCard label="ADR" value="Rp 9.1M" delta={{ value: 3.1, label: "YoY" }} />
          <MetricCard label="RevPAR" value="Rp 7.6M" delta={{ value: 7.9, label: "YoY" }} />
          <MetricCard label="Annualised yield" value="11.4" unit="%" delta={{ value: 0.8, label: "vs plan" }} />
        </div>
      </HeroSection>

      {/* Statement anatomy */}
      <EditorialSection
        eyebrow="The statement"
        title="A complete monthly P&L. Every line drills down to a transaction."
        description="Gross booking revenue, OTA and payment fees, cleaning fees charged to guests, extras, PHR and PPN taxes, utilities, cleaning costs, maintenance, shared cost allocations, management fee, renovation and FF&E reserves, net owner payout — computed and reconciled against bank transactions."
        columns={[
          {
            title: "Revenue",
            body: "Gross nightly revenue, cleaning fees charged to guests, extra services, refunds. Recognised on checkout, FX-snapshotted at posting time.",
          },
          {
            title: "Fees",
            body: "OTA commission by channel, payment processing, bank fees, FX loss, agent commission. Each line points to the specific booking and settlement.",
          },
          {
            title: "Operating costs",
            body: "Utilities, cleaning, toiletries, laundry, maintenance, repairs. Villa-specific or pool-allocated — never silently mixed.",
          },
          {
            title: "Taxes",
            body: "PHR (Bali hospitality tax), PPN (VAT), withholding tax. Filed references attached to each period.",
          },
          {
            title: "Reserves",
            body: "Renovation reserve and FF&E / depreciation reserve contributed monthly. Balances visible, spend requires owner approval above threshold.",
          },
          {
            title: "Management fee",
            body: "Calculated per contract — percentage or fixed. Clearly labelled, never bundled into generic 'management costs'.",
          },
        ]}
      />

      {/* Sample statement */}
      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 md:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-16">
          <div className="lg:col-span-5 lg:sticky lg:top-24 self-start">
            <span className="text-label">Sample owner statement</span>
            <h2 className="text-display text-[32px] md:text-[40px] leading-[1.05] font-medium text-ink mt-3">
              The exact format your owners receive.
            </h2>
            <p className="mt-5 text-ink-secondary leading-relaxed">
              Editorial layout. Tabular numbers. Section subtotals. Hash signed
              on publish. Amendments produce a new statement, never a silent
              rewrite.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Badge tone="success">Hash-signed</Badge>
              <Badge tone="outline">Drill-down per line</Badge>
              <Badge tone="outline">Print-ready PDF</Badge>
              <Badge tone="gold">Demo data</Badge>
            </div>
          </div>
          <div className="lg:col-span-7">
            <ScrollReveal>
              <OwnerStatementPreview editorial={false} />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Models */}
      <EditorialSection
        eyebrow="Three management models"
        title="Same operating system. Three statement shapes."
        description="Whichever ownership structure your villa follows, the platform models it natively. Toggle to see how the same monthly close produces a different statement."
        invert
      >
        <ManagementModels />
      </EditorialSection>

      {/* Pooled distribution */}
      <EditorialSection
        eyebrow="Pooled distribution"
        title="Pool members, resolved to the cent."
        description="Pool members receive a weighted share of net operating profit. The weighting rule is versioned — historical statements always use the rule version active at the period, even when weights are adjusted going forward."
      >
        <div className="rounded-lg border border-line-soft bg-surface p-6 md:p-8">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div>
              <span className="text-label">Enso pool · March 2026 · modelled</span>
              <h3 className="text-display text-[22px] leading-tight font-medium mt-1">
                Pool distribution
              </h3>
            </div>
            <span className="font-mono tabular-nums text-sm text-ink">
              Rp 2.14B · 100% distributed
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {[
              { n: "Takeda Family Office", share: 12, amt: "Rp 256.8M" },
              { n: "Sonoma Capital", share: 24, amt: "Rp 513.6M" },
              { n: "Emma Whitmore", share: 3, amt: "Rp 64.2M" },
              { n: "Arconique GP", share: 8, amt: "Rp 171.2M" },
              { n: "Other pool members (5)", share: 53, amt: "Rp 1.134B" },
            ].map((row) => (
              <div
                key={row.n}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4"
              >
                <span className="text-sm text-ink truncate">{row.n}</span>
                <div className="h-1.5 w-32 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${row.share * 1.5}%` }}
                  />
                </div>
                <span className="font-mono tabular-nums text-sm text-ink text-right w-28">
                  {row.amt}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-tertiary mt-6">
            Demo data. In production each row links to a signed statement PDF
            and bank-confirmed payout.
          </p>
        </div>
      </EditorialSection>

      {/* AI explainer */}
      <EditorialSection
        eyebrow="Investor Assistant"
        title="“Why did my payout change this month?”"
        description="The Investor Assistant answers questions about your statement by citing the exact ledger rows behind the answer. It refuses to invent figures or speculate on returns."
        invert
      >
        <AIPayoutExplainer />
      </EditorialSection>

      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 text-center">
          <h2 className="text-display text-[34px] md:text-[48px] leading-[1.04] font-medium max-w-3xl mx-auto">
            Reporting your accountant will actually enjoy.
          </h2>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Button asChild size="lg">
              <Link href="/owner/statements">See a demo statement</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/contact">Request management proposal</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
