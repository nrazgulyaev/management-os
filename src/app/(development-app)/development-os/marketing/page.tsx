import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * TASK-8-MISSING-ROUTES 3/9 — Dev OS /marketing summary cabinet.
 * Ported from _handoff/development/marketing.html.
 *
 * Mock data verbatim. Live wiring to leads + campaigns tables is
 * TASK-7-DATA-PART-4 follow-up (leads table has 12 DEMO-2 seeds;
 * campaigns table has no DEMO-2 seed yet).
 */

export const metadata = { title: "Development OS · Marketing" };
export const dynamic = "force-dynamic";

const LEAD_SOURCES = [
  { source: "Meta Ads · IG/FB", leads: "28", qualified: "22", reservations: "4", cost: "$1,680", cpl: "$60" },
  { source: "Google Search", leads: "22", qualified: "18", reservations: "3", cost: "$1,240", cpl: "$56" },
  { source: "Direct + SEO", leads: "14", qualified: "12", reservations: "2", cost: "—", cpl: "—" },
  { source: "Referral · agent", leads: "12", qualified: "11", reservations: "2", cost: "$0", cpl: "—" },
  { source: "Press · Tatler", leads: "8", qualified: "6", reservations: "1", cost: "$2,400", cpl: "$300" },
];

const CAMPAIGNS = [
  { name: "Eternal Phase 02 · launch", channel: "Meta + Google", spend: "$2,420", reach: "182K", leads: "38", status: "ok" as const, label: "Live" },
  { name: "Ahau Gardens · sales", channel: "Google Search", spend: "$840", reach: "48K", leads: "12", status: "ok" as const, label: "Live" },
  { name: "Investor outreach Q2", channel: "LinkedIn", spend: "$1,200", reach: "14K", leads: "8", status: "warn" as const, label: "Optimizing" },
];

export default function DevMarketingPage() {
  return (
    <>
      <SectionHeading
        eyebrow="Marketing · 6 channels"
        title={
          <>
            Leads, campaigns, content.{" "}
            <span style={{ color: "var(--amber)" }}>One pipeline.</span>
          </>
        }
        subtitle="Per-source attribution, content calendar, manager performance, conversation logs across WhatsApp + email."
        actions={
          <>
            <button className="btn btn-dark btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>Export leads ↓</button>
            <button className="btn btn-amber btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>+ Campaign</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="MTD leads" value="84" sub="+18 vs Mar" tone="success" />
        <Kpi label="Active campaigns" value="4" sub="2 paid · 2 organic" />
        <Kpi label="Cost / lead" value="$48" sub="−$12 vs Q1" tone="accent" />
        <Kpi label="Conversion · lead → reservation" value="12.4%" sub="+1.8pp" tone="accent" />
        <Kpi label="Content backlog" value="14" sub="6 drafts · 8 ideas" />
      </div>

      <h2
        id="leads"
        className="display"
        style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}
      >
        Lead sources · MTD
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Source</th>
              <th className="num">Leads</th>
              <th className="num">Qualified</th>
              <th className="num">Reservations</th>
              <th className="num">Cost</th>
              <th className="num">CPL</th>
            </tr>
          </thead>
          <tbody>
            {LEAD_SOURCES.map((s) => (
              <tr key={s.source}>
                <td>{s.source}</td>
                <td className="num">{s.leads}</td>
                <td className="num">{s.qualified}</td>
                <td className="num">{s.reservations}</td>
                <td className="num">{s.cost}</td>
                <td className="num">{s.cpl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <h2
        id="campaigns"
        className="display"
        style={{ fontSize: 22, marginBottom: 14, fontWeight: 500, marginTop: 24 }}
      >
        Active campaigns
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Channel</th>
              <th className="num">Spend MTD</th>
              <th className="num">Reach</th>
              <th className="num">Leads</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {CAMPAIGNS.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td style={{ color: "var(--ink-3)" }}>{c.channel}</td>
                <td className="num">{c.spend}</td>
                <td className="num">{c.reach}</td>
                <td className="num">{c.leads}</td>
                <td>
                  <Badge tone={c.status === "warn" ? "warn" : "ok"}>{c.label}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
