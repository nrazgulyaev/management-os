import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";

export const metadata = { title: "Development OS · Platform" };
export const dynamic = "force-dynamic";

const ORGS = [
  { name: "Eternal Developments", country: "ID", plan: "Enterprise", users: "14", mrr: "$4,800" },
  { name: "Enso Capital", country: "SG", plan: "Pro", users: "8", mrr: "$2,400" },
  { name: "Ahau Holdings", country: "ID", plan: "Pro", users: "6", mrr: "$2,400" },
];

const SUB_ROUTES = [
  { href: "/development-os/platform/organizations", label: "Organizations", desc: "Tenant directory + plan management" },
  { href: "/development-os/platform/usage", label: "Usage", desc: "API calls, storage, seats per tenant" },
  { href: "/development-os/platform/api-docs", label: "API docs", desc: "Developer reference + auth flows" },
  { href: "/development-os/platform/branding", label: "Branding", desc: "Public preview branding, white-label" },
];

export default function DevPlatformPage() {
  return (
    <>
      <SectionHeading
        eyebrow="Platform · multi-tenant superview"
        title="All organizations in one place."
        subtitle="Tenant management, usage metrics, API docs, public preview branding. Super-admin only."
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
              + Organization
            </button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Organizations" value="14" />
        <Kpi label="Active users · platform" value="284" />
        <Kpi label="API calls · 30d" value="1.4M" />
        <Kpi label="Revenue · MRR" value="$48K" tone="accent" />
      </div>

      <h2 className="display" style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}>
        Top organizations · MRR
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Org</th>
              <th>Country</th>
              <th>Plan</th>
              <th className="num">Users</th>
              <th className="num">MRR</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ORGS.map((o) => (
              <tr key={o.name}>
                <td>{o.name}</td>
                <td style={{ color: "var(--ink-3)" }}>{o.country}</td>
                <td>{o.plan}</td>
                <td className="num">{o.users}</td>
                <td className="num">{o.mrr}</td>
                <td>
                  <HandoffBadge tone="ok">Active</HandoffBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <h2 className="display" style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}>
        Platform controls
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {SUB_ROUTES.map((r) => (
          <Link key={r.href} href={r.href} style={{ textDecoration: "none" }}>
            <Card style={{ padding: 16, cursor: "pointer" }}>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{r.label} →</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{r.desc}</div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
