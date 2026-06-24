/**
 * P1 (superadmin-plans-console) — Platform Console cockpit.
 *
 * Replaces the 10.6.E.1 roadmap placeholder with the live operator
 * cockpit: a customer-status summary (All / Active / Trial / Grace /
 * Cancelled), an all-orgs table (plan / status / MRR / period), and a
 * per-tier MRR rollup (reuses the /platform/revenue snapshot).
 *
 * Read-only snapshot — every figure comes from org_subscriptions +
 * subscription_plans. The Plans & pricing editor lives at /platform/plans.
 *
 * Gated to super_admin by the (platform-app) layout. Carries its own
 * header per 10.6.C tokens since the layout doesn't mount a shell.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CreditCard, ScrollText } from "lucide-react";
import { SectionHeading, Card, Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import {
  getPlatformConsoleSummary,
  getRevenueSnapshot,
  listSubscriptionOsOrgs,
  type PlatformConsoleSummary,
  type RevenueSnapshot,
  type SubscriptionOsOrgRow,
} from "@/lib/subscription-os/queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Platform Console",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "success" | "info" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  trial: "info",
  grace: "warning",
  cancelled: "danger",
  cancelling: "warning",
  archived: "neutral",
  purged: "neutral",
  "no-subscription": "neutral",
};

function fmtMoney(minor: bigint | null, currency: string | null): string {
  if (minor == null) return "—";
  const n = Number(minor) / 100;
  return `${currency ?? "USD"} ${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export default async function PlatformConsolePage() {
  const emptySummary: PlatformConsoleSummary = {
    total: 0,
    active: 0,
    trial: 0,
    grace: 0,
    cancelled: 0,
  };
  const emptyRevenue: RevenueSnapshot = {
    mrrMinor: 0n,
    arrMinor: 0n,
    customerCount: 0,
    activeCount: 0,
    trialCount: 0,
    cancelledLast30dCount: 0,
    trialToPaidLast30dCount: 0,
    perTier: [],
    currency: "USD",
  };

  const [summary, revenue, orgs] = await Promise.all([
    safeQuery(
      "platform-console.summary",
      getPlatformConsoleSummary(),
      emptySummary,
      4000,
    ),
    safeQuery(
      "platform-console.revenue",
      getRevenueSnapshot(),
      emptyRevenue,
      4000,
    ),
    safeQuery(
      "platform-console.orgs",
      listSubscriptionOsOrgs({}),
      [] as SubscriptionOsOrgRow[],
      4000,
    ),
  ]);

  // Status pills with live counts — link into the filtered orgs list.
  const statusPills: Array<{ label: string; count: number; href: string }> = [
    { label: "All", count: summary.total, href: "/platform/organizations" },
    { label: "Active", count: summary.active, href: "/platform/organizations?status=active" },
    { label: "Trial", count: summary.trial, href: "/platform/organizations?status=trial" },
    { label: "Grace", count: summary.grace, href: "/platform/organizations?status=grace" },
    { label: "Cancelled", count: summary.cancelled, href: "/platform/organizations?status=cancelled" },
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <SectionHeading
        eyebrow="Platform Admin OS"
        title="Platform Console"
        subtitle="Run the business of the platform — customer-status summary, every customer org, and per-tier MRR. Read-only snapshot from org_subscriptions + subscription_plans."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/platform/plans">
                <CreditCard className="w-4 h-4" strokeWidth={1.75} />
                Plans &amp; pricing
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/platform/audit">
                <ScrollText className="w-4 h-4" strokeWidth={1.75} />
                Audit log
              </Link>
            </Button>
          </>
        }
      />

      {/* ── Customer-status summary ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statusPills.map((p, i) => (
          <Link key={p.label} href={p.href} className="block">
            <Kpi
              tone={i === 0 ? "gold" : undefined}
              label={p.label}
              value={String(p.count)}
              sub={i === 0 ? "Total customer orgs" : "View filtered list"}
            />
          </Link>
        ))}
      </div>

      {/* ── MRR / ARR ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <Kpi
            tone="gold"
            label="MRR"
            value={fmtMoney(revenue.mrrMinor, revenue.currency)}
            sub="Sum of monthly price across active subs"
          />
        </div>
        <Kpi
          label="ARR"
          value={fmtMoney(revenue.arrMinor, revenue.currency)}
          sub="MRR × 12"
        />
        <Link href="/platform/revenue" className="block">
          <Kpi
            tone={revenue.trialToPaidLast30dCount > 0 ? "success" : undefined}
            label="Trial → paid (30d)"
            value={String(revenue.trialToPaidLast30dCount)}
            sub={`${revenue.cancelledLast30dCount} cancelled (30d)`}
          />
        </Link>
      </div>

      {/* ── All-orgs table ──────────────────────────────────────────── */}
      <Card padding="none" overflowHidden>
        <div className="pf-card-h">
          <h3>All organizations · {orgs.length}</h3>
          <Link
            href="/platform/organizations"
            className="inline-flex items-center gap-1 text-sm font-medium text-ink-secondary hover:text-accent transition-colors ml-auto"
          >
            Full list + filters
            <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Org</TH>
              <TH>Plan</TH>
              <TH>Status</TH>
              <TH className="text-right">MRR</TH>
              <TH>Period / trial ends</TH>
              <TH className="text-right">Open</TH>
            </TR>
          </THead>
          <TBody>
            {orgs.length === 0 ? (
              <TR>
                <TD colSpan={6} className="text-ink-tertiary text-center py-10">
                  No customer organizations yet.
                </TD>
              </TR>
            ) : (
              orgs.slice(0, 50).map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link
                      href={`/platform/${o.organizationCode}`}
                      className="flex flex-col gap-0.5 hover:text-accent transition-colors"
                    >
                      <span className="text-ink font-medium truncate">{o.name}</span>
                      <span className="text-xs text-ink-tertiary font-mono">
                        {o.organizationCode}
                      </span>
                    </Link>
                  </TD>
                  <TD className="text-ink-secondary">
                    {o.planDisplayName ?? (
                      <span className="text-ink-tertiary">—</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>
                      {o.status}
                    </Badge>
                    {o.isInternalComp && (
                      <Badge tone="gold" className="ml-1.5">
                        comp
                      </Badge>
                    )}
                  </TD>
                  <TDNum>
                    {o.status === "active"
                      ? fmtMoney(o.monthlyPriceMinor, o.currency)
                      : "—"}
                  </TDNum>
                  <TD className="text-sm">
                    {o.status === "trial"
                      ? fmtDate(o.trialEndsAt)
                      : o.status === "active"
                        ? fmtDate(o.currentPeriodEndsAt)
                        : o.status === "cancelled"
                          ? fmtDate(o.cancelledAt)
                          : "—"}
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/platform/${o.organizationCode}`}
                      className="inline-flex items-center text-ink-tertiary hover:text-ink"
                    >
                      <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
                    </Link>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      {/* ── Per-tier MRR rollup (reuses revenue snapshot) ───────────── */}
      <Card padding="none" overflowHidden>
        <div className="pf-card-h">
          <h3>Customers + MRR by plan · {revenue.perTier.length}</h3>
          <Link
            href="/platform/plans"
            className="inline-flex items-center gap-1 text-sm font-medium text-ink-secondary hover:text-accent transition-colors ml-auto"
          >
            Edit plans
            <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Plan</TH>
              <TH>Plan code</TH>
              <TH className="text-right">Active</TH>
              <TH className="text-right">Trial</TH>
              <TH className="text-right">Monthly price</TH>
              <TH className="text-right">MRR contribution</TH>
            </TR>
          </THead>
          <TBody>
            {revenue.perTier.length === 0 ? (
              <TR>
                <TD colSpan={6} className="text-ink-tertiary text-center py-10">
                  No plans with subscribers yet.
                </TD>
              </TR>
            ) : (
              revenue.perTier.map((t) => (
                <TR key={t.planCode}>
                  <TD className="text-ink font-medium">{t.planDisplayName}</TD>
                  <TD className="font-mono text-xs text-ink-tertiary">
                    {t.planCode}
                  </TD>
                  <TDNum>{t.activeCount}</TDNum>
                  <TDNum>{t.trialCount}</TDNum>
                  <TDNum>{fmtMoney(t.monthlyPriceMinor, revenue.currency)}</TDNum>
                  <TDNum>
                    {fmtMoney(t.mrrContributionMinor, revenue.currency)}
                  </TDNum>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
