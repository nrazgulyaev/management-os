import Link from "next/link";
import { StayShell } from "@/components/layout/stay-shell";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BookOpen } from "lucide-react";
import {
  DEMO_GUIDE_SECTIONS,
  DEMO_STAY,
} from "@/features/demo-data/stay-demo-content";

export const metadata = { title: "Villa guide · demo" };

export default function StayDemoGuidePage() {
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
            <BookOpen className="w-5 h-5 text-ink-secondary" />
            <h1 className="text-display text-[28px] md:text-[36px] font-medium text-ink">
              Villa guide
            </h1>
          </div>
          <p className="text-sm text-ink-secondary leading-relaxed max-w-prose">
            Appliances, AC, pool notes, and Bali villa quirks.
          </p>
        </header>

        <div className="flex flex-col gap-6">
          {DEMO_GUIDE_SECTIONS.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className="rounded-md border border-line-soft bg-surface p-6"
            >
              <h2 className="text-base font-medium text-ink mb-3">{s.title}</h2>
              <ul className="list-disc pl-5 text-sm text-ink-secondary space-y-2 leading-relaxed">
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </StayShell>
  );
}
