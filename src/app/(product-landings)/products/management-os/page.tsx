import Link from "next/link";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { subscriptionUrl } from "@/lib/marketing/cross-product-links";
import { CabinetPicker } from "./_components/cabinet-picker";

/**
 * Sprint _handoff/ Task 3 — Management OS landing.
 *
 * 1:1 port of `_handoff/management.html` (landing.js + shared.js).
 * Section order matches the prototype:
 *
 *   MgmtNav → Hero (with HeroFrame floating tiles) → TrustStrip →
 *   ThreeActs → CabinetsSection (interactive picker) → AISection →
 *   OwnerSection → FeatureGrid → Testimonial → Pricing → CTABand →
 *   MgmtFooter
 *
 * Hash-routing in the prototype becomes real Next routes:
 *   go("signup") → /signup
 *   go("login")  → /login
 *   go("frontoffice") → /dashboard
 *   go("owner")  → /owner
 *   go("landing#anchor") → #anchor on this page
 *
 * The CabinetsSection picker keeps its useState — promoted into a
 * tiny client island under `_components/cabinet-picker.tsx`.
 * Everything else stays server-rendered.
 *
 * Typography + palette resolve via `<html data-product="management">`
 * (RootLayout sets it from the middleware x-product header). For apex
 * traffic hitting /products/management-os directly, we force the
 * attribute via the `<div data-product="management">` wrapper so the
 * Mgmt palette still resolves.
 */

export const metadata = {
  title: "Arconique Management OS · Run the villa portfolio quietly",
  description:
    "The operating system for boutique villa and hotel companies — bookings, owner statements, concierge AI, housekeeping, all on one source of truth.",
};

export default function ManagementOsLandingPage() {
  return (
    <div data-product="management" className="product-landing">
      <RevealOnScroll />
      <MgmtNav />
      <main>
        <Hero />
        <TrustStrip />
        <ThreeActs />
        <CabinetsSection />
        <AISection />
        <OwnerSection />
        <FeatureGrid />
        <Testimonial />
        <Pricing />
        <CTABand />
      </main>
      <MgmtFooter />
    </div>
  );
}

// ============================================================
// Icons — inline SVG line-set from prototype shared.js
// ============================================================

type IconProps = { width?: number | string; height?: number | string };

const I = {
  arrow: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  check: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...p}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  ),
  bed: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M3 18V8m0 6h18m0 0v4m0-4v-2a3 3 0 0 0-3-3h-5v5M3 8h6" />
    </svg>
  ),
  receipt: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M5 3v18l3-2 3 2 3-2 3 2 3-2V3l-3 2-3-2-3 2-3-2-3 2zM9 9h6M9 13h6" />
    </svg>
  ),
  spark: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
    </svg>
  ),
  globe: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  ),
  shield: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
    </svg>
  ),
  phone: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </svg>
  ),
  calendar: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  ),
  msg: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M21 12a8 8 0 0 1-12.2 6.8L3 20l1.2-5.8A8 8 0 1 1 21 12z" />
    </svg>
  ),
  bell: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M6 8a6 6 0 1 1 12 0c0 5 2 7 2 7H4s2-2 2-7zM10 19a2 2 0 0 0 4 0" />
    </svg>
  ),
  download: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M12 4v12m0 0l-5-5m5 5l5-5M4 20h16" />
    </svg>
  ),
  chart: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M4 20V8M10 20V4M16 20v-8M22 20H2" />
    </svg>
  ),
  logo: (p: IconProps) => (
    <svg viewBox="0 0 32 32" fill="none" {...p}>
      <path d="M16 4 L26 22 H6 Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 22 L16 13 L21 22" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
};

function MgmtNav() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        background: "rgba(244,239,230,0.78)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "14px 28px",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <Link href="#top" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--forest)" }}>
            <I.logo width={22} height={22} />
          </span>
          <span
            style={{
              fontFamily: "var(--font-newsreader), serif",
              fontSize: 20,
              letterSpacing: "-0.01em",
            }}
          >
            Arconique
          </span>
          <span
            className="label"
            style={{
              marginLeft: 2,
              padding: "2px 8px",
              border: "1px solid var(--line)",
              borderRadius: 999,
              fontSize: 10,
            }}
          >
            Management
          </span>
        </Link>
        <nav
          className="hide-mobile"
          style={{ display: "flex", gap: 22, marginLeft: 18, fontSize: 14 }}
        >
          {[
            ["Product", "#product"],
            ["Cabinets", "#cabinets"],
            ["Concierge AI", "#ai"],
            ["Owners", "#owner"],
            ["Pricing", "#pricing"],
          ].map(([l, href]) => (
            <Link key={l} href={href} style={{ color: "var(--ink-3)" }}>
              {l}
            </Link>
          ))}
        </nav>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <Link
            href="/dashboard"
            className="hide-mobile"
            style={{ fontSize: 14, color: "var(--ink-3)" }}
          >
            Live demo →
          </Link>
          <Link href="/login" className="btn btn-ghost hide-mobile">
            Sign in
          </Link>
          <a href={subscriptionUrl("/signup")} className="btn btn-primary">
            Start trial
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section
      id="product"
      style={{ position: "relative", paddingTop: 48, paddingBottom: 80, overflow: "hidden" }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
        <div
          className="label"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            border: "1px solid var(--line)",
            borderRadius: 999,
            background: "var(--cream-warm)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--terra)",
            }}
          />
          The Arconique Management OS · v9
        </div>

        <h1
          className="display"
          data-reveal
          style={{
            fontSize: "clamp(56px, 9vw, 108px)",
            marginTop: 24,
            marginBottom: 24,
            maxWidth: 1100,
            fontWeight: 400,
          }}
        >
          Run the entire villa portfolio
          <br />
          <em>quietly. profitably. transparently.</em>
        </h1>

        <p
          style={{
            fontSize: 20,
            maxWidth: 680,
            color: "var(--ink-2)",
            lineHeight: 1.5,
            marginTop: 0,
          }}
        >
          Arconique is the operating system for boutique villa and hotel
          companies on Airbnb, Booking.com and direct channels — bookings,
          owner statements, concierge AI, housekeeping, all on one source of
          truth.
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
          <a href={subscriptionUrl("/signup")} className="btn btn-primary btn-lg">
            Start 14-day trial <I.arrow width={16} height={16} />
          </a>
          <Link href="/dashboard" className="btn btn-secondary btn-lg">
            Tour live demo
          </Link>
        </div>

        <div style={{ marginTop: 64, position: "relative" }}>
          <HeroFrame />
        </div>

        <div
          style={{
            marginTop: 36,
            display: "flex",
            flexWrap: "wrap",
            gap: 36,
            alignItems: "center",
            color: "var(--ink-3)",
            fontSize: 13,
          }}
        >
          {[
            ["200+", "Bali villas live"],
            ["$3.8M", "processed monthly"],
            ["14", "portfolios since 2024"],
            ["4", "languages, 24/7 concierge"],
          ].map(([n, l]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="num"
                style={{ fontSize: 22, color: "var(--ink)", fontWeight: 500 }}
              >
                {n}
              </span>{" "}
              {l}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HeroFrame() {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 24,
        overflow: "hidden",
        border: "1px solid var(--line)",
        boxShadow: "0 60px 80px -50px rgba(20,32,28,0.35)",
      }}
    >
      <div
        style={{
          position: "relative",
          aspectRatio: "16 / 8",
          minHeight: 420,
          background:
            "radial-gradient(120% 80% at 50% 80%, rgba(31,58,51,0.45), transparent 60%), repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 24px), linear-gradient(180deg, #c89e6c 0%, #a17a4a 45%, #5e4628 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: 32,
            color: "rgba(255,252,247,0.85)",
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            Villa Eternal Sunset · Pererenan
          </div>
          <div
            style={{
              fontFamily: "var(--font-newsreader), serif",
              fontSize: 36,
              fontStyle: "italic",
              lineHeight: 1,
              marginTop: 6,
            }}
          >
            Tonight, 23 of 28 villas asleep
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 28,
          left: 28,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxWidth: 260,
          zIndex: 2,
        }}
      >
        <HeroTile>
          <div className="label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="pulse-dot" /> Tonight occupancy
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            <span className="num" style={{ fontSize: 28, color: "var(--forest)" }}>
              82%
            </span>
            <span className="num" style={{ fontSize: 13, color: "var(--ink-3)" }}>
              23 / 28 villas
            </span>
          </div>
          <div style={{ display: "flex", gap: 3, marginTop: 8 }}>
            {Array.from({ length: 28 }).map((_, i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 1,
                  background: i < 23 ? "var(--terra)" : "var(--line)",
                }}
              />
            ))}
          </div>
        </HeroTile>
        <HeroTile>
          <div className="label">Arrivals · today</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            <span className="num" style={{ fontSize: 24, color: "var(--ink)" }}>
              6
            </span>
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
              guests · 100% ready
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {["E.W", "K.T", "M.O", "J.R", "S.B", "L.D"].map((n) => (
              <div
                key={n}
                className="mono"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: "var(--cream-deep)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  color: "var(--ink-2)",
                  border: "1px solid var(--line)",
                }}
              >
                {n}
              </div>
            ))}
          </div>
        </HeroTile>
      </div>

      <div
        style={{
          position: "absolute",
          top: 28,
          right: 28,
          maxWidth: 280,
          zIndex: 2,
        }}
      >
        <HeroTileDark>
          <div className="label" style={{ color: "rgba(255,252,247,0.7)" }}>
            Concierge AI · live
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            <span className="num" style={{ fontSize: 24 }}>
              18
            </span>
            <span style={{ fontSize: 13, opacity: 0.78 }}>
              active sessions · 4 languages
            </span>
          </div>
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.08)",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            <span style={{ opacity: 0.7 }}>Sofia · Villa ES-S2:</span>
            {' "Pool heater please by 6pm?" '}
            <span style={{ color: "var(--gold-soft)" }}>→ task auto-created</span>
          </div>
        </HeroTileDark>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 28,
          right: 28,
          maxWidth: 280,
          zIndex: 2,
        }}
      >
        <HeroTile>
          <div className="label">Owner statement · ready</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            <span
              style={{
                fontFamily: "var(--font-newsreader), serif",
                fontStyle: "italic",
                fontSize: 22,
                color: "var(--ink)",
              }}
            >
              October
            </span>
            <span className="num" style={{ fontSize: 14, color: "var(--ink-3)" }}>
              2026
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-3)" }}>
            14 owners · auto-sent at 09:00 GMT+8
          </div>
          <Link
            href="/owner"
            className="btn btn-ghost"
            style={{ padding: "6px 0", fontSize: 13, color: "var(--terra)" }}
          >
            Preview owner view <I.arrow width={13} height={13} />
          </Link>
        </HeroTile>
      </div>

      <div style={{ position: "absolute", bottom: 28, left: 28, zIndex: 2 }}>
        <HeroTile style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "flex" }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill="#BC9A5C">
                <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
              </svg>
            ))}
          </span>
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
            Trusted by 200+ Bali villas
          </span>
        </HeroTile>
      </div>
    </div>
  );
}

function HeroTile({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "rgba(255,252,247,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(218,210,192,0.5)",
        borderRadius: 14,
        padding: "14px 16px",
        boxShadow: "0 16px 40px -20px rgba(20,32,28,0.4)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function HeroTileDark({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(31,58,51,0.86)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        color: "var(--cream-warm)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: "14px 16px",
      }}
    >
      {children}
    </div>
  );
}

function TrustStrip() {
  const names = [
    "Eternal Estates",
    "Enso Villas",
    "Pererenan Collection",
    "Ubud Atelier",
    "Canggu Houses",
    "Seminyak Group",
    "Beachfront Bali",
    "Tirta Villas",
  ];
  return (
    <section
      style={{
        borderTop: "1px solid var(--line-soft)",
        borderBottom: "1px solid var(--line-soft)",
        background: "var(--cream-warm)",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "24px 28px",
          display: "flex",
          alignItems: "center",
          gap: 48,
          flexWrap: "wrap",
        }}
      >
        <span className="label">Operators on Arconique</span>
        <div
          style={{
            display: "flex",
            gap: 36,
            flexWrap: "wrap",
            flex: 1,
            justifyContent: "space-between",
          }}
        >
          {names.map((n, i) => (
            <span
              key={n}
              style={{
                fontFamily: "var(--font-newsreader), serif",
                fontStyle: i % 2 ? "italic" : "normal",
                fontSize: 16,
                color: "var(--ink-3)",
              }}
            >
              {n}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function ThreeActs() {
  const acts = [
    {
      time: "06:00",
      title: "Arrivals before sunrise.",
      body: "Today's six guests arrive at 14:00. By 06:00 housekeeping has its plan, every villa has a readiness state, and the AI has already nudged the late cleaner.",
      stat: "100%",
      statLabel: "arrival readiness this month",
      icon: <I.bed />,
      timeColor: "var(--terra)",
    },
    {
      time: "12:30",
      title: "Owners before sunset.",
      body: "Statements drafted automatically from bookings, channel fees, ops costs, owner stays. Sent to fourteen owners at 09:00 GMT+8 with a line-by-line audit trail.",
      stat: "14",
      statLabel: "owners auto-statemented monthly",
      icon: <I.receipt />,
      timeColor: "var(--forest)",
    },
    {
      time: "23:18",
      title: "Concierge through the night.",
      body: "It is 23:18 on Pererenan and Sofia in S2 wants a late check-out. Concierge AI replies in her language, books it, and only escalates the things that truly need you.",
      stat: "94%",
      statLabel: "guest replies handled by AI",
      icon: <I.msg />,
      timeColor: "var(--gold)",
    },
  ];
  return (
    <section id="cabinets" style={{ padding: "110px 0 30px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
        <div style={{ maxWidth: 780 }}>
          <div className="label">A day on Arconique</div>
          <h2
            className="display"
            data-reveal
            style={{ fontSize: "clamp(40px, 5.5vw, 64px)", marginTop: 18, marginBottom: 18 }}
          >
            The shape of <em>your day</em>, redrawn around the operator.
          </h2>
          <p style={{ fontSize: 18, color: "var(--ink-3)", maxWidth: 640 }}>
            Hospitality runs on twenty quiet decisions per villa, per day.
            Arconique pre-makes most of them — and shows its work, so you can
            intervene only when you actually need to.
          </p>
        </div>

        <div
          style={{
            marginTop: 60,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 24,
          }}
        >
          {acts.map((a, i) => (
            <article
              key={a.time}
              data-reveal
              data-reveal-delay={i + 1}
              style={{
                position: "relative",
                padding: "36px 32px",
                border: "1px solid var(--line-soft)",
                borderRadius: 18,
                background: "var(--paper)",
                display: "flex",
                flexDirection: "column",
                gap: 18,
                minHeight: 380,
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: 48,
                  fontWeight: 300,
                  color: a.timeColor,
                  letterSpacing: "-0.02em",
                }}
              >
                {a.time}
              </div>
              <h3
                className="display"
                style={{ fontSize: 30, margin: 0, fontWeight: 400 }}
              >
                {a.title}
              </h3>
              <p style={{ color: "var(--ink-3)", margin: 0, fontSize: 15 }}>
                {a.body}
              </p>
              <div
                style={{
                  marginTop: "auto",
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  paddingTop: 18,
                  borderTop: "1px dashed var(--line)",
                }}
              >
                <span className="num" style={{ fontSize: 30, color: "var(--ink)" }}>
                  {a.stat}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--ink-3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    fontFamily: "var(--font-jetbrains), monospace",
                  }}
                >
                  {a.statLabel}
                </span>
              </div>
              <span
                style={{
                  position: "absolute",
                  top: 24,
                  right: 24,
                  color: "var(--line-strong)",
                }}
              >
                {a.icon}
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CabinetsSection() {
  return (
    <section
      style={{
        padding: "110px 0",
        background: "var(--cream-warm)",
        borderTop: "1px solid var(--line-soft)",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 48,
            marginBottom: 48,
          }}
        >
          <div style={{ flex: 1 }}>
            <div className="label">Cabinets · five surfaces</div>
            <h2
              className="display"
              data-reveal
              style={{ fontSize: "clamp(40px, 5.5vw, 64px)", marginTop: 18, marginBottom: 18, maxWidth: 740 }}
            >
              One source of truth, <em>five</em> ways to see it.
            </h2>
          </div>
          <p style={{ maxWidth: 380, color: "var(--ink-3)", margin: 0 }}>
            Each role gets a cabinet built for their hour of the day. The data
            is shared. The view is not.
          </p>
        </div>

        <CabinetPicker />
      </div>
    </section>
  );
}

function AISection() {
  const agents = [
    {
      t: "Concierge AI",
      live: true,
      desc: "Multilingual guest replies on WhatsApp + email + chat. Routes 6% of edge cases to humans.",
      icon: <I.msg />,
    },
    {
      t: "Front-Office Copilot",
      live: true,
      desc: "Arrival exceptions, SLA breaches, overdue follow-ups. One AI watching the desk.",
      icon: <I.bell />,
    },
    {
      t: "Tax Assistant",
      live: true,
      desc: "Auto-categorises every transaction, splits VAT, drafts journal entries.",
      icon: <I.receipt />,
    },
    {
      t: "Housekeeping Scheduler",
      live: false,
      desc: "Tomorrow's turnovers, predicted late tasks, supply forecasts.",
      icon: <I.spark />,
    },
    {
      t: "Owner Reporter",
      live: false,
      desc: "Narrative paragraph drafted on top of every statement.",
      icon: <I.chart />,
    },
    {
      t: "Listing Optimizer",
      live: false,
      desc: "Per-villa Airbnb/Booking copy tuned weekly with revenue feedback.",
      icon: <I.globe />,
    },
  ];
  return (
    <section
      id="ai"
      style={{
        padding: "110px 0",
        background: "var(--forest-deep)",
        color: "var(--cream-warm)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.08,
          background:
            "radial-gradient(60% 60% at 80% 20%, var(--gold) 0%, transparent 60%), radial-gradient(60% 60% at 10% 80%, var(--terra) 0%, transparent 60%)",
        }}
      />
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "0 28px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: 60,
            alignItems: "end",
            marginBottom: 56,
          }}
        >
          <div>
            <div className="label" style={{ color: "rgba(244,239,230,0.65)" }}>
              AI-native, not AI-bolted-on
            </div>
            <h2
              className="display"
              data-reveal
              style={{
                fontSize: "clamp(48px, 7vw, 84px)",
                marginTop: 18,
                marginBottom: 18,
                color: "var(--cream-warm)",
              }}
            >
              Six agents.
              <br />
              <em style={{ color: "var(--gold-soft)" }}>One quiet team.</em>
            </h2>
            <p
              style={{
                fontSize: 18,
                color: "rgba(244,239,230,0.78)",
                maxWidth: 560,
              }}
            >
              Every agent reads the same data, writes to the same audit log,
              and gets cut off the same way at the same budget. No
              prompt-engineering required.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
              <Link
                href="/dashboard/ai"
                className="btn"
                style={{
                  background: "var(--cream-warm)",
                  color: "var(--ink)",
                }}
              >
                Browse the AI hub →
              </Link>
            </div>
          </div>
          <ConciergeTranscript />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
          }}
        >
          {agents.map((a, i) => (
            <div
              key={a.t}
              data-reveal
              data-reveal-delay={(i % 3) + 1}
              style={{
                padding: "20px 22px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                display: "flex",
                gap: 14,
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--gold-soft)",
                  flexShrink: 0,
                }}
              >
                {a.icon}
              </span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{a.t}</span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: a.live
                        ? "rgba(120,180,140,0.18)"
                        : "rgba(255,255,255,0.07)",
                      color: a.live ? "#A8D6B5" : "rgba(255,255,255,0.6)",
                    }}
                  >
                    {a.live ? "LIVE" : "Q1 '26"}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "rgba(244,239,230,0.7)",
                    lineHeight: 1.5,
                  }}
                >
                  {a.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConciergeTranscript() {
  const messages: { from: "guest" | "ai"; t: string }[] = [
    {
      from: "guest",
      t: "Hi! Pool heater for tomorrow 6am pls? We'd like to swim before checkout 🙏",
    },
    {
      from: "ai",
      t: "Of course, Sofia. Pool heated to 28°C from 05:30 to 09:00. I've also moved your checkout to 12:00 — no charge. Anything else for the morning?",
    },
    {
      from: "guest",
      t: "Wow thanks. Could we maybe get breakfast at 7? Two croissants and fruit",
    },
    {
      from: "ai",
      t: "Done. Chef Ari is making a fruit bowl with mangosteen + a hot croissant for 07:00 on the deck. ☕ I've added $14 to your stay.",
    },
  ];
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 18,
        padding: 20,
        background: "rgba(0,0,0,0.18)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingBottom: 14,
          marginBottom: 14,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "rgba(244,239,230,0.6)",
            textTransform: "uppercase",
            letterSpacing: "0.16em",
          }}
        >
          WhatsApp · Villa ES-S2 · Sofia M.
        </div>
        <span className="pulse-dot" style={{ marginLeft: "auto" }} />
        <span style={{ fontSize: 11, color: "rgba(244,239,230,0.6)" }}>23:18</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.from === "guest" ? "flex-start" : "flex-end",
              maxWidth: "82%",
              padding: "9px 13px",
              borderRadius: 14,
              fontSize: 13.5,
              lineHeight: 1.45,
              background:
                m.from === "guest"
                  ? "rgba(255,255,255,0.08)"
                  : "var(--gold-soft)",
              color: m.from === "guest" ? "var(--cream-warm)" : "var(--ink)",
            }}
          >
            {m.t}
          </div>
        ))}
      </div>
      <div
        className="mono"
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px dashed rgba(255,255,255,0.12)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "rgba(244,239,230,0.55)",
        }}
      >
        <span>Tasks created: 2 · pool_heat · breakfast</span>
        <span>Escalation: none</span>
      </div>
    </div>
  );
}

function OwnerSection() {
  return (
    <section id="owner" style={{ padding: "110px 0" }}>
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "0 28px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 80,
          alignItems: "center",
        }}
      >
        <div>
          <div className="label">Owners</div>
          <h2
            className="display"
            data-reveal
            style={{ fontSize: "clamp(48px, 6vw, 72px)", marginTop: 18, marginBottom: 18 }}
          >
            The statement <em>your owner</em> actually wanted.
          </h2>
          <p style={{ fontSize: 18, color: "var(--ink-3)", maxWidth: 540 }}>
            Every booking, channel fee, ops cost and owner-stay night, in one
            PDF. With the audit trail underneath. Signed, sealed, and delivered
            by 9am on the 1st.
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "32px 0",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {[
              "Hash-signed PDFs · same statement, same numbers, every owner",
              "Line-by-line drill-down to the booking, the channel, the receipt",
              "Owner-stay quotas tracked automatically — no embarrassing conversations",
              "Wire instructions + distributions out of the same page",
            ].map((l) => (
              <li key={l} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ color: "var(--terra)", flexShrink: 0, marginTop: 4 }}>
                  <I.check width={16} height={16} />
                </span>
                <span style={{ color: "var(--ink-2)" }}>{l}</span>
              </li>
            ))}
          </ul>
          <Link href="/owner" className="btn btn-primary">
            Open owner-side preview <I.arrow width={15} height={15} />
          </Link>
        </div>
        <OwnerStatementMock />
      </div>
    </section>
  );
}

function OwnerStatementMock() {
  return (
    <div
      className="card"
      style={{
        padding: 32,
        position: "relative",
        boxShadow: "0 30px 60px -30px rgba(20,32,28,0.25)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
        }}
      >
        <div>
          <div className="label">Owner statement</div>
          <div
            style={{
              fontFamily: "var(--font-newsreader), serif",
              fontSize: 32,
              marginTop: 4,
            }}
          >
            Emma Whitmore ·{" "}
            <em style={{ color: "var(--terra)" }}>October 2026</em>
          </div>
          <div
            className="mono"
            style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 6 }}
          >
            STMT-2026-10-EW · hash 4f2a…91c8
          </div>
        </div>
        <span className="badge badge-ok">Sent · 01 Nov 09:00</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {[
            ["Gross rental revenue", "+$24,820", "var(--ink)"],
            ["Channel fees (Airbnb · Booking · direct)", "−$3,724", "var(--ink-3)"],
            ["Management fee · 20%", "−$4,219", "var(--ink-3)"],
            ["Operational costs · pool, garden, internet", "−$1,840", "var(--ink-3)"],
            ["Owner stay · 4 nights @ rate ‑ free", "−$1,200", "var(--ink-3)"],
            ["Adjustments · damage refund", "+$180", "var(--ok)"],
          ].map(([label, val, color]) => (
            <tr key={label} style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <td style={{ padding: "10px 0", color: "var(--ink-3)" }}>{label}</td>
              <td
                className="num"
                style={{ padding: "10px 0", textAlign: "right", color }}
              >
                {val}
              </td>
            </tr>
          ))}
          <tr>
            <td
              style={{
                padding: "16px 0 4px",
                fontFamily: "var(--font-newsreader), serif",
                fontSize: 20,
              }}
            >
              Net to owner
            </td>
            <td
              className="num"
              style={{
                padding: "16px 0 4px",
                textAlign: "right",
                fontSize: 24,
                color: "var(--terra)",
              }}
            >
              $14,017
            </td>
          </tr>
        </tbody>
      </table>

      <div
        style={{
          marginTop: 24,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            border: "1px dashed var(--line)",
            borderRadius: 10,
          }}
        >
          <div className="label">Distribution wire</div>
          <div className="mono" style={{ fontSize: 13, marginTop: 4 }}>
            HSBC SG · ****8112
          </div>
        </div>
        <div
          style={{
            padding: "12px 14px",
            border: "1px dashed var(--line)",
            borderRadius: 10,
          }}
        >
          <div className="label">PDF · 6 pages</div>
          <span
            style={{
              color: "var(--terra)",
              fontSize: 13,
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Download <I.download width={13} height={13} />
          </span>
        </div>
      </div>
    </div>
  );
}

function FeatureGrid() {
  const feats = [
    {
      t: "Multi-channel sync",
      d: "Booking.com, Airbnb, direct + 4 more. Per-villa, per-channel, with conflict detection.",
      icon: <I.globe />,
      accent: "var(--terra)",
    },
    {
      t: "Mobile cleaner PWA",
      d: "Offline-first photo upload, voice notes transcribed, geo-tagged completion stamp.",
      icon: <I.phone />,
      accent: "var(--forest)",
    },
    {
      t: "Direct-booking website",
      d: "Your URL. Stripe checkout. Channel-conflict-aware availability. SEO baked in.",
      icon: <I.calendar />,
      accent: "var(--gold)",
    },
    {
      t: "Maintenance intelligence",
      d: "Preventive AC, pool, generator, pest — scheduled around guest stays, never around them.",
      icon: <I.shield />,
      accent: "var(--forest)",
    },
    {
      t: "Owner-stay quota",
      d: "Free nights tracked, peak-season rules, transparent compensation. Owners stop calling you.",
      icon: <I.bed />,
      accent: "var(--terra)",
    },
    {
      t: "Dynamic pricing rails",
      d: "Per-villa base rate, season multipliers, MLOS, stop-sell — applied per channel.",
      icon: <I.chart />,
      accent: "var(--gold)",
    },
  ];
  return (
    <section
      style={{
        padding: "110px 0",
        background: "var(--cream-warm)",
        borderTop: "1px solid var(--line-soft)",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
        <div style={{ maxWidth: 780, marginBottom: 48 }}>
          <div className="label">What you get</div>
          <h2 className="display" style={{ fontSize: "clamp(40px, 5.5vw, 64px)", marginTop: 18 }}>
            Six workflows. <em>Zero add-ons.</em>
          </h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 18,
          }}
        >
          {feats.map((f, i) => (
            <div
              key={f.t}
              className="card"
              data-reveal
              data-reveal-delay={(i % 3) + 1}
              style={{
                padding: 28,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <span
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: "var(--cream-deep)",
                  color: f.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {f.icon}
              </span>
              <h3
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontFamily: "var(--font-newsreader), serif",
                  fontWeight: 500,
                }}
              >
                {f.t}
              </h3>
              <p
                style={{
                  margin: 0,
                  color: "var(--ink-3)",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {f.d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonial() {
  return (
    <section style={{ padding: "110px 0" }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 28px",
          textAlign: "center",
        }}
      >
        <div className="label">From the operator chair</div>
        <p
          style={{
            fontFamily: "var(--font-newsreader), serif",
            fontSize: "clamp(28px, 4vw, 48px)",
            lineHeight: 1.18,
            fontStyle: "italic",
            marginTop: 30,
            color: "var(--ink)",
            fontWeight: 300,
            letterSpacing: "-0.01em",
          }}
        >
          <span
            style={{
              color: "var(--terra)",
              fontSize: 64,
              lineHeight: 0,
              verticalAlign: -12,
              marginRight: 4,
            }}
          >
            &ldquo;
          </span>
          Before Arconique, the eleven villas were running me. Now I close my
          laptop at six and the system keeps going — owners get their PDFs,
          guests get their answers, and I get my evenings back.
        </p>
        <div
          style={{
            marginTop: 36,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "linear-gradient(135deg,#bc9a5c,#c4583c)",
            }}
          />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 500 }}>Made Sutrisno</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
              GM · Eternal Estates · 11 villas · Pererenan
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const tiers = [
    {
      name: "Starter",
      price: "$190",
      per: "villa/mo",
      desc: "For independent owners running 1–5 villas. Direct + 3 channels included.",
      feats: [
        "Bookings + channels",
        "Owner statements (1 owner)",
        "Concierge AI · 200 msg/mo",
        "Cleaner PWA, 5 users",
        "Email support",
      ],
      highlight: false,
    },
    {
      name: "Operator",
      price: "$390",
      per: "villa/mo",
      desc: "For multi-owner managers running 5–25 villas. Audit + custom statements.",
      feats: [
        "Everything in Starter",
        "Multi-owner statements + DPA",
        "Concierge AI · unlimited",
        "Maintenance intelligence",
        "Direct-booking website",
        "Slack-channel support",
      ],
      highlight: true,
    },
    {
      name: "Estate",
      price: "Custom",
      per: "contracted",
      desc: "Portfolios over 25 villas, branded portals, on-island onboarding.",
      feats: [
        "Dedicated success manager",
        "On-island deployment week",
        "Custom integrations (PMS, ERP)",
        "White-label owner portal",
        "99.9% SLA",
      ],
      highlight: false,
    },
  ];
  return (
    <section
      id="pricing"
      style={{
        padding: "110px 0",
        background: "var(--cream-warm)",
        borderTop: "1px solid var(--line-soft)",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
        <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 56px" }}>
          <div className="label">Pricing</div>
          <h2 className="display" style={{ fontSize: "clamp(40px, 5.5vw, 64px)", marginTop: 18 }}>
            From $190/villa · <em>14-day trial</em> · No card.
          </h2>
          <p style={{ fontSize: 17, color: "var(--ink-3)", marginTop: 14 }}>
            Annual contracts get 20% off. All plans include the Bali ops
            playbook + a 90-minute migration call.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 18,
          }}
        >
          {tiers.map((t, i) => (
            <div
              key={t.name}
              className="card"
              data-reveal
              data-reveal-delay={i + 1}
              style={{
                padding: 32,
                display: "flex",
                flexDirection: "column",
                gap: 18,
                border: t.highlight
                  ? "1.5px solid var(--ink)"
                  : "1px solid var(--line-soft)",
                background: t.highlight ? "var(--paper)" : "var(--cream)",
                position: "relative",
              }}
            >
              {t.highlight && (
                <span
                  style={{ position: "absolute", top: -12, left: 32 }}
                  className="badge badge-ink"
                >
                  Recommended
                </span>
              )}
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-newsreader), serif",
                      fontSize: 24,
                    }}
                  >
                    {t.name}
                  </h3>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {t.per}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    marginTop: 14,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-newsreader), serif",
                      fontSize: 48,
                      lineHeight: 1,
                      fontWeight: 400,
                    }}
                  >
                    {t.price}
                  </span>
                </div>
                <p
                  style={{
                    color: "var(--ink-3)",
                    fontSize: 14,
                    marginTop: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {t.desc}
                </p>
              </div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 14,
                }}
              >
                {t.feats.map((f) => (
                  <li
                    key={f}
                    style={{ display: "flex", gap: 9, color: "var(--ink-2)" }}
                  >
                    <span
                      style={{
                        color: "var(--terra)",
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      <I.check width={14} height={14} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              {t.price === "Custom" ? (
                <Link
                  href="/contact"
                  className={"btn " + (t.highlight ? "btn-primary" : "btn-secondary")}
                  style={{ marginTop: "auto", justifyContent: "center" }}
                >
                  Talk to sales <I.arrow width={14} height={14} />
                </Link>
              ) : (
                <a
                  href={subscriptionUrl("/signup")}
                  className={"btn " + (t.highlight ? "btn-primary" : "btn-secondary")}
                  style={{ marginTop: "auto", justifyContent: "center" }}
                >
                  Start trial <I.arrow width={14} height={14} />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTABand() {
  return (
    <section style={{ padding: "100px 28px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 24,
            background: "var(--forest-deep)",
            color: "var(--cream-warm)",
            padding: "80px 64px",
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 48,
            alignItems: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.15,
              background:
                "radial-gradient(60% 80% at 100% 0%, var(--gold) 0%, transparent 60%)",
            }}
          />
          <div style={{ position: "relative" }}>
            <div className="label" style={{ color: "rgba(244,239,230,0.6)" }}>
              Try it
            </div>
            <h2
              className="display"
              data-reveal
              style={{
                fontSize: "clamp(48px, 6vw, 72px)",
                marginTop: 18,
                marginBottom: 18,
                color: "var(--cream-warm)",
              }}
            >
              Run tonight on Arconique.
            </h2>
            <p
              style={{
                maxWidth: 520,
                fontSize: 17,
                color: "rgba(244,239,230,0.78)",
              }}
            >
              14 days. Every cabinet. No credit card. Cancel anytime — your
              data exports as CSV/XLSX if you leave.
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 30,
                flexWrap: "wrap",
              }}
            >
              <a
                href={subscriptionUrl("/signup")}
                className="btn btn-lg"
                style={{ background: "var(--cream-warm)", color: "var(--ink)" }}
              >
                Start your trial <I.arrow width={15} height={15} />
              </a>
              <Link
                href="/dashboard"
                className="btn btn-lg"
                style={{
                  background: "transparent",
                  color: "var(--cream-warm)",
                  border: "1px solid rgba(255,255,255,0.25)",
                }}
              >
                See live demo
              </Link>
            </div>
          </div>
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {[
              "Set up your account in under a minute.",
              "Import villas via CSV, Airbnb iCal, or PMS.",
              "Invite your team — 20 roles ready.",
              "Run your first owner statement on day three.",
            ].map((s, i) => (
              <div
                key={s}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "14px 18px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                <span
                  className="num"
                  style={{
                    color: "var(--gold-soft)",
                    fontSize: 14,
                    width: 22,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 14 }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MgmtFooter() {
  const cols: { h: string; items: [string, string][] }[] = [
    {
      h: "Product",
      items: [
        ["Tour", "#product"],
        ["Cabinets", "#cabinets"],
        ["Concierge AI", "#ai"],
        ["Owners", "/owner"],
        ["Pricing", "#pricing"],
      ],
    },
    {
      h: "Demo",
      items: [
        ["Front office", "/dashboard"],
        ["Owner portal", "/owner"],
        ["Sign in", "/login"],
        ["Start trial", subscriptionUrl("/signup")],
      ],
    },
    {
      h: "Company",
      items: [
        ["About", "/contact"],
        ["Customers", "/portfolio"],
        ["Contact", "/contact"],
        ["Careers", "/contact"],
      ],
    },
    {
      h: "Legal",
      items: [
        ["Terms", "/legal/terms"],
        ["Privacy", "/legal/privacy"],
        ["DPA", "/legal/privacy"],
        ["Status", "/contact"],
      ],
    },
  ];
  return (
    <footer
      style={{
        borderTop: "1px solid var(--line-soft)",
        marginTop: 0,
        background: "var(--cream)",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "56px 28px 36px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr",
            gap: 32,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <span style={{ color: "var(--forest)" }}>
                <I.logo width={22} height={22} />
              </span>
              <span
                style={{
                  fontFamily: "var(--font-newsreader), serif",
                  fontSize: 20,
                }}
              >
                Arconique
              </span>
            </div>
            <p
              style={{
                color: "var(--ink-3)",
                fontSize: 14,
                maxWidth: 320,
                margin: 0,
              }}
            >
              The operating system for premium hospitality. Built in Bali for
              villa and boutique-hotel operators worldwide.
            </p>
            <p
              className="mono"
              style={{ marginTop: 18, fontSize: 12, color: "var(--ink-4)" }}
            >
              management.arconique.com
            </p>
          </div>
          {cols.map((col) => (
            <div key={col.h}>
              <div className="label" style={{ marginBottom: 14 }}>
                {col.h}
              </div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                }}
              >
                {col.items.map(([l, href]) => {
                  const isExternal = /^https?:\/\//.test(href);
                  const style = { color: "var(--ink-3)", fontSize: 14 };
                  return (
                    <li key={l}>
                      {isExternal ? (
                        <a href={href} style={style}>
                          {l}
                        </a>
                      ) : (
                        <Link href={href} style={style}>
                          {l}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 48,
            paddingTop: 20,
            borderTop: "1px solid var(--line-soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: "var(--ink-4)",
          }}
        >
          <span className="mono">
            © 2026 Arconique OS · Made between Bali and Berlin
          </span>
          <span className="mono">v9I · uptime 99.98%</span>
        </div>
      </div>
    </footer>
  );
}
