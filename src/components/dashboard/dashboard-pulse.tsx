import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Sunrise,
  KeyRound,
  LogOut,
  Brush,
  Wrench,
  HandCoins,
  Sparkles,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";

const pulse = [
  { icon: Sunrise, label: "Tonight's occupancy", value: "16 / 19", hint: "84.2%" },
  { icon: KeyRound, label: "Arrivals today", value: "3", hint: "2 on time" },
  { icon: LogOut, label: "Departures today", value: "2", hint: "Last: 12:00" },
  { icon: Brush, label: "Villas not ready", value: "2", hint: "ES-S6 · ES-S2" },
  { icon: Wrench, label: "Open tickets", value: "4", hint: "1 SLA warn" },
  { icon: HandCoins, label: "Payouts queued", value: "7", hint: "Rp 742M" },
];

const alerts = [
  {
    tone: "warning" as const,
    label: "ES-S6 · Pool filter pressure alarm",
    meta: "SLA warning · 1d open · Budi W.",
    href: "/dashboard/operations",
  },
  {
    tone: "info" as const,
    label: "EV-07 · Housekeeping awaiting supervisor approval",
    meta: "22/22 items · photos uploaded",
    href: "/dashboard/operations",
  },
  {
    tone: "accent" as const,
    label: "PR-00412 · Rp 14.5M AC compressor · awaiting Director",
    meta: "Procurement · ES-S6",
    href: "/dashboard/inventory",
  },
];

const alertDot: Record<"warning" | "info" | "accent", string> = {
  warning: "bg-warning",
  info: "bg-info",
  accent: "bg-gold",
};

export function DashboardPulse() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-line-soft rounded-lg border border-line-soft overflow-hidden">
        {pulse.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.label}
              className="bg-surface p-4 flex flex-col gap-2"
            >
              <div className="flex items-center gap-1.5 text-label">
                <Icon className="w-3.5 h-3.5 text-ink-tertiary" strokeWidth={1.75} />
                <span className="truncate">{p.label}</span>
              </div>
              <div className="font-mono tabular-nums text-[22px] leading-none text-ink mt-1">
                {p.value}
              </div>
              <div className="text-[11px] text-ink-tertiary">{p.hint}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
        <div className="rounded-lg bg-surface border border-line-soft">
          <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
              <span className="text-sm font-medium text-ink">
                Action feed
              </span>
            </div>
            <span className="text-[11px] text-ink-tertiary">
              {alerts.length} open · updated just now
            </span>
          </div>
          <ul className="divide-y divide-line-soft">
            {alerts.map((a, i) => (
              <li key={i}>
                <Link
                  href={a.href}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${alertDot[a.tone]}`} />
                    <div className="min-w-0">
                      <div className="text-sm text-ink truncate">
                        {a.label}
                      </div>
                      <div className="text-xs text-ink-tertiary mt-0.5 truncate">
                        {a.meta}
                      </div>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-ink-tertiary shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg bg-accent-weak/60 border border-accent/15 p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-sm bg-ink text-ink-inverse inline-flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
            </div>
            <div>
              <span className="text-label">Operations Copilot · AM briefing</span>
            </div>
            <Badge tone="outline" className="ml-auto">
              Preview
            </Badge>
          </div>
          <p className="text-sm text-ink leading-relaxed">
            Three arrivals today, all on track except <strong>EV-07</strong>,
            whose supervisor review has not yet cleared — cleaner reports 22
            of 22 items done with photos. <strong>ES-S6</strong> remains
            blocked on pool parts; vendor ETA is Friday morning.
          </p>
          <ul className="flex flex-col gap-1.5 text-xs text-ink-secondary">
            <li className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-ink-tertiary" />
              Suggested: approve EV-07 cleaning to hit 15:00 check-in.
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-ink-tertiary" />
              Suggested: reassign ES-S6 maintenance to Day 2 schedule.
            </li>
          </ul>
          <p className="text-[10px] text-ink-tertiary border-t border-accent/15 pt-2">
            Briefing drafted by AI; every claim drills to the source row. Not
            live — wiring arrives with Version 4.
          </p>
        </div>
      </div>
    </div>
  );
}
