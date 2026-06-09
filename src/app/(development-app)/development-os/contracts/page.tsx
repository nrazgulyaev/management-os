import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { formatDate, formatUSD } from "@/lib/utils";
import { getContractGroups } from "@/lib/development/server/contracts";
import {
  CONTRACT_GROUP_STATUS_LABEL,
  GROUP_TYPE_LABEL,
} from "@/lib/development/constants/contracts-constants";
import type { ContractGroupStatus } from "@/lib/development/types/contracts";

export const metadata: Metadata = { title: "Contracts · Development OS" };
export const dynamic = "force-dynamic";

const statusTone: Record<ContractGroupStatus, "neutral" | "warning" | "accent" | "success" | "danger" | "gold"> = {
  draft: "neutral",
  pending_signature: "warning",
  partial_signed: "gold",
  fully_signed: "accent",
  in_payment: "accent",
  completed: "success",
  cancelled: "neutral",
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

export default async function ContractsPage() {
  const groups = await getContractGroups();
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Contracts" },
        ]}
        eyebrow="Sales · contract groups"
        title="One group per buyer-villa pair"
        description="Off-plan groups carry three child contracts — leasehold, construction management, service fee. When all are signed the lead becomes a buyer and the unit type freezes."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      <div className="projects-kpi-strip">
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

      {groups.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-5 h-5" strokeWidth={1.75} />}
          title="No contract groups yet"
          description="Convert an active reservation to create the first contract group."
        />
      ) : (
        <Card padding="default" overflowHidden>
          <div className="flex items-center gap-2.5 mb-3.5">
            <h3 className="display text-[19px] font-medium tracking-tight m-0">
              All contract groups
            </h3>
            <span className="label ml-auto text-[10.5px] tracking-[0.04em]">
              {groups.length} groups
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="data w-full">
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
                    <td className="text-ink">{g.contactFullName}</td>
                    <td>
                      <div className="font-mono text-[11px] text-ink-tertiary">
                        {g.villaCode}
                      </div>
                      <div className="text-[11px] text-ink-secondary">
                        {g.projectName}
                      </div>
                    </td>
                    <td className="text-ink-secondary">
                      {GROUP_TYPE_LABEL[g.groupType]}
                    </td>
                    <td className="num">
                      {fmtUsd(g.totalContractValueUsdMinor)}
                    </td>
                    <td className="font-mono text-[11px]">
                      {formatDate(g.contractDate, "short")}
                    </td>
                    <td>
                      <Badge tone={statusTone[g.status]}>
                        {CONTRACT_GROUP_STATUS_LABEL[g.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </DevelopmentShell>
  );
}
