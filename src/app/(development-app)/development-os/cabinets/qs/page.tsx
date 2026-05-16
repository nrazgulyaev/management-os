import Link from "next/link";
import {
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * Sprint _handoff/ Task 7 (visual port) — Dev OS QS / Cost Analyst cabinet (BOQ desk).
 *
 * 1:1 visual port of `_handoff/development/qs.html` (app.js block).
 * Mock data preserved verbatim — live wiring deferred to TASK-7-DATA
 * per docs/audits/task-6-7-data-wiring-todo.md.
 *
 * Per spec: prototype's BOQ table shows top 7 rows (1 section + 6
 * lines) for visual richness. When the live `listBoqLines()` call
 * lands in TASK-7-DATA, existing pagination/filter UI from
 * `/development-os/boq/*` routes should be linked in via the "Filter"
 * CTA — they remain reachable but aren't embedded here.
 *
 * Sections: SectionHeading → 6-up KPI strip → qs-cost-analyst AI
 * anomaly band → BOQ table (1 section header + 6 lines) → RFQ matrix
 * table (4 vendors with AI-pick highlighted).
 */

export const metadata = { title: "QS · Cost Analyst" };
export const dynamic = "force-dynamic";

type BoqRow =
  | { sec: true; c: string; t: string }
  | {
      sec?: false;
      c: string;
      t: string;
      q: string;
      u: string;
      r: string;
      b: string;
      a: string;
      v: string;
      f: "ok" | "warn" | "danger";
    };

// TODO(task-7-data): wire to features/development/services.listBoqLines({ wp, rev, filter }).
// Prototype top-7 rows; live service ships pagination + section tree.
const BOQ: BoqRow[] = [
  { sec: true, c: "WP-04", t: "STRUCTURAL · Block B" },
  { c: "WP-04.01", t: "Excavation 0-3m · clay", q: "1,820", u: "m³", r: "$14.20", b: "$25,844", a: "$24,920", v: "−3.6%", f: "ok" },
  { c: "WP-04.03", t: "Ready-mix concrete C25/30", q: "1,420", u: "m³", r: "$128.40", b: "$182,328", a: "$183,448", v: "+0.6%", f: "ok" },
  { c: "WP-04.04", t: "Steel rebar Ø12 — main", q: "42.4", u: "t", r: "$1,420", b: "$60,208", a: "$59,640", v: "−0.9%", f: "ok" },
  { c: "WP-04.06", t: "Formwork plywood 18mm", q: "3,200", u: "m²", r: "$8.90", b: "$28,480", a: "$29,280", v: "+2.8%", f: "warn" },
  { c: "WP-04.18.b", t: "Marble Hindari 60×60 cm", q: "480", u: "m²", r: "$49.60", b: "$20,160", a: "$23,808", v: "+18.4%", f: "danger" },
  { c: "WP-04.24", t: "PEX-Al-PEX water pipe Ø20", q: "640", u: "m", r: "$6.40", b: "$4,096", a: "$4,840", v: "+18.2%", f: "danger" },
];

// TODO(task-7-data): wire to features/development/services.getBoqWpRollup(wp).
const WP_STATS: { label: string; value: string; sub: string | null; tone?: "amber" }[] = [
  { label: "Budget · WP-04", value: "$1,840,200", sub: null },
  { label: "Committed", value: "$1,592,400", sub: "86.5%" },
  { label: "Actual · MTD", value: "$1,468,720", sub: "$182K Oct" },
  { label: "Variance", value: "+1.4%", sub: "vs baseline", tone: "amber" },
  { label: "Open POs", value: "14", sub: "$84.2K" },
  { label: "Anomalies", value: "03", sub: "AI-detected", tone: "amber" },
];

// TODO(task-7-data): wire to features/development/services.getRfqMatrix(rfqId).
const RFQ_MATRIX: {
  vendor: string;
  tag: "current" | "ai-pick" | null;
  price: string;
  priceTone?: "amber";
  lead: string;
  qa: string;
  drift: string;
  driftTone: "ok" | "warn" | "danger";
  cta: "primary" | "secondary";
}[] = [
  { vendor: "BatuJaya", tag: "current", price: "$49.60", priceTone: "amber", lead: "21d", qa: "88", drift: "+18.4%", driftTone: "danger", cta: "secondary" },
  { vendor: "NusaMarmer", tag: "ai-pick", price: "$43.20", lead: "18d", qa: "92", drift: "+3.0%", driftTone: "warn", cta: "primary" },
  { vendor: "StoneEra", tag: null, price: "$41.80", lead: "25d", qa: "90", drift: "−0.5%", driftTone: "ok", cta: "secondary" },
  { vendor: "GraniMega", tag: null, price: "$42.00", lead: "14d", qa: "86", drift: "+0.2%", driftTone: "ok", cta: "secondary" },
];

function flagBadge(f: "ok" | "warn" | "danger") {
  if (f === "ok") return <Badge tone="ok">OK</Badge>;
  if (f === "warn") return <Badge tone="warn">Watch</Badge>;
  return <Badge tone="danger">Alert</Badge>;
}

export default function QsPage() {
  return (
    <>
      <SectionHeading
        eyebrow="BOQ · REV 14 · stamped 04 Nov 2026"
        title={
          <>
            WP-04 Structural ·{" "}
            <span style={{ color: "var(--amber)" }}>1,420 m³ live.</span>
          </>
        }
        subtitle="Per-line baseline vs actual, AI-flagged anomalies, full revision history, side-by-side RFQ resolution."
        actions={
          <>
            <Link href="/development-os/boq" className="btn btn-dark btn-sm">
              Open full BOQ
            </Link>
            <Link href="/development-os/boq/quick-entry" className="btn btn-dark btn-sm">
              Quick entry
            </Link>
            <button className="btn btn-dark btn-sm">Export XLSX ↓</button>
            <button className="btn btn-dark btn-sm">Compare REV 13</button>
            <button className="btn btn-amber btn-sm">+ Change order</button>
          </>
        }
      />

      {/* WP rollup strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 0,
          border: "1px solid var(--line)",
          borderRadius: 14,
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        {WP_STATS.map((s, i, arr) => (
          <div
            key={s.label}
            style={{
              padding: "16px 18px",
              borderRight: i < arr.length - 1 ? "1px solid var(--line)" : 0,
              background: s.tone === "amber" ? "rgba(255,107,53,0.04)" : "var(--panel)",
            }}
          >
            <div className="label" style={{ fontSize: 10 }}>{s.label}</div>
            <div
              className="num"
              style={{
                fontSize: 22,
                marginTop: 4,
                color: s.tone === "amber" ? "var(--amber)" : "var(--ink)",
                fontWeight: 500,
              }}
            >
              {s.value}
            </div>
            {s.sub && (
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{s.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* AI anomaly band */}
      <Card
        className="corner-marks"
        style={{ padding: 20, marginBottom: 18, borderColor: "var(--amber)" }}
      >
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
          <span
            style={{
              flexShrink: 0,
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "rgba(255,107,53,0.15)",
              color: "var(--amber)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✦
          </span>
          <div style={{ flex: 1 }}>
            <div className="label label-amber">qs-cost-analyst · run 4af2</div>
            <p
              style={{
                margin: "6px 0 12px",
                fontSize: 14,
                color: "var(--ink)",
                lineHeight: 1.55,
                maxWidth: 780,
              }}
            >
              Line{" "}
              <span className="mono" style={{ color: "var(--amber)" }}>
                WP-04.18.b · Marble Hindari 60×60
              </span>{" "}
              is <strong>+18.4%</strong> vs 6-month rolling baseline. Median across 4
              reference projects: $42/m². Suggested: re-issue RFQ to{" "}
              <strong>StoneEra</strong> ($41.80) and <strong>GraniMega</strong> ($42.00) —
              saves <strong>$3,744</strong> across 480 m².
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-amber btn-sm">Reissue RFQ →</button>
              <button className="btn btn-dark btn-sm">Mark accepted</button>
              <button className="btn btn-ghost btn-sm">Show reasoning</button>
            </div>
          </div>
        </div>
      </Card>

      {/* BOQ table */}
      <Card id="boq" style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <div
          style={{
            padding: "14px 22px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <h2 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            BOQ · WP-04 lines
          </h2>
          <span className="mono" style={{ marginLeft: 14, fontSize: 11, color: "var(--ink-3)" }}>
            7 of 142 shown · filter: anomalies + parents
          </span>
          <Link
            href="/development-os/boq"
            className="btn btn-dark btn-sm"
            style={{ marginLeft: "auto" }}
          >
            Filter
          </Link>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th className="num">Qty</th>
              <th>Unit</th>
              <th className="num">Rate</th>
              <th className="num">Budget</th>
              <th className="num">Actual</th>
              <th className="num">Var.</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {BOQ.map((r, i) =>
              r.sec ? (
                <tr key={i} style={{ background: "var(--bg-2)" }}>
                  <td
                    className="mono"
                    style={{ fontSize: 11, color: "var(--amber)", letterSpacing: "0.08em" }}
                  >
                    {r.c}
                  </td>
                  <td
                    colSpan={8}
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: "var(--amber)",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    {r.t}
                  </td>
                </tr>
              ) : (
                <tr
                  key={i}
                  style={{
                    background: r.f === "danger" ? "rgba(194,71,78,0.04)" : "transparent",
                  }}
                >
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.c}</td>
                  <td style={{ fontSize: 13 }}>{r.t}</td>
                  <td className="num">{r.q}</td>
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.u}</td>
                  <td className="num">{r.r}</td>
                  <td className="num">{r.b}</td>
                  <td
                    className="num"
                    style={{ color: r.f === "danger" ? "var(--amber)" : "var(--ink)" }}
                  >
                    {r.a}
                  </td>
                  <td
                    className="num"
                    style={{
                      color:
                        r.v.startsWith("+") && parseFloat(r.v.slice(1)) > 5
                          ? "var(--amber)"
                          : r.v.startsWith("−")
                            ? "var(--ok)"
                            : "var(--ink)",
                      fontWeight: 500,
                    }}
                  >
                    {r.v}
                  </td>
                  <td>{flagBadge(r.f)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </Card>

      {/* RFQ matrix */}
      <h2
        className="display"
        style={{ fontSize: 24, marginBottom: 14, fontWeight: 500 }}
      >
        RFQ-082 · Marble Hindari 60×60
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Vendor</th>
              <th className="num">$/m²</th>
              <th className="num">Lead</th>
              <th className="num">QA</th>
              <th>Drift</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {RFQ_MATRIX.map((v) => (
              <tr
                key={v.vendor}
                style={{
                  background:
                    v.tag === "current"
                      ? "rgba(194,71,78,0.04)"
                      : v.tag === "ai-pick"
                        ? "rgba(255,107,53,0.04)"
                        : "transparent",
                }}
              >
                <td>
                  <span className="mono">{v.vendor}</span>
                  {v.tag === "current" && (
                    <span style={{ marginLeft: 8 }}>
                      <Badge tone="danger">Current</Badge>
                    </span>
                  )}
                  {v.tag === "ai-pick" && (
                    <span style={{ marginLeft: 8 }}>
                      <Badge tone="warn">AI pick</Badge>
                    </span>
                  )}
                </td>
                <td className="num" style={{ color: v.priceTone === "amber" ? "var(--amber)" : undefined }}>
                  {v.price}
                </td>
                <td className="num">{v.lead}</td>
                <td className="num">{v.qa}</td>
                <td>
                  {v.driftTone === "ok" && <Badge tone="ok">{v.drift}</Badge>}
                  {v.driftTone === "warn" && <Badge tone="warn">{v.drift}</Badge>}
                  {v.driftTone === "danger" && <Badge tone="danger">{v.drift}</Badge>}
                </td>
                <td>
                  <button
                    className={"btn " + (v.cta === "primary" ? "btn-amber" : "btn-dark") + " btn-sm"}
                  >
                    Select
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
