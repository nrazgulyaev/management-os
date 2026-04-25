import Link from "next/link";
import { HeroSection } from "@/components/marketing/hero-section";
import { EditorialSection } from "@/components/marketing/editorial-section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollStagger, ScrollStaggerItem } from "@/components/motion/scroll-reveal";
import { KeyRound, Wifi, BookOpenText, MessageCircle, Smartphone } from "lucide-react";

export const metadata = { title: "Guest experience" };

export default function GuestExperiencePage() {
  return (
    <>
      <HeroSection
        kind="pillar"
        eyebrow="Guest experience"
        title="A boutique-hotel arrival, without an app to download."
        description="Tokenised stay pages, smart-lock codes released at the right moment, a typeset villa guide, upsells in two taps, and a concierge that knows when to hand off to a human."
        primaryCta={{ label: "Preview a stay page", href: "/stay/demo" }}
        secondaryCta={{ label: "How operations stay calm", href: "/operations" }}
      />

      <EditorialSection
        eyebrow="Pre-arrival"
        title="A welcome that does the work for you."
        description="From booking confirmation to checkout review, guests are guided through a quiet editorial experience. Staff intervene only when it matters — and they have full context when they do."
      >
        <ScrollStagger className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              icon: KeyRound,
              t: "Smart-lock code on time",
              b: "Code surfaces at T-24h and revokes at T+3h after checkout. Never leaks, never reused.",
            },
            {
              icon: Wifi,
              t: "Wi-Fi & utilities",
              b: "Network and password preloaded into the guide. AC, espresso, pool — every quirk documented.",
            },
            {
              icon: BookOpenText,
              t: "Villa guide, typeset",
              b: "House rules, appliances, neighbourhood picks — laid out like a magazine, not a PDF.",
            },
            {
              icon: MessageCircle,
              t: "Concierge online",
              b: "AI Guest Concierge answers in under two minutes. WhatsApp handoff with one tap.",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <ScrollStaggerItem
                key={item.t}
                className="rounded-md border border-line-soft bg-surface p-5"
              >
                <Icon
                  className="w-4 h-4 text-ink-tertiary"
                  strokeWidth={1.75}
                />
                <h3 className="text-ink font-medium mt-3">{item.t}</h3>
                <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
                  {item.b}
                </p>
              </ScrollStaggerItem>
            );
          })}
        </ScrollStagger>
      </EditorialSection>

      {/* No-app callout */}
      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-16 grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7">
            <Badge tone="gold">No download required</Badge>
            <h2 className="text-display text-[32px] md:text-[44px] leading-[1.05] font-medium text-ink mt-4">
              The stay page is the app.
            </h2>
            <p className="mt-4 text-ink-secondary text-base md:text-lg leading-relaxed max-w-xl">
              Every guest receives a signed link by email, SMS, and WhatsApp.
              No app store, no account, no friction — just a URL that opens
              their stay, scoped to one booking, that expires after they leave.
            </p>
          </div>
          <div className="md:col-span-5">
            <div className="rounded-lg border border-line-soft bg-surface p-6 md:p-7 flex flex-col gap-4">
              {[
                { icon: Smartphone, t: "Web-based, mobile-first", b: "Opens in any browser. Add to home screen optional." },
                { icon: KeyRound, t: "Tokenised access", b: "Signed URL scoped to this booking only." },
                { icon: MessageCircle, t: "WhatsApp & SMS delivery", b: "Multi-channel send so the link always reaches them." },
              ].map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.t} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-md bg-muted text-ink-secondary inline-flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" strokeWidth={1.75} />
                    </div>
                    <div>
                      <div className="text-sm text-ink font-medium">{row.t}</div>
                      <p className="text-xs text-ink-secondary mt-0.5">
                        {row.b}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Concierge demo */}
      <EditorialSection
        eyebrow="In-stay"
        title="A concierge that never sleeps. Never invents."
        description="The Guest Concierge answers anything about the stay, the villa, and Bali — grounded in your villa guide and FAQ. Anything sensitive hands off to a human on WhatsApp within seconds."
        invert
      >
        <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
          <div className="flex flex-col">
            {[
              { who: "Guest", msg: "How do I use the air conditioning in the master bedroom?" },
              { who: "Concierge", msg: "Dual-zone control. Press MODE twice for COOL, set the temperature with arrows. The moon icon is quiet-night mode. Source · Villa guide · AC" },
              { who: "Guest", msg: "Can I add a private chef for tomorrow night?" },
              { who: "Concierge", msg: "Chef Ketut is available Saturday 7pm — four-course set menu or à la carte. Shall I request 7pm for 4 guests?" },
            ].map((m, i) => (
              <div
                key={i}
                className={`flex gap-3 p-5 border-b last:border-b-0 border-line-soft ${m.who === "Guest" ? "bg-muted/30" : ""}`}
              >
                <div className="text-label w-20 shrink-0">{m.who}</div>
                <p className="text-sm text-ink leading-relaxed">{m.msg}</p>
              </div>
            ))}
          </div>
        </div>
      </EditorialSection>

      {/* Upsells */}
      <EditorialSection
        eyebrow="Services & experiences"
        title="Upsells that read like a concierge menu, not a checkout."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { n: "Airport transfer", from: "Rp 650k" },
            { n: "Private chef", from: "Rp 1.2M / pax" },
            { n: "In-villa massage", from: "Rp 450k / hr" },
            { n: "Extra cleaning", from: "Rp 380k" },
            { n: "Laundry", from: "Rp 18k / kg" },
            { n: "Scooter rental", from: "Rp 90k / day" },
            { n: "Driver for the day", from: "Rp 850k" },
            { n: "Breakfast in villa", from: "Rp 220k / pax" },
          ].map((u) => (
            <div
              key={u.n}
              className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-2"
            >
              <div className="text-sm text-ink font-medium">{u.n}</div>
              <div className="mt-auto pt-3 border-t border-line-soft flex items-center justify-between">
                <span className="text-label">From</span>
                <span className="font-mono tabular-nums text-sm text-ink">
                  {u.from}
                </span>
              </div>
            </div>
          ))}
        </div>
      </EditorialSection>

      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 text-center">
          <h2 className="text-display text-[34px] md:text-[48px] leading-[1.04] font-medium max-w-3xl mx-auto">
            A five-star arrival, without the ten-star overhead.
          </h2>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/stay/demo">See a demo stay page</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
