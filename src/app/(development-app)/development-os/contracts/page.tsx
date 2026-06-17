import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText, AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { formatDate, formatUSD } from "@/lib/utils";
import { getContractGroups } from "@/lib/development/server/contracts";
import { safeQuery } from "@/lib/development/safe-query";
import {
  CONTRACT_GROUP_STATUS_LABEL,
  GROUP_TYPE_LABEL,
} from "@/lib/development/constants/contracts-constants";
import type {
  ContractGroupStatus,
  ContractGroupListItem,
} from "@/lib/development/types/contracts";

export const metadata: Metadata = { title: "Contracts · Development OS" };
export const dynamic = "force-dynamic";

const statusTone: Record<
  ContractGroupStatus,
  "ok" | "warn" | "danger" | "gold" | "info" | "amber" | "soft" | undefined
> = {
  draft: "soft",
  pending_signature: "warn",
  partial_signed: "gold",
  fully_signed: "amber",
  in_payment: "amber",
  completed: "ok",
  cancelled: "soft",
  breached: "danger",
};

function fmtUsd(minor: bigint): string {
  return formatUSD(Number(minor) / 100);
}

/** Abbreviated USD for KPI tiles — `$18.4M` / `$985K`, matching the mockup. */
function fmtAbbrevUsd(minor: bigint): string {
  const usd = Number(minor) / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
  return `$${Math.round(usd)}`;
}

// Sentinel fallback: distinct from a genuinely empty board so we can show
// an honest "temporarily unavailable" warning rather than the normal
// "no contract groups yet" empty state when the query times out / fails.
const DEGRADED = Symbol("contracts-degraded");

export default async function ContractsPage() {
  // STAB low-fix: getContractGroups() was awaited raw — a DB hang took the
  // whole /development-os/contracts route down (curl times out at 30s,
  // Playwright never reaches domcontentloaded). Mirror the reservations
  // STAB-2 pattern: wrap in safeQuery with a 4000ms timeout so the page
  // degrades to an empty board with a warning instead of blocking.
  const groupsOrDegraded = await safeQuery<ContractGroupListItem[] | typeof DEGRADED>(
    "getContractGroups",
    getContractGroups(),
    DEGRADED,
    4000,
  );
  const degraded = groupsOrDegraded === DEGRADED;
  const groups = degraded ? [] : groupsOrDegraded;
  const counts = {
    pending: groups.filter((g) => g.status === "pending_signature").length,
    inPayment: groups.filter((g) => g.status === "in_payment" || g.status === "fully_signed").length,
    completed: groups.filter((g) => g.status === "completed").length,
  };
  const totalValueUsdMinor = groups.reduce(
    (acc, g) => acc + g.totalContractValueUsdMinor,
    0n,
  );

  return (
    <DevelopmentShell>
      <div className="section-heading">
        <div className="eyebrow label">Sales · contract groups</div>
        <h1>
          One group per <em>buyer-villa</em> pair.
        </h1>
        <p>
          Off-plan groups carry three child contracts — leasehold, construction
          management, service fee. When all are signed the lead becomes a buyer
          and the unit type freezes.
        </p>
      </div>

      <div className="flex justify-end mb-[22px]">
        <Link href="/development-os" className="btn btn-dark btn-sm">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Command center
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Pending signature"
          value={counts.pending}
          sub="awaiting buyer"
          tone="warn"
        />
        <Kpi
          label="In payment"
          value={counts.inPayment}
          sub="signed · paying"
          tone="accent"
        />
        <Kpi
          label="Completed"
          value={counts.completed}
          sub="handed over"
          tone="success"
        />
        <Kpi
          label="Total value"
          value={fmtAbbrevUsd(totalValueUsdMinor)}
          sub="all groups"
        />
      </div>

      {degraded ? (
        <div className="card flex items-start gap-3 p-4 text-[13px] text-ink-2">
          <AlertTriangle
            className="w-4 h-4 mt-0.5 shrink-0 text-warning"
            strokeWidth={1.75}
          />
          <div>
            <div className="row-title text-ink">Contracts temporarily unavailable</div>
            <p className="mt-0.5">
              The contract groups query is taking too long to respond. Refresh
              in a moment — your data is safe.
            </p>
          </div>
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-5 h-5" strokeWidth={1.75} />}
          title="No contract groups yet"
          description="Convert an active reservation to create the first contract group."
        />
      ) : (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <span className="label">All contract groups</span>
            <span className="label">{groups.length} groups</span>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Buyer</th>
                    <th>Unit</th>
                    <th>Type</th>
                    <th className="num">Total</th>
                    <th>Contract date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id}>
                      <td className="row-title">{g.contactFullName}</td>
                      <td>
                        <div className="font-mono text-[11px] text-ink">
                          {g.villaCode}
                        </div>
                        <div className="text-[11px] text-ink-3">
                          {g.projectName}
                        </div>
                      </td>
                      <td className="text-ink-3">
                        {GROUP_TYPE_LABEL[g.groupType]}
                      </td>
                      <td className="num">
                        {fmtUsd(g.totalContractValueUsdMinor)}
                      </td>
                      <td className="font-mono text-[11px]">
                        {formatDate(g.contractDate, "short")}
                      </td>
                      <td>
                        <HandoffBadge tone={statusTone[g.status]}>
                          {CONTRACT_GROUP_STATUS_LABEL[g.status]}
                        </HandoffBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </DevelopmentShell>
  );
}
