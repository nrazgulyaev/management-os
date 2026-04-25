import {
  ShieldCheck,
  LineChart,
  Building2,
  Sparkles,
  Users,
  Fingerprint,
} from "lucide-react";

const items = [
  { icon: Building2, label: "Premium villa portfolios" },
  { icon: LineChart, label: "Family-office reporting" },
  { icon: Users, label: "Individual · pooled · hybrid" },
  { icon: ShieldCheck, label: "Row-level privacy" },
  { icon: Sparkles, label: "Permission-aware AI" },
  { icon: Fingerprint, label: "Hash-signed statements" },
];

export function TrustStrip() {
  return (
    <div className="border-y border-line-soft bg-muted/40">
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-5">
        <div className="flex flex-wrap items-center justify-center md:justify-between gap-x-8 gap-y-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="inline-flex items-center gap-2 text-[12px] text-ink-secondary"
              >
                <Icon className="w-3.5 h-3.5 text-ink-tertiary" strokeWidth={1.75} />
                <span className="tracking-wide">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
