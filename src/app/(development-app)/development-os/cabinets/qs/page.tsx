import type { Metadata } from "next";
import Link from "next/link";
import {
  DashboardKpi,
  NoItemsYet,
  PageHeaderHero,
} from "@/components/ui/primitives";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { loadQsCabinet } from "@/lib/development/server/cabinets/qs-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";

/**
 * Stage 10.5.A.2.2 — QS / Cost Analyst cabinet (replatformed).
 *
 * Pattern follows 10.5.A.1 reference cabinets. KPI mapping:
 *   - Active BOQs              → activeBoqCount
 *   - Awaiting QS analysis     → awaitingQsAnalysisCount  (status warn when > 0)
 *   - Specs added (30d)        → recentSpecificationsCount
 *   - Latest analysis          → linked KPI (drill to AI agent output)
 *
 * Carry-overs (per launch prompt 'BOQ progress / Material costs /
 * Quotation gaps / Budget variance' vocab):
 *   - Material costs trend     — needs dev_transactions × cost_categories join
 *   - Quotation gaps           — lives in procurement-cabinet today; cross-link
 *   - Budget variance %        — needs dev_budget_lines × dev_transactions
 */

export const metadata: Metadata = { title: "QS / Cost analyst · Cabinet" };
export const dynamic = "force-dynamic";

export default async function QsCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("qs");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const data = await safeQuery("qsCabinet", loadQsCabinet(), {
    activeBoqCount: 0,
    recentBoqs: [],
    latestQsAnalystOutputCode: null,
    awaitingQsAnalysisCount: 0,
    recentSpecificationsCount: 0,
  });

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-8">
        <PageHeaderHero
          firstName={firstName ?? undefined}
          eyebrow="QS / Cost analyst"
          title="Cost analysis"
          description="BOQ progress, specifications coverage, and AI cost insights."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardKpi
            label="Active BOQs"
            value={String(data.activeBoqCount)}
            status="neutral"
            drillHref="/development-os/boq"
          />
          <DashboardKpi
            label="Awaiting QS analysis"
            value={String(data.awaitingQsAnalysisCount)}
            status={
              data.awaitingQsAnalysisCount === 0
                ? "good"
                : data.awaitingQsAnalysisCount > 5
                  ? "bad"
                  : "warn"
            }
            drillHref="/development-os/ai-agents/qs-cost-analyst"
            hint="Outputs awaiting review"
          />
          <DashboardKpi
            label="Specs added (30d)"
            value={String(data.recentSpecificationsCount)}
            status={data.recentSpecificationsCount === 0 ? "warn" : "neutral"}
            drillHref="/development-os/specifications"
          />
          <DashboardKpi
            label="Latest analysis"
            value={data.latestQsAnalystOutputCode ?? "—"}
            status={data.latestQsAnalystOutputCode ? "good" : "neutral"}
            drillHref={
              data.latestQsAnalystOutputCode
                ? `/development-os/ai-agents/qs-cost-analyst/outputs/${data.latestQsAnalystOutputCode}`
                : "/development-os/ai-agents/qs-cost-analyst"
            }
            hint={data.latestQsAnalystOutputCode ? "Open output" : "Run agent from Jobs"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Section eyebrow="Documents" title="Recent BOQs">
              {data.recentBoqs.length === 0 ? (
                <NoItemsYet
                  entityLabel="BOQs"
                  description="Create your first BOQ document to start tracking quantities."
                />
              ) : (
                <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                  {data.recentBoqs.map((b) => (
                    <li key={b.id}>
                      <Link
                        href={`/development-os/boq/${b.id}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover"
                      >
                        <span className="text-sm text-ink truncate">
                          {b.title}
                        </span>
                        <Badge tone="neutral">{b.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <aside className="flex flex-col gap-4">
            <Section eyebrow="Cross-cabinet" title="Related surfaces">
              <ul className="grid grid-cols-1 gap-2">
                <CrossLink
                  href="/development-os/procurement/quotation-comparison"
                  label="Quotation comparison"
                />
                <CrossLink
                  href="/development-os/specifications"
                  label="Specifications library"
                />
                <CrossLink
                  href="/development-os/finance/payables"
                  label="Payables"
                />
                <CrossLink
                  href="/development-os/ai-agents/qs-cost-analyst"
                  label="QS cost analyst (AI)"
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
