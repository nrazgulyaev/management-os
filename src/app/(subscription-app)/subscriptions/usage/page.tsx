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
import { PageHeader } from "@/components/ui/page-header";
import { DashboardKpi, ListTableCard } from "@/components/ui/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { listSubscriptionOsOrgs } from "@/lib/subscription-os/queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Usage · SubscriptionOS" };
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
  const bothCount = orgs.filter(
    (o) =>
      o.productsEnabled.includes("mgmt") && o.productsEnabled.includes("dev"),
  ).length;

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "SubscriptionOS", href: "/subscriptions" },
          { label: "Usage" },
        ]}
        eyebrow="Platform metrics"
        title="Usage analytics"
        description="Aggregate per-org usage. AI cost / token rollups live in the existing AI-usage analytics page (deep-link below). Per-org storage + active-user metrics ship in a follow-up."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardKpi
          variant="hero"
          tone="emerald-soft"
          label="Total orgs"
          value={String(orgs.length)}
          status="neutral"
          className="sm:col-span-2 lg:col-span-2"
        />
        <DashboardKpi label="Mgmt OS only" value={String(mgmtOnlyCount)} status="neutral" />
        <DashboardKpi label="Dev OS only" value={String(devOnlyCount)} status="neutral" />
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

      <ListTableCard
        eyebrow="Per-org"
        title="Customer products + plan"
        count={orgs.length}
      >
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
                        href={`/subscriptions/${o.organizationCode}`}
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
      </ListTableCard>
    </div>
  );
}
