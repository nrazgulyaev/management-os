import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireInternalUser, AuthorizationError } from "@/features/auth/permissions";
import { AccessForbidden } from "@/components/auth/access-forbidden";
import { getDistribution } from "@/lib/development/server/distributions";
import {
  cancelDistribution,
  executeDistribution,
} from "@/lib/development/server/distribution-actions";
import {
  DISTRIBUTION_STATUS_LABEL,
  DISTRIBUTION_TYPE_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Distribution detail · Development OS",
};
export const dynamic = "force-dynamic";

export default async function DistributionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // SECURITY: gate the detail page — only internal users may view a
  // distribution or reach the Execute/Cancel money-moving controls.
  // Degrade to Forbidden instead of a 500 for a logged-in non-internal user.
  try {
    await requireInternalUser();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <DevelopmentShell>
          <AccessForbidden backHref="/development-os/distributions" backLabel="Distributions" />
        </DevelopmentShell>
      );
    }
    throw err;
  }
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/distributions">Distributions</Link> /{" "}
              <span>Detail</span>
            </div>
            <h1>Distribution detail</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to view distribution details."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      </DevelopmentShell>
    );
  }

  const distribution = await getDistribution(id);
  if (!distribution) notFound();

  async function executeAction() {
    "use server";
    // Re-gate on the POST request (separate from page render).
    await requireInternalUser();
    await executeDistribution(id);
    revalidatePath(`/development-os/distributions/${id}`);
    redirect(`/development-os/distributions/${id}`);
  }

  async function cancelAction(formData: FormData) {
    "use server";
    await requireInternalUser();
    const reason = String(formData.get("reason") ?? "Cancelled via UI");
    await cancelDistribution(id, reason);
    revalidatePath(`/development-os/distributions/${id}`);
    redirect(`/development-os/distributions/${id}`);
  }

  const totalCapitalUsd = distribution.allocations.reduce(
    (acc, a) => acc + BigInt(a.capitalReturnAmountUsdMinor),
    0n,
  );
  const totalProfitUsd = distribution.allocations.reduce(
    (acc, a) => acc + BigInt(a.profitAmountUsdMinor),
    0n,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/distributions">Distributions</Link> /{" "}
            <span>
              #{distribution.distributionNumber} ·{" "}
              {distribution.projectName ?? "Company-wide"}
            </span>
          </div>
          <h1>{DISTRIBUTION_TYPE_LABEL[distribution.distributionType]}</h1>
          {distribution.notes && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {distribution.notes}
            </p>
          )}
        </div>
        <div className="actions">
          <Link
            href="/development-os/distributions"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All distributions
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Summary</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            label="Total"
            value={formatUsdMinor(BigInt(distribution.totalAmountUsdMinor))}
            sub={DISTRIBUTION_TYPE_LABEL[distribution.distributionType]}
          />
          <Kpi
            label="Capital return"
            value={formatUsdMinor(totalCapitalUsd)}
          />
          <Kpi label="Profit" value={formatUsdMinor(totalProfitUsd)} />
          <Kpi
            label="Allocations"
            value={String(distribution.allocations.length)}
          />
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-ink-secondary">
          <HandoffBadge
            tone={
              distribution.status === "completed"
                ? "ok"
                : distribution.status === "declared"
                  ? "warn"
                  : distribution.status === "executing"
                    ? "info"
                    : "soft"
            }
          >
            {DISTRIBUTION_STATUS_LABEL[distribution.status]}
          </HandoffBadge>
          <span>Trigger: {distribution.triggerReason.replace(/_/g, " ")}</span>
          <span>
            Declared: {new Date(distribution.declaredAt).toLocaleString()}
          </span>
          <span>Effective: {distribution.effectiveDate}</span>
          {distribution.completedAt && (
            <span>
              Completed: {new Date(distribution.completedAt).toLocaleString()}
            </span>
          )}
        </div>

        {distribution.status === "declared" && (
          <div className="mt-4 flex flex-col gap-3 rounded-md border border-amber-300/60 bg-amber-50/80 p-4 text-sm text-amber-900">
            <div className="font-medium">
              Ready to execute — clicking will move money into wallets
            </div>
            <div className="text-xs">
              For each allocation, this writes one or two `wallet_transactions`
              rows (capital_return + profit_distribution) and updates the
              corresponding `investor_wallets`. The whole operation is atomic;
              if anything fails, no balances move.
            </div>
            <div className="flex items-center gap-2">
              <form action={executeAction}>
                <button type="submit" className="btn btn-accent">
                  Execute distribution
                </button>
              </form>
              <form action={cancelAction} className="flex items-center gap-2">
                <input
                  type="text"
                  name="reason"
                  placeholder="Cancellation reason"
                  required
                  minLength={3}
                  className="rounded-md border border-line-soft bg-surface px-2 py-1 text-xs"
                />
                <button type="submit" className="btn btn-secondary">
                  Cancel
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Allocations</div>
        {distribution.allocations.length === 0 ? (
          <EmptyState
            title="No allocations"
            description="This distribution has no allocation rows — likely a data integrity issue."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Investor</TH>
                <TH>Commitment</TH>
                <TH>Capital return</TH>
                <TH>Profit</TH>
                <TH>Total</TH>
                <TH>Outstanding @ declare</TH>
                <TH>Profit %</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {distribution.allocations.map((a) => (
                <TR key={a.id}>
                  <TD className="text-sm">{a.investorLegalName}</TD>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/commitments/${a.commitmentId}`}
                      className="hover:underline"
                    >
                      {a.commitmentCode}
                    </Link>
                  </TD>
                  <TDNum>
                    {formatUsdMinor(BigInt(a.capitalReturnAmountUsdMinor))}
                  </TDNum>
                  <TDNum>
                    {formatUsdMinor(BigInt(a.profitAmountUsdMinor))}
                  </TDNum>
                  <TDNum className="font-medium">
                    {formatUsdMinor(BigInt(a.totalAmountUsdMinor))}
                  </TDNum>
                  <TDNum className="text-xs text-ink-tertiary">
                    {formatUsdMinor(
                      BigInt(a.outstandingCapitalAtDeclareUsdMinor),
                    )}
                  </TDNum>
                  <TDNum>{Number(a.profitSharePercentUsed).toFixed(1)}%</TDNum>
                  <TD>
                    <HandoffBadge
                      tone={
                        a.status === "executed"
                          ? "ok"
                          : a.status === "cancelled"
                            ? "soft"
                            : "warn"
                      }
                    >
                      {a.status}
                    </HandoffBadge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}
