import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listArrivals } from "@/features/front-office/services";
import { CheckInButton } from "@/components/front-office/check-in-out-buttons";
import { CheckinApproveButton } from "@/components/front-office/checkin-approve-button";
import { getCheckinStatusMap, getGuestIdMap } from "@/features/checkins/queries";
import { readinessBlocksCheckin } from "@/features/checkins/readiness";
import { GuestIdReview } from "@/components/front-office/guest-id-review";

export const metadata = { title: "Arrivals" };
export const dynamic = "force-dynamic";

const READINESS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  ready: "success",
  occupied: "info",
  cleaning: "warning",
  inspection: "info",
  dirty: "warning",
  out_of_order: "danger",
  maintenance_block: "danger",
  unknown: "neutral",
};

export default async function ArrivalsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date ? new Date(sp.date) : new Date();
  const rows = await listArrivals(date);
  const checkinMap = await getCheckinStatusMap(rows.map((r) => r.bookingId));
  const guestIdMap = await getGuestIdMap(rows.map((r) => r.bookingId));
  const dateStr = date.toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Front office", href: "/dashboard/front-office" },
          { label: "Arrivals" },
        ]}
        title={`Arrivals — ${dateStr}`}
        description="Bookings due to check in. Readiness and any open service requests are surfaced inline so the front desk can clear blockers before the guest arrives."
      />

      <Section eyebrow="Today" title={`${rows.length} arriving`}>
        {rows.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
            No arrivals scheduled.
          </p>
        ) : (
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Booking</th>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Guest</th>
                  <th className="text-right px-3 py-2">Pax</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Readiness</th>
                  <th className="text-left px-3 py-2">Service</th>
                  <th className="text-left px-3 py-2">Check-in</th>
                  <th className="text-left px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => {
                  const cstatus = checkinMap[r.bookingId];
                  const idDoc = guestIdMap[r.bookingId];
                  return (
                    <tr key={r.bookingId}>
                      <td className="px-3 py-2 text-ink font-medium">{r.bookingCode}</td>
                      <td className="px-3 py-2 text-ink-secondary">
                        {r.villaCode ?? "—"} · <span className="text-ink-tertiary">{r.projectName ?? ""}</span>
                      </td>
                      <td className="px-3 py-2 text-ink-secondary">{r.guestDisplay}</td>
                      <td className="px-3 py-2 text-right text-ink-tertiary tabular-nums">{r.guestsCount}</td>
                      <td className="px-3 py-2">
                        <Badge tone={r.bookingStatus === "confirmed" ? "info" : "neutral"}>
                          {r.bookingStatus}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={READINESS_TONES[r.readinessStatus] ?? "neutral"}>
                          {r.readinessStatus}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {r.hasOpenServiceRequest ? (
                          <Badge tone="warning">open SR</Badge>
                        ) : (
                          <span className="text-ink-tertiary text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1.5">
                          {cstatus === "submitted" ? (
                            <Badge tone="warning">awaiting review</Badge>
                          ) : cstatus === "code_issued" ? (
                            <Badge tone="success">code issued</Badge>
                          ) : cstatus === "approved" ? (
                            <Badge tone="success">approved</Badge>
                          ) : cstatus === "in_progress" ? (
                            <Badge tone="info">in progress</Badge>
                          ) : (
                            <span className="text-ink-tertiary text-xs">—</span>
                          )}
                          {(cstatus === "submitted" || idDoc) && (
                            <GuestIdReview bookingId={r.bookingId} idDoc={idDoc} />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {cstatus === "submitted" ? (
                          <CheckinApproveButton
                            bookingId={r.bookingId}
                            disabled={readinessBlocksCheckin(r.readinessStatus)}
                            disabledReason={`villa ${r.readinessStatus}`}
                          />
                        ) : (
                          <CheckInButton bookingId={r.bookingId} bookingStatus={r.bookingStatus} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
