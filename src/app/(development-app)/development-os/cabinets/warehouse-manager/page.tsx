import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  PackagePlus,
  ScanBarcode,
  Truck,
} from "lucide-react";
import { DashboardKpi } from "@/components/ui/primitives";
import {
  HalfDonutGauge,
  HatchedBarChart,
  HeroGreetingAI,
  KpiRowMixed,
  PatrolTimeline,
  type HatchedBarDatum,
  type KpiItem,
  type PatrolEvent,
} from "@/components/award";
import { Section } from "@/components/ui/section";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadWarehouseCabinet } from "@/lib/development/server/cabinets/warehouse-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Mega-Sprint / Phase 5 — Warehouse Manager cabinet on Sprint-4 gold
 * standard. Replaces the Stage-10.5.A.3.2 CabinetGreetingBlock +
 * PageHeaderHero stack with <HeroGreetingAI>, swaps the headline KPI
 * grid for <KpiRowMixed> with a gold-solid hero (Low stock — the
 * inventory-watch metric), adds a Today's-pulse hatched-bar of daily
 * movement volume + a stock-health half-donut, and surfaces a
 * <PatrolTimeline> of the most recent inventory movements as the
 * activity rail. SpreadsheetView quick-entry routes for stock
 * movements + stocktake are deferred to follow-up sprints
 * (audit §D5: 0.5 day each).
 */

export const metadata: Metadata = { title: "Warehouse manager · Cabinet" };
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

const INFLOW_TYPES = new Set([
  "received",
  "returned",
  "transferred",
  "adjusted",
]);

function movementKind(type: string): "check" | "incident" | "alert" {
  if (INFLOW_TYPES.has(type)) return "check";
  if (type === "damaged" || type === "lost" || type === "written_off")
    return "alert";
  return "incident";
}

function movementStatus(type: string): "ok" | "warn" | "alert" | "info" {
  if (INFLOW_TYPES.has(type)) return "ok";
  if (type === "damaged" || type === "lost" || type === "written_off")
    return "alert";
  if (type === "issued_to_site" || type === "used") return "info";
  return "warn";
}

export default async function WarehouseCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("warehouse-manager");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const data = await safeQuery("warehouseCabinet", loadWarehouseCabinet(), {
    totalSkuCount: 0,
    lowStockItemsCount: 0,
    zeroStockItemsCount: 0,
    todayMovementsCount: 0,
    qaqcLinkedToMaterialsCount: 0,
    pendingDeliveriesCount: 0,
    movementsLast7Days: [],
    recentMovements: [],
  });

  const now = new Date();
  const dailyMovements = bucketLast7Days(data.movementsLast7Days, now);

  const kpis: KpiItem[] = [
    {
      label: "Low stock",
      value: String(data.lowStockItemsCount),
      delta:
        data.lowStockItemsCount === 0
          ? "All items above reorder point"
          : `${data.lowStockItemsCount} need re-order`,
      href: "/development-os/inventory?filter=low-stock",
    },
    {
      label: "Pending deliveries",
      value: String(data.pendingDeliveriesCount),
      delta:
        data.pendingDeliveriesCount === 0
          ? "No POs in flight"
          : "Open POs awaiting receipt",
      href: "/development-os/procurement/purchase-orders",
    },
    {
      label: "Movements today",
      value: String(data.todayMovementsCount),
      delta:
        data.todayMovementsCount === 0
          ? "No activity yet"
          : "Inflows + outflows",
      href: "/development-os/inventory/movements",
    },
    {
      label: "Zero stock",
      value: String(data.zeroStockItemsCount),
      delta:
        data.zeroStockItemsCount === 0
          ? "No outages"
          : "Out of stock now",
      href: "/development-os/inventory?filter=zero-stock",
    },
  ];

  // Stock health = active SKUs above their reorder point.
  const healthy = Math.max(0, data.totalSkuCount - data.lowStockItemsCount);
  const healthPct =
    data.totalSkuCount > 0
      ? Math.round((healthy / data.totalSkuCount) * 100)
      : 0;

  const timelineEvents: PatrolEvent[] = data.recentMovements.map((m) => ({
    id: m.id,
    timestamp: m.movementDate,
    status: movementStatus(m.movementType),
    kind: movementKind(m.movementType),
    title: `${m.movementType.replaceAll("_", " ")} · ${m.itemName ?? "—"}`,
    body: `Qty ${m.quantity}`,
    href: `/development-os/inventory/movements?focus=${m.id}`,
    statusLabel: m.movementType.replaceAll("_", " "),
  }));

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-8 md:gap-10">
        <HeroGreetingAI
          firstName={firstName}
          role="Warehouse Manager · Cabinet"
          dateLabel={todayLabel(now)}
          aiPromptPlaceholder="What's low this week? Show open deliveries."
          showMyTasksHref="/development-os/inventory/movements"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {[
            {
              href: "/development-os/inventory/movements/new",
              icon: PackagePlus,
              label: "Log stock movement",
              caption: "Inflow · outflow · transfer",
            },
            {
              href: "/development-os/inventory/receiving",
              icon: Truck,
              label: "Receive delivery",
              caption:
                data.pendingDeliveriesCount > 0
                  ? `${data.pendingDeliveriesCount} POs in flight`
                  : "Nothing in transit",
            },
            {
              href: "/development-os/inventory?filter=low-stock",
              icon: ScanBarcode,
              label: "Low-stock watchlist",
              caption: `${data.lowStockItemsCount} below reorder`,
            },
          ].map(({ href, icon: Icon, label, caption }) => (
            <Link
              key={href}
              href={href}
              className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors"
            >
              <span className="shrink-0 w-10 h-10 rounded-full bg-gradient-gold-soft border border-line-soft inline-flex items-center justify-center">
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

        <KpiRowMixed kpis={kpis} heroTone="gold-solid" />

        <Section
          eyebrow="Today's pulse"
          title="Movement cadence + stock health"
          description="Daily inventory movement volume over the last 7 days, alongside the share of active SKUs above their reorder point."
        >
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 md:gap-5">
            <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                  Last 7 days
                </span>
                <span className="text-xs text-ink-tertiary tabular-nums">
                  {data.totalSkuCount} active SKUs
                </span>
              </div>
              <HatchedBarChart
                data={dailyMovements}
                tone="gold"
                height={200}
              />
            </div>
            <HalfDonutGauge
              variant="emerald"
              value={healthPct}
              max={100}
              label={
                <>
                  <p className="text-display text-[28px] md:text-[36px] leading-none font-medium text-ink tabular-nums">
                    {healthPct}%
                  </p>
                  <p className="text-xs text-ink-tertiary mt-1">
                    SKUs above reorder
                  </p>
                </>
              }
              legend={[
                { label: `${healthy} healthy` },
                {
                  label: `${data.lowStockItemsCount} low`,
                  color: "var(--line-strong)",
                },
              ]}
            />
          </div>
        </Section>

        <Section
          eyebrow="Activity"
          title="Recent inventory movements"
          description="Last 8 inflows, outflows, and transfers across all locations."
          action={
            <Link
              href="/development-os/inventory/movements"
              className="text-xs text-ink-tertiary hover:underline"
            >
              All movements →
            </Link>
          }
        >
          {timelineEvents.length === 0 ? (
            <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 text-sm text-ink-tertiary">
              No movements yet. Log the first one from the quick-action
              strip above.
            </div>
          ) : (
            <PatrolTimeline
              events={timelineEvents}
              maxVisible={8}
              moreHref="/development-os/inventory/movements"
            />
          )}
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Section
              eyebrow="Inventory"
              title="Material quality"
            >
              <DashboardKpi
                label="QA on materials"
                value={String(data.qaqcLinkedToMaterialsCount)}
                status={
                  data.qaqcLinkedToMaterialsCount === 0 ? "good" : "warn"
                }
                drillHref="/development-os/qa-qc?entity=material"
                hint="Material-linked QA/QC issues"
              />
            </Section>
          </div>

          <aside>
            <Section eyebrow="Surfaces" title="Jump to">
              <ul className="grid grid-cols-1 gap-2">
                {[
                  {
                    href: "/development-os/inventory",
                    label: "Inventory & SKUs",
                  },
                  {
                    href: "/development-os/inventory/movements",
                    label: "Movements log",
                  },
                  {
                    href: "/development-os/inventory/receiving",
                    label: "Receiving",
                  },
                  {
                    href: "/development-os/qa-qc?entity=material",
                    label: "Material QA/QC",
                  },
                  {
                    href: "/development-os/procurement/purchase-orders",
                    label: "Open POs",
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
                label="Total SKUs"
                value={String(data.totalSkuCount)}
                status="neutral"
                drillHref="/development-os/inventory"
                hint="Active items"
                className="mt-3"
              />
            </Section>
          </aside>
        </div>
      </div>
    </DevelopmentShell>
  );
}
