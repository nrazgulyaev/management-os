import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FieldQuickActions } from "@/components/field/field-quick-actions";
import { ChevronRight, CheckCircle2, Clock, Wrench } from "lucide-react";

export const metadata = { title: "Today — Field" };

const todayTasks = [
  {
    id: "hk-eternal-07",
    villa: "Eternal 07",
    code: "EV-07",
    type: "Turnover",
    scheduled: "13:00",
    items: 22,
    done: 22,
    status: "awaiting_approval",
    href: "/field/tasks/demo",
    priority: "P3",
    tone: "warning" as const,
    statusLabel: "Awaiting supervisor",
  },
  {
    id: "hk-enso-s2",
    villa: "Enso S2",
    code: "ES-S2",
    type: "Turnover",
    scheduled: "11:00",
    items: 18,
    done: 11,
    status: "in_progress",
    href: "/field/tasks/demo",
    priority: "P2",
    tone: "info" as const,
    statusLabel: "In progress",
  },
  {
    id: "mt-enso-s6",
    villa: "Enso S6",
    code: "ES-S6",
    type: "Maintenance · AC",
    scheduled: "14:30",
    items: 0,
    done: 0,
    status: "open",
    href: "/field/tasks/demo",
    priority: "P2",
    tone: "warning" as const,
    statusLabel: "Tech en route",
  },
  {
    id: "hk-ahau-02",
    villa: "Ahau 02",
    code: "AH-02",
    type: "Turnover",
    scheduled: "14:30",
    items: 24,
    done: 0,
    status: "queued",
    href: "/field/tasks/demo",
    priority: "P3",
    tone: "neutral" as const,
    statusLabel: "Queued",
  },
];

export default function FieldHome() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="text-label">Saturday · 25 April</span>
        <h1 className="text-display text-[28px] leading-tight font-medium text-ink mt-2">
          Today's tasks
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          Four tasks assigned to you. One awaiting your supervisor.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Assigned", v: "4", icon: Clock },
          { l: "In progress", v: "1", icon: Wrench },
          { l: "Done today", v: "3", icon: CheckCircle2 },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.l}
              className="rounded-md border border-line-soft bg-surface p-3 flex flex-col items-start gap-2"
            >
              <Icon className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
              <div className="font-mono tabular-nums text-lg text-ink">
                {k.v}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                {k.l}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        {todayTasks.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className="rounded-lg border border-line-soft bg-surface p-4 flex items-start justify-between gap-3 hover:border-line-strong transition-colors active:translate-y-[1px]"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-ink-tertiary">
                  {t.code}
                </span>
                <Badge tone="outline">{t.priority}</Badge>
                <span className="text-[11px] text-ink-tertiary tabular-nums">
                  {t.scheduled}
                </span>
              </div>
              <div className="text-ink font-medium text-sm mt-2">{t.villa}</div>
              <div className="text-xs text-ink-secondary mt-0.5">{t.type}</div>
              {t.items > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden max-w-[200px]">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${(t.done / t.items) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-ink-tertiary">
                    {t.done}/{t.items}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Badge tone={t.tone}>{t.statusLabel}</Badge>
              <ChevronRight className="w-4 h-4 text-ink-tertiary" />
            </div>
          </Link>
        ))}
      </div>

      <div>
        <span className="text-label mb-3 inline-block">Quick actions</span>
        <FieldQuickActions />
      </div>

      <div className="mt-2 p-4 rounded-md border border-dashed border-line-soft bg-muted/30">
        <span className="text-label">Offline-ready</span>
        <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
          Checklists, photos, and completions queue locally if your connection
          drops. They sync automatically the moment you're back online.
        </p>
      </div>
    </div>
  );
}
