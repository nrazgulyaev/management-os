import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import {
  getResourcePoolByCode,
  listResourceAssignmentsForResource,
} from "@/lib/development/server/schedule/resource-pool-queries";

export const metadata: Metadata = { title: "Resource · Schedule" };
export const dynamic = "force-dynamic";

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const r = await getResourcePoolByCode(code);
  if (!r) notFound();
  const today = new Date();
  const horizon = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  const assignments = await listResourceAssignmentsForResource(r.id, today, horizon);
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Schedule</span> /{" "}
            <Link href="/development-os/schedule/resources">Resources</Link> /{" "}
            <span>{r.resourceCode}</span>
          </div>
          <h1>{r.displayName}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`${r.resourceType} · ${r.totalCapacityPerDay ?? "—"} ${r.capacityUnit} / day`}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/schedule/resources"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Skills</div>
        <Card padding="default">
          <div className="flex flex-wrap gap-2">
            {(r.skills ?? []).map((s) => (
              <HandoffBadge key={s} tone="soft">
                {s}
              </HandoffBadge>
            ))}
            {(!r.skills || r.skills.length === 0) && (
              <span className="text-sm text-ink-tertiary">No skills tagged.</span>
            )}
          </div>
        </Card>
      </div>
      <div>
        <div className="label mb-2.5">{`Upcoming assignments (60 days)`}</div>
        {assignments.length === 0 ? (
          <EmptyState title="No upcoming assignments" description="" />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Capacity / day</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td className="text-xs">
                      {a.allocationStart} → {a.allocationEnd}
                    </td>
                    <td className="mono num">{a.allocatedCapacityPerDay}</td>
                    <td className="text-xs">{a.status}</td>
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
