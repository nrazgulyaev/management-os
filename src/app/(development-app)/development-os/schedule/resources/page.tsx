import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listResourcePools } from "@/lib/development/server/schedule/resource-pool-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Resource pools · Schedule" };
export const dynamic = "force-dynamic";

export default async function ResourcePoolsPage() {
  const rows = await safeQuery("resourcePools", listResourcePools(), []);
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Schedule</span> /{" "}
            <span>Resources</span>
          </div>
          <h1>Resource pools</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Vendor teams, internal teams, individuals, equipment with daily
            capacity.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/schedule/resources/new"
            className="btn btn-accent btn-sm"
          >
            New resource pool
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">{`${rows.length} pool(s)`}</div>
        {rows.length === 0 ? (
          <EmptyState title="No resource pools" description="Create resource pools to enable leveling." />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Capacity / day</th>
                  <th scope="col">Skills</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono text-xs">
                      <Link
                        href={`/development-os/schedule/resources/${r.resourceCode}`}
                        className="hover:underline"
                      >
                        {r.resourceCode}
                      </Link>
                    </td>
                    <td className="row-title">{r.displayName}</td>
                    <td className="text-xs">{r.resourceType}</td>
                    <td className="mono num">
                      {r.totalCapacityPerDay ?? "—"} {r.capacityUnit}
                    </td>
                    <td className="text-xs">{(r.skills ?? []).join(", ")}</td>
                    <td>
                      <HandoffBadge tone={r.isActive ? "ok" : "soft"}>
                        {r.isActive ? "active" : "inactive"}
                      </HandoffBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}
