import * as React from "react";
import {
  CalendarClock,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
  StickyNote,
  Video,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import type { InteractionListItem } from "@/lib/development/types/sales";

const typeIcon: Record<string, LucideIcon> = {
  call: Phone,
  whatsapp_message: MessageSquare,
  whatsapp_voice: MessageSquare,
  email_in: Mail,
  email_out: Mail,
  zoom_meeting: Video,
  site_meeting: Building2,
  sms: MessageSquare,
  in_person: Building2,
  note: StickyNote,
  system_event: CalendarClock,
  ai_draft: Sparkles,
};

const typeLabel: Record<string, string> = {
  call: "Call",
  whatsapp_message: "WhatsApp",
  whatsapp_voice: "WhatsApp voice",
  email_in: "Email · in",
  email_out: "Email · out",
  zoom_meeting: "Zoom",
  site_meeting: "Site meeting",
  sms: "SMS",
  in_person: "In person",
  note: "Note",
  system_event: "System",
  ai_draft: "AI draft",
};

const directionTone: Record<string, string> = {
  inbound: "bg-info-weak text-info",
  outbound: "bg-accent-weak text-accent",
  internal_note: "bg-muted text-ink-secondary",
};

export function InteractionTimeline({
  items,
  filterTypes,
}: {
  items: InteractionListItem[];
  /** Optional whitelist of interaction types to show (e.g. only ai_draft). */
  filterTypes?: string[];
}) {
  const visible = filterTypes
    ? items.filter((i) => filterTypes.includes(i.interactionType))
    : items;

  if (visible.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-soft bg-muted/30 px-6 py-10 text-center">
        <p className="text-sm text-ink-secondary">
          No interactions yet. Manual notes, calls, and AI drafts will appear here.
        </p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {visible.map((it) => {
        const Icon = typeIcon[it.interactionType] ?? StickyNote;
        return (
          <li
            key={it.id}
            className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-7 h-7 rounded-sm flex items-center justify-center",
                    directionTone[it.direction] ?? "bg-muted text-ink-secondary",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-ink">
                    {it.subject ?? typeLabel[it.interactionType] ?? it.interactionType}
                  </span>
                  <span className="text-[11px] text-ink-tertiary">
                    {typeLabel[it.interactionType] ?? it.interactionType} ·{" "}
                    {it.direction.replace("_", " ")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {it.reviewStatus !== "not_required" && (
                  <Badge
                    tone={
                      it.reviewStatus === "approved"
                        ? "accent"
                        : it.reviewStatus === "rejected"
                          ? "danger"
                          : it.reviewStatus === "sent"
                            ? "success"
                            : "gold"
                    }
                  >
                    {it.reviewStatus}
                  </Badge>
                )}
                <span className="text-[11px] text-ink-tertiary font-mono">
                  {formatDate(it.occurredAt, "short")}
                </span>
              </div>
            </div>
            {it.body && (
              <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">
                {it.body}
              </p>
            )}
            {it.aiSummary && (
              <div className="rounded-sm border border-accent/20 bg-accent-weak/40 px-3 py-2 flex flex-col gap-1">
                <span className="text-label text-accent">AI summary</span>
                <span className="text-xs text-ink leading-relaxed">{it.aiSummary}</span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
