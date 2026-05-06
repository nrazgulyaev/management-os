import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { OwnerPerformanceSummary } from "@/components/owner/owner-performance-summary";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { monthlyRevenueStrip } from "@/lib/mock/metrics";

export const metadata = { title: "Your portfolio" };

const ownedVillas = [
  {
    id: "ev-07",
    name: "Eternal 07",
    project: "Eternal Villas",
    code: "EV-07",
    share: 100,
    ytdRevenue: "Rp 1.96B",
    occupancy: "82.0%",
    lastStatement: "Mar 2026",
  },
  {
    id: "es-s5",
    name: "Enso S5",
    project: "Enso Villas",
    code: "ES-S5",
    share: 100,
    ytdRevenue: "Rp 2.41B",
    occupancy: "89.1%",
    lastStatement: "Mar 2026",
  },
];

const poolHoldings = [
  { project: "Enso Villas", share: 3, ytdDistribution: "Rp 192.6M" },
];

export default function OwnerHome() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Monday · 24 April 2026"
        title="Your portfolio at a glance."
        description="Two owned villas and a 3% share of the Enso pool. Your March 2026 statement has been signed and published."
        actions={
          <Button asChild>
            <Link href="/owner/statements">
              March statement
              <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
            </Link>
          </Button>
        }
      />

      <OwnerPerformanceSummary />

      <Section
        eyebrow="What you can see"
        title="Owner workspace"
        description="Everything in this portal is owner-safe. Guest contact details, lock codes, and other operator-only data are filtered out before they reach you."
        variant="panel"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          {[
            { href: "/owner/calendar", label: "Calendar", hint: "Direct, OTA, owner stays, maintenance — colour-coded." },
            { href: "/owner/bookings", label: "Bookings", hint: "Stay-by-stay financial breakdown for your villas." },
            { href: "/owner/revenue", label: "Revenue", hint: "Direct vs OTA mix, occupancy, ADR, RevPAR." },
            { href: "/owner/statements", label: "Statements", hint: "Monthly statements — the canonical accounting record." },
            { href: "/owner/stays", label: "Owner stays", hint: "Block your villa for personal use." },
            { href: "/owner/inbox", label: "Inbox", hint: "Notifications about your portfolio." },
          ].map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-md border border-line-soft bg-canvas p-4 hover:border-line-strong transition-colors"
            >
              <div className="text-ink font-medium">{c.label}</div>
              <div className="text-xs text-ink-tertiary mt-1">{c.hint}</div>
            </Link>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Performance"
        title="12-month revenue"
        description="Your two villas, combined."
        variant="panel"
      >
        <div className="flex items-end gap-2 h-36 mt-3">
          {monthlyRevenueStrip.map((m, i) => {
            const pct = (m.revenue / 1600) * 100;
            return (
              <div
                key={m.month}
                className="flex-1 flex flex-col items-center gap-2"
              >
                <div className="w-full h-full flex items-end justify-center">
                  <div
                    className={`w-full rounded-sm ${i === monthlyRevenueStrip.length - 1 ? "bg-accent" : "bg-accent/30"}`}
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-ink-tertiary tabular-nums">
                  {m.month}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        eyebrow="Owned villas"
        title="Your villas"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/owner/villas">All villas</Link>
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ownedVillas.map((v) => (
            <Link
              key={v.id}
              href={`/owner/villas#${v.id}`}
              className="group rounded-lg border border-line-soft bg-surface p-6 flex flex-col gap-4 hover:border-line-strong transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink-tertiary">
                  {v.code}
                </span>
                <ArrowUpRight className="w-4 h-4 text-ink-tertiary group-hover:text-ink" />
              </div>
              <div>
                <h3 className="text-display text-[22px] leading-tight font-medium text-ink">
                  {v.name}
                </h3>
                <p className="text-sm text-ink-tertiary mt-1">{v.project}</p>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-line-soft">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                    Share
                  </div>
                  <div className="text-sm font-mono tabular-nums text-ink mt-1">
                    {v.share}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                    YTD revenue
                  </div>
                  <div className="text-sm font-mono tabular-nums text-ink mt-1">
                    {v.ytdRevenue}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                    Occupancy
                  </div>
                  <div className="text-sm font-mono tabular-nums text-ink mt-1">
                    {v.occupancy}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Pool participation"
        title="Pooled holdings"
        description="Shares you hold in pooled projects."
      >
        <div className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
          {poolHoldings.map((p) => (
            <div
              key={p.project}
              className="flex items-center justify-between p-5"
            >
              <div>
                <div className="text-ink font-medium">{p.project} · Pool</div>
                <div className="text-xs text-ink-tertiary mt-0.5">
                  Weighted distribution · monthly
                </div>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                    Share
                  </div>
                  <div className="text-sm font-mono tabular-nums text-ink mt-1">
                    {p.share}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                    YTD distribution
                  </div>
                  <div className="text-sm font-mono tabular-nums text-ink mt-1">
                    {p.ytdDistribution}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
