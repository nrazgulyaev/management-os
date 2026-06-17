import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { listOrganizations } from "@/lib/development/server/organizations/organization-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { CreateOrganizationModalForm } from "@/components/development/platform/create-organization-modal-form";
import {
  OrganizationsExportButton,
  type OrgExportRow,
} from "@/components/development/platform/organizations-export-button";

export const metadata = { title: "Development OS · Platform" };
export const dynamic = "force-dynamic";

const SUB_ROUTES = [
  { href: "/development-os/platform/organizations", label: "Organizations", desc: "Tenant directory + plan management" },
  { href: "/development-os/platform/usage", label: "Usage", desc: "API calls, storage, seats per tenant" },
  { href: "/development-os/platform/api-docs", label: "API docs", desc: "Developer reference + auth flows" },
  { href: "/development-os/platform/branding", label: "Branding", desc: "Public preview branding, white-label" },
];

const TIER_LABEL: Record<string, string> = {
  internal: "Internal",
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
  custom: "Custom",
};

export default async function DevPlatformPage() {
  const orgs = await safeQuery(
    "platform.listOrganizations",
    listOrganizations(),
    [] as Awaited<ReturnType<typeof listOrganizations>>,
  );

  const exportRows: OrgExportRow[] = orgs.map((o) => ({
    organizationCode: o.organizationCode,
    name: o.name,
    organizationType: o.organizationType,
    subscriptionTier: o.subscriptionTier,
    countryCode: o.countryCode,
    primaryCurrency: o.primaryCurrency,
    isActive: o.isActive,
    enabledModules: Array.isArray(o.enabledModules)
      ? (o.enabledModules as string[])
      : [],
  }));

  // ── KPIs derived from real aggregates ──────────────────────────────
  const activeCount = orgs.filter((o) => o.isActive).length;
  const paidTiers = new Set(["professional", "enterprise", "custom"]);
  const paidCount = orgs.filter(
    (o) => o.isActive && paidTiers.has(o.subscriptionTier),
  ).length;
  const distinctCountries = new Set(
    orgs.filter((o) => o.isActive).map((o) => o.countryCode),
  ).size;
  // Sum the count of enabled modules across active tenants (a real
  // platform-wide footprint metric rather than a hardcoded "1.4M").
  const enabledModulesTotal = orgs
    .filter((o) => o.isActive)
    .reduce(
      (sum, o) =>
        sum + (Array.isArray(o.enabledModules) ? o.enabledModules.length : 0),
      0,
    );

  // Top organizations by tier rank (enterprise/custom first) then name.
  const TIER_RANK: Record<string, number> = {
    custom: 0,
    enterprise: 1,
    professional: 2,
    starter: 3,
    internal: 4,
  };
  const topOrgs = [...orgs]
    .filter((o) => o.isActive)
    .sort(
      (a, b) =>
        (TIER_RANK[a.subscriptionTier] ?? 9) -
          (TIER_RANK[b.subscriptionTier] ?? 9) || a.name.localeCompare(b.name),
    )
    .slice(0, 8);

  return (
    <>
      <SectionHeading
        eyebrow="Platform · multi-tenant superview"
        title="All organizations in one place."
        subtitle="Tenant management, usage metrics, API docs, public preview branding. Super-admin only."
        actions={
          <>
            <OrganizationsExportButton rows={exportRows} />
            <CreateOrganizationModalForm />
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Organizations" value={String(orgs.length)} sub={`${activeCount} active`} />
        <Kpi label="Paid tenants" value={String(paidCount)} sub="professional+" />
        <Kpi label="Countries" value={String(distinctCountries)} sub="active tenants" />
        <Kpi
          label="Enabled modules"
          value={String(enabledModulesTotal)}
          sub="platform footprint"
          tone="accent"
        />
      </div>

      <h2 className="display" style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}>
        Top organizations
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
        {topOrgs.length === 0 ? (
          <div style={{ padding: 20, fontSize: 13, color: "var(--ink-3)" }}>
            No organizations yet. Use “+ Organization” to provision the first
            tenant.
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Org</th>
                <th>Code</th>
                <th>Country</th>
                <th>Tier</th>
                <th className="num">Modules</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {topOrgs.map((o) => {
                const modules = Array.isArray(o.enabledModules)
                  ? (o.enabledModules as string[])
                  : [];
                return (
                  <tr key={o.id}>
                    <td>
                      <Link
                        href={`/development-os/platform/organizations/${o.organizationCode}`}
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        {o.name}
                      </Link>
                    </td>
                    <td className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                      {o.organizationCode}
                    </td>
                    <td style={{ color: "var(--ink-3)" }}>{o.countryCode}</td>
                    <td>{TIER_LABEL[o.subscriptionTier] ?? o.subscriptionTier}</td>
                    <td className="num">{modules.length}</td>
                    <td>
                      <HandoffBadge tone={o.isActive ? "ok" : "soft"}>
                        {o.isActive ? "Active" : "Archived"}
                      </HandoffBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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
