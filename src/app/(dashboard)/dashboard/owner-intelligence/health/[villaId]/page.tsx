import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import {
  computeVillaHealth,
  listOwnerVillaHealthSnapshots,
} from "@/features/owner-intelligence/health-services";
import { requireOrgId } from "@/features/auth/require-org";
import { GenerateVillaSnapshotForm } from "@/components/owner-intelligence/snapshot-buttons";

export const metadata = { title: "Villa health detail" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  excellent: "success",
  good: "info",
  watch: "warning",
  attention: "danger",
  unknown: "neutral",
};

export default async function HealthDetailPage({
  params,
}: {
  params: Promise<{ villaId: string }>;
}) {
  const { villaId } = await params;
  const snapshots = await listOwnerVillaHealthSnapshots({
    villaId,
    organizationId: await requireOrgId(),
  });
  const today = new Date();
  const periodEnd = formatISODate(today);
  const periodStart = formatISODate(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const computed = await computeVillaHealth(villaId, periodStart, periodEnd);
  if (!computed) notFound();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          {
            label: "Owner intelligence",
            href: "/dashboard/owner-intelligence",
          },
          {
            label: "Health snapshots",
            href: "/dashboard/owner-intelligence/health",
          },
          {
            label: computed.villaName ?? villaId.slice(0, 8),
          },
        ]}
        title={`Villa ${computed.villaName ?? villaId.slice(0, 8)}`}
        description={`Live computation for ${periodStart} → ${periodEnd}. Snapshots store the same numbers and are what the owner sees.`}
        actions={
          <Badge tone={STATUS_TONES[computed.outcome.status] ?? "neutral"}>
            {computed.outcome.status} · {Math.round(computed.outcome.score)}
            /100
          </Badge>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Booked nights"
          value={String(computed.inputs.bookedNights)}
          hint={`of ${computed.inputs.availableNights} available`}
        />
        <MetricCard
          label="Owner stay nights"
          value={String(computed.inputs.ownerStayNights)}
        />
        <MetricCard
          label="Maintenance blocked"
          value={String(computed.inputs.maintenanceBlockedNights)}
        />
        <MetricCard
          label="Open tickets"
          value={String(computed.inputs.maintenanceTicketsOpen)}
          accent={computed.inputs.maintenanceTicketsOpen > 0}
        />
      </div>
      <Section eyebrow="Run" title="Recompute snapshot">
        <div className="rounded-md border border-line-soft bg-surface p-5">
          <GenerateVillaSnapshotForm
            villaId={villaId}
            periodStart={periodStart}
            periodEnd={periodEnd}
          />
          <p className="text-[11px] text-ink-tertiary mt-2">
            Idempotent — re-running for the same period overwrites the
            existing row.
          </p>
        </div>
      </Section>
      <Section eyebrow="History" title={`${snapshots.length} snapshots stored`}>
        {snapshots.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No snapshots yet. Use the recompute button above.
          </p>
        ) : (
          <ol className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft text-sm">
            {snapshots.map((s) => (
              <li
                key={s.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <span className="font-mono tabular-nums text-xs">
                  {s.periodStart} → {s.periodEnd}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={STATUS_TONES[s.healthStatus] ?? "neutral"}>
                    {s.healthStatus}
                  </Badge>
                  <span className="font-mono tabular-nums">
                    {s.healthScore !== null
                      ? Number(s.healthScore).toFixed(0)
                      : "—"}
                    /100
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
      <Section eyebrow="What changed this month" title="Deterministic explanation">
        <ul className="rounded-md border border-line-soft bg-surface p-5 list-disc list-inside text-sm space-y-1">
          {computed.explanation.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </Section>
      <Link
        href="/dashboard/owner-intelligence/health"
        className="text-xs text-ink hover:underline underline-offset-4"
      >
        ← All snapshots
      </Link>
    </div>
  );
}

function formatISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
