import { Building2, Home, Users, BedDouble, KeyRound } from "lucide-react";
import type { LiveCounts } from "@/features/dashboard/live-counts";

export function LivePulseStrip({ counts }: { counts: LiveCounts }) {
  const items = [
    { icon: Building2, label: "Projects", value: counts.projects },
    { icon: Home, label: "Villas", value: counts.villas },
    { icon: Users, label: "Owners", value: counts.owners },
    { icon: BedDouble, label: "In-house bookings", value: counts.activeBookings },
    { icon: KeyRound, label: "Check-ins · 14 days", value: counts.upcomingCheckIns },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-line-soft rounded-lg border border-line-soft overflow-hidden">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.label} className="bg-surface p-4 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-label">
              <Icon className="w-3.5 h-3.5 text-ink-tertiary" strokeWidth={1.75} />
              <span className="truncate">{it.label}</span>
            </div>
            <div className="font-mono tabular-nums text-[22px] leading-none text-ink mt-1">
              {it.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
