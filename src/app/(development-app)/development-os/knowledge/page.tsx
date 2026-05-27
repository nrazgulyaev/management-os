import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";

export const metadata = { title: "Development OS · Knowledge" };
export const dynamic = "force-dynamic";

const DRAWINGS = [
  {
    name: "A-101 · Block B / L2 plan",
    project: "EP02",
    rev: "REV 14",
    status: "ok" as const,
    statusLabel: "Approved",
    by: "Made S.",
    when: "21 Apr 08:14",
  },
  {
    name: "S-204 · Column schedule",
    project: "EP02",
    rev: "REV 8",
    status: "ok" as const,
    statusLabel: "Approved",
    by: "Wayan T.",
    when: "20 Apr",
  },
  {
    name: "M-104 · MEP rough-in",
    project: "EP02",
    rev: "REV 6",
    status: "warn" as const,
    statusLabel: "Under review",
    by: "Sub-MEP",
    when: "19 Apr",
  },
];

export default function DevKnowledgePage() {
  return (
    <>
      <SectionHeading
        eyebrow="Knowledge · drawings · specs · method statements"
        title="The source of truth for the jobsite."
        subtitle="Drawings with revision history, technical specifications, method statements library, quality standards."
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
              + Drawing
            </button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Drawings" value="284" sub="14 revisions latest" />
        <Kpi label="Specifications" value="86" />
        <Kpi label="Method statements" value="42" sub="all approved" />
        <Kpi label="Quality standards" value="14" />
      </div>

      <h2 className="display" style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}>
        Recent drawing revisions
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Drawing</th>
              <th>Project</th>
              <th>Revision</th>
              <th>Status</th>
              <th>Issued by</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {DRAWINGS.map((d) => (
              <tr key={d.name}>
                <td>{d.name}</td>
                <td style={{ color: "var(--ink-3)" }}>{d.project}</td>
                <td>{d.rev}</td>
                <td>
                  <HandoffBadge tone={d.status}>{d.statusLabel}</HandoffBadge>
                </td>
                <td>{d.by}</td>
                <td style={{ color: "var(--ink-3)" }}>{d.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic", marginTop: 16 }}>
        Live drawing pipeline + revision diff viewer coming soon. Method statements library
        + quality standards roll-up wire to the documents schema.
      </p>
    </>
  );
}
