import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SectionHeading } from "@/components/dashboard/primitives";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import { listOwnerVillasForCurrentUser } from "@/features/owner-intelligence/calendar-services";
import {
  computeVillaHealth,
  getOwnerVillaHealth,
  getUpcomingPreventiveMaintenanceForOwner,
} from "@/features/owner-intelligence/health-services";
import { listOwnerVisibleReviews } from "@/features/owner-intelligence/reviews-services";
import {
  classifyVillaHealthStatus,
  type VillaHealthStatus,
} from "@/features/owner-intelligence/health-pure";

export const metadata = { title: "Villa health" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  VillaHealthStatus,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  excellent: "success",
  good: "info",
  watch: "warning",
  attention: "danger",
  unknown: "neutral",
};

export default async function OwnerVillaHealthPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const villas = await listOwnerVillasForCurrentUser();
  const villa = villas.find((v) => v.villaId === id);
  if (!villa) notFound();
  const today = new Date();
  const periodEnd = formatISODate(today);
  const periodStart = formatISODate(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [snapshot, computed, preventive, reviews] = await Promise.all([
    getOwnerVillaHealth(id, periodStart, periodEnd),
    computeVillaHealth(id, periodStart, periodEnd),
    getUpcomingPreventiveMaintenanceForOwner(id, 60),
    listOwnerVisibleReviews({ villaId: id, limit: 5 }),
  ]);
  const status: VillaHealthStatus =
    (snapshot?.healthStatus as VillaHealthStatus) ??
    computed?.outcome.status ??
    "unknown";
  const score =
    (snapshot?.healthScore !== undefined && snapshot?.healthScore !== null
      ? Number(snapshot.healthScore)
      : null) ??
    computed?.outcome.score ??
    null;
  const inputs = computed?.inputs;
  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow={`Portfolio · villas · ${villa.villaName ?? villa.villaCode ?? id} · health`}
        title={`${villa.villaName ?? villa.villaCode ?? "Villa"} — health`}
        subtitle={`Reporting period ${periodStart} → ${periodEnd}.`}
        actions={<Badge tone={STATUS_TONES[status]}>{status}</Badge>}
      />
      <Link
        href={`/owner/villas/${id}/calendar`}
        className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Calendar
      </Link>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Health score"
          value={score !== null ? `${Math.round(score)} / 100` : "—"}
          accent={
            classifyVillaHealthStatus(score) === "attention" ||
            classifyVillaHealthStatus(score) === "watch"
          }
        />
        <MetricCard
          label="Booked nights"
          value={String(inputs?.bookedNights ?? snapshot?.bookedNights ?? 0)}
          hint={
            inputs?.availableNights
              ? `of ${inputs.availableNights} available`
              : undefined
          }
        />
        <MetricCard
          label="Owner stay nights"
          value={String(inputs?.ownerStayNights ?? snapshot?.ownerStayNights ?? 0)}
        />
        <MetricCard
          label="Maintenance / hold"
          value={String(
            inputs?.maintenanceBlockedNights ??
              snapshot?.maintenanceBlockedNights ??
              0,
          )}
          hint="nights blocked"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Open maintenance"
          value={String(
            inputs?.maintenanceTicketsOpen ??
              snapshot?.maintenanceTicketsOpen ??
              0,
          )}
        />
        <MetricCard
          label="Completed maintenance"
          value={String(
            inputs?.maintenanceTicketsCompleted ??
              snapshot?.maintenanceTicketsCompleted ??
              0,
          )}
        />
        <MetricCard
          label="Housekeeping completed"
          value={String(
            inputs?.housekeepingTasksCompleted ??
              snapshot?.housekeepingTasksCompleted ??
              0,
          )}
        />
        <MetricCard
          label="Utility risks"
          value={String(
            inputs?.utilityRiskCount ?? snapshot?.utilityRiskCount ?? 0,
          )}
        />
      </div>
      <section>
        <div className="label">What changed this month</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 4, fontWeight: 500 }}>Period summary</h2>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 14px" }}>
          Deterministic narrative built from the same numbers above. No model output.
        </p>
        <ul className="rounded-md border border-line-soft bg-surface p-5 list-disc list-inside text-sm space-y-1">
          {(computed?.explanation ?? []).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
          {(computed?.explanation.length ?? 0) === 0 && (
            <li className="text-ink-tertiary">
              We&apos;ll fill this in as soon as we have enough activity to
              report.
            </li>
          )}
        </ul>
      </section>
      <section>
        <div className="label">Upcoming</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 4, fontWeight: 500 }}>Preventive maintenance</h2>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 14px" }}>
          Scheduled within the next 60 days.
        </p>
        {preventive.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No preventive items scheduled in this window.
          </p>
        ) : (
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft text-sm">
            {preventive.map((p) => (
              <li
                key={p.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <span>
                  <span className="font-medium">{p.label}</span>
                  <span className="text-[11px] text-ink-tertiary ml-2">
                    {p.cadence}
                  </span>
                </span>
                <span className="font-mono text-xs">{p.nextDueOn}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <div className="label">Recent guest reviews</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          {reviews.length} reviews
        </h2>
        {reviews.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No owner-visible reviews yet.
          </p>
        ) : (
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft text-sm">
            {reviews.map((r) => (
              <li key={r.id} className="px-4 py-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] text-ink-tertiary">
                  <span>
                    {r.reviewerDisplayName ?? "Guest"}
                    {r.reviewerCountry ? ` · ${r.reviewerCountry}` : ""}
                  </span>
                  <span className="font-mono tabular-nums">
                    {r.rating !== null ? `${r.rating.toFixed(1)} / 5` : "—"}
                  </span>
                </div>
                {r.text && (
                  <p className="text-sm text-ink-secondary whitespace-pre-wrap">
                    {r.text}
                  </p>
                )}
                <span className="text-[10px] text-ink-tertiary">
                  via {r.source}
                  {r.reviewDate ? ` · ${r.reviewDate}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
