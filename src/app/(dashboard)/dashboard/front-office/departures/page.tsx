import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listDepartures } from "@/features/front-office/services";

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
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Front office", href: "/dashboard/front-office" },
          { label: "Departures" },
        ]}
        title={`Departures — ${dateStr}`}
        description="Bookings due to check out. Cleaning task status, late-checkout request status, and the same-day next arrival (if any) are joined in so the front desk can sequence turnovers."
      />

      <Section eyebrow="Today" title={`${rows.length} departing`}>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No departures scheduled.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Booking</th>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Guest</th>
                  <th className="text-left px-3 py-2">Expected checkout</th>
                  <th className="text-left px-3 py-2">Cleaning</th>
                  <th className="text-left px-3 py-2">Late checkout</th>
                  <th className="text-left px-3 py-2">Same-day arrival</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.bookingId}>
                    <td className="px-3 py-2 text-ink font-medium">{r.bookingCode}</td>
                    <td className="px-3 py-2 text-ink-secondary">{r.villaCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{r.guestDisplay}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {r.expectedCheckoutAt ? r.expectedCheckoutAt.slice(0, 16).replace("T", " ") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.cleaningTaskStatus ? (
                        <Badge tone="info">{r.cleaningTaskStatus}</Badge>
                      ) : (
                        <span className="text-ink-tertiary text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.lateCheckoutRequestStatus ? (
                        <Badge tone="warning">{r.lateCheckoutRequestStatus}</Badge>
                      ) : (
                        <span className="text-ink-tertiary text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">
                      {r.nextArrivalBookingId ? "yes" : "—"}
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
