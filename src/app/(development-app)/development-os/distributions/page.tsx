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
  DISTRIBUTION_TYPE_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Distributions · Development OS",
};
export const dynamic = "force-dynamic";

export default async function DistributionsPage() {
  const db = getDb();
  const distributions = db
    ? await safeQuery(
        "getDistributions",
        getDistributions(),
        [] as Awaited<ReturnType<typeof getDistributions>>,
        4000,
      )
    : [];

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
            <div className="label mb-2.5">All distributions</div>
            {distributions.length === 0 ? (
              <EmptyState
                title="No distributions yet"
                description="Click 'Declare distribution' to compute and stage your first allocation."
                action={
                  <Link
                    href="/development-os/distributions"
                    className="btn btn-secondary btn-sm"
                  >
                    View distributions
                  </Link>
                }
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
                  {distributions.map((d) => (
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
