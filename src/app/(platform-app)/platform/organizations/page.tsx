/**
 * Stage 10.6.E.2.1 — Customer organizations list.
 *
 * All customer orgs at a glance. Filter by status, search by name/code,
 * link into per-org detail. Reads from existing organizations +
 * orgSubscriptions + subscriptionPlans tables.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  DashboardKpi,
  FilterPills,
  ListTableCard,
  type FilterPillItem,
} from "@/components/ui/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  listSubscriptionOsOrgs,
  type SubscriptionOsOrgRow,
} from "@/lib/subscription-os/queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Organizations · Platform Admin OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "success" | "info" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  trial: "info",
  grace: "warning",
  cancelled: "danger",
  archived: "neutral",
  purged: "neutral",
  "no-subscription": "neutral",
};

function fmtMoney(minor: bigint | null, currency: string | null): string {
  if (!minor) return "—";
  const n = Number(minor) / 100;
  return `${currency ?? "USD"} ${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

function daysUntil(d: Date | null): string {
  if (!d) return "—";
  const diff = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  if (diff === 0) return "today";
  return `in ${diff}d`;
}

export default async function OrganizationsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const sp = await searchParams;
  const status =
    sp.status === "trial" ||
    sp.status === "active" ||
    sp.status === "grace" ||
    sp.status === "cancelled" ||
    sp.status === "archived" ||
    sp.status === "purged"
      ? sp.status
      : "";

  const orgs = await safeQuery(
    "subscription-os.listOrgs",
    listSubscriptionOsOrgs({ status, search: sp.search }),
    [] as SubscriptionOsOrgRow[],
    4000,
  );

  const counts = {
    all: orgs.length,
    trial: orgs.filter((o) => o.status === "trial").length,
    active: orgs.filter((o) => o.status === "active").length,
    grace: orgs.filter((o) => o.status === "grace").length,
    cancelled: orgs.filter((o) => o.status === "cancelled").length,
  };

  // Build filter URLs preserving search.
  const baseHref = "/platform/organizations";
  const buildHref = (s: string): string => {
    const params = new URLSearchParams();
    if (s) params.set("status", s);
    if (sp.search) params.set("search", sp.search);
    const qs = params.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  };

  const pills: FilterPillItem[] = [
    { value: "", label: "All", href: buildHref(""), count: counts.all },
    { value: "active", label: "Active", href: buildHref("active"), count: counts.active },
    { value: "trial", label: "Trial", href: buildHref("trial"), count: counts.trial },
    { value: "grace", label: "Grace", href: buildHref("grace"), count: counts.grace },
    { value: "cancelled", label: "Cancelled", href: buildHref("cancelled"), count: counts.cancelled },
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Platform Admin OS", href: "/platform" },
          { label: "Organizations" },
        ]}
        eyebrow="Platform · all tenants"
        title="Customer organizations"
        description="Every customer org with its current subscription state. Filter by status or search by name / code, then drill into the per-org console."
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <DashboardKpi
          label="Total orgs"
          value={String(counts.all)}
          status="neutral"
          hint="All customers"
        />
        <DashboardKpi
          label="Active · paid"
          value={String(counts.active)}
          status="good"
          hint="Recurring MRR"
        />
        <DashboardKpi
          label="Trial"
          value={String(counts.trial)}
          status="neutral"
          hint="Evaluating"
        />
        <DashboardKpi
          label="Grace"
          value={String(counts.grace)}
          status={counts.grace > 0 ? "warn" : "neutral"}
          hint="Payment retry"
        />
        <DashboardKpi
          label="Cancelled"
          value={String(counts.cancelled)}
          status={counts.cancelled > 0 ? "bad" : "neutral"}
          hint="Churned"
        />
      </div>

      <FilterPills items={pills} current={status} label="Status" />

      <ListTableCard
        eyebrow="Customers"
        title={
          status
            ? `${status[0].toUpperCase()}${status.slice(1)} organizations`
            : "All organizations"
        }
        count={orgs.length}
      >
        <Table>
          <THead>
            <TR>
              <TH>Org</TH>
              <TH>Plan</TH>
              <TH>Status</TH>
              <TH>MRR</TH>
              <TH>Trial / period ends</TH>
              <TH>Products</TH>
              <TH className="text-right">Open</TH>
            </TR>
          </THead>
          <TBody>
            {orgs.length === 0 ? (
              <TR>
                <TD colSpan={7} className="text-ink-tertiary text-center py-10">
                  No organizations match your filter.
                </TD>
              </TR>
            ) : (
              orgs.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link
                      href={`/platform/${o.organizationCode}`}
                      className="flex flex-col gap-0.5 hover:text-accent transition-colors"
                    >
                      <span className="text-ink font-medium truncate">
                        {o.name}
                      </span>
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
                  <TD className="font-mono tabular-nums text-sm">
                    {o.status === "active"
                      ? fmtMoney(o.monthlyPriceMinor, o.currency)
                      : "—"}
                  </TD>
                  <TD className="text-sm">
                    {o.status === "trial" ? (
                      <span>
                        {fmtDate(o.trialEndsAt)}{" "}
                        <span className="text-ink-tertiary">
                          ({daysUntil(o.trialEndsAt)})
                        </span>
                      </span>
                    ) : o.status === "active" ? (
                      <span>{fmtDate(o.currentPeriodEndsAt)}</span>
                    ) : o.status === "cancelled" ? (
                      <span className="text-ink-tertiary">
                        cancelled {fmtDate(o.cancelledAt)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    <div className="flex gap-1">
                      {o.productsEnabled.map((p) => (
                        <Badge key={p} tone="outline">
                          {p}
                        </Badge>
                      ))}
                    </div>
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
      </ListTableCard>
    </div>
  );
}
