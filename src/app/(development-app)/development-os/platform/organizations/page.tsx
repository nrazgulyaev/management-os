import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listOrganizations } from "@/lib/development/server/organizations/organization-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Organizations · Platform" };
export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const orgs = await safeQuery(
    "platform-organizations.listOrganizations",
    listOrganizations(),
    [] as Awaited<ReturnType<typeof listOrganizations>>,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        title="Organizations"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Platform" },
          { label: "Organizations" },
        ]}
        description="Tenant registry for the Arconique platform. ARCONIQUE_DEFAULT is the bootstrap tenant — every existing record is currently scoped to it."
      />

      <Section title={`${orgs.length} organization(s)`}>
        {orgs.length === 0 ? (
          <EmptyState
            title="No organizations yet"
            description="Apply migration 0071 to seed ARCONIQUE_DEFAULT."
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Tier</th>
                <th>Modules</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => {
                const modules = Array.isArray(o.enabledModules)
                  ? (o.enabledModules as string[])
                  : [];
                return (
                  <tr key={o.id} className="border-b border-line-soft">
                    <td className="py-2 font-mono text-xs">
                      <Link
                        href={`/development-os/platform/organizations/${o.organizationCode}`}
                        className="hover:underline"
                      >
                        {o.organizationCode}
                      </Link>
                    </td>
                    <td>{o.name}</td>
                    <td className="text-xs">{o.organizationType}</td>
                    <td className="text-xs">{o.subscriptionTier}</td>
                    <td className="text-xs text-ink-tertiary">
                      {modules.length === 0 ? "—" : modules.join(", ")}
                    </td>
                    <td>
                      <Badge tone={o.isActive ? "success" : "neutral"}>
                        {o.isActive ? "active" : "archived"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
