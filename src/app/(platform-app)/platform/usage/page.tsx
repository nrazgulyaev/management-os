/**
 * Stage 10.6.E.2.4 — Usage analytics.
 *
 * Per-org usage rollups. v1 surfaces aggregate org counts + a deep-link
 * to the existing AI-usage analytics page (which already does the per-
 * agent breakdown). Per-org storage + active-user metrics ship in a
 * follow-up sub-phase that adds queries to the usageMetrics table.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SectionHeading, Card, Kpi } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { listSubscriptionOsOrgs } from "@/lib/subscription-os/queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Usage · Platform Admin OS" };
export const dynamic = "force-dynamic";

export default async function UsageDashboardPage() {
  const orgs = await safeQuery(
    "subscription-os.usage.orgs",
    listSubscriptionOsOrgs(),
    [],
    4000,
  );

  // Per-product split — count orgs that have each product enabled.
  const mgmtOnlyCount = orgs.filter(
    (o) =>
      o.productsEnabled.includes("mgmt") && !o.productsEnabled.includes("dev"),
  ).length;
  const devOnlyCount = orgs.filter(
    (o) =>
      o.productsEnabled.includes("dev") && !o.productsEnabled.includes("mgmt"),
  ).length;
  const _bothCount = orgs.filter(
    (o) =>
      o.productsEnabled.includes("mgmt") && o.productsEnabled.includes("dev"),
  ).length;

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <div>
        <div className="crumb">
          <Link href="/platform">Platform Admin OS</Link> / <span>Usage</span>
        </div>
        <SectionHeading
          eyebrow="Platform · metrics"
          title="Aggregate usage"
          subtitle="Per-org product mix and adoption. AI cost / token rollups live in the Dev OS AI-usage page; per-org storage + active-user metrics ship in a follow-up."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <Kpi
            tone="gold"
            label="Total orgs"
            value={String(orgs.length)}
            sub="Across both products"
          />
        </div>
        <Kpi
          label="Mgmt OS only"
          value={String(mgmtOnlyCount)}
          sub="Villa ops"
        />
        <Kpi
          label="Dev OS only"
          value={String(devOnlyCount)}
          sub="Construction"
        />
      </div>

      <div className="rounded-3xl border border-line-soft bg-gradient-gold-soft shadow-soft-card p-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-display text-[20px] md:text-[24px] leading-tight font-medium text-ink">
            AI usage breakdown lives in Dev OS
          </h2>
          <p className="text-sm text-ink-secondary mt-1">
            Per-agent token consumption + cost estimates already ship in
            the existing AI usage analytics page. Per-org rollup view is a
            follow-up sub-phase.
          </p>
        </div>
        <Link
          href="/development-os/settings/ai-usage"
          className="inline-flex items-center gap-1 text-sm font-medium text-ink hover:text-accent shrink-0"
        >
          Open AI usage analytics
          <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
        </Link>
      </div>

      <Card padding="none" overflowHidden>
        <div className="pf-card-h">
          <h3>Customer products + plan · {orgs.length}</h3>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Org</TH>
              <TH>Plan</TH>
              <TH>Products</TH>
              <TH className="text-right">Both?</TH>
            </TR>
          </THead>
          <TBody>
            {orgs.length === 0 ? (
              <TR>
                <TD colSpan={4} className="text-center py-12 text-sm text-ink-tertiary">
                  No customer organizations yet.
                </TD>
              </TR>
            ) : (
              orgs.map((o) => {
                const both =
                  o.productsEnabled.includes("mgmt") &&
                  o.productsEnabled.includes("dev");
                return (
                  <TR key={o.id}>
                    <TD>
                      <Link
                        href={`/platform/${o.organizationCode}`}
                        className="text-ink font-medium hover:text-accent"
                      >
                        {o.name}
                      </Link>
                    </TD>
                    <TD className="text-sm text-ink-secondary">
                      {o.planDisplayName ?? "—"}
                    </TD>
                    <TD className="text-sm">
                      {o.productsEnabled.join(", ") || "—"}
                    </TD>
                    <TDNum>{both ? "✓" : "—"}</TDNum>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
