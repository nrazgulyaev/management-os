import Link from "next/link";
import { StayShell } from "@/components/layout/stay-shell";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Sparkles } from "lucide-react";
import {
  DEMO_SERVICES,
  DEMO_STAY,
} from "@/features/demo-data/stay-demo-content";

export const metadata = { title: "Services · demo" };

const CATEGORY_LABELS: Record<string, string> = {
  transport: "Transport",
  food: "Food",
  wellness: "Wellness",
  rental: "Rentals",
  housekeeping: "Housekeeping",
};

export default function StayDemoServicesPage() {
  return (
    <StayShell
      villaName={DEMO_STAY.villaName}
      dates="25 Apr → 29 Apr · 4 nights"
      basePath="/stay/demo"
    >
      <div className="flex flex-col gap-8">
        <Link
          href="/stay/demo"
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to your stay
        </Link>

        <header className="flex flex-col gap-2">
          <Badge tone="gold">Demo only</Badge>
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-ink-secondary" />
            <h1 className="text-display text-[28px] md:text-[36px] font-medium text-ink">
              Services & experiences
            </h1>
          </div>
          <p className="text-sm text-ink-secondary leading-relaxed max-w-prose">
            Tap any service to open a demo order form. In production this
            creates a real order and notifies the concierge team.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEMO_SERVICES.map((s) => (
            <Link
              key={s.id}
              href={`/stay/demo/services/${s.id}`}
              className="text-left group rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-2 hover:border-line-strong transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-ink font-medium text-sm">{s.name}</div>
                  <div className="text-xs text-ink-tertiary mt-1">{s.description}</div>
                </div>
                <Badge tone="outline">{CATEGORY_LABELS[s.category]}</Badge>
              </div>
              <div className="mt-auto pt-3 border-t border-line-soft flex items-center justify-between">
                <span className="text-label">From</span>
                <span className="font-mono tabular-nums text-sm text-ink">
                  {s.priceLabel}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </StayShell>
  );
}
