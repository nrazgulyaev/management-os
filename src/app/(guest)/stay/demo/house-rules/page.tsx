import Link from "next/link";
import { StayShell } from "@/components/layout/stay-shell";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ScrollText } from "lucide-react";
import {
  DEMO_HOUSE_RULES,
  DEMO_STAY,
} from "@/features/demo-data/stay-demo-content";

export const metadata = { title: "House rules · demo" };

export default function StayDemoHouseRulesPage() {
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
            <ScrollText className="w-5 h-5 text-ink-secondary" />
            <h1 className="text-display text-[28px] md:text-[36px] font-medium text-ink">
              House rules
            </h1>
          </div>
        </header>

        <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
          {DEMO_HOUSE_RULES.map((r) => (
            <li key={r.title} className="p-5">
              <div className="text-sm font-medium text-ink">{r.title}</div>
              <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">
                {r.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </StayShell>
  );
}
