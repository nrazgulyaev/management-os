import Link from "next/link";
import { GuestShell } from "@/components/layout/guest-shell";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, KeyRound } from "lucide-react";
import { DEMO_STAY } from "@/features/demo-data/stay-demo-content";

export const metadata = { title: "Check-in · demo" };

export default function StayDemoCheckInPage() {
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
          <h1 className="text-display text-[28px] md:text-[36px] font-medium text-ink">
            Check-in details
          </h1>
          <p className="text-sm text-ink-secondary leading-relaxed max-w-prose">
            In production, your personal smart-lock code becomes active 24
            hours before arrival and expires three hours after checkout.
            This demo page shows the layout with placeholder values.
          </p>
        </header>

        <section className="rounded-lg border border-line-soft bg-surface p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-md bg-ink text-ink-inverse inline-flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <Badge tone="gold">Demo · valid window placeholder</Badge>
            <h3 className="text-base font-medium text-ink mt-3">
              Your smart-lock code
            </h3>
            <div className="mt-4 flex items-center gap-2 p-4 rounded-sm bg-muted border border-line-soft">
              <div className="font-mono text-2xl tabular-nums text-ink tracking-[0.4em]">
                {DEMO_STAY.demoLockCode}
              </div>
            </div>
            <p className="text-xs text-ink-tertiary mt-3 leading-relaxed">
              <strong>Demo code:</strong> {DEMO_STAY.demoLockCode} — in
              production codes are unique per stay and shown only during the
              valid window. Works on the main gate and the front door.
            </p>
          </div>
        </section>

        <section className="rounded-md border border-line-soft bg-surface p-6">
          <h2 className="text-base font-medium text-ink mb-3">
            Arrival instructions
          </h2>
          <ol className="list-decimal pl-5 text-sm text-ink-secondary space-y-2 leading-relaxed">
            <li>Drive directly through the main gate. Self-check-in — no front desk.</li>
            <li>Enter your code on the keypad. Press # to confirm.</li>
            <li>Your bedroom is the first on the right; sea-view room.</li>
            <li>Wi-Fi credentials are on the bedside card; also on this site under{" "}
              <Link href="/stay/demo/wifi" className="underline">Wi-Fi</Link>.
            </li>
          </ol>
        </section>

        <section className="rounded-md border border-line-soft bg-surface p-6">
          <h2 className="text-base font-medium text-ink mb-3">
            Driver phrase (give to your taxi)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md bg-muted/40 border border-line-soft p-4">
              <div className="text-label mb-1">English</div>
              <p className="text-sm text-ink">{DEMO_STAY.driverPhrase.en}</p>
            </div>
            <div className="rounded-md bg-muted/40 border border-line-soft p-4">
              <div className="text-label mb-1">Bahasa Indonesia</div>
              <p className="text-sm text-ink">{DEMO_STAY.driverPhrase.id}</p>
            </div>
          </div>
        </section>
      </div>
    </GuestShell>
  );
}
