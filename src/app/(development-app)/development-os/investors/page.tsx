import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Briefcase, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { DevOsRowActions } from "@/components/development/dev-os-row-actions";
import { getDb } from "@/lib/db/client";
import {
  getInvestors,
  getInvestorMetrics,
} from "@/lib/development/server/investors";
import {
  INVESTOR_TYPE_LABEL,
  INVESTOR_STATUS_LABEL,
  INVESTOR_STATUSES,
  INVESTOR_TYPES,
  type InvestorStatus,
  type InvestorType,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import {
  logSafeQueryTimings,
  safeQuery,
  type SafeQueryTiming,
} from "@/lib/development/safe-query";
import { InvestorModalForm } from "@/components/development/investors/investor-modal-form";
import { ExportButton } from "@/components/development/bulk-import/export-button";

export const metadata: Metadata = { title: "Investors · Development OS" };
export const dynamic = "force-dynamic";

const EMPTY_METRICS = {
  totalInvestors: 0,
  byType: {
    gp: 0,
    lp_private: 0,
    lp_institutional: 0,
    landowner_jv: 0,
  } as Record<
    "gp" | "lp_private" | "lp_institutional" | "landowner_jv",
    number
  >,
  byStatus: { active: 0, inactive: 0, exited: 0 } as Record<
    "active" | "inactive" | "exited",
    number
  >,
  totalCommittedUsdMinor: "0",
  totalDrawnUsdMinor: "0",
  totalDistributedUsdMinor: "0",
  totalWalletAvailableUsdMinor: "0",
};

/** Mock `.iv-sec` — mono uppercase eyebrow with a trailing hairline rule. */
function SectionRule({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 mb-3 flex items-center gap-2.5">
      <span className="label text-[10.5px]">{children}</span>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}

export default async function InvestorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = (INVESTOR_STATUSES as readonly string[]).includes(
    sp.status ?? "",
  )
    ? (sp.status as InvestorStatus)
    : undefined;
  const typeFilter = (INVESTOR_TYPES as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as InvestorType)
    : undefined;
  const q = (sp.q ?? "").trim().toLowerCase();

  const db = getDb();
  const timings: SafeQueryTiming[] = [];
  const onTiming = (t: SafeQueryTiming) => timings.push(t);

  let investors: Awaited<ReturnType<typeof getInvestors>> = [];
  let metrics = EMPTY_METRICS;

  if (db) {
    [investors, metrics] = await Promise.all([
      safeQuery(
        "getInvestors",
        getInvestors({ status: statusFilter, type: typeFilter }),
        [],
        4000,
        onTiming,
      ),
      safeQuery(
        "getInvestorMetrics",
        getInvestorMetrics(),
        EMPTY_METRICS,
        4000,
        onTiming,
      ),
    ]);
  }

  // Free-text search across code, legal name, email — applied to the
  // org-scoped result set (no SQL change to the shared query).
  if (q) {
    investors = investors.filter(
      (i) =>
        i.investorCode.toLowerCase().includes(q) ||
        i.legalName.toLowerCase().includes(q) ||
        (i.contactEmail ?? "").toLowerCase().includes(q),
    );
  }
  const hasFilters = Boolean(q || statusFilter || typeFilter);

  logSafeQueryTimings("investors", timings);
  const degraded = timings.filter((t) => t.usedFallback).map((t) => t.label);

  const committed = BigInt(metrics.totalCommittedUsdMinor);
  const drawn = BigInt(metrics.totalDrawnUsdMinor);
  const distributed = BigInt(metrics.totalDistributedUsdMinor);
  const wallet = BigInt(metrics.totalWalletAvailableUsdMinor);
  const deployedPct =
    committed > 0n ? Math.round(Number((drawn * 100n) / committed)) : 0;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Investors</span>
          </div>
          <div className="label">
            {db
              ? `${metrics.totalInvestors} investors · ${formatUsdMinor(committed)} committed · ${deployedPct}% deployed`
              : "Database not configured"}
          </div>
          <h1>Fund, investors &amp; distributions</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Pre-handover capital partners. Each investor can hold one or more
            commitments across projects with negotiated profit-share and
            capital-return priority.
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <InvestorModalForm />
            <ExportButton entity="investors" />
            <Button asChild variant="secondary">
              <Link href="/development-os/investors/waterfall">
                <Waves className="w-4 h-4" strokeWidth={1.75} />
                Waterfall &amp; calls
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {!db && (
        <EmptyState
          title="Investors module needs the database"
          description="Database connection not configured. Contact support."
          action={
            <span className="badge badge-warn">DATABASE_URL not set</span>
          }
        />
      )}

      {db && degraded.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning-weak px-4 py-3 text-sm text-warning">
          <div className="font-medium">Some investor data is unavailable</div>
          <div className="text-xs text-warning/80 mt-1">
            Affected: {degraded.join(", ")}. Refresh in a moment.
          </div>
        </div>
      )}

      {db && (
        <div>
          <SectionRule>Capital snapshot</SectionRule>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Total committed"
              value={formatUsdMinor(committed)}
              sub={`${metrics.totalInvestors} investors`}
              tone="accent"
            />
            <Kpi
              label="Total drawn"
              value={formatUsdMinor(drawn)}
              sub={`${deployedPct}% deployed`}
            />
            <Kpi
              label="Distributed"
              value={formatUsdMinor(distributed)}
              sub="Capital + profit attributed"
              tone="success"
            />
            <Kpi
              label="In wallets"
              value={formatUsdMinor(wallet)}
              sub="Available, not yet withdrawn"
            />
          </div>

          <SectionRule>
            LP · positions (open an investor for the ledger)
          </SectionRule>

          <form
            method="GET"
            action="/development-os/investors"
            className="mb-3 flex flex-wrap items-center gap-2"
          >
            <input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search code / name / email…"
              aria-label="Search investors"
              className="rounded-full border border-line bg-surface px-3.5 py-[6px] text-[12.5px] text-ink w-[220px] focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <select
              name="status"
              defaultValue={statusFilter ?? ""}
              aria-label="Status"
              className="rounded-full border border-line bg-surface px-3 py-[6px] text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">All statuses</option>
              {INVESTOR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {INVESTOR_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              name="type"
              defaultValue={typeFilter ?? ""}
              aria-label="Type"
              className="rounded-full border border-line bg-surface px-3 py-[6px] text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">All types</option>
              {INVESTOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INVESTOR_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-dark btn-sm">
              Apply
            </button>
            {hasFilters && (
              <Link
                href="/development-os/investors"
                className="btn btn-secondary btn-sm"
              >
                Clear
              </Link>
            )}
          </form>

          {investors.length === 0 ? (
            hasFilters ? (
              <EmptyState
                title="No investors match"
                description="No investors match the current search or filters. Clear them to see the full list."
              />
            ) : (
            <EmptyState
              title="No investors yet"
              description="Add your first investor to start tracking commitments and distributions."
              action={
                <span className="badge badge-soft gap-1">
                  <Briefcase className="w-3 h-3" />
                  {INVESTOR_TYPE_LABEL.gp}, {INVESTOR_TYPE_LABEL.lp_private},{" "}
                  {INVESTOR_TYPE_LABEL.lp_institutional},{" "}
                  {INVESTOR_TYPE_LABEL.landowner_jv}
                </span>
              }
            />
            )
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data lp-table w-full">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Legal name</th>
                      <th>Type</th>
                      <th>Currency</th>
                      <th className="num">Commitments</th>
                      <th className="num">Committed (USD)</th>
                      <th className="num">Drawn (USD)</th>
                      <th className="num">In wallet (USD)</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {investors.map((i) => (
                      <tr key={i.id}>
                        <td className="font-mono text-xs">
                          <Link
                            href={`/development-os/investors/${i.investorCode}`}
                            className="hover:underline"
                          >
                            {i.investorCode}
                          </Link>
                        </td>
                        <td className="row-title">{i.legalName}</td>
                        <td className="text-xs text-ink-3">
                          {INVESTOR_TYPE_LABEL[i.investorType]}
                        </td>
                        <td className="text-xs">{i.primaryCurrency}</td>
                        <td className="num">{i.commitmentCount}</td>
                        <td className="num">
                          {formatUsdMinor(BigInt(i.totalCommittedUsdMinor))}
                        </td>
                        <td className="num">
                          {formatUsdMinor(BigInt(i.totalDrawnUsdMinor))}
                        </td>
                        <td className="num text-ok">
                          {formatUsdMinor(
                            BigInt(i.walletAvailableTotalUsdMinor),
                          )}
                        </td>
                        <td>
                          <span
                            className={
                              "badge " +
                              (i.status === "active"
                                ? "badge-ok"
                                : i.status === "exited"
                                  ? "badge-soft"
                                  : "badge-warn")
                            }
                          >
                            {INVESTOR_STATUS_LABEL[i.status]}
                          </span>
                        </td>
                        <td className="text-right">
                          <DevOsRowActions
                            kind="investor"
                            row={{
                              id: i.id,
                              displayName: i.legalName,
                              detailHref: `/development-os/investors/${i.investorCode}`,
                              values: {
                                investorCode: i.investorCode,
                                legalName: i.legalName,
                                investorType: i.investorType,
                                primaryCurrency: i.primaryCurrency,
                                contactEmail: i.contactEmail ?? "",
                                contactPhone: i.contactPhone ?? "",
                                taxResidency: i.taxResidency ?? "",
                              },
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-line-soft px-[18px] py-3 font-mono text-[11px] text-ink-3">
                <span>
                  {investors.length} LP · pro-rata by committed share
                </span>
                <span>auto-reconcile via bank webhook</span>
              </div>
            </div>
          )}
        </div>
      )}
    </DevelopmentShell>
  );
}
