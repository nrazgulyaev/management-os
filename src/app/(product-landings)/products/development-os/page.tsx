import * as React from "react";
import Link from "next/link";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { subscriptionUrl } from "@/lib/marketing/cross-product-links";

/**
 * Sprint _handoff/ Task 4 — Development OS landing.
 *
 * 1:1 port of `_handoff/development.html` (landing.js + shared.js).
 * Section order matches the prototype:
 *
 *   DevNav → Hero (with HeroFrame: gantt + BOQ snapshot + site QS card)
 *   → Marquee (capability ticker) → ProjectOverview (with SchematicVilla
 *   floorplan SVG) → CabinetGrid → BOQTeaser (with variance heat-map) →
 *   AIAgents (with AgentTranscript) → InvestorTeaser (with LP brief
 *   waterfall) → SpecGrid → Pricing → CTABand → DevFooter
 *
 * Hash-routing in the prototype becomes real Next routes:
 *   go("signup") → /signup
 *   go("login")  → /login
 *   go("boq")    → /development-os/cabinets/qs
 *   go("investor") → /investor-portal/dashboard
 *   go("landing#anchor") → #anchor on this page
 *
 * Pure server component — no client-side state needed for this landing
 * (unlike Mgmt's CabinetPicker, the Dev cabinet grid is a static grid).
 *
 * Typography + palette resolve via `<div data-product="development">`
 * wrapper so apex traffic hitting /products/development-os directly
 * still gets the Dev palette (amber, concrete, blueprint grid).
 */

export const metadata = {
  title: "Arconique Development OS · Build the next one — on record",
  description:
    "The construction operating system for boutique villa, condotel and resort developers — BOQ, procurement, QA/QC, daily reports, investor portal.",
};

export default function DevelopmentOsLandingPage() {
  return (
    <div data-product="development">
      <RevealOnScroll />
      <DevNav />
      <main>
        <Hero />
        <Marquee />
        <ProjectOverview />
        <CabinetGrid />
        <BOQTeaser />
        <AIAgents />
        <InvestorTeaser />
        <SpecGrid />
        <Pricing />
        <CTABand />
      </main>
      <DevFooter />
    </div>
  );
}

// ============================================================
// Icons used by the landing — slim set
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
  logoMark: (p: IconProps) => (
    <svg viewBox="0 0 32 32" fill="none" {...p}>
      <rect x="4" y="4" width="24" height="24" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 22 V12 H22 M10 17 H22" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
};

// ============================================================
// Top nav
// ============================================================
function DevNav() {
  const navItems = [
    ["Platform", "#platform"],
    ["Cabinets", "#cabinets"],
    ["AI agents", "#ai"],
    ["Investors", "#investors"],
    ["Pricing", "#pricing"],
  ];
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        background: "rgba(248,244,234,0.82)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          maxWidth: 1360,
          margin: "0 auto",
          padding: "14px 28px",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <Link href="#platform" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--amber)" }}>
            <I.logoMark width={22} height={22} />
          </span>
          <span
            style={{
              fontFamily: "var(--font-space), sans-serif",
              fontSize: 18,
              letterSpacing: "-0.01em",
              fontWeight: 500,
            }}
          >
            ARCONIQUE
          </span>
          <span className="badge badge-amber" style={{ fontSize: 10 }}>
            DEV.OS
          </span>
        </Link>
        <nav
          className="hide-mobile"
          style={{ display: "flex", gap: 22, marginLeft: 18, fontSize: 13 }}
        >
          {navItems.map(([l, href]) => (
            <Link key={l} href={href} style={{ color: "var(--ink-2)" }}>
              {l}
            </Link>
          ))}
        </nav>
        <div
          style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}
        >
          <Link
            href="/development-os/cabinets/qs"
            className="hide-mobile mono"
            style={{ fontSize: 12, color: "var(--ink-3)", letterSpacing: "0.05em" }}
          >
            OPEN.LIVE.DEMO →
          </Link>
          <Link href="/login" className="btn btn-ghost hide-mobile">
            Sign in
          </Link>
          <a href={subscriptionUrl("/signup")} className="btn btn-amber">
            Start trial <I.arrow width={13} height={13} />
          </a>
        </div>
      </div>
    </header>
  );
}

// ============================================================
// Hero
// ============================================================
function Hero() {
  return (
    <section
      id="platform"
      className="grid-paper"
      style={{
        position: "relative",
        paddingTop: 48,
        paddingBottom: 96,
        overflow: "hidden",
      }}
    >
      <div style={{ maxWidth: 1360, margin: "0 auto", padding: "0 28px" }}>
        <div
          className="mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 14px",
            border: "1px solid var(--line-2)",
            background: "var(--bg-2)",
            borderRadius: 999,
            fontSize: 11,
            letterSpacing: "0.12em",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              background: "var(--amber)",
              borderRadius: 999,
            }}
          />
          ARCONIQUE / DEV.OS / V9.06 · BUILT 04 NOV 2026
        </div>

        <h1
          className="display"
          data-reveal
          style={{
            fontSize: "clamp(56px, 9vw, 108px)",
            marginTop: 24,
            marginBottom: 24,
            maxWidth: 1120,
            fontWeight: 500,
          }}
        >
          Build the next one.
          <br />
          <span style={{ color: "var(--amber)" }}>
            On budget. On schedule. On record.
          </span>
        </h1>

        <p
          style={{
            fontSize: 19,
            maxWidth: 680,
            color: "var(--ink-2)",
            lineHeight: 1.5,
            marginTop: 0,
          }}
        >
          Arconique Development OS is the construction-grade operating system
          for boutique villa, condotel and resort developers. BOQ, procurement,
          QA/QC, daily reports, investor reporting — one source of truth from
          groundbreaking to handover.
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
          <a href={subscriptionUrl("/signup")} className="btn btn-amber btn-lg">
            Start 14-day trial <I.arrow width={14} height={14} />
          </a>
          <Link href="/development-os" className="btn btn-dark btn-lg">
            Open BOQ desk demo
          </Link>
        </div>

        <div style={{ marginTop: 64, position: "relative" }}>
          <HeroFrame />
        </div>

        <div
          style={{
            marginTop: 36,
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 24,
            color: "var(--ink-3)",
            fontSize: 13,
            paddingTop: 24,
            borderTop: "1px solid var(--line)",
          }}
        >
          {[
            ["14", "active projects on Arconique"],
            ["$24M", "commitment under management"],
            ["8,300", "BOQ lines under control"],
            ["1.4%", "average cost variance to budget"],
            ["23.4%", "portfolio IRR YTD"],
          ].map(([n, l]) => (
            <div key={l}>
              <div
                className="num"
                style={{
                  fontSize: 28,
                  color: "var(--ink)",
                  fontWeight: 500,
                }}
              >
                {n}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  letterSpacing: "0.02em",
                  marginTop: 4,
                  color: "var(--ink-3)",
                }}
              >
                {l}
              </div>
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
      className="corner-marks"
      style={{
        position: "relative",
        border: "1px solid var(--line-2)",
        background: "var(--panel)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 18px",
          borderBottom: "1px solid var(--line)",
          background: "var(--bg-2)",
        }}
      >
        <div
          className="mono"
          style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.12em" }}
        >
          PROJECT · ETERNAL/PHASE-02 · 12 VILLAS · 5.6 HA
        </div>
        <span
          className="mono"
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--ok)",
            letterSpacing: "0.12em",
          }}
        >
          ● ON SCHEDULE · 87% BUDGET
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.1fr",
          gap: 0,
          minHeight: 480,
        }}
      >
        {/* LEFT — gantt + BOQ snapshot */}
        <div style={{ padding: 24, borderRight: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
            <h3 className="display" style={{ margin: 0, fontSize: 20 }}>
              Week 36 · Construction plan
            </h3>
            <span
              className="mono"
              style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
            >
              NOV 04 — NOV 10
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 9,
              marginBottom: 18,
            }}
          >
            {[
              { l: "Foundations · Block B", w: 90, color: "var(--ok)", left: 0, queued: false },
              {
                l: "Concrete · Block B/L2",
                w: 55,
                color: "var(--amber)",
                left: 25,
                queued: false,
              },
              {
                l: "MEP rough-in · Block A",
                w: 45,
                color: "var(--steel-soft)",
                left: 10,
                queued: false,
              },
              { l: "Roofing · Block A", w: 30, color: "var(--ink-3)", left: 55, queued: true },
              { l: "Finishes · Phase 1", w: 20, color: "var(--ink-3)", left: 75, queued: true },
            ].map((b) => (
              <div
                key={b.l}
                style={{
                  display: "grid",
                  gridTemplateColumns: "170px 1fr",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{b.l}</span>
                <div
                  style={{
                    position: "relative",
                    height: 18,
                    background: "var(--bg-3)",
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      gridTemplateColumns: "repeat(7, 1fr)",
                    }}
                  >
                    {Array.from({ length: 6 }).map((_, k) => (
                      <div
                        key={k}
                        style={{ borderRight: "1px dashed var(--line)" }}
                      />
                    ))}
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      top: 2,
                      bottom: 2,
                      left: `${b.left}%`,
                      width: `${b.w}%`,
                      background: b.color,
                      borderRadius: 1,
                      opacity: b.queued ? 0.4 : 1,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              height: 1,
              backgroundImage:
                "linear-gradient(90deg, var(--line-2) 50%, transparent 50%)",
              backgroundSize: "6px 1px",
              backgroundRepeat: "repeat-x",
              margin: "6px 0 14px",
            }}
          />

          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span className="label">BOQ · 8,300 lines</span>
            <span
              className="mono"
              style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
            >
              WP-04 · STRUCTURAL
            </span>
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {[
              ["C25/30 ready-mix concrete · m³", "1,420", "$182,400", "+1.2%", "badge-amber"],
              ["Steel rebar Ø12 / Ø16 · t", "84.6", "$118,200", "−0.4%", "badge-ok"],
              ["Formwork plywood 18mm · m²", "3,200", "$28,600", "+2.8%", "badge-warn"],
              ["Anti-termite chemical · L", "240", "$1,800", "0.0%", "badge-ok"],
            ].map((r) => (
              <div
                key={r[0]}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 60px 80px 60px",
                  padding: "7px 0",
                  gap: 10,
                  borderBottom: "1px solid var(--line)",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{r[0]}</span>
                <span
                  className="num"
                  style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "right" }}
                >
                  {r[1]}
                </span>
                <span
                  className="num"
                  style={{ fontSize: 12, color: "var(--ink)", textAlign: "right" }}
                >
                  {r[2]}
                </span>
                <span
                  className={`badge ${r[4]}`}
                  style={{ fontSize: 10, justifySelf: "end" }}
                >
                  {r[3]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — site QS card */}
        <div
          style={{
            position: "relative",
            padding: 24,
            background:
              "repeating-linear-gradient(135deg, rgba(20,19,14,0.04) 0 1px, transparent 1px 18px), linear-gradient(160deg, #F6D2BC 0%, #E2B095 100%)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              height: "100%",
            }}
          >
            <div className="panel-2" style={{ padding: 16, alignSelf: "start" }}>
              <div className="label label-amber">Budget · MTD</div>
              <div className="num" style={{ fontSize: 30, marginTop: 6 }}>
                $182,420
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                +1.2% over plan
              </div>
              <div style={{ display: "flex", gap: 2, marginTop: 10 }}>
                {Array.from({ length: 30 }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      flex: 1,
                      height: 5,
                      background: i < 18 ? "var(--amber)" : "var(--line-2)",
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="panel-2" style={{ padding: 16, alignSelf: "start" }}>
              <div className="label">QS · anomalies today</div>
              <div className="num" style={{ fontSize: 30, marginTop: 6 }}>
                03
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                Auto-flagged by qs-cost-analyst
              </div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "10px 0 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  fontSize: 11,
                  color: "var(--ink-2)",
                }}
              >
                <li>· Marble Hindari 60×60 · +18% vs baseline</li>
                <li>· Cabling YDA 4mm · 2x supplier spread</li>
                <li>· Plumbing PEX · qty mismatch BOQ→PR</li>
              </ul>
            </div>
            <div
              className="panel-2"
              style={{ padding: 16, gridColumn: "1 / -1" }}
            >
              <div style={{ display: "flex", alignItems: "baseline" }}>
                <div className="label label-amber">
                  AI · qs-cost-analyst · 06:14
                </div>
                <span
                  className="mono"
                  style={{
                    marginLeft: "auto",
                    fontSize: 10,
                    color: "var(--ink-4)",
                  }}
                >
                  RUN 0e4f8a · 1.4s
                </span>
              </div>
              <p
                style={{
                  margin: "10px 0 12px",
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--ink)",
                }}
              >
                The Marble Hindari 60×60 line is{" "}
                <span style={{ color: "var(--amber)" }}>
                  18.4% above the 6-month rolling baseline
                </span>{" "}
                for comparable marble lots from this supplier. Adjacent
                QS-Cost-Analyst projects show $42/m² as the median; we are
                quoted $49.6/m². Suggest re-issuing the RFQ to two backup
                vendors before issuing the PO.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <Link
                  href="/development-os/cabinets/qs"
                  className="btn btn-amber"
                  style={{ padding: "7px 12px", fontSize: 12 }}
                >
                  Open BOQ line <I.arrow width={12} height={12} />
                </Link>
                <span
                  className="btn btn-dark"
                  style={{ padding: "7px 12px", fontSize: 12 }}
                >
                  Reissue RFQ to 2 backups
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        className="mono"
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 18px",
          borderTop: "1px solid var(--line)",
          background: "var(--bg-2)",
          gap: 18,
          fontSize: 11,
          color: "var(--ink-3)",
        }}
      >
        <span>STAMP: ARC.DEV.OS · 2026-11-04</span>
        <span>·</span>
        <span>SIGNED BY: PM @ M.SUTRISNO</span>
        <span style={{ marginLeft: "auto" }}>RUN-ID 4af2 — IMMUTABLE AUDIT</span>
      </div>
    </div>
  );
}

// ============================================================
// Marquee
// ============================================================
function Marquee() {
  const items = [
    "BOQ control",
    "Procurement",
    "RFQ matrix",
    "PO automation",
    "QA/QC photo-evidence",
    "Method statements",
    "Daily reports",
    "Cost analyst AI",
    "Tax assistant AI",
    "Investor portal",
    "Distributions",
    "Capital ledger",
    "Drawings revision",
    "Buyer portal",
    "Sales pipeline",
  ];
  return (
    <section
      style={{
        borderTop: "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
        background: "var(--bg-2)",
        overflow: "hidden",
      }}
    >
      <div
        className="mono"
        style={{
          display: "flex",
          gap: 36,
          padding: "16px 28px",
          whiteSpace: "nowrap",
        }}
      >
        {[...items, ...items].map((l, i) => (
          <span
            key={i}
            style={{
              fontSize: 12,
              color: i % 3 === 0 ? "var(--amber)" : "var(--ink-3)",
              letterSpacing: "0.12em",
            }}
          >
            ● {l}
          </span>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// Project overview + SchematicVilla SVG
// ============================================================
function ProjectOverview() {
  return (
    <section style={{ padding: "100px 0", position: "relative" }}>
      <div style={{ maxWidth: 1360, margin: "0 auto", padding: "0 28px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 80,
            alignItems: "start",
          }}
        >
          <div>
            <div className="label label-amber">SECTION 01 · WHAT IS DEV.OS</div>
            <h2
              className="display"
              data-reveal
              style={{ fontSize: "clamp(40px, 5vw, 60px)", marginTop: 18, marginBottom: 18 }}
            >
              From groundbreaking
              <br />
              to handover,{" "}
              <span style={{ color: "var(--amber)" }}>one source of truth.</span>
            </h2>
            <p
              style={{
                fontSize: 17,
                color: "var(--ink-2)",
                maxWidth: 540,
                lineHeight: 1.55,
              }}
            >
              Boutique developers run on twenty spreadsheets, three WhatsApp
              groups, and one panicked QS. Arconique Development OS replaces
              all of it with one rigorous workspace where every line item,
              every photo, every signature, every dollar reconciles.
            </p>
            <ul
              style={{
                marginTop: 32,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {[
                [
                  "BOQ control",
                  "8,300-line bills of quantity with revision history, baseline-vs-actual, and Excel paste-in import.",
                ],
                [
                  "Procurement → PO",
                  "RFQ matrix · vendor scorecards · auto-PO. The CFO knows what they're approving.",
                ],
                [
                  "QA/QC + reports",
                  "Photo-evidence inspection trail · geo-tagged · signed at completion. Court-ready.",
                ],
                [
                  "Investor portal",
                  "Distributions · NAV · bilingual reports. LPs stop emailing you for updates.",
                ],
              ].map(([head, body]) => (
                <li
                  key={head}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "180px 1fr",
                    gap: 18,
                    padding: "14px 0",
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-space), sans-serif",
                      fontWeight: 500,
                      fontSize: 15,
                    }}
                  >
                    {head}
                  </span>
                  <span style={{ fontSize: 14, color: "var(--ink-2)" }}>
                    {body}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <SchematicVilla />
        </div>
      </div>
    </section>
  );
}

function SchematicVilla() {
  return (
    <div className="corner-marks panel" style={{ padding: 24, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span className="label label-amber">
          DWG · ETERNAL/02/A-101 · REV 04
        </span>
        <span
          className="mono"
          style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
        >
          1:200 · 04 NOV 2026
        </span>
      </div>
      <div
        style={{
          aspectRatio: "4 / 3",
          marginTop: 16,
          position: "relative",
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <svg
          viewBox="0 0 400 300"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <defs>
            <pattern id="dgrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="rgba(20,19,14,0.07)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="400" height="300" fill="url(#dgrid)" />
          <rect
            x="50"
            y="50"
            width="300"
            height="200"
            fill="none"
            stroke="#14130E"
            strokeWidth="1.6"
          />
          <line x1="170" y1="50" x2="170" y2="170" stroke="#14130E" strokeWidth="1.1" />
          <line x1="170" y1="170" x2="350" y2="170" stroke="#14130E" strokeWidth="1.1" />
          <line x1="240" y1="170" x2="240" y2="250" stroke="#14130E" strokeWidth="1.1" />
          <path
            d="M 130 50 A 25 25 0 0 1 155 75 L 130 75 Z"
            fill="none"
            stroke="#FF6B35"
            strokeWidth="0.9"
          />
          <path
            d="M 170 130 A 20 20 0 0 1 190 150 L 170 150 Z"
            fill="none"
            stroke="#FF6B35"
            strokeWidth="0.9"
          />
          <rect
            x="65"
            y="200"
            width="80"
            height="40"
            rx="6"
            fill="#C9DCEA"
            stroke="#3D5A7A"
            strokeWidth="0.9"
          />
          <text
            x="80"
            y="225"
            fill="#1F3550"
            fontSize="9"
            fontFamily="IBM Plex Mono"
            fontWeight="500"
          >
            POOL · 32m²
          </text>
          <text
            x="80"
            y="100"
            fill="#14130E"
            fontSize="9.5"
            fontFamily="IBM Plex Mono"
            fontWeight="600"
          >
            LIVING
          </text>
          <text x="80" y="115" fill="#3D3B33" fontSize="8" fontFamily="IBM Plex Mono">
            42.5 m²
          </text>
          <text
            x="200"
            y="100"
            fill="#14130E"
            fontSize="9.5"
            fontFamily="IBM Plex Mono"
            fontWeight="600"
          >
            MASTER · BED
          </text>
          <text x="200" y="115" fill="#3D3B33" fontSize="8" fontFamily="IBM Plex Mono">
            28.2 m²
          </text>
          <text
            x="200"
            y="210"
            fill="#14130E"
            fontSize="9.5"
            fontFamily="IBM Plex Mono"
            fontWeight="600"
          >
            KITCHEN
          </text>
          <text x="200" y="225" fill="#3D3B33" fontSize="8" fontFamily="IBM Plex Mono">
            14.0 m²
          </text>
          <text
            x="270"
            y="210"
            fill="#14130E"
            fontSize="9.5"
            fontFamily="IBM Plex Mono"
            fontWeight="600"
          >
            DINING
          </text>
          <text x="270" y="225" fill="#3D3B33" fontSize="8" fontFamily="IBM Plex Mono">
            22.0 m²
          </text>
          <line x1="50" y1="270" x2="350" y2="270" stroke="#FF6B35" strokeWidth="0.8" />
          <line x1="50" y1="265" x2="50" y2="275" stroke="#FF6B35" strokeWidth="0.8" />
          <line x1="350" y1="265" x2="350" y2="275" stroke="#FF6B35" strokeWidth="0.8" />
          <text
            x="195"
            y="284"
            fill="#C2451E"
            fontSize="8.5"
            fontFamily="IBM Plex Mono"
            fontWeight="600"
            textAnchor="middle"
          >
            15.0 m
          </text>
          <line x1="30" y1="50" x2="30" y2="250" stroke="#FF6B35" strokeWidth="0.8" />
          <line x1="25" y1="50" x2="35" y2="50" stroke="#FF6B35" strokeWidth="0.8" />
          <line x1="25" y1="250" x2="35" y2="250" stroke="#FF6B35" strokeWidth="0.8" />
          <text
            x="20"
            y="155"
            fill="#C2451E"
            fontSize="8.5"
            fontFamily="IBM Plex Mono"
            fontWeight="600"
            textAnchor="middle"
            transform="rotate(-90 20 155)"
          >
            10.0 m
          </text>
          <circle cx="370" cy="70" r="14" fill="#FFFCF4" stroke="#3D3B33" strokeWidth="0.8" />
          <path d="M 370 60 L 374 76 L 370 72 L 366 76 Z" fill="#FF6B35" />
          <text
            x="370"
            y="93"
            fill="#3D3B33"
            fontSize="8"
            fontFamily="IBM Plex Mono"
            fontWeight="500"
            textAnchor="middle"
          >
            N
          </text>
        </svg>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginTop: 18,
        }}
      >
        {[
          ["GFA", "186.2 m²"],
          ["TFA", "240.0 m²"],
          ["Cost/m²", "$2,180"],
          ["Sale/m²", "$5,400"],
        ].map(([l, v]) => (
          <div
            key={l}
            style={{
              padding: "10px 12px",
              border: "1px solid var(--line)",
              background: "var(--bg-2)",
            }}
          >
            <div className="label" style={{ fontSize: 10 }}>
              {l}
            </div>
            <div className="num" style={{ fontSize: 16, marginTop: 2 }}>
              {v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Cabinet grid
// ============================================================
function CabinetGrid() {
  const cabs = [
    {
      code: "01",
      name: "Project Manager",
      k: "PM",
      desc: "Portfolio at-risk, kanban pipeline, daily digest, exception inbox.",
      color: "var(--amber)",
      href: "/development-os/cabinets/project-manager",
    },
    {
      code: "02",
      name: "QS / Cost desk",
      k: "QS",
      desc: "BOQ under review, anomalies, change orders, baseline vs actual, specs.",
      color: "var(--steel-soft)",
      href: "/development-os/cabinets/qs",
    },
    {
      code: "03",
      name: "Procurement",
      k: "PROC",
      desc: "PR queue · RFQ matrix · vendor scorecards · PO and deliveries.",
      color: "var(--ink-2)",
      href: "/development-os/cabinets/procurement-manager",
    },
    {
      code: "04",
      name: "CFO bookkeeper",
      k: "CFO",
      desc: "P&L, cash, AR/AP — one cabinet, with tax-assistant on every cell.",
      color: "var(--ok)",
      href: "/development-os/cabinets/cfo-accountant",
    },
    {
      code: "05",
      name: "Site supervisor",
      k: "SITE",
      desc: "Daily reports, photo evidence, QA/QC inbox, method statements.",
      color: "var(--warn)",
      href: "/development-os/cabinets/site-supervisor",
    },
    {
      code: "06",
      name: "Investor portal",
      k: "LP",
      desc: "Capital flow, distributions, NAV, bilingual reports for LPs.",
      color: "var(--lime)",
      href: "/investor-portal/dashboard",
    },
  ];
  return (
    <section
      id="cabinets"
      style={{
        padding: "110px 0",
        background: "var(--bg-2)",
        borderTop: "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div style={{ maxWidth: 1360, margin: "0 auto", padding: "0 28px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            marginBottom: 48,
            gap: 24,
          }}
        >
          <div>
            <div className="label label-amber">SECTION 02 · CABINETS</div>
            <h2
              className="display"
              data-reveal
              style={{ fontSize: "clamp(40px, 5vw, 60px)", marginTop: 18, marginBottom: 0 }}
            >
              Six cabinets.
              <br />
              One project.
            </h2>
          </div>
          <p
            style={{
              maxWidth: 420,
              marginLeft: "auto",
              color: "var(--ink-3)",
              margin: 0,
            }}
          >
            Each role gets a cabinet built around their actual work — not a
            generic dashboard with a hundred toggles.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {cabs.map((c, i) => {
            const inner = (
              <>
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                    CAB-{c.code}
                  </span>
                  <span
                    className="mono"
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      color: c.color,
                      letterSpacing: "0.12em",
                    }}
                  >
                    ● {c.k}
                  </span>
                </div>
                <h3 className="display" style={{ margin: 0, fontSize: 26 }}>
                  {c.name}
                </h3>
                <p
                  style={{
                    margin: 0,
                    color: "var(--ink-2)",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                  }}
                >
                  {c.desc}
                </p>
                <div
                  className="mono"
                  style={{
                    marginTop: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: c.href ? "var(--amber)" : "var(--ink-4)",
                  }}
                >
                  {c.href ? (
                    <>
                      OPEN DEMO <I.arrow width={13} height={13} />
                    </>
                  ) : (
                    <>SHIPPED · NO DEMO YET</>
                  )}
                </div>
              </>
            );
            const sharedStyle: React.CSSProperties = {
              textAlign: "left",
              padding: 24,
              border: "1px solid var(--line-2)",
              background: "var(--panel)",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              minHeight: 240,
              textDecoration: "none",
            };
            return c.href ? (
              <Link
                key={c.code}
                href={c.href}
                className="corner-marks"
                data-reveal
                data-reveal-delay={(i % 3) + 1}
                style={sharedStyle}
              >
                {inner}
              </Link>
            ) : (
              <div
                key={c.code}
                className="corner-marks"
                data-reveal
                data-reveal-delay={(i % 3) + 1}
                style={sharedStyle}
              >
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// BOQ teaser + variance heat-map
// ============================================================
function BOQTeaser() {
  return (
    <section style={{ padding: "110px 0" }}>
      <div
        style={{
          maxWidth: 1360,
          margin: "0 auto",
          padding: "0 28px",
          display: "grid",
          gridTemplateColumns: "1fr 1.2fr",
          gap: 80,
          alignItems: "center",
        }}
      >
        <div>
          <div className="label label-amber">SECTION 03 · BOQ INTELLIGENCE</div>
          <h2
            className="display"
            data-reveal
            style={{ fontSize: "clamp(40px, 4.5vw, 54px)", marginTop: 18, marginBottom: 18 }}
          >
            8,300 lines.
            <br />
            <span style={{ color: "var(--amber)" }}>Zero hidden cost drift.</span>
          </h2>
          <p
            style={{
              fontSize: 16,
              color: "var(--ink-2)",
              maxWidth: 520,
              lineHeight: 1.55,
            }}
          >
            Excel paste-in import. Hierarchical sections that match how QS
            actually thinks. Per-line baseline-vs-actual variance, anomaly
            detection on every PO, revision history that won&apos;t lose a comma
            between version 14 and 15.
          </p>
          <ul
            style={{
              marginTop: 28,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 14,
            }}
          >
            {[
              "Per-line revision history",
              "AI cost analyst on every change order",
              "Variance heat-map across 12 work packages",
              "Side-by-side RFQ comparison built-in",
              "Auto-PO when supplier + price + budget align",
            ].map((l) => (
              <li key={l} style={{ display: "flex", gap: 10 }}>
                <span style={{ color: "var(--amber)", flexShrink: 0, marginTop: 4 }}>
                  <I.check width={13} height={13} />
                </span>
                <span style={{ color: "var(--ink-2)" }}>{l}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/development-os/cabinets/qs"
            className="btn btn-amber"
            style={{ marginTop: 30 }}
          >
            Open the BOQ desk demo <I.arrow width={14} height={14} />
          </Link>
        </div>
        <BOQVisual />
      </div>
    </section>
  );
}

function BOQVisual() {
  const heat = [
    [0, 1, 1, 2, 3, 1, 0, 1, 2, 2, 1, 3],
    [1, 2, 3, 3, 4, 3, 2, 1, 1, 2, 1, 1],
    [1, 2, 2, 3, 3, 2, 1, 2, 2, 3, 2, 2],
    [0, 1, 1, 2, 2, 1, 1, 2, 3, 3, 2, 1],
    [2, 3, 3, 4, 4, 4, 3, 2, 2, 2, 1, 1],
    [1, 1, 2, 2, 3, 2, 1, 1, 2, 2, 1, 1],
  ];
  const colors = [
    "var(--bg-3)",
    "rgba(255,107,53,0.18)",
    "rgba(255,107,53,0.36)",
    "rgba(255,107,53,0.55)",
    "var(--amber)",
  ];
  const wps = ["Earthworks", "Structural", "MEP", "Envelope", "Finishes", "Landscape"];
  return (
    <div className="panel corner-marks" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h3 className="display" style={{ margin: 0, fontSize: 22 }}>
          Variance heat-map · 12 weeks
        </h3>
        <span
          className="mono"
          style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
        >
          WK 25 — WK 36
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "100px repeat(12, 1fr)",
          gap: 4,
          fontSize: 11,
        }}
      >
        <div />
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="mono"
            style={{ textAlign: "center", color: "var(--ink-4)" }}
          >
            {25 + i}
          </div>
        ))}
        {heat.map((row, ri) => (
          <React.Fragment key={ri}>
            <div
              className="mono"
              style={{ color: "var(--ink-3)", display: "flex", alignItems: "center" }}
            >
              {wps[ri]}
            </div>
            {row.map((v, ci) => (
              <div
                key={ci}
                className="mono"
                style={{
                  height: 28,
                  background: colors[v],
                  border: "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  color: v >= 3 ? "#000" : "var(--ink-3)",
                }}
              >
                {v ? `${v}%` : "·"}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
      <div
        style={{
          height: 1,
          background: "var(--line)",
          margin: "22px 0 14px",
        }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
        }}
      >
        <div>
          <div className="label">Total variance</div>
          <div className="num" style={{ fontSize: 24, marginTop: 4, color: "var(--amber)" }}>
            +1.4%
          </div>
        </div>
        <div>
          <div className="label">PO under flag</div>
          <div className="num" style={{ fontSize: 24, marginTop: 4 }}>
            14
          </div>
        </div>
        <div>
          <div className="label">Suggested re-RFQ</div>
          <div className="num" style={{ fontSize: 24, marginTop: 4, color: "var(--steel-soft)" }}>
            4
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AI agents
// ============================================================
function AIAgents() {
  const agents = [
    {
      t: "QS Cost Analyst",
      live: true,
      d: "Catches unit-cost outliers before they ship to PO. Reads against historical baselines + flags drift.",
    },
    {
      t: "Procurement Analyst",
      live: true,
      d: "Compares quotations side-by-side, picks the right vendor, flags price drifts.",
    },
    {
      t: "Daily Construction Digest",
      live: true,
      d: "Yesterday's exceptions, today's plan. Filed at 06:00 to your PM inbox.",
    },
    {
      t: "Weekly Plan Generator",
      live: true,
      d: "Forward-looking week plan with resource calls, risk callouts, schedule pivots.",
    },
    {
      t: "Tax Assistant",
      live: true,
      d: "Auto-categorises every transaction, splits VAT, drafts journal entries.",
    },
    {
      t: "Marketing Assistant",
      live: false,
      d: "Per-villa launch copy, channel briefs, agent decks — tuned weekly.",
    },
    {
      t: "Executive Business",
      live: false,
      d: "Board-ready snapshot. Multi-project. Owner-stay forecast included.",
    },
    {
      t: "Memory · cross-agent",
      live: true,
      d: "Shared semantic memory. Every fact written once, recalled by everyone.",
    },
  ];
  return (
    <section
      id="ai"
      style={{
        padding: "110px 0",
        background: "var(--bg)",
        borderTop: "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        className="grid-paper"
        style={{ position: "absolute", inset: 0, opacity: 0.7 }}
      />
      <div
        style={{
          maxWidth: 1360,
          margin: "0 auto",
          padding: "0 28px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 60,
            marginBottom: 48,
          }}
        >
          <div>
            <div className="label label-amber">SECTION 04 · AI AGENTS</div>
            <h2
              className="display"
              data-reveal
              style={{ fontSize: "clamp(40px, 5vw, 60px)", marginTop: 18, marginBottom: 18 }}
            >
              Eight agents.
              <br />
              <span style={{ color: "var(--amber)" }}>Five already live.</span>
            </h2>
            <p style={{ fontSize: 17, color: "var(--ink-2)", maxWidth: 480 }}>
              Every agent shares one read-only allowlist, one audit log, one
              budget. They reason about your project — not the entire internet.
            </p>
          </div>
          <AgentTranscript />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          {agents.map((a, i) => (
            <div
              key={a.t}
              className="panel"
              data-reveal
              data-reveal-delay={(i % 4) + 1}
              style={{
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minHeight: 160,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
                  AG-{String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={"badge " + (a.live ? "badge-ok" : "badge-soft")}
                  style={{ marginLeft: "auto" }}
                >
                  {a.live ? "LIVE" : "Q1'26"}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-space), sans-serif",
                  fontWeight: 500,
                  fontSize: 15,
                }}
              >
                {a.t}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: "var(--ink-3)",
                  lineHeight: 1.5,
                }}
              >
                {a.d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AgentTranscript() {
  return (
    <div className="panel corner-marks" style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          paddingBottom: 12,
          marginBottom: 12,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <span
          className="mono"
          style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.12em" }}
        >
          AGENT · procurement-analyst
        </span>
        <span className="pulse-dot" style={{ marginLeft: "auto" }} />
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          14:22
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            padding: "10px 12px",
            background: "var(--bg-2)",
            border: "1px solid var(--line)",
            fontSize: 13,
          }}
        >
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.12em" }}
          >
            PM @ MADE:
          </span>
          <br />
          Compare RFQ-082 for stainless balustrade 304/24mm. 6 vendors. Pick
          the right one.
        </div>
        <div
          style={{
            padding: "10px 12px",
            background: "rgba(255,107,53,0.06)",
            border: "1px solid rgba(255,107,53,0.25)",
            fontSize: 13,
          }}
        >
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--amber)", letterSpacing: "0.12em" }}
          >
            PROCUREMENT-ANALYST:
          </span>
          <br />
          Top 3 vendors after dedupe:{" "}
          <span className="mono" style={{ color: "var(--ink)" }}>
            BaliSteel 304
          </span>{" "}
          @ $42/m ·{" "}
          <span className="mono" style={{ color: "var(--ink)" }}>
            NusaWorks
          </span>{" "}
          @ $44/m ·{" "}
          <span className="mono" style={{ color: "var(--ink)" }}>
            InoxJaya
          </span>{" "}
          @ $48/m.
          <br />
          Recommend{" "}
          <span className="mono" style={{ color: "var(--ok)" }}>
            BaliSteel
          </span>
          : matches V-grade spec on file, on-time score 96%, 14-day lead. Drift
          vs 6mo baseline:{" "}
          <span className="mono" style={{ color: "var(--ok)" }}>
            −2.4%
          </span>
          .
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <span className="btn btn-amber" style={{ padding: "7px 12px", fontSize: 12 }}>
          Accept · draft PO
        </span>
        <span className="btn btn-dark" style={{ padding: "7px 12px", fontSize: 12 }}>
          Why these three?
        </span>
      </div>
      <div
        style={{
          height: 1,
          backgroundImage:
            "linear-gradient(90deg, var(--line-2) 50%, transparent 50%)",
          backgroundSize: "6px 1px",
          backgroundRepeat: "repeat-x",
          margin: "14px 0 8px",
        }}
      />
      <div
        className="mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--ink-4)",
        }}
      >
        <span>RUN 7c8e · 2.1s · 540 tok</span>
        <span>READ-ONLY ALLOWLIST</span>
      </div>
    </div>
  );
}

// ============================================================
// Investor teaser
// ============================================================
function InvestorTeaser() {
  return (
    <section
      id="investors"
      style={{
        padding: "110px 0",
        background: "var(--bg-2)",
        borderTop: "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          maxWidth: 1360,
          margin: "0 auto",
          padding: "0 28px",
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 80,
          alignItems: "center",
        }}
      >
        <InvestorVisual />
        <div>
          <div className="label label-amber">SECTION 05 · INVESTORS</div>
          <h2
            className="display"
            data-reveal
            style={{ fontSize: "clamp(40px, 4.5vw, 54px)", marginTop: 18, marginBottom: 18 }}
          >
            LPs stop emailing
            <br />
            you for updates.
          </h2>
          <p
            style={{
              fontSize: 16,
              color: "var(--ink-2)",
              maxWidth: 520,
              lineHeight: 1.55,
            }}
          >
            Bilingual, report-grade portal. Distributions, NAV, capital ledger,
            waterfall, quarterly attestations. Self-service for LPs,
            audit-ready for you.
          </p>
          <ul
            style={{
              marginTop: 28,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 14,
            }}
          >
            {[
              "EN/ID/RU/JP report templates",
              "Capital ledger with hash-signed PDFs",
              "Waterfall distribution engine",
              "Per-LP private rooms · documents · contracts",
              "Per-quarter attestation flow",
            ].map((l) => (
              <li key={l} style={{ display: "flex", gap: 10 }}>
                <span style={{ color: "var(--amber)", flexShrink: 0, marginTop: 4 }}>
                  <I.check width={13} height={13} />
                </span>
                <span style={{ color: "var(--ink-2)" }}>{l}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/investor-portal/dashboard"
            className="btn btn-amber"
            style={{ marginTop: 30 }}
          >
            Open the LP portal preview <I.arrow width={14} height={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function InvestorVisual() {
  return (
    <div className="panel corner-marks" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <h3 className="display" style={{ margin: 0, fontSize: 22 }}>
          Eternal Phase 02 · LP brief
        </h3>
        <span
          className="mono"
          style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
        >
          Q4 2026
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 14,
          marginTop: 20,
        }}
      >
        {[
          ["Commitment called", "78%", "$18.7M · 14 LPs"],
          ["Distribution Oct", "$124K", "wired 01 Nov"],
          ["IRR · YTD", "23.4%", "vs PPM 18%"],
        ].map(([l, v, s]) => (
          <div key={l} className="panel-2" style={{ padding: 14 }}>
            <div className="label">{l}</div>
            <div className="num" style={{ fontSize: 24, marginTop: 4 }}>
              {v}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
              {s}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span className="label">DISTRIBUTION WATERFALL · OCT 2026</span>
          <span
            className="mono"
            style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
          >
            USD · K
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
            marginTop: 14,
            height: 160,
          }}
        >
          {[
            { l: "Gross", v: 180, color: "var(--steel)" },
            { l: "Pref-8%", v: 48, color: "var(--steel-soft)" },
            { l: "GP catch", v: 14, color: "var(--lime)" },
            { l: "LP split", v: 60, color: "var(--ink-2)" },
            { l: "To LPs", v: 124, color: "var(--amber)" },
          ].map((b, i) => (
            <div
              key={b.l}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span className="num" style={{ fontSize: 11, color: "var(--ink-2)" }}>
                {b.v}
              </span>
              <div
                style={{
                  width: "100%",
                  height: `${(b.v / 200) * 120}px`,
                  background: b.color,
                  opacity: i === 4 ? 1 : 0.7,
                }}
              />
              <span className="mono" style={{ fontSize: 9, color: "var(--ink-4)" }}>
                {b.l.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 22, display: "flex", gap: 8 }}>
        {["HASH 4F2A...91C8", "SIGNED · GP @ N.R", "Q4 ATTESTATION"].map((s) => (
          <span
            key={s}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              border: "1px dashed var(--line-2)",
              borderRadius: 999,
              color: "var(--ink-3)",
              fontFamily: "var(--font-plex), monospace",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Spec grid
// ============================================================
function SpecGrid() {
  const feats: [string, string, string, "amber" | ""][] = [
    ["01", "Excel-paste BOQ", "Drop your spreadsheet. Hierarchical sections + revision history. Excel-paste import doesn't break formulas.", ""],
    ["02", "RFQ matrix", "Compare 6 vendors side-by-side. Selected-vendor lock. Price-drift detection per supplier.", ""],
    ["03", "Auto-PO + receiving", "Per-line receipts · partial deliveries · variance flagged. PO closes itself when everything's in.", "amber"],
    ["04", "Photo-evidence QA", "Every report cross-referenced. Geo-tagged · signed at completion · photo-tagged trail.", ""],
    ["05", "Method statements", "Library of MS templates per trade. Versioned, approved, attached to tasks.", ""],
    ["06", "Waterfall engine", "Pref + catch-up + LP/GP split. Distribution simulator. Quarterly PDFs.", ""],
    ["07", "Bilingual reports", "EN/ID/RU/JP. Per-LP templates. Localised currencies, localised dates.", ""],
    ["08", "Mobile-first PWA", "Offline reports + voice notes auto-transcribed. Site supervisor in their language.", ""],
    ["09", "API + webhooks", "Per-project keys, scoped permissions, HMAC-signed webhooks. Connect your tooling.", ""],
  ];
  return (
    <section style={{ padding: "100px 0" }}>
      <div style={{ maxWidth: 1360, margin: "0 auto", padding: "0 28px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            marginBottom: 48,
            gap: 24,
          }}
        >
          <div>
            <div className="label label-amber">SECTION 06 · SPECIFICATION</div>
            <h2
              className="display"
              data-reveal
              style={{ fontSize: "clamp(40px, 5vw, 60px)", marginTop: 18, marginBottom: 0 }}
            >
              What&apos;s in the box.
            </h2>
          </div>
          <span
            className="mono"
            style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
          >
            9 OF 24 SHOWN · FULL LIST IN PDF
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 0,
            border: "1px solid var(--line)",
            borderRadius: 24,
            overflow: "hidden",
          }}
        >
          {feats.map((f, i) => (
            <div
              key={f[0]}
              style={{
                padding: "28px 26px",
                borderRight: i % 3 === 2 ? "0" : "1px solid var(--line)",
                borderBottom: i >= feats.length - 3 ? "0" : "1px solid var(--line)",
                background: f[3] === "amber" ? "rgba(255,107,53,0.05)" : "transparent",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: f[3] === "amber" ? "var(--amber)" : "var(--ink-4)",
                    letterSpacing: "0.12em",
                  }}
                >
                  F.{f[0]}
                </span>
                <h3 className="display" style={{ margin: 0, fontSize: 20 }}>
                  {f[1]}
                </h3>
              </div>
              <p
                style={{
                  margin: "12px 0 0",
                  fontSize: 13.5,
                  color: "var(--ink-2)",
                  lineHeight: 1.55,
                }}
              >
                {f[2]}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Pricing
// ============================================================
function Pricing() {
  const tiers = [
    {
      name: "Project",
      price: "$1,200",
      per: "/project/mo",
      desc: "For developers running one active project (≤ 30 units / $5M GDV).",
      feats: [
        "1 project · 5 cabinets",
        "8 user seats",
        "BOQ · 5,000 lines",
        "2 AI agents · 5K msg/mo",
        "Investor portal · 8 LPs",
      ],
      highlight: false,
    },
    {
      name: "Portfolio",
      price: "$2,800",
      per: "/project/mo",
      desc: "For boutique developers with 2–6 concurrent projects.",
      feats: [
        "Unlimited projects + cabinets",
        "30 seats",
        "BOQ · 30,000 lines",
        "All AI agents · unlimited",
        "Bilingual portal",
        "Slack-channel support",
      ],
      highlight: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      per: "contracted",
      desc: "Multi-entity holding companies, regulated reporting, SSO.",
      feats: [
        "Dedicated PM + onboarding",
        "SAML / OIDC SSO",
        "Custom integrations",
        "White-label portal",
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
        background: "var(--bg-2)",
        borderTop: "1px solid var(--line)",
      }}
    >
      <div style={{ maxWidth: 1360, margin: "0 auto", padding: "0 28px" }}>
        <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 48px" }}>
          <div className="label label-amber">SECTION 07 · PRICING</div>
          <h2
            className="display"
            data-reveal
            style={{ fontSize: "clamp(40px, 5vw, 60px)", marginTop: 18 }}
          >
            From $1,200/project.{" "}
            <span style={{ color: "var(--amber)" }}>No per-user games.</span>
          </h2>
          <p style={{ fontSize: 16, color: "var(--ink-3)", marginTop: 14 }}>
            Annual contracts: 18% off. Implementation included for Portfolio +
            Enterprise.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {tiers.map((t, i) => (
            <div
              key={t.name}
              className={t.highlight ? "corner-marks" : ""}
              data-reveal
              data-reveal-delay={i + 1}
              style={{
                padding: 32,
                background: t.highlight ? "var(--panel)" : "var(--bg-2)",
                border: "1px solid",
                borderColor: t.highlight ? "var(--amber)" : "var(--line-2)",
                display: "flex",
                flexDirection: "column",
                gap: 18,
                position: "relative",
              }}
            >
              {t.highlight && (
                <span
                  className="badge badge-amber"
                  style={{ position: "absolute", top: -12, left: 32 }}
                >
                  Recommended
                </span>
              )}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <h3 className="display" style={{ margin: 0, fontSize: 24 }}>
                    {t.name}
                  </h3>
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--ink-3)" }}
                  >
                    {t.per}
                  </span>
                </div>
                <div
                  className="num"
                  style={{ fontSize: 44, marginTop: 14, fontWeight: 500 }}
                >
                  {t.price}
                </div>
                <p
                  style={{
                    color: "var(--ink-3)",
                    fontSize: 13,
                    marginTop: 10,
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
                  fontSize: 13.5,
                }}
              >
                {t.feats.map((f) => (
                  <li
                    key={f}
                    style={{ display: "flex", gap: 9, color: "var(--ink-2)" }}
                  >
                    <span
                      style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }}
                    >
                      <I.check width={13} height={13} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              {t.price === "Custom" ? (
                <Link
                  href="/contact"
                  className={"btn " + (t.highlight ? "btn-amber" : "btn-dark")}
                  style={{ marginTop: "auto", justifyContent: "center" }}
                >
                  Talk to sales <I.arrow width={13} height={13} />
                </Link>
              ) : (
                <a
                  href={subscriptionUrl("/signup")}
                  className={"btn " + (t.highlight ? "btn-amber" : "btn-dark")}
                  style={{ marginTop: "auto", justifyContent: "center" }}
                >
                  Start trial <I.arrow width={13} height={13} />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// CTA band
// ============================================================
function CTABand() {
  return (
    <section style={{ padding: "100px 28px" }}>
      <div style={{ maxWidth: 1360, margin: "0 auto" }}>
        <div
          className="corner-marks grid-paper"
          style={{
            position: "relative",
            padding: "72px 56px",
            border: "1px solid var(--amber)",
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr",
            gap: 60,
          }}
        >
          <div>
            <div className="label label-amber">SECTION 08 · GET STARTED</div>
            <h2
              className="display"
              data-reveal
              style={{ fontSize: "clamp(44px, 5.5vw, 64px)", marginTop: 18, marginBottom: 18 }}
            >
              Run your next groundbreaking on Arconique.
            </h2>
            <p style={{ maxWidth: 540, fontSize: 17, color: "var(--ink-2)" }}>
              14 days. Every cabinet. No card. Your data exports as CSV/XLSX
              at any time — no lock-in, no penalty.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
              <a href={subscriptionUrl("/signup")} className="btn btn-amber btn-lg">
                Start your trial <I.arrow width={14} height={14} />
              </a>
              <Link href="/development-os" className="btn btn-dark btn-lg">
                Open the BOQ desk
              </Link>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["Provision", "Workspace ready in 90 seconds."],
              ["Import", "Paste BOQ from Excel · or upload XLSX."],
              ["Invite", "Add QS, PM, site supervisor, CFO, LPs."],
              ["Run", "Run your first daily digest on day 3."],
            ].map(([head, body], i) => (
              <div
                key={head}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "12px 16px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--line-2)",
                }}
              >
                <span
                  className="mono"
                  style={{ color: "var(--amber)", fontSize: 12, width: 30 }}
                >
                  0{i + 1}
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{head}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Footer
// ============================================================
function DevFooter() {
  const cols: { h: string; items: [string, string][] }[] = [
    {
      h: "Platform",
      items: [
        ["Tour", "#platform"],
        ["Cabinets", "#cabinets"],
        ["AI agents", "#ai"],
        ["Investors", "/investor-portal/dashboard"],
        ["Pricing", "#pricing"],
      ],
    },
    {
      h: "Demo",
      items: [
        ["BOQ desk", "/development-os/cabinets/qs"],
        ["Investor portal", "/investor-portal/dashboard"],
        ["Sign in", "/login"],
        ["Start trial", subscriptionUrl("/signup")],
      ],
    },
    {
      h: "Resources",
      items: [
        ["Spec sheet PDF", "/contact"],
        ["ROI calculator", "/contact"],
        ["Customer stories", "/portfolio"],
        ["Implementation guide", "/contact"],
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
    <footer style={{ borderTop: "1px solid var(--line)", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1360, margin: "0 auto", padding: "56px 28px 36px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr",
            gap: 36,
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
              <span style={{ color: "var(--amber)" }}>
                <I.logoMark width={22} height={22} />
              </span>
              <span className="display" style={{ fontSize: 18 }}>
                ARCONIQUE
              </span>
              <span className="badge badge-amber" style={{ fontSize: 10 }}>
                DEV.OS
              </span>
            </div>
            <p
              style={{
                color: "var(--ink-3)",
                fontSize: 13.5,
                maxWidth: 340,
                margin: 0,
              }}
            >
              The construction operating system for boutique villa, condotel
              and resort developers in Southeast Asia. Built on jobsites in
              Bali.
            </p>
            <p
              className="mono"
              style={{ marginTop: 18, fontSize: 11, color: "var(--ink-4)" }}
            >
              development.arconique.com
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
                  const style = { color: "var(--ink-2)", fontSize: 13 };
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
          className="mono"
          style={{
            marginTop: 48,
            paddingTop: 20,
            borderTop: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            color: "var(--ink-4)",
          }}
        >
          <span>© 2026 ARCONIQUE OS · MADE BETWEEN BALI AND BERLIN</span>
          <span>BUILD 09H · UPTIME 99.98%</span>
        </div>
      </div>
    </footer>
  );
}

