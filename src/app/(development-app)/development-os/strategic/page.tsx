import {
  Kpi,
  SectionHeading,
  Card,
} from "@/components/dashboard/primitives";

export const metadata = { title: "Development OS · Strategic" };
export const dynamic = "force-dynamic";

const UNITS = [
  { unit: "EP02-A01", sale: "$680K", hard: "$398K", soft: "$84K", net: "$198K", stage: "Construction" },
  { unit: "EP02-A04", sale: "$420K", hard: "$248K", soft: "$52K", net: "$120K", stage: "Construction" },
  { unit: "EP02-B07", sale: "$540K", hard: "$324K", soft: "$68K", net: "$148K", stage: "Construction" },
];

export default function DevStrategicPage() {
  return (
    <>
      <SectionHeading
        eyebrow="Strategic · cycle intel + forecasting"
        title={
          <>
            Stages, profitability,{" "}
            <span style={{ color: "var(--amber)" }}>cashflow.</span>
          </>
        }
        subtitle="Project cycle intelligence (variance from comparable projects), per-unit profitability simulation, cashflow forecast."
        actions={
          <>
            <button
              className="btn btn-dark btn-sm"
              disabled
              title="Coming soon"
              style={{ opacity: 0.55, cursor: "not-allowed" }}
            >
              Export ↓
            </button>
            <button
              className="btn btn-amber btn-sm"
              disabled
              title="Coming soon"
              style={{ opacity: 0.55, cursor: "not-allowed" }}
            >
              + Scenario
            </button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Projects scored" value="3" />
        <Kpi label="Avg cycle deviation" value="+4.2%" sub="vs reference" />
        <Kpi label="Forecast variance" value="±$48K" sub="30-day window" tone="gold" />
        <Kpi label="Unit profitability avg" value="$184K/unit" tone="success" />
      </div>

      <h2 className="display" style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}>
        Unit profitability · EP02
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Unit</th>
              <th className="num">Sale price</th>
              <th className="num">Hard cost</th>
              <th className="num">Soft cost</th>
              <th className="num">Net margin</th>
              <th>Stage</th>
            </tr>
          </thead>
          <tbody>
            {UNITS.map((u) => (
              <tr key={u.unit}>
                <td style={{ fontFamily: "ui-monospace, monospace" }}>{u.unit}</td>
                <td className="num">{u.sale}</td>
                <td className="num">{u.hard}</td>
                <td className="num">{u.soft}</td>
                <td className="num" style={{ color: "var(--amber)" }}>{u.net}</td>
                <td style={{ color: "var(--ink-3)" }}>{u.stage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic", marginTop: 16 }}>
        Cycle intelligence + cashflow forecasting wire to risks (5 seeded) + decisions schema
        in the next data pass. Per-unit simulator coming soon.
      </p>
    </>
  );
}
