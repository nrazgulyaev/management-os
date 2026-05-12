import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  listAvailableVillas,
  listVillaCalendarBlocks,
} from "@/features/availability/services";
import { listVillas } from "@/features/villas/services";
import { CalendarBlockAddButton } from "@/components/availability/block-add-button";

export const metadata = { title: "Availability" };
export const dynamic = "force-dynamic";

const TYPE_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  guest_booking: "info",
  owner_stay: "info",
  maintenance_block: "warning",
  deep_cleaning: "warning",
  inspection: "info",
  out_of_order: "danger",
  internal_hold: "neutral",
  channel_hold: "neutral",
};

function next7DaysWindow() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

export default async function AvailabilityPage() {
  const { start, end } = next7DaysWindow();
  const [available, blocks, villas] = await Promise.all([
    listAvailableVillas({ rangeStart: start, rangeEnd: end }),
    listVillaCalendarBlocks({
      rangeStart: start,
      rangeEnd: end,
      status: "active",
      limit: 200,
    }),
    listVillas(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName ?? ""}` }));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Availability" }]}
        title="Availability board"
        description="Master calendar primitive — every reason a villa is unavailable lives here. Confirmed bookings, owner stays, deep cleans, OOO, internal/channel holds. Half-open intervals, so back-to-back stays are not a conflict."
        actions={<CalendarBlockAddButton villas={villaOpts} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Available villas (next 7d)" value={String(available.length)} />
        <MetricCard label="Active blocks (next 7d)" value={String(blocks.length)} />
      </div>

      <Section eyebrow="Next 7 days" title="Active blocks">
        {blocks.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No active blocks in the window.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Title</th>
                  <th className="text-left px-3 py-2">From</th>
                  <th className="text-left px-3 py-2">To</th>
                  <th className="text-left px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {blocks.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2 text-ink font-medium">{b.villaCode ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={TYPE_TONES[b.blockType] ?? "neutral"}>
                        {b.blockType.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{b.title}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {b.startsAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {b.endsAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">
                      {b.sourceType ?? "—"}
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
