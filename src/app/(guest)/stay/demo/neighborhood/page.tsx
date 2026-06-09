import Link from "next/link";
import { StayShell } from "@/components/layout/stay-shell";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Map } from "lucide-react";
import {
  DEMO_NEIGHBORHOOD,
  DEMO_STAY,
} from "@/features/demo-data/stay-demo-content";

export const metadata = { title: "Neighborhood · demo" };

export default function StayDemoNeighborhoodPage() {
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
            <Map className="w-5 h-5 text-ink-secondary" />
            <h1 className="text-display text-[28px] md:text-[36px] font-medium text-ink">
              Neighborhood
            </h1>
          </div>
          <p className="text-sm text-ink-secondary leading-relaxed max-w-prose">
            Curated picks within walking distance. In production this opens
            an interactive map; the demo shows the static list.
          </p>
        </header>

        <section
          aria-hidden
          className="rounded-md border border-line-soft bg-canvas h-48 md:h-64 grid place-items-center text-xs text-ink-tertiary"
        >
          Map placeholder · production renders an interactive map
        </section>

        <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
          {DEMO_NEIGHBORHOOD.map((p) => (
            <li
              key={p.name}
              className="p-5 flex items-start justify-between gap-3"
            >
              <div>
                <div className="text-sm font-medium text-ink">{p.name}</div>
                <div className="text-xs text-ink-tertiary mt-0.5">
                  {p.type} · {p.walkMins} min walk
                </div>
                <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">
                  {p.note}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </StayShell>
  );
}
