import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PurchaseRequestStatusPill } from "./purchase-status-pill";
import { Badge } from "@/components/ui/badge";
import { formatMoneyMinor } from "@/lib/money";
import type { PurchaseRequestRow } from "@/features/procurement/services";

export function RequestCard({
  request,
  href,
}: {
  request: PurchaseRequestRow;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-line-soft bg-surface p-4 flex items-start justify-between gap-3 hover:border-line-strong transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-ink-tertiary">{request.requestCode}</span>
          <Badge tone="outline">{request.priority}</Badge>
          <span className="text-[11px] text-ink-tertiary">{request.lineCount} lines</span>
        </div>
        <div className="text-sm text-ink font-medium mt-2">{request.title}</div>
        <div className="text-xs text-ink-secondary mt-0.5">
          {request.supplierName ?? "No supplier picked"}
          {request.projectName ? ` · ${request.projectName}` : ""}
          {request.requestedByName ? ` · by ${request.requestedByName}` : ""}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <PurchaseRequestStatusPill status={request.status} />
        {request.totalEstimatedMinor !== null && request.currency && (
          <span className="font-mono tabular-nums text-xs text-ink">
            {formatMoneyMinor(request.totalEstimatedMinor, request.currency)}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-ink-tertiary" />
      </div>
    </Link>
  );
}
