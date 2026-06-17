import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { NumKpi } from "@/components/projects/num-kpi";
import { getDistributions } from "@/lib/development/server/distributions";
import {
  DISTRIBUTION_STATUS_LABEL,
  DISTRIBUTION_TYPE_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";

/**
 * CFO distributions list. The CFO console links here as a primary CTA;
 * this surface is now a real per-distribution list (de-stubbed) backed by
 * the org-scoped `getDistributions()` reader. Each row links into the
 * canonical detail/declare flow under /development-os/distributions, which
 * carries the per-commitment allocation table + execute lifecycle.
 *
 * Styled with the dev `.page-header`/`.btn` lineage to match the rest of
 * the CFO console (capital-calls list, capital-call detail).
 */

export const metadata: Metadata = { title: "Distributions · Development OS" };
export const dynamic = "force-dynamic";

function fmt(minor: string): string {
  return formatUsdMinor(BigInt(minor));
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "badge badge-ok";
    case "declared":
      return "badge badge-warn";
    case "executing":
      return "badge badge-info";
    default:
      return "badge";
  }
}

export default async function CfoDistributionsPage() {
  const distributions = await safeQuery(
    "getDistributions",
    getDistributions(),
    [] as Awaited<ReturnType<typeof getDistributions>>,
    4000,
  );

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
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/cfo">CFO</Link>
            <span>·</span>
            <span>
              {`${distributions.length} distribution${distributions.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <h1>Distributions</h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Capital returns and profit distributions to investors. Declare a
            distribution to compute per-commitment allocations; execute to
            attribute funds to wallets.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/distributions/new"
            className="btn btn-primary btn-sm"
          >
            + Declare distribution
          </Link>
          <Link href="/development-os/cfo" className="btn btn-secondary btn-sm">
            ← CFO console
          </Link>
        </div>
      </div>

      <div className="cfo-detail-kpis">
        <NumKpi
          label="Pending execution"
          value={String(declared.length)}
          sub={formatUsdMinor(totalDeclared)}
          tone="warn"
        />
        <NumKpi
          label="Completed"
          value={String(completed.length)}
          sub={formatUsdMinor(totalExecuted)}
          tone="ok"
        />
        <NumKpi label="Total" value={String(distributions.length)} />
        <NumKpi
          label="Cancelled"
          value={String(
            distributions.filter((d) => d.status === "cancelled").length,
          )}
        />
      </div>

      <h2 className="display text-[22px] mb-3 mt-6">All distributions</h2>
      {distributions.length === 0 ? (
        <EmptyState
          variant="caught-up"
          title="No distributions yet"
          body="Declare a distribution to compute and stage your first per-commitment allocation. Capital returns settle by priority tier; profit distributions split pro-rata on drawn capital × profit share."
        />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Project</th>
              <th>Type</th>
              <th className="num">Total (USD)</th>
              <th>Trigger</th>
              <th>Declared</th>
              <th>Effective</th>
              <th className="num">Allocations</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {distributions.map((d) => (
              <tr key={d.id}>
                <td className="mono">
                  <Link
                    href={`/development-os/distributions/${d.id}`}
                    className="hover:underline"
                  >
                    #{d.distributionNumber}
                  </Link>
                </td>
                <td>
                  {d.projectName ?? (
                    <span className="text-[var(--ink-3)]">Company-wide</span>
                  )}
                </td>
                <td>{DISTRIBUTION_TYPE_LABEL[d.distributionType]}</td>
                <td className="num mono">{fmt(d.totalAmountUsdMinor)}</td>
                <td className="text-[12px] text-[var(--ink-3)]">
                  {d.triggerReason.replace(/_/g, " ")}
                </td>
                <td className="text-[12px]">
                  {new Date(d.declaredAt).toLocaleDateString()}
                </td>
                <td className="text-[12px]">{d.effectiveDate}</td>
                <td className="num mono">{d.allocationCount}</td>
                <td>
                  <span className={statusBadgeClass(d.status)}>
                    {DISTRIBUTION_STATUS_LABEL[d.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
