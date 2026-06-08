import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listResourcePools } from "@/lib/development/server/schedule/resource-pool-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Resource pools · Schedule" };
export const dynamic = "force-dynamic";

export default async function ResourcePoolsPage() {
  const rows = await safeQuery("resourcePools", listResourcePools(), []);
  return (
    <DevelopmentShell>
      <PageHeader
        title="Resource pools"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Schedule" },
          { label: "Resources" },
        ]}
        description="Vendor teams, internal teams, individuals, equipment with daily capacity."
        actions={
          <Button asChild>
            <Link href="/development-os/schedule/resources/new">New resource pool</Link>
          </Button>
        }
      />
      <Section title={`${rows.length} pool(s)`}>
        {rows.length === 0 ? (
          <EmptyState title="No resource pools" description="Create resource pools to enable leveling." />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Capacity / day</th>
                <th>Skills</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-soft hover:bg-muted/30">
                  <td className="py-2 font-mono text-xs">
                    <Link
                      href={`/development-os/schedule/resources/${r.resourceCode}`}
                      className="hover:underline"
                    >
                      {r.resourceCode}
                    </Link>
                  </td>
                  <td>{r.displayName}</td>
                  <td className="text-xs">{r.resourceType}</td>
                  <td className="font-mono tabular-nums">
                    {r.totalCapacityPerDay ?? "—"} {r.capacityUnit}
                  </td>
                  <td className="text-xs">{(r.skills ?? []).join(", ")}</td>
                  <td>
                    <Badge tone={r.isActive ? "success" : "neutral"}>
                      {r.isActive ? "active" : "inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
