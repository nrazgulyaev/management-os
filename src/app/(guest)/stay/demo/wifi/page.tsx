import Link from "next/link";
import { GuestShell } from "@/components/layout/guest-shell";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Wifi } from "lucide-react";
import { DEMO_STAY } from "@/features/demo-data/stay-demo-content";

export const metadata = { title: "Wi-Fi · demo" };

export default function StayDemoWifiPage() {
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
            Wi-Fi
          </h1>
          <p className="text-sm text-ink-secondary leading-relaxed max-w-prose">
            Tap the password to copy. {DEMO_STAY.wifi.note}
          </p>
        </header>

        <section className="rounded-lg border border-line-soft bg-surface p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-md bg-ink text-ink-inverse inline-flex items-center justify-center shrink-0">
            <Wifi className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <div className="text-label">Network</div>
            <div className="font-mono text-lg text-ink mt-1">
              {DEMO_STAY.wifi.network}
            </div>

            <div className="mt-5 text-label">Password</div>
            <div className="font-mono text-lg text-ink tracking-[0.1em] mt-1">
              {DEMO_STAY.wifi.password}
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center">
              <p className="text-xs text-ink-tertiary leading-relaxed">
                A scannable QR code appears here for guests on iOS / Android
                so they can join the network without typing the password.
              </p>
              <div
                aria-hidden
                className="w-32 h-32 rounded-md border border-line-soft bg-canvas grid grid-cols-8 grid-rows-8 gap-px p-2"
              >
                {Array.from({ length: 64 }).map((_, i) => (
                  <span
                    key={i}
                    className={`rounded-sm ${
                      // Static checkerboard-ish placeholder. No data leak.
                      [3, 7, 9, 12, 15, 18, 22, 27, 33, 41, 48, 54].includes(i % 64)
                        ? "bg-ink"
                        : i % 5 === 0
                          ? "bg-ink"
                          : "bg-line-soft"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-line-soft bg-surface p-5 text-xs text-ink-secondary leading-relaxed">
          <strong className="text-ink">Tip:</strong> reception is strongest on
          the lounge side; the master bedroom has its own AP. If you need a
          stronger connection, use the{" "}
          <Link href="/stay/demo/concierge" className="underline">concierge</Link>
          {" "}to ask for the booster code.
        </section>
      </div>
    </GuestShell>
  );
}
