import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { Card } from "@/components/dashboard/primitives";
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
          <p className="empty m-0 text-sm text-ink-3">No arrivals scheduled.</p>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Villa</th>
                  <th>Guest</th>
                  <th className="num">Pax</th>
                  <th>Status</th>
                  <th>Readiness</th>
                  <th>Service</th>
                  <th>Check-in</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cstatus = checkinMap[r.bookingId];
                  const idDoc = guestIdMap[r.bookingId];
                  return (
                    <tr key={r.bookingId}>
                      <td className="row-title">{r.bookingCode}</td>
                      <td className="text-ink-2">
                        {r.villaCode ?? "—"} · <span className="text-ink-3">{r.projectName ?? ""}</span>
                      </td>
                      <td className="text-ink-2">{r.guestDisplay}</td>
                      <td className="num text-ink-3">{r.guestsCount}</td>
                      <td>
                        <Badge tone={r.bookingStatus === "confirmed" ? "info" : "neutral"}>
                          {r.bookingStatus}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={READINESS_TONES[r.readinessStatus] ?? "neutral"}>
                          {r.readinessStatus}
                        </Badge>
                      </td>
                      <td>
                        {r.hasOpenServiceRequest ? (
                          <Badge tone="warning">open SR</Badge>
                        ) : (
                          <span className="text-ink-3 text-xs">—</span>
                        )}
                      </td>
                      <td>
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
                            <span className="text-ink-3 text-xs">—</span>
                          )}
                          {(cstatus === "submitted" || idDoc) && (
                            <GuestIdReview bookingId={r.bookingId} idDoc={idDoc} />
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-1.5 items-start">
                          {cstatus === "submitted" ? (
                            <CheckinApproveButton
                              bookingId={r.bookingId}
                              disabled={readinessBlocksCheckin(r.readinessStatus)}
                              disabledReason={`villa ${r.readinessStatus}`}
                            />
                          ) : (
                            <CheckInButton bookingId={r.bookingId} bookingStatus={r.bookingStatus} />
                          )}
                          <Link
                            href={`/dashboard/front-office/checkin/${r.bookingId}`}
                            className="text-[11px] text-ink-3 hover:text-ink underline"
                          >
                            Guided check-in →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </Section>
    </div>
  );
}
