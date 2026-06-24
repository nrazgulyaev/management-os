/**
 * Platform Billing console — honest v1 (pre-PSP).
 *
 * IA borrowed from the superseded cc-functional-handoff
 * `cabinets/super-admin/04-billing.html` draft (revenue rollup KPI
 * strip + per-org billing rows), minus everything that needs a payment
 * provider: the mock's failed-payments triage, invoice ledger and
 * dunning editor are represented by the explicit "Payments not
 * connected" band instead of fake data or dead buttons.
 *
 * Reads: getRevenueSnapshot (the exact same read /platform/revenue
 * uses, so MRR matches across consoles) + listBillingOrgRows (org ⨝
 * subscription ⨝ plan with derived billing state). Auth: super_admin
 * gate in the (platform-app) layout.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SectionHeading, Card, Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import {
  FilterPills,
  type FilterPillItem,
} from "@/components/ui/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getRevenueSnapshot } from "@/lib/subscription-os/queries";
import { safeQuery } from "@/lib/development/safe-query";
import {
  listBillingOrgRows,
  type BillingOrgRow,
  type BillingState,
} from "./queries";
import { PaymentsNotConnectedBand } from "./payments-not-connected";

export const metadata: Metadata = { title: "Billing · Platform Admin OS" };
export const dynamic = "force-dynamic";

const STATE_LABEL: Record<BillingState, string> = {
  paying: "Active plan",
  comped: "Comped",
  trial: "Trial",
  grace: "Grace",
  cancelled: "Cancelled",
  dormant: "Dormant",
  "no-plan": "No plan",
};

const STATE_TONE: Record<
  BillingState,
  "success" | "info" | "warning" | "danger" | "neutral" | "gold"
> = {
  paying: "success",
  comped: "gold",
  trial: "info",
  grace: "warning",
  cancelled: "danger",
  dormant: "neutral",
  "no-plan": "neutral",
};

const STATE_VALUES: BillingState[] = [
  "paying",
  "comped",
  "trial",
  "grace",
  "cancelled",
  "dormant",
  "no-plan",
];

function fmtMoney(minor: bigint | null, currency: string | null): string {
  if (minor === null) return "—";
  const n = Number(minor) / 100;
  return `${currency ?? "USD"} ${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export default async function PlatformBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; plan?: string }>;
}) {
  const sp = await searchParams;
  const stateFilter = STATE_VALUES.includes(sp.state as BillingState)
    ? (sp.state as BillingState)
    : "";
  const planFilter = sp.plan ?? "";

  const [snap, allRows] = await Promise.all([
    safeQuery(
      "platform-billing.revenue",
      getRevenueSnapshot(),
      {
        mrrMinor: 0n,
        arrMinor: 0n,
        customerCount: 0,
        activeCount: 0,
        trialCount: 0,
        cancelledLast30dCount: 0,
        trialToPaidLast30dCount: 0,
        perTier: [],
        currency: "USD",
      },
      4000,
    ),
    safeQuery(
      "platform-billing.orgRows",
      listBillingOrgRows(),
      [] as BillingOrgRow[],
      4000,
    ),
  ]);

  // KPI math — all from live rows, conventions stated in the hints.
  const payingRows = allRows.filter((r) => r.billingState === "paying");
  const compedRows = allRows.filter((r) => r.billingState === "comped");
  const payingMrrMinor = payingRows.reduce(
    (acc, r) => acc + (r.monthlyPriceMinor ?? 0n),
    0n,
  );
  const arpu =
    payingRows.length > 0
      ? `${snap.currency} ${(Number(payingMrrMinor) / 100 / payingRows.length).toLocaleString(
          "en-US",
          { maximumFractionDigits: 0 },
        )}`
      : "—";

  // Distinct plans present in the data (for the plan filter pills).
  const planCodes = Array.from(
    new Map(
      allRows
        .filter((r) => r.planCode)
        .map((r) => [r.planCode as string, r.planDisplayName ?? r.planCode!]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  // Apply both filters; pill counts reflect the OTHER active filter so
  // the numbers always match what clicking a pill will show.
  const planFiltered = allRows.filter(
    (r) => !planFilter || r.planCode === planFilter,
  );
  const stateFiltered = allRows.filter(
    (r) => !stateFilter || r.billingState === stateFilter,
  );
  const rows = planFiltered.filter(
    (r) => !stateFilter || r.billingState === stateFilter,
  );

  const buildHref = (next: { state?: string; plan?: string }): string => {
    const params = new URLSearchParams();
    const s = next.state ?? stateFilter;
    const p = next.plan ?? planFilter;
    if (s) params.set("state", s);
    if (p) params.set("plan", p);
    const qs = params.toString();
    return qs ? `/platform/billing?${qs}` : "/platform/billing";
  };

  const statePills: FilterPillItem[] = [
    {
      value: "",
      label: "All",
      href: buildHref({ state: "" }),
      count: planFiltered.length,
    },
    ...STATE_VALUES.map((s) => ({
      value: s,
      label: STATE_LABEL[s],
      href: buildHref({ state: s }),
      count: planFiltered.filter((r) => r.billingState === s).length,
    })),
  ];

  const planPills: FilterPillItem[] = [
    {
      value: "",
      label: "All plans",
      href: buildHref({ plan: "" }),
      count: stateFiltered.length,
    },
    ...planCodes.map(([code, name]) => ({
      value: code,
      label: name,
      href: buildHref({ plan: code }),
      count: stateFiltered.filter((r) => r.planCode === code).length,
    })),
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <div>
        <div className="crumb">
          <Link href="/platform">Platform Admin OS</Link> / <span>Billing</span>
        </div>
        <SectionHeading
          eyebrow="Platform · billing"
          title="Billing console"
          subtitle="Subscription billing per org — plan, derived billing state and MRR from the plan catalog. No payment provider is connected yet, so there are no invoices or payments here; see the band below for what unlocks at launch."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <Kpi
            tone="gold"
            label="MRR"
            value={fmtMoney(snap.mrrMinor, snap.currency)}
            sub="Active subscriptions × plan price — same read as Revenue (includes comped)"
          />
        </div>
        <Kpi
          tone={payingRows.length > 0 ? "success" : undefined}
          label="Paying orgs"
          value={String(payingRows.length)}
          sub="Active subscription, not comped"
        />
        <Kpi
          label="Comped orgs"
          value={String(compedRows.length)}
          sub="Internal complimentary plans"
        />
        <Kpi
          label="ARPU"
          value={arpu}
          sub="Paying MRR ÷ paying orgs (comps excluded)"
        />
      </div>

      <div className="flex flex-col gap-4">
        <FilterPills items={statePills} current={stateFilter} label="Billing state" />
        <FilterPills items={planPills} current={planFilter} label="Plan" />
      </div>

      <Card padding="none" overflowHidden>
        <div className="pf-card-h">
          <h3>
            {stateFilter
              ? `${STATE_LABEL[stateFilter]} organizations`
              : "All organizations"}{" "}
            · {rows.length}
          </h3>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Org</TH>
              <TH>Plan</TH>
              <TH>Billing state</TH>
              <TH>MRR</TH>
              <TH>Since</TH>
              <TH className="text-right">Console</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={6} className="text-ink-tertiary text-center py-10">
                  No organizations match your filter.
                </TD>
              </TR>
            ) : (
              rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link
                      href={`/platform/billing/${r.organizationCode}`}
                      className="flex flex-col gap-0.5 hover:text-accent transition-colors"
                    >
                      <span className="text-ink font-medium truncate">
                        {r.name}
                      </span>
                      <span className="text-xs text-ink-tertiary font-mono">
                        {r.organizationCode}
                      </span>
                    </Link>
                  </TD>
                  <TD className="text-ink-secondary">
                    {r.planDisplayName ?? (
                      <span className="text-ink-tertiary">—</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={STATE_TONE[r.billingState]}>
                      {STATE_LABEL[r.billingState]}
                    </Badge>
                  </TD>
                  <TD className="font-mono tabular-nums text-sm">
                    {r.billingState === "paying" ? (
                      fmtMoney(r.monthlyPriceMinor, r.currency)
                    ) : r.billingState === "comped" &&
                      r.status === "active" ? (
                      <span className="text-ink-tertiary">
                        {fmtMoney(r.monthlyPriceMinor, r.currency)} (comp)
                      </span>
                    ) : (
                      <span className="text-ink-tertiary">—</span>
                    )}
                  </TD>
                  <TD className="text-sm">
                    {r.sinceDate ? (
                      <span>
                        {fmtDate(r.sinceDate)}{" "}
                        <span className="text-xs text-ink-tertiary">
                          ({r.sinceLabel})
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-tertiary">—</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/platform/${r.organizationCode}`}
                      title="Open org console"
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

      <PaymentsNotConnectedBand />
    </div>
  );
}
