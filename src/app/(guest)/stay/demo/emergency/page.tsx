import Link from "next/link";
import { GuestShell } from "@/components/layout/guest-shell";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import {
  DEMO_EMERGENCY_CONTACTS,
  DEMO_STAY,
} from "@/features/demo-data/stay-demo-content";

export const metadata = { title: "Emergency · demo" };

export default function StayDemoEmergencyPage() {
  return (
    <GuestShell
      villaName={DEMO_STAY.villaName}
      dates="25 Apr → 29 Apr · 4 nights"
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
            <ShieldAlert className="w-5 h-5 text-danger" />
            <h1 className="text-display text-[28px] md:text-[36px] font-medium text-ink">
              Emergency
            </h1>
          </div>
          <p className="text-sm text-ink-secondary leading-relaxed max-w-prose">
            Numbers to call in case of emergency. Demo numbers are masked.
          </p>
        </header>

        <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
          {DEMO_EMERGENCY_CONTACTS.map((c) => (
            <li
              key={c.label}
              className="p-5 flex items-center justify-between gap-3"
            >
              <div className="text-sm text-ink">{c.label}</div>
              <div className="font-mono text-sm text-ink tabular-nums">
                {c.value}
              </div>
            </li>
          ))}
        </ul>

        <section className="rounded-md border border-warning/40 bg-warning-weak/30 p-5 text-sm text-ink-secondary leading-relaxed">
          <strong className="text-ink">If unsure:</strong> call the villa
          manager first. They speak English + Bahasa Indonesia and will
          coordinate the right help.
        </section>
      </div>
    </GuestShell>
  );
}
