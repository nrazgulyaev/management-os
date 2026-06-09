import Link from "next/link";
import { StayShell } from "@/components/layout/stay-shell";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ListChecks } from "lucide-react";
import {
  DEMO_REQUESTS,
  DEMO_STAY,
} from "@/features/demo-data/stay-demo-content";

export const metadata = { title: "Your requests · demo" };

export default function StayDemoRequestsPage() {
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
            <ListChecks className="w-5 h-5 text-ink-secondary" />
            <h1 className="text-display text-[28px] md:text-[36px] font-medium text-ink">
              Your requests
            </h1>
          </div>
          <p className="text-sm text-ink-secondary leading-relaxed max-w-prose">
            Three demo requests with timeline + replies. In production this
            mirrors `guest_service_requests`.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          {DEMO_REQUESTS.map((r) => {
            const tone =
              r.status === "Pending"
                ? "warning"
                : r.status === "Scheduled"
                  ? "info"
                  : "success";
            return (
              <article
                key={r.code}
                className="rounded-md border border-line-soft bg-surface p-5"
              >
                <header className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-ink-tertiary">
                      {r.code}
                    </div>
                    <h2 className="text-base font-medium text-ink">{r.title}</h2>
                  </div>
                  <Badge tone={tone}>{r.status}</Badge>
                </header>
                <ol className="mt-4 border-l border-line-soft pl-4 space-y-3">
                  {r.timeline.map((t, i) => (
                    <li key={i}>
                      <div className="text-[11px] text-ink-tertiary tabular-nums">
                        {t.at}
                      </div>
                      <p className="text-sm text-ink-secondary leading-relaxed mt-0.5">
                        {t.note}
                      </p>
                    </li>
                  ))}
                </ol>
              </article>
            );
          })}
        </div>
      </div>
    </StayShell>
  );
}
