import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
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
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No in-house stays.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Booking</th>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Guest</th>
                  <th className="text-left px-3 py-2">Stay</th>
                  <th className="text-right px-3 py-2">Open SR</th>
                  <th className="text-right px-3 py-2">Open MT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.bookingId}>
                    <td className="px-3 py-2 text-ink font-medium">{r.bookingCode}</td>
                    <td className="px-3 py-2 text-ink-secondary">{r.villaCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{r.guestDisplay}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {r.checkInDate} → {r.checkOutDate}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.openServiceRequests > 0 ? (
                        <Badge tone="warning">{r.openServiceRequests}</Badge>
                      ) : (
                        <span className="text-ink-tertiary tabular-nums">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-tertiary tabular-nums">
                      {r.openMaintenanceTickets}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
