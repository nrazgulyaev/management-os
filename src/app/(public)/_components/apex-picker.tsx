import Link from "next/link";

/**
 * Sprint _handoff/ Task 2 — apex picker.
 *
 * Renders the split-screen `_handoff/index.html` design at the apex
 * `arconique.com` URL when middleware doesn't resolve a product
 * subdomain. Two equal halves: warm cream Mgmt OS left, dark grid
 * Dev OS right. Each half links to the canonical product subdomain.
 *
 * Server component — no client state needed; hover transforms are
 * pure CSS. Lives in `(public)/_components/` so the layout's main
 * wrapper doesn't try to grid-pad it (the picker is full-bleed by
 * design).
 *
 * No `data-product` attribute on this page — both palettes appear
 * side-by-side, so the picker brings its own colors inline rather
 * than depending on the product-scoped vars from globals.css.
 */
export function ApexPicker() {
  return (
    <div className="apex-picker">
      <style>{apexPickerStyles}</style>
      <Link
        href="https://management.arconique.com"
        className="apex-half apex-mgmt"
      >
        <div className="apex-brand">
          <svg
            className="apex-mark"
            viewBox="0 0 32 32"
            fill="none"
            style={{ color: "#1F3A33" }}
            aria-hidden
          >
            <path
              d="M16 4 L26 22 H6 Z"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M11 22 L16 13 L21 22"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
          <span className="apex-name">Arconique</span>
          <span className="apex-tag">MANAGEMENT</span>
        </div>
        <div className="apex-body">
          <div className="apex-label">For villa &amp; hotel operators</div>
          <h1 className="apex-h1">
            Run the
            <br />
            villa portfolio
            <br />
            <em>quietly.</em>
          </h1>
          <p className="apex-lede">
            Bookings, owner statements, concierge AI, housekeeping — one
            operating system for boutique hospitality companies on Airbnb,
            Booking.com and direct.
          </p>
          <div className="apex-stats">
            <div>
              <span className="apex-num">200+</span>
              <span>Bali villas live</span>
            </div>
            <div>
              <span className="apex-num">$3.8M</span>
              <span>processed/month</span>
            </div>
            <div>
              <span className="apex-num">14</span>
              <span>portfolios</span>
            </div>
          </div>
        </div>
        <div className="apex-cta">
          <span className="apex-btn apex-btn-primary">Open Management OS →</span>
          <span className="apex-small">management.arconique.com</span>
        </div>
      </Link>

      <Link
        href="https://development.arconique.com"
        className="apex-half apex-dev"
      >
        <div className="apex-brand">
          <svg
            className="apex-mark"
            viewBox="0 0 32 32"
            fill="none"
            style={{ color: "#FF6B35" }}
            aria-hidden
          >
            <rect x="4" y="4" width="24" height="24" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M10 22 V12 H22 M10 17 H22"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          <span className="apex-name apex-name-dev">ARCONIQUE</span>
          <span className="apex-tag apex-tag-dev">DEV.OS</span>
        </div>
        <div className="apex-body">
          <div className="apex-label apex-label-dev">For boutique developers</div>
          <h1 className="apex-h1 apex-h1-dev">
            Build the
            <br />
            next one.
            <br />
            <span>On record.</span>
          </h1>
          <p className="apex-lede apex-lede-dev">
            BOQ, procurement, QA/QC, daily reports, investor portal — one
            construction-grade operating system for villa, condotel and resort
            developments.
          </p>
          <div className="apex-stats">
            <div>
              <span className="apex-num apex-num-dev">14</span>
              <span className="apex-stat-label-dev">projects on-platform</span>
            </div>
            <div>
              <span className="apex-num apex-num-dev">$24M</span>
              <span className="apex-stat-label-dev">commitment under mgmt</span>
            </div>
            <div>
              <span className="apex-num apex-num-dev">23.4%</span>
              <span className="apex-stat-label-dev">portfolio IRR YTD</span>
            </div>
          </div>
        </div>
        <div className="apex-cta">
          <span className="apex-btn apex-btn-primary apex-btn-dev">
            Open Development OS →
          </span>
          <span className="apex-small apex-small-dev">development.arconique.com</span>
        </div>
      </Link>
    </div>
  );
}

const apexPickerStyles = `
.apex-picker {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100vh;
  font-family: var(--font-inter), system-ui, sans-serif;
}
.apex-half {
  padding: 56px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
}
.apex-mgmt { background: #F4EFE6; color: #14201C; }
.apex-mgmt::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(60% 40% at 100% 100%, rgba(196,88,60,0.16), transparent 60%),
    radial-gradient(50% 60% at 0% 0%, rgba(188,154,92,0.10), transparent 60%);
}
.apex-dev {
  background: #0E0E0D; color: #F5F4EE;
  background-image:
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
  background-size: 60px 60px;
}
.apex-dev::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(40% 50% at 100% 0%, rgba(255,107,53,0.18), transparent 60%);
}

.apex-brand { display: flex; align-items: center; gap: 10px; position: relative; }
.apex-mark { width: 22px; height: 22px; }
.apex-name {
  font-family: var(--font-newsreader), Georgia, serif;
  font-size: 20px; letter-spacing: -0.01em;
}
.apex-name-dev {
  font-family: var(--font-space), sans-serif;
  font-size: 18px; font-weight: 500; letter-spacing: 0.02em;
}
.apex-tag {
  font-family: var(--font-plex), monospace;
  font-size: 10px; padding: 2px 8px; border-radius: 999px;
  letter-spacing: 0.14em;
  border: 1px solid #DAD2C0; color: #4A5A55;
}
.apex-tag-dev {
  border: 1px solid rgba(255,107,53,0.4);
  color: #FF6B35;
  background: rgba(255,107,53,0.08);
  border-radius: 2px;
}

.apex-body { margin-top: 80px; position: relative; }
.apex-label {
  font-family: var(--font-plex), monospace;
  text-transform: uppercase;
  font-size: 11px; letter-spacing: 0.18em;
  color: #4A5A55; opacity: 0.7;
}
.apex-label-dev { color: #FF6B35; opacity: 1; }
.apex-h1 {
  font-family: var(--font-newsreader), serif;
  font-weight: 400; font-size: 72px; line-height: 1.02;
  letter-spacing: -0.02em; margin: 24px 0;
}
.apex-h1 em { color: #C4583C; font-style: italic; }
.apex-h1-dev {
  font-family: var(--font-space), sans-serif;
  font-weight: 500; letter-spacing: -0.025em;
}
.apex-h1-dev span { color: #FF6B35; }
.apex-lede { font-size: 17px; color: #4A5A55; max-width: 460px; line-height: 1.5; margin: 0; }
.apex-lede-dev { color: #C9C7BF; }

.apex-stats { display: flex; gap: 36px; margin-top: 30px; font-size: 13px; position: relative; }
.apex-stats > div { display: flex; flex-direction: column; gap: 4px; }
.apex-num {
  font-family: var(--font-plex), monospace;
  font-size: 24px; color: #14201C;
}
.apex-num-dev { color: #F5F4EE; }
.apex-stats span:not(.apex-num) { color: #4A5A55; }
.apex-stat-label-dev { color: #8E8C84 !important; }

.apex-cta {
  margin-top: auto; padding-top: 36px;
  display: flex; flex-direction: column; gap: 14px; position: relative;
}
.apex-btn {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 14px 22px; font-size: 14px; font-weight: 500;
  transition: transform 0.15s ease, opacity 0.15s ease;
  width: fit-content;
}
.apex-half:hover .apex-btn { transform: translateX(2px); }
.apex-btn-primary { background: #14201C; color: #FAF7F1; border-radius: 999px; }
.apex-btn-dev { background: #FF6B35; color: #0E0E0D; border-radius: 2px; }
.apex-small { font-size: 13px; opacity: 0.7; margin-top: 4px; color: #4A5A55; }
.apex-small-dev {
  color: #8E8C84;
  font-family: var(--font-plex), monospace;
  letter-spacing: 0.08em;
}

@media (max-width: 860px) {
  .apex-picker { grid-template-columns: 1fr; }
  .apex-h1 { font-size: 48px !important; }
  .apex-half { padding: 36px 24px; min-height: 80vh; }
}
`;
