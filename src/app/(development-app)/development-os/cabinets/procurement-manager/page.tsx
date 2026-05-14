import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardList,
  FileSpreadsheet,
  Sparkles,
} from "lucide-react";
import { DashboardKpi } from "@/components/ui/primitives";
import {
  HalfDonutGauge,
  HatchedBarChart,
  HeroGreetingAI,
  KpiRowMixed,
  type HatchedBarDatum,
  type KpiItem,
} from "@/components/award";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadProcurementCabinet } from "@/lib/development/server/cabinets/procurement-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Mega-Sprint / Phase 3 — Procurement Manager cabinet on Sprint-4 gold
 * standard. Replaces the Stage-10.5.A.2.3 CabinetGreetingBlock +
 * PageHeaderHero stack with <HeroGreetingAI>, swaps the headline KPI
 * grid for <KpiRowMixed> with a coral-solid hero (PRs awaiting
 * quotation), adds a Today's-pulse row (HatchedBarChart of 7-day PR
 * submissions + HalfDonutGauge for delivered vs ordered), and renders
 * a real inline 3-card grid of recent procurement-analyst outputs.
 */

export const metadata: Metadata = { title: "Procurement manager · Cabinet" };
export const dynamic = "force-dynamic";

function todayLabel(now: Date): string {
  const day = now.getDate();
  const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
  const month = now.toLocaleDateString("en-US", { month: "long" });
  return `${day} · ${weekday}, ${month}`;
}

function bucketLast7Days(
  rows: Array<{ isoDate: string; count: number }>,
  today: Date,
): HatchedBarDatum[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.isoDate, r.count);
  const out: HatchedBarDatum[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const n = counts.get(iso) ?? 0;
    out.push({
      label: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      value: Math.max(n, 1),
      status: n > 0 ? "active" : "inactive",
      caption: n > 0 ? String(n) : undefined,
    });
  }
  return out;
}

function formatSpend(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

export default async function ProcurementCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("procurement-manager");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const data = await safeQuery("procurementCabinet", loadProcurementCabinet(), {
    pendingApprovalsCount: 0,
    quotationsAwaitingComparisonCount: 0,
    posAwaitingDeliveryCount: 0,
    recentDeliveriesCount: 0,
    latestProcurementAnalystOutputCode: null,
    prsLast7Days: [],
    topPendingPrs: [],
    spendMtd: null,
    recentProcurementAnalystOutputs: [],
  });

  const now = new Date();
  const dailyPrs = bucketLast7Days(data.prsLast7Days, now);

  const kpis: KpiItem[] = [
    {
      label: "PRs awaiting quotation",
      value: String(data.pendingApprovalsCount),
      delta:
        data.pendingApprovalsCount === 0
          ? "Inbox clear"
          : `${data.pendingApprovalsCount} need action`,
      href: "/development-os/procurement/purchase-requests",
    },
    {
      label: "RFQs to compare",
      value: String(data.quotationsAwaitingComparisonCount),
      delta:
        data.quotationsAwaitingComparisonCount === 0
          ? "Comparisons complete"
          : `${data.quotationsAwaitingComparisonCount} sets`,
      href: "/development-os/procurement/quotation-comparison",
    },
    {
      label: "Open POs",
      value: String(data.posAwaitingDeliveryCount),
      delta:
        data.posAwaitingDeliveryCount === 0
          ? "No POs in flight"
          : "In transit",
      href: "/development-os/procurement/purchase-orders",
    },
    {
      label: "Spend (MTD)",
      value: formatSpend(data.spendMtd),
      delta:
        data.spendMtd === null
          ? "No POs this month"
          : "PO totals (USD)",
      href: "/development-os/procurement/purchase-orders",
    },
  ];

  // Health gauge: deliveries received in the last 7 days vs the number
  // of POs that should have delivered (open POs + recent deliveries).
  // Pure heuristic — exact KPI lives on the inventory cabinet.
  const deliveryTarget = Math.max(
    1,
    data.posAwaitingDeliveryCount + data.recentDeliveriesCount,
  );
  const deliveryPct = Math.min(
    100,
    Math.round((data.recentDeliveriesCount / deliveryTarget) * 100),
  );

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-8 md:gap-10">
        <HeroGreetingAI
          firstName={firstName}
          role="Procurement Manager · Cabinet"
          dateLabel={todayLabel(now)}
          aiPromptPlaceholder="Compare quotations on a PR or flag a price anomaly."
          showMyTasksHref="/development-os/procurement/purchase-requests"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {[
            {
              href: "/development-os/procurement/purchase-requests/new",
              icon: ClipboardList,
              label: "Raise new PR",
              caption: "Single form · paste-import",
            },
            {
              href: "/development-os/procurement/quotation-comparison",
              icon: FileSpreadsheet,
              label: "Compare quotations",
              caption:
                data.quotationsAwaitingComparisonCount > 0
                  ? `${data.quotationsAwaitingComparisonCount} pending`
                  : "All compared",
            },
            {
              href: "/development-os/ai-agents/procurement-analyst",
              icon: Sparkles,
              label: "AI procurement analyst",
              caption: "Price anomalies · vendor picks",
            },
          ].map(({ href, icon: Icon, label, caption }) => (
            <Link
              key={href}
              href={href}
              className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors"
            >
              <span className="shrink-0 w-10 h-10 rounded-full bg-gradient-coral-soft border border-line-soft inline-flex items-center justify-center">
                <Icon className="w-4 h-4 text-ink" strokeWidth={1.75} />
              </span>
              <span className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium text-ink truncate">
                  {label}
                </span>
                <span className="text-xs text-ink-tertiary truncate">
                  {caption}
                </span>
              </span>
              <ArrowUpRight
                className="w-4 h-4 text-ink-tertiary shrink-0"
                strokeWidth={1.75}
              />
            </Link>
          ))}
        </div>

        <KpiRowMixed kpis={kpis} heroTone="coral-solid" />

        <Section
          eyebrow="Today's pulse"
          title="PR cadence + delivery health"
          description="Daily purchase-request submissions over the last 7 days, alongside the share of recent deliveries against open POs."
        >
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 md:gap-5">
            <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                  Last 7 days
                </span>
                <span className="text-xs text-ink-tertiary tabular-nums">
                  {data.recentDeliveriesCount} deliveries
                </span>
              </div>
              <HatchedBarChart
                data={dailyPrs}
                tone="terracotta"
                height={200}
              />
            </div>
            <HalfDonutGauge
              variant="gold"
              value={deliveryPct}
              max={100}
              label={
                <>
                  <p className="text-display text-[28px] md:text-[36px] leading-none font-medium text-ink tabular-nums">
                    {deliveryPct}%
                  </p>
                  <p className="text-xs text-ink-tertiary mt-1">
                    Delivered vs in-flight
                  </p>
                </>
              }
              legend={[
                { label: `${data.recentDeliveriesCount} delivered` },
                {
                  label: `${data.posAwaitingDeliveryCount} in flight`,
                  color: "var(--line-strong)",
                },
              ]}
            />
          </div>
        </Section>

        <Section
          eyebrow="AI"
          title="Procurement analyst — recent outputs"
          description="Latest price-anomaly + vendor-pick suggestions from the procurement-analyst agent."
          action={
            <Link
              href="/development-os/ai-agents/procurement-analyst"
              className="text-xs text-ink-tertiary hover:underline"
            >
              Open agent →
            </Link>
          }
        >
          {data.recentProcurementAnalystOutputs.length === 0 ? (
            <div className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                Recent runs
              </span>
              <p className="text-sm leading-relaxed opacity-90">
                No outputs yet. Trigger the procurement-analyst agent
                from Jobs or via the AI prompt above to surface price-
                anomaly flags + recommended vendor picks here.
              </p>
              <Badge tone="outline" className="self-start">
                Run the agent to populate
              </Badge>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
              {data.recentProcurementAnalystOutputs.map((o) => (
                <Link
                  key={o.outputCode}
                  href={`/development-os/ai-agents/procurement-analyst/outputs/${o.outputCode}`}
                  className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3 hover:bg-muted/40 transition-colors min-h-[180px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary">
                      {o.outputCode}
                    </span>
                    <ArrowUpRight
                      className="w-4 h-4 text-ink-tertiary"
                      strokeWidth={1.75}
                    />
                  </div>
                  <h4 className="text-sm font-medium text-ink line-clamp-2">
                    {o.title}
                  </h4>
                  <p className="text-xs text-ink-secondary leading-relaxed line-clamp-4">
                    {o.summary}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Section
              eyebrow="Pipeline"
              title="Pending purchase requests"
              description="Most-recent PRs awaiting approval or quotation."
            >
              {data.topPendingPrs.length === 0 ? (
                <div className="rounded-md border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
                  No pending PRs. New requests will appear here as they
                  arrive.
                </div>
              ) : (
                <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                  {data.topPendingPrs.map((pr) => (
                    <li key={pr.id}>
                      <Link
                        href={`/development-os/procurement/purchase-requests/${pr.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-hover"
                      >
                        <span className="flex flex-col min-w-0">
                          <span className="font-mono text-xs text-ink-tertiary">
                            {pr.prCode ?? pr.id.slice(0, 8)}
                          </span>
                          <span className="text-sm text-ink truncate">
                            {pr.title ?? "—"}
                          </span>
                        </span>
                        <Badge
                          tone={
                            pr.status === "awaiting_approval"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {pr.status}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <aside>
            <Section
              eyebrow="Pipeline"
              title="Jump to"
              description="Cross-link to the surfaces you visit daily."
            >
              <ul className="grid grid-cols-1 gap-2">
                {[
                  {
                    href: "/development-os/procurement/quotation-comparison",
                    label: "Quotation comparison",
                  },
                  {
                    href: "/development-os/procurement/purchase-orders",
                    label: "Purchase orders",
                  },
                  {
                    href: "/development-os/inventory",
                    label: "Inventory & deliveries",
                  },
                  {
                    href: "/development-os/vendors",
                    label: "Vendor directory",
                  },
                ].map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="block rounded-md border border-line-soft bg-surface px-4 py-3 text-sm text-ink hover:border-line-strong transition-colors"
                    >
                      {l.label} <span aria-hidden>→</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <DashboardKpi
                label="Latest analyst output"
                value={
                  data.latestProcurementAnalystOutputCode ?? "—"
                }
                status="neutral"
                drillHref={
                  data.latestProcurementAnalystOutputCode
                    ? `/development-os/ai-agents/procurement-analyst/outputs/${data.latestProcurementAnalystOutputCode}`
                    : "/development-os/ai-agents/procurement-analyst"
                }
                hint="Procurement analyst agent"
                className="mt-3"
              />
            </Section>
          </aside>
        </div>
      </div>
    </DevelopmentShell>
  );
}
