import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { Card } from "@/components/dashboard/primitives";
import { listInHouseGuests } from "@/features/front-office/services";

export const metadata = { title: "In-house" };
export const dynamic = "force-dynamic";

export default async function InHousePage() {
  const rows = await listInHouseGuests(new Date());

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Front office", href: "/dashboard/front-office" },
          { label: "In-house" },
        ]}
        title="In-house guests"
        description="Stays currently in progress. Counts of open service requests and maintenance tickets help the front desk spot stays at risk."
      />

      <Section eyebrow="Right now" title={`${rows.length} stays`}>
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
                        <Badge tone="warning">{r.openServiceRequests}</Badge>
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
      </Section>
    </div>
  );
}
