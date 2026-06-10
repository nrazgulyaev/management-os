import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listInHouseGuests } from "@/features/front-office/services";

export const metadata = { title: "In-house" };
export const dynamic = "force-dynamic";

export default async function InHousePage() {
  const rows = await listInHouseGuests(new Date());

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/front-office">Front office</Link> / <span>In-house</span>
          </div>
          <h1>In-house guests</h1>
        </div>
      </div>

      <p className="mt-3 mb-7 text-[15px] text-ink-3 max-w-[680px]">
        Stays currently in progress. Counts of open service requests and
        maintenance tickets help the front desk spot stays at risk.
      </p>

      <div className="section-heading">
        <div className="eyebrow label">Right now</div>
        <h2>{rows.length} stays</h2>
      </div>

      {rows.length === 0 ? (
        <p className="empty m-0 text-sm text-ink-3">No in-house stays.</p>
      ) : (
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Villa</th>
                <th>Guest</th>
                <th>Stay</th>
                <th className="num">Open SR</th>
                <th className="num">Open MT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.bookingId}>
                  <td className="row-title">{r.bookingCode}</td>
                  <td className="text-ink-2">{r.villaCode ?? "—"}</td>
                  <td className="text-ink-2">{r.guestDisplay}</td>
                  <td className="num text-ink-3">
                    {r.checkInDate} → {r.checkOutDate}
                  </td>
                  <td className="num">
                    {r.openServiceRequests > 0 ? (
                      <HandoffBadge tone="warn">{r.openServiceRequests}</HandoffBadge>
                    ) : (
                      <span className="text-ink-3">0</span>
                    )}
                  </td>
                  <td className="num text-ink-3">
                    {r.openMaintenanceTickets}
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
