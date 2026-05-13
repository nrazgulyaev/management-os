import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
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
          <p className="rounded-3xl border border-dashed border-line-soft bg-muted/20 px-7 py-8 text-sm text-ink-tertiary">
            No requests.
          </p>
        ) : (
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Booking</th>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Requested time</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Fee</th>
                  <th className="text-right px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink font-medium">{r.bookingCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{r.villaCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{r.requestType.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {r.requestedTime ? r.requestedTime.slice(0, 16).replace("T", " ") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {r.feeAmountMinor != null ? `${(r.feeAmountMinor / 100).toFixed(2)} ${r.currency ?? ""}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CheckinCheckoutRequestRowActions id={r.id} status={r.status} />
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
