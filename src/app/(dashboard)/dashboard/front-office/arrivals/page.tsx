import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listArrivals } from "@/features/front-office/services";
import { CheckInButton } from "@/components/front-office/check-in-out-buttons";
import { CheckinApproveButton } from "@/components/front-office/checkin-approve-button";
import { getCheckinStatusMap, getGuestIdMap } from "@/features/checkins/queries";
import { readinessBlocksCheckin } from "@/features/checkins/readiness";
import { GuestIdReview } from "@/components/front-office/guest-id-review";

export const metadata = { title: "Arrivals" };
export const dynamic = "force-dynamic";

type FoTone = "ok" | "warn" | "danger" | "gold" | "info" | "ink" | "soft";

const READINESS_TONES: Record<string, FoTone> = {
  ready: "ok",
  occupied: "info",
  cleaning: "warn",
  inspection: "info",
  dirty: "warn",
  out_of_order: "danger",
  maintenance_block: "danger",
  unknown: "soft",
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
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/front-office">Front office</Link> / <span>Arrivals</span>
          </div>
          <h1>Arrivals — {dateStr}</h1>
        </div>
      </div>

      <p className="mt-3 mb-7 text-[15px] text-ink-3 max-w-[680px]">
        Bookings due to check in. Readiness and any open service requests are
        surfaced inline so the front desk can clear blockers before the guest
        arrives.
      </p>

      <div className="section-heading">
        <div className="eyebrow label">Today</div>
        <h2>{rows.length} arriving</h2>
      </div>

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
                      <HandoffBadge tone={r.bookingStatus === "confirmed" ? "info" : "soft"}>
                        {r.bookingStatus}
                      </HandoffBadge>
                    </td>
                    <td>
                      <HandoffBadge tone={READINESS_TONES[r.readinessStatus] ?? "soft"}>
                        {r.readinessStatus}
                      </HandoffBadge>
                    </td>
                    <td>
                      {r.hasOpenServiceRequest ? (
                        <HandoffBadge tone="warn">open SR</HandoffBadge>
                      ) : (
                        <span className="text-ink-3 text-xs">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-col gap-1.5">
                        {cstatus === "submitted" ? (
                          <HandoffBadge tone="warn">awaiting review</HandoffBadge>
                        ) : cstatus === "code_issued" ? (
                          <HandoffBadge tone="ok">code issued</HandoffBadge>
                        ) : cstatus === "approved" ? (
                          <HandoffBadge tone="ok">approved</HandoffBadge>
                        ) : cstatus === "in_progress" ? (
                          <HandoffBadge tone="info">in progress</HandoffBadge>
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
    </>
  );
}
