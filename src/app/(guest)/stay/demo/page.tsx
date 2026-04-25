import { GuestShell } from "@/components/layout/guest-shell";
import { StayGuide } from "@/components/guest/stay-guide";
import { ServiceRequestGrid } from "@/components/guest/service-request-grid";
import { AIConciergePreview } from "@/components/guest/ai-concierge-preview";
import { EmergencyBlock } from "@/components/guest/emergency-block";
import { HouseRules } from "@/components/guest/house-rules";
import { ReviewRequest } from "@/components/guest/review-request";
import { Badge } from "@/components/ui/badge";
import { KeyRound, CalendarDays, Users, Smartphone } from "lucide-react";

export const metadata = { title: "Your stay" };

export default function StayDemoPage() {
  return (
    <GuestShell villaName="Enso S5" dates="25 Apr → 29 Apr · 4 nights">
      <div className="flex flex-col gap-10">
        {/* Hero */}
        <section className="rounded-xl overflow-hidden border border-line-soft bg-surface">
          <div
            className="aspect-[16/10] md:aspect-[16/9]"
            style={{
              background:
                "linear-gradient(180deg, rgba(14,59,46,0.15) 0%, rgba(14,59,46,0.5) 100%), linear-gradient(135deg, #5a6b5c 0%, #2a3a30 100%)",
            }}
          />
          <div className="p-6 md:p-8">
            <Badge tone="gold">Welcome, Mr. Martin</Badge>
            <h1 className="text-display text-[34px] md:text-[44px] leading-[1.05] font-medium text-ink mt-4">
              Enso Villa S5
            </h1>
            <p className="mt-3 text-ink-secondary">
              Berawa, Canggu · 4 bedrooms · Ocean-side residence
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-line-soft">
              <div>
                <div className="flex items-center gap-1.5 text-label mb-1.5">
                  <CalendarDays className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Check-in
                </div>
                <div className="text-sm text-ink">
                  Saturday, 25 April · from 15:00
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-label mb-1.5">
                  <CalendarDays className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Check-out
                </div>
                <div className="text-sm text-ink">
                  Wednesday, 29 April · by 11:00
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-label mb-1.5">
                  <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Guests
                </div>
                <div className="text-sm text-ink">4 adults</div>
              </div>
            </div>
          </div>
        </section>

        {/* No-app callout */}
        <section className="rounded-md border border-line-soft bg-muted/40 p-4 flex items-center gap-3">
          <Smartphone
            className="w-4 h-4 text-ink-secondary shrink-0"
            strokeWidth={1.75}
          />
          <div className="flex-1">
            <span className="text-sm text-ink font-medium">No app required.</span>{" "}
            <span className="text-sm text-ink-secondary">
              This page is your stay — bookmark it or add to your home screen.
            </span>
          </div>
        </section>

        {/* Check-in */}
        <section id="check-in">
          <h2 className="text-display text-[24px] leading-tight font-medium text-ink mb-4">
            Check-in
          </h2>
          <div className="rounded-lg border border-line-soft bg-surface p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-md bg-ink text-ink-inverse inline-flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <Badge tone="gold">Available 24 h before arrival</Badge>
              <h3 className="text-base font-medium text-ink mt-3">
                Your smart-lock code will appear here
              </h3>
              <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
                On Friday, 24 April at 15:00 WITA, your personal 6-digit code
                becomes active. It works on the main gate and the front door,
                and expires three hours after checkout. The villa is
                self-check-in — drive straight in through the main gate.
              </p>
              <div className="mt-4 flex items-center gap-2 p-4 rounded-sm bg-muted border border-line-soft">
                <div className="font-mono text-2xl tabular-nums text-ink-tertiary tracking-[0.4em]">
                  · · · · · ·
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Guide */}
        <section id="guide">
          <h2 className="text-display text-[24px] leading-tight font-medium text-ink mb-4">
            Your villa
          </h2>
          <StayGuide />
        </section>

        {/* House rules */}
        <section id="rules">
          <h2 className="text-display text-[24px] leading-tight font-medium text-ink mb-4">
            House rules
          </h2>
          <HouseRules />
        </section>

        {/* Services */}
        <section id="services">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-display text-[24px] leading-tight font-medium text-ink">
              Services & experiences
            </h2>
            <span className="text-xs text-ink-tertiary">
              Booked & billed to your stay
            </span>
          </div>
          <ServiceRequestGrid />
        </section>

        {/* Concierge */}
        <section id="concierge" className="scroll-mt-20">
          <h2 className="text-display text-[24px] leading-tight font-medium text-ink mb-4">
            Concierge
          </h2>
          <AIConciergePreview />
        </section>

        {/* Review */}
        <section id="review">
          <h2 className="text-display text-[24px] leading-tight font-medium text-ink mb-4">
            After your stay
          </h2>
          <ReviewRequest />
        </section>

        {/* Emergency */}
        <section id="emergency">
          <EmergencyBlock />
        </section>
      </div>
    </GuestShell>
  );
}
