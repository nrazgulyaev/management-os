import Link from "next/link";
import { notFound } from "next/navigation";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
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
  "soft" | "info" | "warn" | "ok" | "danger"
> = {
  excellent: "ok",
  good: "info",
  watch: "warn",
  attention: "danger",
  unknown: "soft",
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-intelligence">Owner intelligence</Link>{" "}
            /{" "}
            <Link href="/dashboard/owner-intelligence/health">
              Health snapshots
            </Link>{" "}
            / <span>{computed.villaName ?? villaId.slice(0, 8)}</span>
          </div>
          <h1>Villa {computed.villaName ?? villaId.slice(0, 8)}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Live computation for {periodStart} → {periodEnd}. Snapshots store
            the same numbers and are what the owner sees.
          </p>
        </div>
        <div className="actions">
          <HandoffBadge tone={STATUS_TONES[computed.outcome.status] ?? "soft"}>
            {computed.outcome.status} · {Math.round(computed.outcome.score)}
            /100
          </HandoffBadge>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Booked nights"
          value={String(computed.inputs.bookedNights)}
          sub={`of ${computed.inputs.availableNights} available`}
        />
        <Kpi
          label="Owner stay nights"
          value={String(computed.inputs.ownerStayNights)}
        />
        <Kpi
          label="Maintenance blocked"
          value={String(computed.inputs.maintenanceBlockedNights)}
        />
        <Kpi
          label="Open tickets"
          value={String(computed.inputs.maintenanceTicketsOpen)}
          tone={computed.inputs.maintenanceTicketsOpen > 0 ? "accent" : undefined}
        />
      </div>
      <div>
        <div className="label mb-2.5">Run</div>
        <Card padding="default">
          <GenerateVillaSnapshotForm
            villaId={villaId}
            periodStart={periodStart}
            periodEnd={periodEnd}
          />
          <p className="text-[11px] text-ink-tertiary mt-2">
            Idempotent — re-running for the same period overwrites the
            existing row.
          </p>
        </Card>
      </div>
      <div>
        <div className="label mb-2.5">
          History · {snapshots.length} snapshots stored
        </div>
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
                  <HandoffBadge tone={STATUS_TONES[s.healthStatus] ?? "soft"}>
                    {s.healthStatus}
                  </HandoffBadge>
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
      </div>
      <div>
        <div className="label mb-2.5">What changed this month</div>
        <Card padding="default">
          <ul className="list-disc list-inside text-sm space-y-1">
            {computed.explanation.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Card>
      </div>
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
