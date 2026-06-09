import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { Card } from "@/components/dashboard/primitives";
import { listCheckinCheckoutRequests } from "@/features/front-office/services";
import { CheckinCheckoutRequestRowActions } from "@/components/front-office/request-row-actions";

export const metadata = { title: "Check-in / check-out requests" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  requested: "warning",
  reviewing: "info",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
  completed: "success",
};

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listCheckinCheckoutRequests({
    status: sp.status || undefined,
    limit: 200,
  });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Front office", href: "/dashboard/front-office" },
          { label: "Requests" },
        ]}
        title="Check-in / check-out requests"
        description="Early check-in, late check-out, expected-checkout-time updates, and early-checkout notices. Approve, reject, or mark completed."
      />

      <Section eyebrow="Inbox" title={`${rows.length} requests`}>
        {rows.length === 0 ? (
          <p className="empty m-0 text-sm text-ink-3">No requests.</p>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Villa</th>
                  <th>Type</th>
                  <th>Requested time</th>
                  <th>Status</th>
                  <th className="num">Fee</th>
                  <th className="num">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="row-title">{r.bookingCode ?? "—"}</td>
                    <td className="text-ink-2">{r.villaCode ?? "—"}</td>
                    <td className="text-ink-2">{r.requestType.replace(/_/g, " ")}</td>
                    <td className="num text-ink-3">
                      {r.requestedTime ? r.requestedTime.slice(0, 16).replace("T", " ") : "—"}
                    </td>
                    <td>
                      <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>{r.status}</Badge>
                    </td>
                    <td className="num text-ink-3">
                      {r.feeAmountMinor != null ? `${(r.feeAmountMinor / 100).toFixed(2)} ${r.currency ?? ""}` : "—"}
                    </td>
                    <td className="num">
                      <CheckinCheckoutRequestRowActions id={r.id} status={r.status} />
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
