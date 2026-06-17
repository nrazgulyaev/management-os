import type { Metadata } from "next";
import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listOrganizations } from "@/lib/development/server/organizations/organization-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { CreateOrganizationModalForm } from "@/components/development/platform/create-organization-modal-form";

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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Platform</span> / <span>Organizations</span>
          </div>
          <h1>Organizations</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Tenant registry for the Arconique platform. ARCONIQUE_DEFAULT is the
            bootstrap tenant — every existing record is currently scoped to it.
          </p>
        </div>
        <div className="actions">
          <CreateOrganizationModalForm />
        </div>
      </div>

      <div>
        <div className="label mb-2.5">{orgs.length} organization(s)</div>
        {orgs.length === 0 ? (
          <EmptyState
            title="No organizations yet"
            description="Apply migration 0071 to seed ARCONIQUE_DEFAULT."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Tier</th>
                <th scope="col">Modules</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => {
                const modules = Array.isArray(o.enabledModules)
                  ? (o.enabledModules as string[])
                  : [];
                return (
                  <tr key={o.id}>
                    <td className="mono text-xs">
                      <Link
                        href={`/development-os/platform/organizations/${o.organizationCode}`}
                        className="hover:underline"
                      >
                        {o.organizationCode}
                      </Link>
                    </td>
                    <td className="row-title">{o.name}</td>
                    <td className="text-xs">{o.organizationType}</td>
                    <td className="text-xs">{o.subscriptionTier}</td>
                    <td className="text-xs text-ink-3">
                      {modules.length === 0 ? "—" : modules.join(", ")}
                    </td>
                    <td>
                      <HandoffBadge tone={o.isActive ? "ok" : "soft"}>
                        {o.isActive ? "active" : "archived"}
                      </HandoffBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </DevelopmentShell>
  );
}
