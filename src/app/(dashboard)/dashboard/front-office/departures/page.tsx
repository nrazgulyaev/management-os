import Link from "next/link";
import { Card, HandoffBadge, Kpi } from "@/components/dashboard/primitives";
import { listDepartures } from "@/features/front-office/services";
import { CheckOutButton } from "@/components/front-office/check-in-out-buttons";
import { ExpectedCheckoutEditor } from "@/components/front-office/expected-checkout-editor";

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

  // KPI roll-ups — derived from the rows already fetched above.
  const checkedOut = rows.filter((r) => r.bookingStatus === "checked_out").length;
  const lateAsks = rows.filter((r) => r.lateCheckoutRequestStatus != null).length;
  const turnovers = rows.filter((r) => r.nextArrivalBookingId).length;

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Kpi label="Departing" value={String(rows.length)} sub={dateStr} />
        <Kpi
          label="Checked out"
          value={String(checkedOut)}
          sub={rows.length > 0 ? `${rows.length - checkedOut} still in villa` : "none today"}
          tone={checkedOut > 0 ? "success" : undefined}
        />
        <Kpi
          label="Late-checkout asks"
          value={String(lateAsks)}
          sub="requests on today's departures"
          tone={lateAsks > 0 ? "gold" : undefined}
        />
        <Kpi
          label="Same-day turns"
          value={String(turnovers)}
          sub="next arrival lands today"
          tone="accent"
        />
      </div>

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
                  <td className="num">
                    <ExpectedCheckoutEditor
                      bookingId={r.bookingId}
                      expectedCheckoutAt={r.expectedCheckoutAt}
                    />
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
