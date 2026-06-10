import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { listGuestReviewRequests } from "@/features/guest-journey/services";
import { RunReviewRequestsButton } from "@/components/guest-journey/journey-buttons";

export const metadata = { title: "Review requests" };
export const dynamic = "force-dynamic";

export default async function ReviewRequestsAdminPage() {
  const rows = await listGuestReviewRequests({ limit: 200 });
  const completedCount = rows.filter(({ request }) => request.status === "completed").length;
  const inFlightCount = rows.filter(
    ({ request }) => request.status === "sent" || request.status === "clicked"
  ).length;
  const failedCount = rows.filter(({ request }) => request.status === "failed").length;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-journey">Guest journey</Link> /{" "}
            <span>Review requests</span>
          </div>
          <h1>Post-stay review requests</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Channel is picked deterministically from the booking&apos;s
            distribution channel: Airbnb / Booking.com → OTA review surface;
            direct / manual → /stay/[token]/review.
          </p>
        </div>
        <div className="actions">
          <RunReviewRequestsButton />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-[18px]">
        <Kpi label="Requests · in view" value={String(rows.length)} />
        <Kpi
          label="Sent / clicked"
          value={String(inFlightCount)}
          tone={inFlightCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Completed"
          value={String(completedCount)}
          tone={completedCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Failed"
          value={String(failedCount)}
          tone={failedCount > 0 ? "danger" : undefined}
        />
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Booking</th>
              <th scope="col">Channel</th>
              <th scope="col">Stage</th>
              <th scope="col">Sent</th>
              <th scope="col">Clicked</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={6}>No review requests yet.</TableEmpty>
            ) : (
              rows.map(({ request: r, bookingCode, villaCode }) => (
                <tr key={r.id}>
                  <td className="mono text-[11px] text-ink-3">
                    {bookingCode ?? r.bookingId?.slice(0, 8) ?? "—"}
                    <div className="text-[10px] text-ink-4">
                      {villaCode ?? ""}
                    </div>
                  </td>
                  <td className="text-[12px] text-ink-3">{r.channel}</td>
                  <td className="text-[12px] text-ink-3 capitalize">
                    {r.requestStage.replace("_", " ")}
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {r.sentAt?.toISOString() ?? "—"}
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {r.clickedAt?.toISOString() ?? "—"}
                  </td>
                  <td>
                    <Badge
                      tone={
                        r.status === "completed"
                          ? "success"
                          : r.status === "sent" || r.status === "clicked"
                            ? "info"
                            : r.status === "skipped"
                              ? "warning"
                              : r.status === "failed"
                                ? "danger"
                                : "neutral"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
