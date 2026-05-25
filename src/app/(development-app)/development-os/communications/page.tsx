import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";

export const metadata = { title: "Development OS · Communications" };
export const dynamic = "force-dynamic";

const TEMPLATES = [
  { name: "pour_method_signed", lang: "EN", usedFor: "Project manager confirmation" },
  { name: "po_partial_receipt", lang: "ID", usedFor: "Warehouse to procurement" },
  { name: "safety_incident_alert", lang: "EN, ID", usedFor: "All staff broadcast" },
  { name: "weekly_plan_director", lang: "EN", usedFor: "Director Monday digest" },
];

export default function DevCommunicationsPage() {
  return (
    <>
      <SectionHeading
        eyebrow="Communications · WhatsApp + email + push"
        title="Every signal, on the wire."
        subtitle="WhatsApp Business templates, phone number registry, notification rules per role."
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
              + Template
            </button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="WA messages · MTD" value="1,820" />
        <Kpi label="Templates approved" value="14" />
        <Kpi label="Phone numbers" value="22" sub="all staff + key vendors" />
        <Kpi label="Notification rules" value="42" />
      </div>

      <h2 className="display" style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}>
        WhatsApp template library
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Template</th>
              <th>Language</th>
              <th>Used for</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATES.map((t) => (
              <tr key={t.name}>
                <td style={{ fontFamily: "ui-monospace, monospace" }}>{t.name}</td>
                <td>{t.lang}</td>
                <td style={{ color: "var(--ink-3)" }}>{t.usedFor}</td>
                <td>
                  <HandoffBadge tone="ok">Approved</HandoffBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic", marginTop: 16 }}>
        Live template + rule editor coming soon. Inbound delivery to WhatsApp Business API
        is wired separately via the integrations panel.
      </p>
    </>
  );
}
