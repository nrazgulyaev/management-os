import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDistributions } from "@/lib/development/server/distributions";
import {
  DISTRIBUTION_STATUS_LABEL,
  DISTRIBUTION_STATUSES,
  DISTRIBUTION_TYPE_LABEL,
  DISTRIBUTION_TYPES,
  type DistributionStatus,
  type DistributionType,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Distributions · Development OS",
};
export const dynamic = "force-dynamic";

export default async function DistributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = (DISTRIBUTION_STATUSES as readonly string[]).includes(
    sp.status ?? "",
  )
    ? (sp.status as DistributionStatus)
    : undefined;
  const typeFilter = (DISTRIBUTION_TYPES as readonly string[]).includes(
    sp.type ?? "",
  )
    ? (sp.type as DistributionType)
    : undefined;
  const q = (sp.q ?? "").trim().toLowerCase();

  const db = getDb();
  // Load the full org-scoped set once; KPIs reflect the whole portfolio,
  // the table below is narrowed by the operator's search / filters.
  const distributions = db
    ? await safeQuery(
        "getDistributions",
        getDistributions(),
        [] as Awaited<ReturnType<typeof getDistributions>>,
        4000,
      )
    : [];

  const filtered = distributions.filter((d) => {
    if (statusFilter && d.status !== statusFilter) return false;
    if (typeFilter && d.distributionType !== typeFilter) return false;
    if (q) {
      const hay = `#${d.distributionNumber} ${d.projectName ?? ""} ${d.triggerReason}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const hasFilters = Boolean(q || statusFilter || typeFilter);

  const declared = distributions.filter((d) => d.status === "declared");
  const completed = distributions.filter((d) => d.status === "completed");
  const totalDeclared = declared.reduce(
    (acc, d) => acc + BigInt(d.totalAmountUsdMinor),
    0n,
  );
  const totalExecuted = completed.reduce(
    (acc, d) => acc + BigInt(d.totalAmountUsdMinor),
    0n,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Distributions</span>
          </div>
          <h1>Distributions</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Capital returns and profit distributions to investors. Declare a
            distribution to compute per-commitment allocations; execute to
            attribute funds to wallets. Cash payout to investors is a separate
            wallet withdrawal action.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/distributions/new"
            className="btn btn-accent btn-sm"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            Declare distribution
          </Link>
          <Link
            href="/development-os"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      {!db && (
        <EmptyState
          title="Distributions need the database"
          description="Database connection not configured. Contact support."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      )}

      {db && (
        <>
          <div>
            <div className="label mb-2.5">Snapshot</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi
                label="Pending execution"
                value={String(declared.length)}
                sub={formatUsdMinor(totalDeclared)}
              />
              <Kpi
                label="Completed"
                value={String(completed.length)}
                sub={formatUsdMinor(totalExecuted)}
              />
              <Kpi
                label="Total distributions"
                value={String(distributions.length)}
              />
              <Kpi
                label="Cancelled"
                value={String(
                  distributions.filter((d) => d.status === "cancelled").length,
                )}
              />
            </div>
          </div>

          <div>
            <form
              method="GET"
              action="/development-os/distributions"
              className="mb-3 flex flex-wrap items-center gap-2"
            >
              <input
                type="search"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Search #, project, trigger…"
                aria-label="Search distributions"
                className="rounded-full border border-line bg-surface px-3.5 py-[6px] text-[12.5px] text-ink w-[220px] focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <select
                name="status"
                defaultValue={statusFilter ?? ""}
                aria-label="Status"
                className="rounded-full border border-line bg-surface px-3 py-[6px] text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">All statuses</option>
                {DISTRIBUTION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {DISTRIBUTION_STATUS_LABEL[s]}
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
                {DISTRIBUTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DISTRIBUTION_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-dark btn-sm">
                Apply
              </button>
              {hasFilters && (
                <Link
                  href="/development-os/distributions"
                  className="btn btn-secondary btn-sm"
                >
                  Clear
                </Link>
              )}
            </form>

            <div className="label mb-2.5">
              All distributions · {filtered.length} shown
            </div>
            {distributions.length === 0 ? (
              <EmptyState
                title="No distributions yet"
                description="Click 'Declare distribution' to compute and stage your first allocation."
                action={
                  <Link
                    href="/development-os/distributions/new"
                    className="btn btn-secondary btn-sm"
                  >
                    Declare distribution
                  </Link>
                }
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No distributions match"
                description="No distributions match the current search or filters. Clear them to see the full list."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Project</TH>
                    <TH>Type</TH>
                    <TH>Total (USD)</TH>
                    <TH>Trigger</TH>
                    <TH>Declared</TH>
                    <TH>Effective</TH>
                    <TH>Allocations</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((d) => (
                    <TR key={d.id}>
                      <TD className="font-mono text-xs">
                        <Link
                          href={`/development-os/distributions/${d.id}`}
                          className="hover:underline"
                        >
                          #{d.distributionNumber}
                        </Link>
                      </TD>
                      <TD className="text-sm">
                        {d.projectName ?? (
                          <span className="text-ink-tertiary">Company-wide</span>
                        )}
                      </TD>
                      <TD className="text-xs">
                        {DISTRIBUTION_TYPE_LABEL[d.distributionType]}
                      </TD>
                      <TDNum>
                        {formatUsdMinor(BigInt(d.totalAmountUsdMinor))}
                      </TDNum>
                      <TD className="text-xs text-ink-secondary">
                        {d.triggerReason.replace(/_/g, " ")}
                      </TD>
                      <TD className="text-xs">
                        {new Date(d.declaredAt).toLocaleDateString()}
                      </TD>
                      <TD className="text-xs">{d.effectiveDate}</TD>
                      <TDNum>{d.allocationCount}</TDNum>
                      <TD>
                        <HandoffBadge
                          tone={
                            d.status === "completed"
                              ? "ok"
                              : d.status === "declared"
                                ? "warn"
                                : d.status === "executing"
                                  ? "info"
                                  : "soft"
                          }
                        >
                          {DISTRIBUTION_STATUS_LABEL[d.status]}
                        </HandoffBadge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </>
      )}
    </DevelopmentShell>
  );
}
