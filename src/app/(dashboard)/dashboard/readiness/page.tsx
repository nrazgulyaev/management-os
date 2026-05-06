import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listCurrentReadiness } from "@/features/readiness/services";
import { listVillas } from "@/features/villas/services";
import { listArrivals } from "@/features/front-office/services";
import { ReadinessSetForm } from "@/components/readiness/readiness-set-form";

export const metadata = { title: "Readiness" };
export const dynamic = "force-dynamic";

const TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  ready: "success",
  occupied: "info",
  cleaning: "warning",
  inspection: "info",
  dirty: "warning",
  out_of_order: "danger",
  maintenance_block: "danger",
  unknown: "neutral",
};

export default async function ReadinessPage() {
  const [current, villaList, arrivals] = await Promise.all([
    listCurrentReadiness(),
    listVillas(),
    listArrivals(new Date()),
  ]);
  const knownVillas = new Set(current.map((c) => c.villaId));
  const villasWithoutState = villaList.filter((v) => !knownVillas.has(v.id));

  // V9D — surface arrivals whose villa is not in a "ready" / "occupied" /
  // "cleaning" / "inspection" state.
  const READY_STATUSES = new Set([
    "ready",
    "occupied",
    "cleaning",
    "inspection",
  ]);
  const arrivalsNotReady = arrivals.filter(
    (a) => !READY_STATUSES.has(a.readinessStatus),
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Readiness" }]}
        title="Villa readiness"
        description="Append-only timeline. The current row per villa is shown here. Setting a new state closes the previous one — see history on the villa detail page."
      />

      {arrivalsNotReady.length > 0 && (
        <Section
          eyebrow="Heads up"
          title={`${arrivalsNotReady.length} arrival${arrivalsNotReady.length === 1 ? "" : "s"} today, villa not ready`}
          description="Confirm cleaning + inspection before guest arrival. The risk scanner queues a notification per arrival."
        >
          <div className="rounded-md border border-warning/40 bg-warning-weak/30 p-4">
            <ul className="text-sm divide-y divide-line-soft">
              {arrivalsNotReady.map((a) => (
                <li key={a.bookingId} className="py-2 flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] text-ink-tertiary">
                    {a.bookingCode}
                  </span>
                  <span className="text-ink">{a.villaCode ?? "—"}</span>
                  <Badge tone="warning">{a.readinessStatus}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      <Section eyebrow="Current state" title={`${current.length} villas tracked`}>
        {current.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No readiness rows yet. Use the form below to set the first state.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Project</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Since</th>
                  <th className="text-left px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {current.map((c) => (
                  <tr key={c.villaId}>
                    <td className="px-3 py-2 text-ink font-medium">{c.villaCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{c.projectName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={TONES[c.readinessStatus] ?? "neutral"}>
                        {c.readinessStatus}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {c.effectiveFrom.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">
                      {c.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        eyebrow="Update"
        title="Set readiness"
        description={
          villasWithoutState.length > 0
            ? `${villasWithoutState.length} villa(s) have no readiness state yet — start with one of those.`
            : "Update an existing villa's readiness state."
        }
      >
        <ReadinessSetForm
          villas={villaList.map((v) => ({
            id: v.id,
            label: `${v.unitCode} · ${v.projectName}`,
          }))}
        />
      </Section>
    </div>
  );
}
