import type { Metadata } from "next";
import Link from "next/link";
import {
  DashboardKpi,
  PageHeaderHero,
} from "@/components/ui/primitives";
import { Section } from "@/components/ui/section";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadProcurementCabinet } from "@/lib/development/server/cabinets/procurement-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Stage 10.5.A.2.3 — Procurement Manager cabinet (replatformed).
 *
 * KPI mapping (existing data → operator vocabulary "PR pending /
 * RFQ active / Vendors / Avg cycle time"):
 *   - PR pending           → pendingApprovalsCount
 *   - RFQ active           → quotationsAwaitingComparisonCount
 *   - Open POs             → posAwaitingDeliveryCount
 *   - Recent deliveries    → recentDeliveriesCount (7d)
 *
 * Carry-overs:
 *   - Vendors count          — needs a `vendors` aggregate query
 *   - Avg cycle time         — needs PO timestamp series, not on the
 *                              critical path for first replatform
 */

export const metadata: Metadata = { title: "Procurement manager · Cabinet" };
export const dynamic = "force-dynamic";

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
  });

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-8">
        <PageHeaderHero
          firstName={firstName ?? undefined}
          eyebrow="Procurement manager"
          title="Procurement pipeline"
          description="Purchase requests, RFQs, open POs, and supplier performance."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardKpi
            label="PRs pending"
            value={String(data.pendingApprovalsCount)}
            status={
              data.pendingApprovalsCount === 0
                ? "good"
                : data.pendingApprovalsCount > 10
                  ? "bad"
                  : "warn"
            }
            drillHref="/development-os/procurement/purchase-requests"
            hint="Submitted or awaiting approval"
          />
          <DashboardKpi
            label="RFQs to compare"
            value={String(data.quotationsAwaitingComparisonCount)}
            status={
              data.quotationsAwaitingComparisonCount === 0
                ? "good"
                : "warn"
            }
            drillHref="/development-os/procurement/quotation-comparison"
            hint="Quotations pending review"
          />
          <DashboardKpi
            label="Open POs"
            value={String(data.posAwaitingDeliveryCount)}
            status="neutral"
            drillHref="/development-os/procurement/purchase-orders"
            hint="Active or in transit"
          />
          <DashboardKpi
            label="Deliveries (7d)"
            value={String(data.recentDeliveriesCount)}
            status={data.recentDeliveriesCount === 0 ? "warn" : "good"}
            drillHref="/development-os/inventory"
            hint="Materials received last week"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Section eyebrow="AI" title="Insights">
              <div className="rounded-md border border-line-soft bg-surface p-5">
                <div className="text-label">Latest procurement analyst</div>
                {data.latestProcurementAnalystOutputCode ? (
                  <Link
                    href={`/development-os/ai-agents/procurement-analyst/outputs/${data.latestProcurementAnalystOutputCode}`}
                    className="text-sm text-info hover:underline"
                  >
                    {data.latestProcurementAnalystOutputCode} →
                  </Link>
                ) : (
                  <span className="text-sm text-ink-tertiary">
                    No output yet — run the agent from{" "}
                    <Link
                      href="/development-os/jobs"
                      className="text-info hover:underline"
                    >
                      Jobs
                    </Link>
                    .
                  </span>
                )}
              </div>
            </Section>
          </div>

          <aside className="flex flex-col gap-4">
            <Section eyebrow="Pipeline" title="Jump to">
              <ul className="grid grid-cols-1 gap-2">
                <CrossLink
                  href="/development-os/procurement/purchase-requests"
                  label="Purchase requests"
                />
                <CrossLink
                  href="/development-os/procurement/quotation-comparison"
                  label="Quotation comparison"
                />
                <CrossLink
                  href="/development-os/procurement/purchase-orders"
                  label="Purchase orders"
                />
                <CrossLink
                  href="/development-os/inventory"
                  label="Inventory & deliveries"
                />
                <CrossLink
                  href="/development-os/vendors"
                  label="Vendor directory"
                />
              </ul>
            </Section>
          </aside>
        </div>
      </div>
    </DevelopmentShell>
  );
}

function CrossLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-md border border-line-soft bg-surface px-4 py-3 text-sm text-ink hover:border-line-strong transition-colors"
      >
        {label} <span aria-hidden>→</span>
      </Link>
    </li>
  );
}
