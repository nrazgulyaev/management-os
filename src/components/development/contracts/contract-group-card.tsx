import * as React from "react";
import Link from "next/link";
import { Building2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, formatUSD } from "@/lib/utils";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import type { ContractGroupListItem } from "@/lib/development/types/contracts";
import { CONTRACT_GROUP_STATUS_LABEL } from "@/lib/development/constants/contracts-constants";

const statusTone: Record<
  string,
  "neutral" | "accent" | "gold" | "warning" | "danger" | "success"
> = {
  draft: "neutral",
  pending_signature: "gold",
  partial_signed: "gold",
  fully_signed: "accent",
  in_payment: "accent",
  completed: "success",
  cancelled: "neutral",
  breached: "danger",
};

function fmtUsdMinor(minor: bigint): string {
  return formatUSD(Number(minor) / 100);
}

export function ContractGroupCard({
  group,
}: {
  group: ContractGroupListItem;
}) {
  return (
    <Link
      href={`${DEVELOPMENT_APP_PATH}/contracts/${group.id}`}
      className={cn(
        "group block rounded-md border border-line-soft bg-surface p-5 hover:border-line-strong hover:shadow-[var(--shadow-rest)] transition-all",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-ink-tertiary" strokeWidth={1.75} />
            <span className="text-sm font-medium text-ink truncate">
              {group.contactFullName}
            </span>
          </div>
          <span className="text-xs text-ink-tertiary truncate">
            {group.villaCode}
            {group.villaName && ` · ${group.villaName}`}
          </span>
        </div>
        <Badge tone={statusTone[group.status] ?? "neutral"}>
          {CONTRACT_GROUP_STATUS_LABEL[group.status] ?? group.status}
        </Badge>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-tertiary">
        <Building2 className="w-3 h-3" strokeWidth={1.75} />
        <span className="truncate">{group.projectName}</span>
        <span className="opacity-60">·</span>
        <span className="font-mono">{group.templateName}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-tertiary">Contract value</dt>
          <dd className="font-mono tabular-nums text-ink">
            {fmtUsdMinor(group.totalContractValueUsdMinor)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-tertiary">Signed</dt>
          <dd className="font-mono tabular-nums text-ink">
            {group.fullySignedAt
              ? formatDate(group.fullySignedAt, "short")
              : group.firstSignedAt
                ? `partial · ${formatDate(group.firstSignedAt, "short")}`
                : "—"}
          </dd>
        </div>
      </dl>

      {group.salesSchemeName && (
        <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-ink-tertiary">
          <span>Scheme:</span>
          <span className="font-mono text-ink">{group.salesSchemeName}</span>
        </div>
      )}
    </Link>
  );
}
