import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  listOwnerCalendarRows,
} from "@/features/owner-intelligence/calendar-services";
import {
  classifyOwnerCalendarEvent,
  publicCalendarStatusLabel,
} from "@/features/owner-intelligence/calendar-pure";

export const metadata = { title: "Owner calendar (admin)" };
export const dynamic = "force-dynamic";

const BUCKET_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  guest_stay: "info",
  owner_stay: "success",
  maintenance: "warning",
  internal_hold: "neutral",
  out_of_order: "danger",
  operations: "neutral",
  review: "info",
};

export default async function OwnerCalendarAdminPage() {
  const today = new Date();
  const fromIso = formatISODate(today);
  const toIso = formatISODate(
    new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000),
  );
  const rows = await listOwnerCalendarRows({
    from: fromIso,
    to: toIso,
  });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          {
            label: "Owner intelligence",
            href: "/dashboard/owner-intelligence",
          },
          { label: "Calendar" },
        ]}
        title="Owner calendar (admin)"
        description="Same projection the owner sees, with admin links into bookings / tasks. We never display raw guest contact info even on this page; ops can drill into the source row from here."
      />
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No owner-linked villas found.
        </p>
      ) : (
        rows.map((row) => (
          <Section
            key={row.villa.villaId}
            eyebrow={row.villa.projectName ?? "Villa"}
            title={row.villa.villaName ?? row.villa.villaCode ?? "Villa"}
            description={`Owner ${row.villa.ownerId.slice(0, 8)}… · ${row.events.length} events`}
          >
            {row.events.length === 0 ? (
              <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-xs text-ink-tertiary">
                Nothing scheduled.
              </p>
            ) : (
              <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-canvas/50 text-left">
                    <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                      <th className="px-4 py-3">Dates</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Source ID</th>
                      <th className="px-4 py-3">Guest</th>
                      <th className="px-4 py-3">Channel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.events.map((e) => (
                      <tr key={e.id} className="border-t border-line-soft">
                        <td className="px-4 py-3 font-mono tabular-nums text-xs">
                          {e.startDate}
                          {e.endDate !== e.startDate
                            ? ` → ${e.endDate}`
                            : ""}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              BUCKET_TONES[
                                classifyOwnerCalendarEvent(e.source)
                              ] ?? "neutral"
                            }
                          >
                            {publicCalendarStatusLabel(e)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                          {e.id.replace(/^[^:]+:/, "")}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {e.guestDisplayName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-tertiary">
                          {e.channelLabel ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        ))
      )}
    </div>
  );
}

function formatISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
