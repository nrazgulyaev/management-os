import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listDepartures } from "@/features/front-office/services";
import { CheckOutButton } from "@/components/front-office/check-in-out-buttons";

export const metadata = { title: "Departures" };
export const dynamic = "force-dynamic";

export default async function DeparturesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date ? new Date(sp.date) : new Date();
  const rows = await listDepartures(date);
  const dateStr = date.toISOString().slice(0, 10);

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/front-office">Front office</Link> / <span>Departures</span>
          </div>
          <h1>Departures — {dateStr}</h1>
        </div>
      </div>

      <p className="mt-3 mb-7 text-[15px] text-ink-3 max-w-[680px]">
        Bookings due to check out. Cleaning task status, late-checkout request
        status, and the same-day next arrival (if any) are joined in so the
        front desk can sequence turnovers.
      </p>

      <div className="section-heading">
        <div className="eyebrow label">Today</div>
        <h2>{rows.length} departing</h2>
      </div>

      {rows.length === 0 ? (
        <p className="empty m-0 text-sm text-ink-3">No departures scheduled.</p>
      ) : (
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Villa</th>
                <th>Guest</th>
                <th>Expected checkout</th>
                <th>Cleaning</th>
                <th>Late checkout</th>
                <th>Same-day arrival</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.bookingId}>
                  <td className="row-title">{r.bookingCode}</td>
                  <td className="text-ink-2">{r.villaCode ?? "—"}</td>
                  <td className="text-ink-2">{r.guestDisplay}</td>
                  <td className="num text-ink-3">
                    {r.expectedCheckoutAt ? r.expectedCheckoutAt.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                  <td>
                    {r.cleaningTaskStatus ? (
                      <HandoffBadge tone="info">{r.cleaningTaskStatus}</HandoffBadge>
                    ) : (
                      <span className="text-ink-3 text-xs">—</span>
                    )}
                  </td>
                  <td>
                    {r.lateCheckoutRequestStatus ? (
                      <HandoffBadge tone="warn">{r.lateCheckoutRequestStatus}</HandoffBadge>
                    ) : (
                      <span className="text-ink-3 text-xs">—</span>
                    )}
                  </td>
                  <td className="text-ink-3 text-xs">
                    {r.nextArrivalBookingId ? "yes" : "—"}
                  </td>
                  <td>
                    <CheckOutButton
                      bookingId={r.bookingId}
                      bookingStatus={r.bookingStatus}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
