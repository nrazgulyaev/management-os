import Link from "next/link";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";

/**
 * Sprint _handoff/ Task 2 — subscription landing.
 *
 * 1:1 port of `_handoff/subscription.html` into a Next.js server
 * component. Nine sections preserved in source order (Header, Hero,
 * Products, Why-Both, Pricing, Trust, How-It-Works, FAQ, Final-CTA,
 * Footer). Outbound links rewritten to real routes:
 *
 *  - management.html / development.html → management./development.
 *    arconique.com (canonical product subdomains — middleware
 *    rewrites `/` on each to the placeholder landings)
 *  - In-page anchors (#pricing, #cta, …) → same in this single-file
 *    port; preserves the sticky-nav scroll behaviour.
 *
 * Typography + palette resolve via the product-scoped CSS variables on
 * `<html data-product="subscription">` (set by RootLayout from the
 * `x-product` middleware header). Newsreader / Fraunces / JetBrains
 * Mono come from next/font — see src/app/layout.tsx.
 *
 * Inline styles are preserved from the prototype (style={{…}}) — they
 * encode the visual contract. A follow-up sprint can extract repeated
 * patterns into utility classes once the design lands in production.
 */

const FOOTER_BRAND_SVG = (
  <svg
    width="22"
    height="22"
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden
    style={{ color: "var(--ink)" }}
  >
    <path d="M16 4 L26 22 H6 Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M11 22 L16 13 L21 22" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export function SubscriptionLanding() {
  return (
    <>
      <RevealOnScroll />
      <SubscriptionStyleOverrides />

      {/* HEADER */}
      <header
        className="site"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(245,240,226,0.86)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <div
          className="nav-row"
          style={{
            maxWidth: 1360,
            margin: "0 auto",
            padding: "16px 32px",
            display: "flex",
            alignItems: "center",
            gap: 28,
          }}
        >
          <Link
            href="#top"
            className="brand"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: "var(--font-fraunces), serif",
              fontSize: 22,
              letterSpacing: "-0.01em",
            }}
          >
            {FOOTER_BRAND_SVG}
            Arconique
            <span
              className="chip"
              style={{ marginLeft: 6, fontSize: 10, padding: "2px 8px" }}
            >
              SUBSCRIPTION
            </span>
          </Link>
          <nav
            className="top hide-mobile"
            style={{
              display: "flex",
              gap: 28,
              marginLeft: 12,
              fontSize: 14,
              color: "var(--ink-2)",
            }}
          >
            <Link href="#products">Products</Link>
            <Link href="#why">Why both</Link>
            <Link href="#pricing">Pricing</Link>
            <Link href="#trust">Customers</Link>
            <Link href="#faq">FAQ</Link>
          </nav>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <Link
              href="https://management.arconique.com"
              className="btn btn-ghost btn-sm hide-mobile"
            >
              Management OS →
            </Link>
            <Link
              href="https://development.arconique.com"
              className="btn btn-ghost btn-sm hide-mobile"
            >
              Development OS →
            </Link>
            <Link href="#pricing" className="btn btn-ink btn-sm">
              Start trial
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="sec" id="top" style={{ padding: "56px 0 96px" }}>
        <div className="container">
          <div className="chip chip-dot" data-reveal>
            Arconique · v9 · 04 May 2026 · Made in Bali
          </div>
          <h1
            className="display xl"
            data-reveal
            style={{
              fontSize: "clamp(60px, 9vw, 132px)",
              fontWeight: 400,
              margin: "28px 0 24px",
              maxWidth: 1240,
            }}
          >
            Two operating systems
            <br />
            <em>for premium property.</em>
            <br />
            <span style={{ color: "var(--ink-3)", fontStyle: "italic" }}>
              One operating company.
            </span>
          </h1>
          <p
            data-reveal
            style={{
              fontSize: 19,
              maxWidth: 720,
              color: "var(--ink-2)",
              margin: "0 0 36px",
            }}
          >
            Arconique builds two software systems for boutique villa and resort
            businesses in Southeast Asia.{" "}
            <strong style={{ color: "var(--ink)", fontWeight: 500 }}>
              Management OS
            </strong>{" "}
            runs the portfolio you already own.{" "}
            <strong style={{ color: "var(--ink)", fontWeight: 500 }}>
              Development OS
            </strong>{" "}
            builds the next one. Both live in one workspace, share one audit
            log, and stop you from emailing your COO at 23:00.
          </p>
          <div
            data-reveal
            style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
          >
            <Link href="#pricing" className="btn btn-ink btn-lg">
              See pricing →
            </Link>
            <Link
              href="https://management.arconique.com"
              className="btn btn-ghost btn-lg"
            >
              Tour Management OS
            </Link>
            <Link
              href="https://development.arconique.com"
              className="btn btn-ghost btn-lg"
            >
              Tour Development OS
            </Link>
          </div>
          <div
            data-reveal
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 36,
              marginTop: 72,
              paddingTop: 28,
              borderTop: "1px solid var(--line-soft)",
            }}
          >
            {[
              { n: "200+", l: "villas under Management OS" },
              { n: "14", l: "active development projects" },
              { n: "$24M", l: "LP commitment under management" },
              { n: "99.98%", l: "platform uptime · 12mo trailing" },
            ].map((s) => (
              <div key={s.l}>
                <div
                  className="num"
                  style={{
                    fontSize: 34,
                    color: "var(--ink)",
                    fontWeight: 500,
                  }}
                >
                  {s.n}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--ink-3)",
                    marginTop: 4,
                  }}
                >
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCTS */}
      <section
        className="sec"
        id="products"
        style={{
          background: "var(--paper-2)",
          borderTop: "1px solid var(--line-soft)",
          borderBottom: "1px solid var(--line-soft)",
          padding: "96px 0",
        }}
      >
        <div className="container">
          <div
            data-reveal
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 24,
              marginBottom: 56,
            }}
          >
            <div>
              <div className="label label-gold">Two products · one platform</div>
              <h2
                className="display"
                style={{
                  fontSize: "clamp(40px, 5.5vw, 64px)",
                  margin: "12px 0 0",
                }}
              >
                Pick one. Or <em>let them talk.</em>
              </h2>
              <p
                style={{
                  maxWidth: 580,
                  color: "var(--ink-3)",
                  margin: "16px 0 0",
                  fontSize: 16,
                }}
              >
                Both products are independently complete. Together they share a
                workspace, a permission model, and an audit log — so a single
                org can run a 50-villa portfolio while building the next five.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
            }}
          >
            <ProductCard
              accent="terra"
              tag="MANAGEMENT OS"
              title={
                <>
                  Run the portfolio. <em>Quietly.</em>
                </>
              }
              blurb="The villa and boutique-hotel operating system. Bookings, owner statements, concierge AI, housekeeping, dynamic pricing, direct bookings — all on one source of truth. Built in Bali for premium hospitality operators."
              cabinetsLabel="What you get · 21 cabinets"
              items={[
                "Front office + arrivals",
                "Concierge AI · 4 languages",
                "Owner statements · hash-signed",
                "Owner stays + quotas",
                "Multi-channel sync (6 channels)",
                "Dynamic pricing · live",
                "Maintenance intelligence",
                "Inventory + procurement",
                "Direct-booking website",
                "Guest stays + smart-lock",
                "8 specialist AI agents",
                "Owner intelligence reports",
              ]}
              landingHref="https://management.arconique.com"
              demoHref="https://management.arconique.com/dashboard"
              subdomainCaption="→ management.arconique.com"
            />
            <ProductCard
              accent="amber"
              tag="DEVELOPMENT OS"
              dark
              delay={1}
              title={
                <>
                  Build the next one. <span style={{ color: "var(--amber)" }}>On record.</span>
                </>
              }
              blurb="The construction operating system for boutique villa and condotel developers. BOQ, procurement, QA/QC, daily reports, investor portal — one source of truth from groundbreaking to handover."
              cabinetsLabel="What you get · 20 cabinets"
              items={[
                "BOQ · 8,300-line live tracking",
                "QS Cost Analyst AI",
                "Procurement · PR/RFQ/PO/invoice",
                "Site supervisor PWA",
                "Photo-evidence QA/QC",
                "CFO cabinet · P&L + tax",
                "Investor portal · bilingual",
                "Capital ledger + waterfall",
                "Sales pipeline + buyers",
                "Method statements library",
                "10 specialist AI agents",
                "Risk radar · executive view",
              ]}
              landingHref="https://development.arconique.com"
              demoHref="https://development.arconique.com/development-os"
              subdomainCaption="→ development.arconique.com"
            />
          </div>
        </div>
      </section>

      {/* WHY BOTH */}
      <section className="sec" id="why" style={{ padding: "96px 0" }}>
        <div className="container">
          <div
            data-reveal
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr",
              gap: 64,
              alignItems: "flex-start",
            }}
          >
            <div>
              <div className="label label-gold">Why both</div>
              <h2
                className="display"
                style={{
                  fontSize: "clamp(40px, 5.5vw, 64px)",
                  margin: "12px 0 0",
                }}
              >
                Build it. <em>Run it.</em> Without
                <br />
                switching browser tabs.
              </h2>
              <p
                style={{
                  maxWidth: 540,
                  color: "var(--ink-3)",
                  margin: "22px 0 0",
                  fontSize: 16,
                }}
              >
                Boutique developers eventually become operators. The unit you
                sold becomes the villa you run. The villa you run pays for the
                next groundbreaking. The capital you raised needs ongoing
                reporting after the asset is live. One workspace closes that
                loop.
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "36px 0 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  fontSize: 15,
                }}
              >
                {WHY_BOTH_LINES.map((line) => (
                  <li key={line.n} style={{ display: "flex", gap: 14 }}>
                    <span
                      className="num"
                      style={{ color: "var(--gold-deep)", minWidth: 28 }}
                    >
                      {line.n}
                    </span>
                    <div>
                      <strong>{line.heading}</strong>
                      <br />
                      <span style={{ color: "var(--ink-3)" }}>{line.body}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Unified LP report card */}
            <div style={{ position: "relative" }}>
              <div
                className="card-ink"
                style={{
                  padding: 28,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0.12,
                    background:
                      "radial-gradient(60% 60% at 100% 0%, var(--gold) 0%, transparent 60%)",
                  }}
                />
                <div
                  className="label"
                  style={{ color: "rgba(245,240,226,0.6)" }}
                >
                  UNIFIED LP REPORT · Q1 2026
                </div>
                <h3
                  className="display"
                  style={{
                    fontSize: 28,
                    margin: "10px 0 0",
                    color: "var(--paper)",
                  }}
                >
                  Robert P. · Hong Kong
                </h3>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "rgba(245,240,226,0.6)",
                    marginTop: 4,
                  }}
                >
                  LP across EP02 (dev) + ES-S5 (mgmt)
                </div>

                <div
                  style={{
                    marginTop: 26,
                    display: "grid",
                    gap: 14,
                  }}
                >
                  <LpReportRow
                    source="FROM DEVELOPMENT OS"
                    rows={[
                      { l: "Commitment called", v: "78%", gold: true },
                      { l: "YTD distributions", v: "$184K" },
                    ]}
                  />
                  <LpReportRow
                    source="FROM MANAGEMENT OS"
                    rows={[
                      { l: "YTD owner payouts", v: "$84K", gold: true },
                      { l: "Net annualized yield", v: "11.4%" },
                    ]}
                  />
                  <div
                    style={{
                      padding: "14px 16px",
                      background: "var(--gold)",
                      color: "var(--ink)",
                      borderRadius: 12,
                    }}
                  >
                    <div
                      className="label"
                      style={{ color: "rgba(15,26,31,0.6)" }}
                    >
                      COMPOSITE IRR · NET
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-fraunces), serif",
                        fontSize: 42,
                        marginTop: 6,
                        fontStyle: "italic",
                        fontWeight: 400,
                      }}
                    >
                      23.4%
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(15,26,31,0.7)",
                        marginTop: 2,
                      }}
                    >
                      vs PPM 18.0% · attested 31 Mar 2026
                    </div>
                  </div>
                </div>

                <div
                  className="mono"
                  style={{
                    marginTop: 22,
                    paddingTop: 14,
                    borderTop: "1px dashed rgba(255,255,255,0.18)",
                    fontSize: 10,
                    color: "rgba(245,240,226,0.5)",
                    letterSpacing: "0.08em",
                  }}
                >
                  HASH a91f2c…7d4b · CHAIN VERIFIED
                </div>
              </div>
              <div
                style={{
                  marginTop: 12,
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--ink-3)",
                  fontStyle: "italic",
                }}
              >
                — One LP report. Two systems behind it.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section
        className="sec"
        id="pricing"
        style={{
          background: "var(--paper-2)",
          borderTop: "1px solid var(--line-soft)",
          borderBottom: "1px solid var(--line-soft)",
          padding: "96px 0",
        }}
      >
        <div className="container">
          <div
            data-reveal
            style={{
              textAlign: "center",
              maxWidth: 720,
              margin: "0 auto 56px",
            }}
          >
            <div className="label label-gold">
              Pricing · annual gets 18% off
            </div>
            <h2
              className="display"
              style={{
                fontSize: "clamp(40px, 5.5vw, 64px)",
                margin: "12px 0 0",
              }}
            >
              Buy <em>one.</em> Buy <em>both.</em> 14-day trial first.
            </h2>
            <p
              style={{
                color: "var(--ink-3)",
                margin: "18px 0 0",
                fontSize: 16,
              }}
            >
              Per-villa for Management OS. Per-project for Development OS.
              Bundle saves 20%. No card to start. Cancel any time — full
              CSV/XLSX export of every row.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 18,
            }}
          >
            <PricingCard
              accent="terra"
              tag="MANAGEMENT OS"
              name="Operator"
              audience="For multi-owner companies running 5–25 villas."
              price="$390"
              unit="/villa/mo"
              floor="FROM $190/villa · Starter tier"
              features={[
                "All 21 cabinets · unlimited users",
                "Multi-owner statements · DPA",
                "Concierge AI · unlimited messages",
                "Direct-booking website included",
                "Maintenance intelligence",
                "Slack-channel support · live",
              ]}
              ctaLabel="Start Management trial →"
              ctaHref="https://management.arconique.com"
              ctaClass="btn-terra"
            />
            <PricingCard
              accent="amber"
              tag="DEVELOPMENT OS"
              name="Portfolio"
              audience="For boutique developers with 2–6 concurrent projects."
              price="$2,800"
              unit="/project/mo"
              floor="FROM $1,200/project · Project tier"
              features={[
                "All 20 cabinets · 30 user seats",
                "BOQ · 30,000 lines",
                "All 10 AI agents · unlimited",
                "Bilingual investor portal · 4 langs",
                "Capital + waterfall engine",
                "Slack-channel support · live",
              ]}
              ctaLabel="Start Development trial →"
              ctaHref="https://development.arconique.com"
              ctaClass="btn-amber"
              delay={1}
            />
            <PricingCardBundle />
          </div>

          {/* Enterprise tail */}
          <div
            data-reveal
            style={{
              marginTop: 24,
              padding: "18px 24px",
              border: "1px dashed var(--line)",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span className="chip chip-ink">ENTERPRISE</span>
            <span
              style={{ fontSize: 14, color: "var(--ink-2)", flex: 1 }}
            >
              Portfolios over 50 villas or 6+ concurrent projects · multi-entity
              SPVs · SAML SSO · custom integrations · 99.9% SLA · white-label
              owner/LP portal.
            </span>
            <Link href="#cta" className="btn btn-ghost btn-sm">
              Custom quote →
            </Link>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="sec" id="trust" style={{ padding: "96px 0" }}>
        <div className="container">
          <div
            data-reveal
            style={{
              textAlign: "center",
              maxWidth: 720,
              margin: "0 auto 36px",
            }}
          >
            <div className="label label-gold">Customers</div>
            <h2
              className="display"
              style={{
                fontSize: "clamp(36px, 4.5vw, 52px)",
                margin: "12px 0 0",
              }}
            >
              Trusted by <em>operators and builders</em> across Bali.
            </h2>
          </div>
          <div
            data-reveal
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 36,
              flexWrap: "wrap",
              padding: "28px 32px",
              borderTop: "1px solid var(--line)",
              borderBottom: "1px solid var(--line)",
            }}
          >
            {[
              ["Eternal Estates", false],
              ["Enso Villas", true],
              ["Ahau Gardens", false],
              ["Pererenan Collection", true],
              ["Tirta Villas", false],
              ["Beachfront Bali", true],
            ].map(([name, italic]) => (
              <span
                key={String(name)}
                style={{
                  fontFamily: "var(--font-fraunces), serif",
                  fontSize: 22,
                  color: "var(--ink-3)",
                  fontStyle: italic ? "italic" : "normal",
                }}
              >
                {name}
              </span>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
              marginTop: 36,
            }}
          >
            <Testimonial
              quoteColor="var(--terra)"
              body="Before Arconique, eleven villas were running me. Now I close my laptop at six and the system keeps going — owners get their PDFs, guests get answers, I get my evenings back."
              avatar={
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    background:
                      "linear-gradient(135deg, var(--gold), var(--terra))",
                  }}
                />
              }
              name="Made Sutrisno"
              role="GM · Eternal Estates · 11 villas · Pererenan"
            />
            <Testimonial
              quoteColor="var(--amber)"
              delay={1}
              body="We rebaselined the BOQ in four hours. Caught a $40K marble overpay in week one. The qs-cost-analyst paid for the entire annual subscription on a single line item."
              avatar={
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    background: "var(--ink)",
                    color: "var(--gold)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-fraunces), serif",
                    fontSize: 16,
                  }}
                >
                  NR
                </div>
              }
              name="N. Razgulyaev"
              role="Founder · Eternal Developments · 3 projects · $24M GDV"
            />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        className="sec"
        style={{
          background: "var(--paper-2)",
          borderTop: "1px solid var(--line-soft)",
          borderBottom: "1px solid var(--line-soft)",
          padding: "96px 0",
        }}
      >
        <div className="container">
          <div
            data-reveal
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 24,
              marginBottom: 56,
            }}
          >
            <div>
              <div className="label label-gold">How it works</div>
              <h2
                className="display"
                style={{
                  fontSize: "clamp(40px, 5.5vw, 64px)",
                  margin: "12px 0 0",
                }}
              >
                Live in <em>under a week.</em>
              </h2>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 14,
            }}
          >
            <HowStep
              variant="bento-emerald"
              numColor="var(--gold-soft)"
              n="01"
              title="Provision in 60 seconds"
              body="Workspace at your subdomain. Demo data preloaded. 5 seats ready."
            />
            <HowStep
              variant="bento"
              numColor="var(--gold-deep)"
              n="02"
              title="Import your truth"
              body="CSV, iCal, Airbnb, Booking.com, or paste an Excel BOQ. We map it for you."
              delay={1}
            />
            <HowStep
              variant="bento-gold"
              numColor="var(--ink)"
              n="03"
              title="Invite the team"
              body="20 internal roles ready. Owners + LPs get tokenized portals. SAML SSO on Enterprise."
              delay={2}
              dark
            />
            <HowStep
              variant="bento-terra"
              numColor="var(--gold-soft)"
              n="04"
              title="Run by Friday"
              body="First owner statement on day 3. First daily digest on day 1. First AI run minutes in."
              delay={3}
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="sec" id="faq" style={{ padding: "96px 0" }}>
        <div className="container">
          <div
            data-reveal
            style={{
              textAlign: "center",
              maxWidth: 720,
              margin: "0 auto 56px",
            }}
          >
            <div className="label label-gold">FAQ</div>
            <h2
              className="display"
              style={{
                fontSize: "clamp(36px, 4.5vw, 52px)",
                margin: "12px 0 0",
              }}
            >
              The honest answers.
            </h2>
          </div>

          <div
            data-reveal
            style={{
              maxWidth: 880,
              margin: "0 auto",
              display: "grid",
              gap: 4,
            }}
          >
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="card"
                style={{ padding: "22px 28px", cursor: "pointer" }}
              >
                <summary
                  style={{
                    fontFamily: "var(--font-fraunces), serif",
                    fontSize: 22,
                    fontWeight: 400,
                    listStyle: "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  {f.q}{" "}
                  <span style={{ color: "var(--ink-3)", fontSize: 28 }}>+</span>
                </summary>
                <p
                  style={{
                    margin: "14px 0 0",
                    color: "var(--ink-3)",
                    fontSize: 15,
                    lineHeight: 1.6,
                  }}
                >
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="sec" id="cta" style={{ padding: "96px 0" }}>
        <div className="container">
          <div
            className="bento bento-ink"
            data-reveal
            style={{
              padding: "64px 56px",
              position: "relative",
              overflow: "hidden",
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
                opacity: 0.18,
                background:
                  "radial-gradient(60% 80% at 100% 0%, var(--gold) 0%, transparent 60%)",
              }}
            />
            <div style={{ position: "relative" }}>
              <div
                className="label"
                style={{ color: "rgba(245,240,226,0.6)" }}
              >
                Get started
              </div>
              <h2
                className="display"
                style={{
                  fontSize: "clamp(40px, 5.5vw, 72px)",
                  margin: "14px 0 0",
                  color: "var(--paper)",
                }}
              >
                Live tonight on Arconique.
              </h2>
              <p
                style={{
                  maxWidth: 540,
                  color: "rgba(245,240,226,0.78)",
                  margin: "18px 0 0",
                  fontSize: 17,
                }}
              >
                14-day trial of either product. Or both. No card. Cancel any
                time — your data exports as CSV/XLSX.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 30,
                  flexWrap: "wrap",
                }}
              >
                <Link
                  href="https://management.arconique.com"
                  className="btn btn-gold btn-lg"
                >
                  Start with Management →
                </Link>
                <Link
                  href="https://development.arconique.com"
                  className="btn btn-ghost btn-lg"
                  style={{
                    background: "transparent",
                    color: "var(--paper)",
                    borderColor: "rgba(255,255,255,0.25)",
                  }}
                >
                  Start with Development
                </Link>
              </div>
            </div>
            <div
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {[
                "Pick the product (or bundle)",
                "Workspace ready in 90 seconds",
                "First AI run within minutes",
                "Talk to a human within 24h",
              ].map((step, i) => (
                <div
                  key={step}
                  style={{
                    padding: "14px 18px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.04)",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <span
                    className="num"
                    style={{ color: "var(--gold)", width: 24 }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    style={{
                      color: "rgba(245,240,226,0.9)",
                      fontSize: 14,
                    }}
                  >
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        style={{
          background: "var(--paper-2)",
          borderTop: "1px solid var(--line-soft)",
          padding: "56px 0 32px",
        }}
      >
        <div className="container">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr",
              gap: 36,
            }}
          >
            <div>
              <div
                className="brand"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontFamily: "var(--font-fraunces), serif",
                  fontSize: 22,
                }}
              >
                {FOOTER_BRAND_SVG} Arconique
              </div>
              <p
                style={{
                  margin: "18px 0 0",
                  color: "var(--ink-3)",
                  fontSize: 14,
                  maxWidth: 320,
                }}
              >
                The operating company for premium property in Southeast Asia.
                Two products, one platform, one quiet team.
              </p>
              <p
                className="mono"
                style={{
                  marginTop: 22,
                  fontSize: 11,
                  color: "var(--ink-4)",
                  letterSpacing: "0.08em",
                }}
              >
                subscription.arconique.com
              </p>
            </div>
            <FooterCol
              label="Products"
              items={[
                ["Management OS", "https://management.arconique.com"],
                ["Mgmt demo cabinets", "https://management.arconique.com/dashboard"],
                ["Development OS", "https://development.arconique.com"],
                ["Dev demo cabinets", "https://development.arconique.com/development-os"],
              ]}
            />
            <FooterCol
              label="Pricing"
              items={[
                ["Operator", "#pricing"],
                ["Portfolio", "#pricing"],
                ["Vertical (bundle)", "#pricing"],
                ["Enterprise", "#cta"],
              ]}
            />
            <FooterCol
              label="Company"
              items={[
                ["About", "#"],
                ["Customers", "#trust"],
                ["Careers", "#"],
                ["Contact", "#cta"],
              ]}
            />
            <FooterCol
              label="Legal"
              items={[
                ["Terms", "/legal/terms"],
                ["Privacy", "/legal/privacy"],
                ["DPA", "/legal/privacy"],
                ["Status", "#"],
              ]}
            />
          </div>
          <div
            className="mono"
            style={{
              marginTop: 48,
              paddingTop: 20,
              borderTop: "1px solid var(--line-soft)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 11,
              color: "var(--ink-4)",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <span>© 2026 ARCONIQUE OS · MADE BETWEEN BALI AND BERLIN</span>
            <span>BUILD v9.07 · UPTIME 99.98%</span>
          </div>
        </div>
      </footer>
    </>
  );
}

// ============================================================
// Section helpers — keep the main composition readable
// ============================================================

const WHY_BOTH_LINES = [
  {
    n: "01",
    heading: "One audit log.",
    body: "Every booking, every PO, every change order, every distribution — hash-chained in one append-only ledger.",
  },
  {
    n: "02",
    heading: "Asset handover, in place.",
    body: "A villa graduates from Development to Management with one click. Buyers become owners. POs become opex. No data migration.",
  },
  {
    n: "03",
    heading: "Investors see both sides.",
    body: "LP portal pulls capital ledger from Development, NOI from Management. One quarterly report. One IRR.",
  },
  {
    n: "04",
    heading: "20 roles, one permission model.",
    body: "Site supervisor, GM, QS, concierge, CFO, owner, LP, board member — every role's cabinet, gated by the same RLS layer.",
  },
];

const FAQS = [
  {
    q: "Can I buy just Management OS without Development OS?",
    a: "Yes. The two products are independently complete. Most villa managers start with Management OS. Developers start with Development OS. About a third of customers run both within their first year.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Every table exports as CSV/XLSX. Statements export as hash-signed PDFs. Documents room downloads as one ZIP. Migration help is included in the offboarding session. No lock-in, no penalty.",
  },
  {
    q: "How are AI agents priced?",
    a: "Each tier includes a monthly token budget (Operator: $150, Portfolio: $180, Vertical: combined $300). Soft overage to 150%, hard cap above. No per-message charges. Every run is auditable in the cabinet.",
  },
  {
    q: "Is it just for Bali?",
    a: "Built in Bali, designed for SE Asia, deployed in Thailand and Vietnam too. Multi-currency, multi-language (EN/ID/RU/JP), local tax presets (Bali PHR, Thai SBT, VAT). European pilots starting Q3 2026.",
  },
  {
    q: "Do you have an API?",
    a: "Yes. Per-org API keys, scoped permissions, HMAC-signed webhooks. Documented at developer.arconique.com. Public quote API is free; finance + automation endpoints require Portfolio or Vertical tier.",
  },
];

function SubscriptionStyleOverrides() {
  // Container width + section spacing — these mirror the prototype's
  // global CSS and aren't covered by the product-scoped block in
  // globals.css (which is tied to data-product attributes).
  return (
    <style>{`
      .container { max-width: 1360px; margin: 0 auto; padding: 0 32px; }
      @media (max-width: 1000px) {
        .container { padding: 0 24px; }
        [data-product="subscription"] .display { font-size: 11vw !important; line-height: 1.05 !important; }
      }
      @media (max-width: 640px) {
        .container { padding: 0 18px; }
      }
    `}</style>
  );
}

interface ProductCardProps {
  accent: "terra" | "amber";
  tag: string;
  title: React.ReactNode;
  blurb: string;
  cabinetsLabel: string;
  items: string[];
  landingHref: string;
  demoHref: string;
  subdomainCaption: string;
  dark?: boolean;
  delay?: number;
}

function ProductCard(props: ProductCardProps) {
  const isDark = props.dark;
  return (
    <div
      className="bento"
      data-reveal
      data-reveal-delay={props.delay}
      style={{ padding: 0, overflow: "hidden" }}
    >
      <div
        className={isDark ? "tex-cool" : "tex-sand"}
        style={{
          padding: "32px 32px 28px",
          borderBottom: "1px solid var(--line-soft)",
          color: isDark ? "var(--paper)" : undefined,
          position: "relative",
        }}
      >
        {isDark && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "30px 30px",
              pointerEvents: "none",
            }}
          />
        )}
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background:
                  props.accent === "terra" ? "var(--terra)" : "var(--amber)",
                color: isDark ? "var(--ink)" : "var(--paper)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                {props.accent === "terra" ? (
                  <path d="M3 21V8l9-5 9 5v13M9 21v-7h6v7" />
                ) : (
                  <path d="M14 5l5 5-9 9-5-5 9-9zM12 7l5 5M3 21l3-3" />
                )}
              </svg>
            </span>
            <span
              className="chip"
              style={
                props.accent === "terra"
                  ? {
                      background: "var(--paper)",
                      borderColor: "var(--terra-soft)",
                      color: "var(--terra)",
                    }
                  : {
                      background: "rgba(255,107,53,0.18)",
                      borderColor: "rgba(255,255,255,0.3)",
                      color: "var(--amber-soft)",
                      letterSpacing: "0.12em",
                    }
              }
            >
              {props.tag}
            </span>
          </div>
          <h3
            className="display"
            style={{
              fontSize: 44,
              margin: "18px 0 10px",
              maxWidth: 480,
              color: isDark ? "var(--paper)" : undefined,
            }}
          >
            {props.title}
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: 15.5,
              color: isDark
                ? "rgba(245,240,226,0.78)"
                : "var(--ink-2)",
              maxWidth: 520,
            }}
          >
            {props.blurb}
          </p>
        </div>
      </div>
      <div style={{ padding: "24px 32px" }}>
        <div className="label" style={{ marginBottom: 12 }}>
          {props.cabinetsLabel}
        </div>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px 14px",
            fontSize: 14,
          }}
        >
          {props.items.map((it) => (
            <li key={it}>· {it}</li>
          ))}
        </ul>
        <div
          style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: "1px dashed var(--line)",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <Link href={props.landingHref} className="btn btn-ink">
            Visit landing →
          </Link>
          <Link href={props.demoHref} className="btn btn-ghost">
            Open demo cabinets
          </Link>
        </div>
        <div
          className="mono"
          style={{
            marginTop: 14,
            fontSize: 11,
            color: "var(--ink-4)",
            letterSpacing: "0.08em",
          }}
        >
          {props.subdomainCaption}
        </div>
      </div>
    </div>
  );
}

interface LpReportRowProps {
  source: string;
  rows: { l: string; v: string; gold?: boolean }[];
}
function LpReportRow({ source, rows }: LpReportRowProps) {
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
      }}
    >
      <div className="label" style={{ color: "var(--amber-soft)" }}>
        {source}
      </div>
      {rows.map((r, i) => (
        <div
          key={r.l}
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: i === 0 ? 8 : 6,
            alignItems: "baseline",
          }}
        >
          <span style={{ fontSize: 13.5 }}>{r.l}</span>
          <span
            className="num"
            style={{
              fontSize: 18,
              color: r.gold ? "var(--gold)" : undefined,
            }}
          >
            {r.v}
          </span>
        </div>
      ))}
    </div>
  );
}

interface PricingCardProps {
  accent: "terra" | "amber";
  tag: string;
  name: string;
  audience: string;
  price: string;
  unit: string;
  floor: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  ctaClass: string;
  delay?: number;
}

function PricingCard(props: PricingCardProps) {
  return (
    <div
      className="card"
      data-reveal
      data-reveal-delay={props.delay}
      style={{
        padding: 28,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            className="chip"
            style={
              props.accent === "terra"
                ? {
                    background: "var(--paper)",
                    borderColor: "var(--terra-soft)",
                    color: "var(--terra)",
                  }
                : {
                    background: "var(--paper)",
                    borderColor: "var(--amber-soft)",
                    color: "var(--amber)",
                  }
            }
          >
            {props.tag}
          </span>
        </div>
        <h3
          className="display"
          style={{ fontSize: 30, margin: "14px 0 0", fontWeight: 400 }}
        >
          {props.name}
        </h3>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13.5,
            color: "var(--ink-3)",
          }}
        >
          {props.audience}
        </p>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span
            className="display"
            style={{ fontSize: 54, fontWeight: 400 }}
          >
            {props.price}
          </span>
          <span style={{ color: "var(--ink-3)", fontSize: 14 }}>
            {props.unit}
          </span>
        </div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--ink-4)",
            marginTop: 4,
          }}
        >
          {props.floor}
        </div>
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
          color: "var(--ink-2)",
        }}
      >
        {props.features.map((f) => (
          <li key={f}>· {f}</li>
        ))}
      </ul>
      <Link
        href={props.ctaHref}
        className={`btn ${props.ctaClass}`}
        style={{ marginTop: "auto", justifyContent: "center" }}
      >
        {props.ctaLabel}
      </Link>
    </div>
  );
}

function PricingCardBundle() {
  return (
    <div
      className="card bento-ink"
      data-reveal
      data-reveal-delay={2}
      style={{
        padding: 28,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        color: "var(--paper)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: "var(--gold)",
        }}
      />
      <span
        className="chip"
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          background: "var(--gold)",
          color: "var(--ink)",
          borderColor: "var(--gold)",
        }}
      >
        BEST VALUE · −20%
      </span>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            className="chip"
            style={{
              background: "rgba(255,255,255,0.08)",
              borderColor: "rgba(255,255,255,0.2)",
              color: "var(--paper)",
            }}
          >
            MGMT
          </span>
          <span style={{ color: "var(--ink-4)" }}>+</span>
          <span
            className="chip"
            style={{
              background: "rgba(255,255,255,0.08)",
              borderColor: "rgba(255,255,255,0.2)",
              color: "var(--paper)",
            }}
          >
            DEV
          </span>
        </div>
        <h3
          className="display"
          style={{
            fontSize: 30,
            margin: "14px 0 0",
            fontWeight: 400,
            color: "var(--paper)",
          }}
        >
          Vertical
        </h3>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13.5,
            color: "rgba(245,240,226,0.7)",
          }}
        >
          For developers who also operate the buildings they sell.
        </p>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span
            className="display"
            style={{
              fontSize: 54,
              fontWeight: 400,
              color: "var(--paper)",
            }}
          >
            $5,400
          </span>
          <span
            style={{ color: "rgba(245,240,226,0.6)", fontSize: 14 }}
          >
            /mo · bundle
          </span>
        </div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--gold-soft)",
            marginTop: 4,
          }}
        >
          SAVE $1,400/MO vs separate
        </div>
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
          color: "rgba(245,240,226,0.85)",
        }}
      >
        <li>· Everything in Operator + Portfolio</li>
        <li>· Unified LP portal · both products</li>
        <li>· Asset handover · dev → mgmt</li>
        <li>· 30 villas + 2 projects included</li>
        <li>· On-island onboarding week</li>
        <li>· Dedicated success manager</li>
      </ul>
      <Link
        href="#cta"
        className="btn btn-gold"
        style={{ marginTop: "auto", justifyContent: "center" }}
      >
        Talk to sales →
      </Link>
    </div>
  );
}

interface TestimonialProps {
  quoteColor: string;
  body: string;
  avatar: React.ReactNode;
  name: string;
  role: string;
  delay?: number;
}
function Testimonial(props: TestimonialProps) {
  return (
    <div
      className="card"
      data-reveal
      data-reveal-delay={props.delay}
      style={{ padding: 32 }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-fraunces), serif",
          fontSize: 22,
          lineHeight: 1.4,
          fontStyle: "italic",
          color: "var(--ink)",
          letterSpacing: "-0.01em",
        }}
      >
        <span
          style={{
            color: props.quoteColor,
            fontSize: 40,
            lineHeight: 0,
            verticalAlign: -10,
          }}
        >
          &ldquo;
        </span>
        {props.body}
      </p>
      <div
        style={{
          marginTop: 24,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {props.avatar}
        <div>
          <div style={{ fontWeight: 500 }}>{props.name}</div>
          <div
            className="mono"
            style={{ fontSize: 11, color: "var(--ink-3)" }}
          >
            {props.role}
          </div>
        </div>
      </div>
    </div>
  );
}

interface HowStepProps {
  variant: string;
  numColor: string;
  n: string;
  title: string;
  body: string;
  delay?: number;
  dark?: boolean;
}
function HowStep(props: HowStepProps) {
  return (
    <div
      className={`bento ${props.variant}`}
      data-reveal
      data-reveal-delay={props.delay}
      style={{
        padding: 24,
        minHeight: 220,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        className="num"
        style={{ fontSize: 36, color: props.numColor }}
      >
        {props.n}
      </div>
      <div
        className="display"
        style={{
          fontSize: 22,
          fontWeight: 400,
          color: props.dark ? "var(--ink)" : undefined,
        }}
      >
        {props.title}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 13.5,
          opacity: props.dark ? undefined : 0.82,
          color: props.dark ? "var(--ink-2)" : undefined,
        }}
      >
        {props.body}
      </p>
    </div>
  );
}

interface FooterColProps {
  label: string;
  items: [string, string][];
}
function FooterCol({ label, items }: FooterColProps) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 14 }}>
        {label}
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 9,
          fontSize: 13.5,
        }}
      >
        {items.map(([name, href]) => (
          <li key={name}>
            <Link href={href} style={{ color: "var(--ink-2)" }}>
              {name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
