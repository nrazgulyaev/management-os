import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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

export default async function ContractsPage() {
  const groups = await getContractGroups();
  const counts = {
    pending: groups.filter((g) => g.status === "pending_signature").length,
    inPayment: groups.filter((g) => g.status === "in_payment" || g.status === "fully_signed").length,
    completed: groups.filter((g) => g.status === "completed").length,
  };

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Contracts" },
        ]}
        eyebrow={`${counts.pending} pending signature · ${counts.inPayment} in payment · ${counts.completed} completed`}
        title="Contracts"
        description="Each contract group is the parent record per buyer-villa pair. Off-plan groups have three child contracts (leasehold, construction management, service fee). When all are signed, the lead transitions to buyer and the unit type freezes."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-5 h-5" strokeWidth={1.75} />}
          title="No contract groups yet"
          description="Convert an active reservation to create the first contract group."
        />
      ) : (
        <Section eyebrow="All contract groups" title={`${groups.length} groups`}>
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 border-b border-line-soft text-left">
                  <tr>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Buyer</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Unit</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Type</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary text-right">Total</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Contract date</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr
                      key={g.id}
                      className="border-b border-line-soft last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <span className="text-ink">{g.contactFullName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-ink-tertiary">
                            {g.villaCode}
                          </span>
                          <span className="text-xs text-ink-secondary">
                            {g.projectName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">
                        {GROUP_TYPE_LABEL[g.groupType]}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-ink">
                        {fmtUsd(g.totalContractValueUsdMinor)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {formatDate(g.contractDate, "short")}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone[g.status]}>
                          {CONTRACT_GROUP_STATUS_LABEL[g.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}
    </DevelopmentShell>
  );
}
