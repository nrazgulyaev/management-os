import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
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
      <PageHeader
        title={r.displayName}
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Schedule" },
          { label: "Resources", href: "/development-os/schedule/resources" },
          { label: r.resourceCode },
        ]}
        description={`${r.resourceType} · ${r.totalCapacityPerDay ?? "—"} ${r.capacityUnit} / day`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/schedule/resources">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title="Skills">
        <div className="flex flex-wrap gap-2">
          {(r.skills ?? []).map((s) => (
            <Badge key={s} tone="neutral">
              {s}
            </Badge>
          ))}
          {(!r.skills || r.skills.length === 0) && (
            <span className="text-sm text-ink-tertiary">No skills tagged.</span>
          )}
        </div>
      </Section>
      <Section title={`Upcoming assignments (60 days)`}>
        {assignments.length === 0 ? (
          <EmptyState title="No upcoming assignments" description="" />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Period</th>
                <th>Capacity / day</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-line-soft">
                  <td className="py-2 text-xs">
                    {a.allocationStart} → {a.allocationEnd}
                  </td>
                  <td className="font-mono tabular-nums">{a.allocatedCapacityPerDay}</td>
                  <td className="text-xs">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
