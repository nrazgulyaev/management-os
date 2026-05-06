import * as React from "react";
import Link from "next/link";
import { Mail, MapPin, MessageSquare, Phone, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import type { LeadListItem } from "@/lib/development/types/sales";

const channelIcon: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  whatsapp: MessageSquare,
  email: Mail,
  phone: Phone,
  in_person: MapPin,
};

export function LeadCard({
  lead,
  pendingDraftCount = 0,
}: {
  lead: LeadListItem;
  pendingDraftCount?: number;
}) {
  const Channel = lead.preferredCommunicationChannel
    ? channelIcon[lead.preferredCommunicationChannel] ?? Mail
    : Mail;

  return (
    <Link
      href={`${DEVELOPMENT_APP_PATH}/sales/${lead.roleId}`}
      className={cn(
        "block rounded-md border border-line-soft bg-surface p-3.5 hover:border-line-strong hover:shadow-[var(--shadow-rest)] transition-all",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium text-ink truncate">
            {lead.fullName}
          </span>
          {lead.projectName && (
            <span className="text-[11px] text-ink-tertiary truncate">
              {lead.projectName}
              {lead.unitTypeName && (
                <>
                  <span className="opacity-60"> · </span>
                  {lead.unitTypeName}
                </>
              )}
            </span>
          )}
        </div>
        {pendingDraftCount > 0 && (
          <Badge tone="gold" className="shrink-0">
            <Sparkles className="w-3 h-3 mr-1" strokeWidth={2} />
            {pendingDraftCount}
          </Badge>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-ink-tertiary">
        <span className="inline-flex items-center gap-1 truncate">
          <Channel className="w-3 h-3" strokeWidth={1.75} />
          {lead.email ?? lead.phone ?? "—"}
        </span>
        <span className="font-mono shrink-0">
          {formatDate(lead.startedAt, "short")}
        </span>
      </div>

      {(lead.acquisitionSource || lead.agentDisplayName || lead.countryOfResidence) && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {lead.countryOfResidence && (
            <Badge tone="outline">{lead.countryOfResidence}</Badge>
          )}
          {lead.acquisitionSource && (
            <Badge tone="neutral">{lead.acquisitionSource}</Badge>
          )}
          {lead.agentDisplayName && (
            <Badge tone="accent">{lead.agentDisplayName}</Badge>
          )}
        </div>
      )}
    </Link>
  );
}
