import Link from "next/link";
import { StayShell } from "@/components/layout/stay-shell";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileDown } from "lucide-react";
import {
  DEMO_GUIDE_SECTIONS,
  DEMO_HOUSE_RULES,
  DEMO_EMERGENCY_CONTACTS,
  DEMO_STAY,
} from "@/features/demo-data/stay-demo-content";

export const metadata = { title: "Offline guide · demo" };

export default function StayDemoOfflinePage() {
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
            <FileDown className="w-5 h-5 text-ink-secondary" />
            <h1 className="text-display text-[28px] md:text-[36px] font-medium text-ink">
              Offline guide
            </h1>
          </div>
          <p className="text-sm text-ink-secondary leading-relaxed max-w-prose">
            A printable summary for spotty Wi-Fi areas. The "Download PDF"
            button is a placeholder in the demo.
          </p>
        </header>

        <div className="rounded-md border border-line-soft bg-surface p-5 flex items-center justify-between gap-3">
          <div className="text-sm text-ink-secondary">
            Save this page or screenshot the sections below.
          </div>
          <button
            type="button"
            disabled
            className="h-9 px-4 rounded-md border border-line-soft bg-canvas text-sm text-ink-tertiary inline-flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" /> Download PDF (demo)
          </button>
        </div>

        <article className="rounded-md border border-line-soft bg-surface p-6 flex flex-col gap-5">
          <section>
            <h2 className="text-base font-medium text-ink">
              {DEMO_STAY.villaName}
            </h2>
            <p className="text-sm text-ink-secondary mt-1">
              {DEMO_STAY.area}
            </p>
            <p className="text-sm text-ink-secondary mt-1">
              Demo lock code: <strong>{DEMO_STAY.demoLockCode}</strong>
            </p>
          </section>

          {DEMO_GUIDE_SECTIONS.map((s) => (
            <section key={s.id}>
              <h3 className="text-sm font-medium text-ink">{s.title}</h3>
              <ul className="list-disc pl-5 text-sm text-ink-secondary mt-1 space-y-1">
                {s.bullets.slice(0, 3).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          ))}

          <section>
            <h3 className="text-sm font-medium text-ink">House rules</h3>
            <ul className="text-sm text-ink-secondary mt-1 space-y-1">
              {DEMO_HOUSE_RULES.map((r) => (
                <li key={r.title}>
                  <strong className="text-ink">{r.title}:</strong> {r.body}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-medium text-ink">Emergency</h3>
            <ul className="text-sm text-ink-secondary mt-1 space-y-1">
              {DEMO_EMERGENCY_CONTACTS.map((c) => (
                <li key={c.label}>
                  <strong className="text-ink">{c.label}:</strong> {c.value}
                </li>
              ))}
            </ul>
          </section>
        </article>
      </div>
    </StayShell>
  );
}
