import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import {
  listOwnerCalendarRows,
} from "@/features/owner-intelligence/calendar-services";
import {
  classifyOwnerCalendarEvent,
  publicCalendarStatusLabel,
} from "@/features/owner-intelligence/calendar-pure";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "Owner calendar (admin)" };
export const dynamic = "force-dynamic";

const BUCKET_TONES: Record<
  string,
  "soft" | "info" | "warn" | "ok" | "danger"
> = {
  guest_stay: "info",
  owner_stay: "ok",
  maintenance: "warn",
  internal_hold: "soft",
  out_of_order: "danger",
  operations: "soft",
  review: "info",
};

export default async function OwnerCalendarAdminPage() {
  const { allowed } = await requireCabinetAccess("owners");
  if (!allowed) return <CabinetGate cabinet="Owner intelligence" />;
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-intelligence">Owner intelligence</Link>{" "}
            / <span>Calendar</span>
          </div>
          <h1>Owner calendar (admin)</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Same projection the owner sees, with admin links into bookings /
            tasks. We never display raw guest contact info even on this page;
            ops can drill into the source row from here.
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No owner-linked villas found.
        </p>
      ) : (
        rows.map((row) => (
          <div key={row.villa.villaId}>
            <div className="label mb-2.5">
              {row.villa.projectName ?? "Villa"} ·{" "}
              {row.villa.villaName ?? row.villa.villaCode ?? "Villa"} · Owner{" "}
              {row.villa.ownerId.slice(0, 8)}… · {row.events.length} events
            </div>
            {row.events.length === 0 ? (
              <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-xs text-ink-tertiary">
                Nothing scheduled.
              </p>
            ) : (
              <Card padding="none" overflowHidden>
                <table className="data">
                  <thead>
                    <tr>
                      <th scope="col">Dates</th>
                      <th scope="col">Type</th>
                      <th scope="col">Source ID</th>
                      <th scope="col">Guest</th>
                      <th scope="col">Channel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.events.map((e) => (
                      <tr key={e.id}>
                        <td className="mono text-xs">
                          {e.startDate}
                          {e.endDate !== e.startDate
                            ? ` → ${e.endDate}`
                            : ""}
                        </td>
                        <td>
                          <HandoffBadge
                            tone={
                              BUCKET_TONES[
                                classifyOwnerCalendarEvent(e.source)
                              ] ?? "soft"
                            }
                          >
                            {publicCalendarStatusLabel(e)}
                          </HandoffBadge>
                        </td>
                        <td className="mono text-[11px] text-ink-tertiary">
                          {e.id.replace(/^[^:]+:/, "")}
                        </td>
                        <td className="text-xs">
                          {e.guestDisplayName ?? "—"}
                        </td>
                        <td className="text-xs text-ink-tertiary">
                          {e.channelLabel ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function formatISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
