import Link from "next/link";
import { StayShell } from "@/components/layout/stay-shell";
import { Eyebrow, SectionTitle, StayRow } from "@/components/stay/stay-ui";
import { Badge } from "@/components/ui/badge";
import {
  KeyRound,
  CalendarDays,
  Users,
  ArrowUpRight,
  Wifi,
  ScrollText,
  ConciergeBell,
  Compass,
  MessageCircle,
  ListChecks,
  FileDown,
  ShieldAlert,
  Map,
  MessagesSquare,
  Phone,
} from "lucide-react";
import {
  DEMO_STAY,
  DEMO_NEIGHBORHOOD,
  DEMO_HOUSE_RULES,
  DEMO_EMERGENCY_CONTACTS,
  DEMO_SERVICES,
} from "@/features/demo-data/stay-demo-content";

export const metadata = { title: "Your stay" };

const TOP_SERVICES = ["airport-transfer", "private-chef", "breakfast"];

export default function StayDemoPage() {
  const topServices = DEMO_SERVICES.filter((s) => TOP_SERVICES.includes(s.id));
  const topPlaces = DEMO_NEIGHBORHOOD.slice(0, 3);
  const topRules = DEMO_HOUSE_RULES.slice(0, 3);
  const topContacts = DEMO_EMERGENCY_CONTACTS.slice(0, 3);

  return (
    <StayShell
      villaName={DEMO_STAY.villaName}
      dates="25 Apr → 29 Apr · 4 nights"
      basePath="/stay/demo"
    >
      <div className="flex flex-col gap-8">
        {/* Hero — editorial villa band (mockup variant A). */}
        <section className="relative -mx-6 -mt-7 overflow-hidden rounded-b-[var(--r-hero)]">
          <div className="bg-stay-hero h-[300px] sm:h-[360px]" />
          <div className="absolute inset-0 bg-stay-hero-scrim" />
          <div className="absolute inset-x-6 bottom-12 text-[#F6F1E7]">
            <Eyebrow className="text-[#F6F1E7]/75">
              Welcome, {DEMO_STAY.guestSalutation}
            </Eyebrow>
            <h1 className="text-display text-[38px] leading-[1.06] tracking-[-0.02em] font-normal text-white mt-1.5">
              {DEMO_STAY.villaName}
            </h1>
            <p className="text-[14.5px] text-white/90 mt-1.5">
              {DEMO_STAY.area} · {DEMO_STAY.bedrooms} bedrooms
            </p>
          </div>
        </section>

        <div className="rounded-[var(--r-md)] border border-warning/30 bg-warning-weak px-5 py-3 text-xs text-warning leading-relaxed">
          <span className="font-medium">Demo only.</span> No personal data is
          stored or collected. Real stays use tokenised links of the form{" "}
          <code className="font-mono text-[11px]">/stay/[token]</code> minted
          from a confirmed booking.
        </div>

        {/* Stay facts (mockup countdown card analogue). */}
        <section className="rounded-[var(--r-card)] border border-line-soft bg-surface shadow-[var(--shadow-card)] p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-label mb-1.5">
                <CalendarDays className="w-3.5 h-3.5" strokeWidth={1.75} />
                Check-in
              </div>
              <div className="text-sm text-ink">{DEMO_STAY.checkInLabel}</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-label mb-1.5">
                <CalendarDays className="w-3.5 h-3.5" strokeWidth={1.75} />
                Check-out
              </div>
              <div className="text-sm text-ink">{DEMO_STAY.checkOutLabel}</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-label mb-1.5">
                <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
                Guests
              </div>
              <div className="text-sm text-ink">{DEMO_STAY.guests} adults</div>
            </div>
          </div>
        </section>

        {/* Your service (mockup .row list). */}
        <section>
          <SectionTitle title="Your service" />
          <div className="rounded-[var(--r-card)] border border-line-soft bg-surface shadow-[var(--shadow-card)] px-5 divide-y divide-line-soft">
            <StayRow
              href="/stay/demo/concierge"
              icon={MessageCircle}
              title="Concierge"
              detail="Ask anything — we reply around the clock"
            />
            <StayRow
              href="/stay/demo/services"
              icon={ConciergeBell}
              title="Services & orders"
              detail="Breakfast, spa, transfer, groceries"
            />
            <StayRow
              href="/stay/demo/neighborhood"
              icon={Compass}
              title="Nearby"
              detail="Beaches, restaurants, what to see"
            />
            <StayRow
              href="/stay/demo/guide"
              icon={ScrollText}
              title="Villa guide"
              detail="Wi-Fi, appliances, house rules"
            />
          </div>
        </section>

        {/* Smart lock / Check-in */}
        <Link
          href="/stay/demo/check-in"
          className="rounded-[var(--r-card)] border border-line-soft bg-surface shadow-[var(--shadow-card)] p-6 flex items-start gap-4 hover:border-line-strong transition-colors group"
        >
          <div className="w-10 h-10 rounded-md bg-ink text-ink-inverse inline-flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <Badge tone="gold">Demo · valid window placeholder</Badge>
              <ArrowUpRight className="w-4 h-4 text-ink-tertiary group-hover:text-ink" />
            </div>
            <h2 className="text-display text-[22px] leading-tight font-medium text-ink mt-3">
              Check-in & smart lock
            </h2>
            <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
              In production your personal 6-digit code becomes active 24 h
              before arrival and expires three hours after checkout. Demo
              code below is a placeholder.
            </p>
            <div className="mt-4 flex items-center gap-3 p-4 rounded-sm bg-muted border border-line-soft">
              <span className="text-label">Demo code</span>
              <span className="font-mono text-2xl tabular-nums text-ink tracking-[0.4em]">
                {DEMO_STAY.demoLockCode}
              </span>
            </div>
          </div>
        </Link>

        {/* Wi-Fi */}
        <Link
          href="/stay/demo/wifi"
          className="rounded-[var(--r-card)] border border-line-soft bg-surface shadow-[var(--shadow-card)] p-6 flex items-start gap-4 hover:border-line-strong transition-colors group"
        >
          <div className="w-10 h-10 rounded-md bg-ink/5 inline-flex items-center justify-center shrink-0">
            <Wifi className="w-4 h-4 text-ink-secondary" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-label">Wi-Fi</span>
              <ArrowUpRight className="w-4 h-4 text-ink-tertiary group-hover:text-ink" />
            </div>
            <h2 className="text-display text-[22px] leading-tight font-medium text-ink mt-1">
              {DEMO_STAY.wifi.network}
            </h2>
            <div className="mt-2 font-mono text-sm text-ink-secondary tracking-[0.1em]">
              {DEMO_STAY.wifi.password}
            </div>
            <p className="text-xs text-ink-tertiary mt-2">
              Encrypted at rest in production. Tap to see the QR placeholder.
            </p>
          </div>
        </Link>

        {/* Services */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-display text-[24px] leading-tight font-medium text-ink">
              Services & experiences
            </h2>
            <Link
              href="/stay/demo/services"
              className="text-xs text-ink hover:underline underline-offset-4"
            >
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topServices.map((s) => (
              <Link
                key={s.id}
                href={`/stay/demo/services/${s.id}`}
                className="rounded-[var(--r-md)] border border-line-soft bg-surface shadow-[var(--shadow-card)] p-5 flex flex-col gap-2 hover:border-line-strong transition-colors group"
              >
                <div className="flex items-start justify-between">
                  <ConciergeBell className="w-4 h-4 text-forest" strokeWidth={1.75} />
                  <ArrowUpRight className="w-4 h-4 text-ink-tertiary group-hover:text-ink" />
                </div>
                <div className="text-ink font-medium text-sm">{s.name}</div>
                <div className="text-xs text-ink-tertiary">{s.description}</div>
                <div className="mt-auto pt-3 border-t border-line-soft flex items-center justify-between">
                  <span className="text-label">From</span>
                  <span className="font-mono tabular-nums text-sm text-ink">
                    {s.priceLabel}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Concierge */}
        <Link
          href="/stay/demo/concierge"
          className="rounded-[var(--r-card)] border border-line-soft bg-surface shadow-[var(--shadow-card)] p-6 flex items-start gap-4 hover:border-line-strong transition-colors group"
        >
          <div className="w-10 h-10 rounded-md bg-ink/5 inline-flex items-center justify-center shrink-0">
            <MessagesSquare className="w-4 h-4 text-ink-secondary" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-label">Concierge</span>
              <ArrowUpRight className="w-4 h-4 text-ink-tertiary group-hover:text-ink" />
            </div>
            <h2 className="text-display text-[22px] leading-tight font-medium text-ink mt-1">
              Ask anything about your stay
            </h2>
            <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
              Mock chat with five canned replies — production routes to a
              real concierge with handoff to staff.
            </p>
          </div>
        </Link>

        {/* Emergency */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-display text-[24px] leading-tight font-medium text-ink">
              Emergency
            </h2>
            <Link
              href="/stay/demo/emergency"
              className="text-xs text-ink hover:underline underline-offset-4"
            >
              All numbers →
            </Link>
          </div>
          <div className="rounded-lg border border-line-soft bg-surface divide-y divide-line-soft">
            {topContacts.map((c) => (
              <div
                key={c.label}
                className="px-5 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-danger" />
                  <span className="text-sm text-ink">{c.label}</span>
                </div>
                <div className="font-mono text-sm text-ink tabular-nums flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-ink-tertiary" />
                  {c.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Neighborhood */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-display text-[24px] leading-tight font-medium text-ink">
              Neighborhood
            </h2>
            <Link
              href="/stay/demo/neighborhood"
              className="text-xs text-ink hover:underline underline-offset-4"
            >
              Open map →
            </Link>
          </div>
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {topPlaces.map((p) => (
              <li
                key={p.name}
                className="p-4 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <Map className="w-4 h-4 text-ink-tertiary mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-ink">{p.name}</div>
                    <div className="text-xs text-ink-tertiary mt-0.5">
                      {p.type} · {p.walkMins} min walk
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* House rules */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-display text-[24px] leading-tight font-medium text-ink">
              House rules
            </h2>
            <Link
              href="/stay/demo/house-rules"
              className="text-xs text-ink hover:underline underline-offset-4"
            >
              All rules →
            </Link>
          </div>
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {topRules.map((r) => (
              <li key={r.title} className="p-4 flex items-start gap-3">
                <ScrollText className="w-4 h-4 text-ink-tertiary mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-ink">{r.title}</div>
                  <p className="text-xs text-ink-tertiary mt-1 leading-relaxed">
                    {r.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Secondary nav */}
        <section className="rounded-[var(--r-md)] border border-line-soft bg-muted/40 p-5">
          <div className="text-label mb-3">More</div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/stay/demo/guide"
              className="text-sm text-ink hover:underline underline-offset-4 inline-flex items-center gap-1.5"
            >
              <ScrollText className="w-3.5 h-3.5" /> Read the full guide
            </Link>
            <Link
              href="/stay/demo/requests"
              className="text-sm text-ink hover:underline underline-offset-4 inline-flex items-center gap-1.5"
            >
              <ListChecks className="w-3.5 h-3.5" /> Your requests
            </Link>
            <Link
              href="/stay/demo/offline"
              className="text-sm text-ink hover:underline underline-offset-4 inline-flex items-center gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" /> Offline guide
            </Link>
          </div>
        </section>
      </div>
    </StayShell>
  );
}
