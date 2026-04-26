import Link from "next/link";
import { ChevronRight, Wrench } from "lucide-react";
import { MaintenanceStatusPill } from "./task-status-pill";
import { PriorityPill } from "./priority-pill";

export interface MaintenanceTicketCardData {
  id: string;
  ticketCode: string;
  title: string;
  issueCategory: string;
  severity: string;
  status: string;
  villaCode: string | null;
  reportedAt: string;
}

export function MaintenanceTicketCard({
  ticket,
  href,
}: {
  ticket: MaintenanceTicketCardData;
  href: string;
}) {
  const reportedDate = ticket.reportedAt.slice(0, 10);
  return (
    <Link
      href={href}
      className="rounded-lg border border-line-soft bg-surface p-4 flex items-start justify-between gap-3 hover:border-line-strong transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-ink-tertiary">{ticket.ticketCode}</span>
          <PriorityPill priority={ticket.severity} />
          <span className="text-[11px] text-ink-tertiary capitalize">
            {ticket.issueCategory}
          </span>
        </div>
        <div className="text-ink font-medium text-sm mt-2 flex items-center gap-2">
          <Wrench className="w-3.5 h-3.5 text-ink-tertiary" strokeWidth={1.75} />
          {ticket.title}
        </div>
        <div className="text-xs text-ink-secondary mt-0.5">
          {ticket.villaCode ?? "Unassigned villa"} · reported {reportedDate}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <MaintenanceStatusPill status={ticket.status} />
        <ChevronRight className="w-4 h-4 text-ink-tertiary" />
      </div>
    </Link>
  );
}
