import Link from "next/link";
import { HeroSection } from "@/components/marketing/hero-section";
import { EditorialSection } from "@/components/marketing/editorial-section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollStagger, ScrollStaggerItem } from "@/components/motion/scroll-reveal";
import { CalendarRange, Brush, Wrench, Boxes, KeyRound, BarChart3 } from "lucide-react";

export const metadata = {
  title: "Villa management",
  description:
    "Premium villa management for Bali portfolios — channel mix, housekeeping, maintenance, procurement, smart access, and investor reporting on one platform.",
};

const lifecycle = [
  {
    n: "01",
    icon: CalendarRange,
    title: "Booking & channel mix",
    body: "Direct, Airbnb, Booking.com, Agoda, Expedia, agents — all reservations, fees, and refunds reconciled to the villa.",
  },
  {
    n: "02",
    icon: KeyRound,
    title: "Pre-arrival & smart access",
    body: "Tokenised stay page, smart-lock code released at T-24h, Wi-Fi card, villa guide, concierge online before the guest lands.",
  },
  {
    n: "03",
    icon: Brush,
    title: "Turnover with photo evidence",
    body: "Auto-task on checkout, mobile checklist with required photos, supervisor approval before status returns to ready.",
  },
  {
    n: "04",
    icon: Wrench,
    title: "Maintenance & preventive",
    body: "SLA-tracked tickets, scheduled AC service, pool chemistry, fire safety, structural inspections — automated and archived.",
  },
  {
    n: "05",
    icon: Boxes,
    title: "Inventory & procurement",
    body: "Stock per villa and warehouse, low-stock alerts, purchase requests with approval thresholds, supplier ratings.",
  },
  {
    n: "06",
    icon: BarChart3,
    title: "Finance & owner statements",
    body: "Monthly close in 3 business days. Hash-signed PDF statements. Reserves, management fee, and payouts — all transparent.",
  },
];

export default function VillaManagementPage() {
  return (
    <>
      <HeroSection
        kind="pillar"
        eyebrow="Villa management"
        title="Every villa, run like a hospitality asset."
        description="Channel management, housekeeping, maintenance, procurement, finance, and owner reporting — engineered as one workflow, not seven."
        primaryCta={{ label: "Request management proposal", href: "/contact" }}
        secondaryCta={{ label: "See the owner portal", href: "/owner-portal" }}
      />

      {/* Lifecycle */}
      <EditorialSection
        eyebrow="The villa lifecycle"
        title="Six steps. One platform. No tool-switching."
        description="From the moment a guest enquires to the moment the owner receives a payout, every step lives in Arconique Management OS."
      >
        <ScrollStagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-line-soft border border-line-soft rounded-lg overflow-hidden">
          {lifecycle.map((s) => {
            const Icon = s.icon;
            return (
              <ScrollStaggerItem
                key={s.n}
                className="bg-surface p-6 md:p-7 flex flex-col gap-4 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-md bg-accent-weak text-accent inline-flex items-center justify-center">
                    <Icon className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <span className="font-mono tabular-nums text-[11px] text-ink-tertiary">
                    {s.n}
                  </span>
                </div>
                <div>
                  <h3 className="text-display text-[20px] leading-tight font-medium text-ink">
                    {s.title}
                  </h3>
                  <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
                    {s.body}
                  </p>
                </div>
              </ScrollStaggerItem>
            );
          })}
        </ScrollStagger>
      </EditorialSection>

      {/* Models comparison */}
      <EditorialSection
        eyebrow="Built for three ownership models"
        title="Individual, pooled, hybrid — first-class, never an afterthought."
        description="Switch any villa between models at contract renewal. Historical statements stay intact; rule versions are frozen per period."
        invert
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              t: "Individual",
              s: "One villa, one owner",
              b: "Every cent of revenue and every expense is tied to your villa. Reserves grow against your asset. Best for standalone villas.",
              tone: "outline" as const,
            },
            {
              t: "Pooled",
              s: "One asset, weighted distribution",
              b: "Pool members hold a weighted share of net operating profit. Occupancy smoothing reduces variance. Best for full-complex syndication.",
              tone: "gold" as const,
            },
            {
              t: "Hybrid",
              s: "Villa-specific revenue · shared costs",
              b: "The Arconique default. Individual revenue and direct costs stay with the owner. Shared costs follow a versioned allocation rule.",
              tone: "accent" as const,
            },
          ].map((m) => (
            <div
              key={m.t}
              className="rounded-lg border border-line-soft bg-surface p-7 flex flex-col gap-4"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-display text-[24px] leading-tight font-medium text-ink">
                  {m.t}
                </h3>
                <Badge tone={m.tone}>{m.s}</Badge>
              </div>
              <p className="text-sm text-ink-secondary leading-relaxed">
                {m.b}
              </p>
            </div>
          ))}
        </div>
      </EditorialSection>

      {/* What you get */}
      <EditorialSection
        eyebrow="What you get"
        title="The full operating package."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { t: "Channel management", d: "Airbnb, Booking.com, Agoda, Expedia, direct, agent — synced rates, availability, and reservations." },
            { t: "Housekeeping & turnover", d: "Photo-verified checklists, supervisor approval, linen counts, time-stamped evidence on every stay." },
            { t: "Maintenance & preventive", d: "SLA-tracked tickets, scheduled AC service, pool chemistry, fire safety, structural inspections." },
            { t: "Procurement & inventory", d: "Purchase requests, approval flows, supplier ratings, stock levels per villa and warehouse." },
            { t: "Finance & taxes", d: "PPN, PHR, withholding, management fee, reserves, owner payouts — computed monthly, signed, hashed." },
            { t: "Smart access & cameras", d: "Time-boxed lock codes for guests and staff. Common-area cameras with audit-logged viewing." },
          ].map((row) => (
            <div
              key={row.t}
              className="rounded-md border border-line-soft bg-surface p-5"
            >
              <h3 className="text-base font-medium text-ink">{row.t}</h3>
              <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
                {row.d}
              </p>
            </div>
          ))}
        </div>
      </EditorialSection>

      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 text-center">
          <h2 className="text-display text-[34px] md:text-[52px] leading-[1.04] font-medium max-w-3xl mx-auto">
            Bring us your villa. We'll run it like an asset.
          </h2>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/contact">Start the conversation</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
