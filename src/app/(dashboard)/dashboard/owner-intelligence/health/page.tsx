import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { NoItemsYet } from "@/components/ui/primitives";
import { listOwnerVillaHealthSnapshots } from "@/features/owner-intelligence/health-services";
import { GenerateAllSnapshotsButton } from "@/components/owner-intelligence/snapshot-buttons";

export const metadata = { title: "Villa health snapshots" };
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

export default async function HealthListPage() {
  const snapshots = await listOwnerVillaHealthSnapshots();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          {
            label: "Owner intelligence",
            href: "/dashboard/owner-intelligence",
          },
          { label: "Health snapshots" },
        ]}
        title="Villa health snapshots"
        description="Cached health summaries per villa + period. Owners read these through the same projection at /owner/villas/[id]/health. Use the button below to recompute the current month for every villa with prior history."
        actions={<GenerateAllSnapshotsButton />}
      />
      <Section eyebrow="History" title={`${snapshots.length} snapshots`}>
        {snapshots.length === 0 ? (
          <NoItemsYet
            entityLabel="health snapshots"
            description="No villa health snapshots have been generated yet. Use the 'Generate snapshots' button in the page header to seed the current month for every villa with prior history."
          />
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50 text-left">
                <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">Villa</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Booked</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Maint</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                      {s.villaId.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-xs">
                      {s.periodStart} → {s.periodEnd}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-xs">
                      {s.healthScore !== null
                        ? Number(s.healthScore).toFixed(0)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={STATUS_TONES[s.healthStatus] ?? "neutral"}
                      >
                        {s.healthStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {s.bookedNights}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {s.ownerStayNights}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {s.maintenanceBlockedNights}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/owner-intelligence/health/${s.villaId}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
