import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listOwnerStayRequests } from "@/features/owner-stays/services";

export const metadata = { title: "Owner stay requests" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  requested: "info",
  availability_check: "info",
  requires_relocation: "warning",
  pending_admin_approval: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
  completed: "neutral",
};

const FILTERS: { label: string; status?: string }[] = [
  { label: "All" },
  { label: "Pending approval", status: "pending_admin_approval" },
  { label: "Requires relocation", status: "requires_relocation" },
  { label: "Approved", status: "approved" },
  { label: "Rejected", status: "rejected" },
  { label: "Cancelled", status: "cancelled" },
];

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export default async function OwnerStayRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listOwnerStayRequests({
    status: sp.status || undefined,
    limit: 200,
  });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owner stays", href: "/dashboard/owner-stays" },
          { label: "Requests" },
        ]}
        title="Requests"
        description="Owner-portal requests. Approve to materialise an owner_stay calendar block; reject to surface a reason in the owner inbox."
      />

      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-widest">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.status ? `?status=${f.status}` : "?"}
            className={`px-3 py-1.5 rounded-full border ${
              (f.status ?? "") === (sp.status ?? "")
                ? "bg-ink text-ink-inverse border-ink"
                : "border-line-soft text-ink-secondary hover:border-line-strong"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Section eyebrow="Inbox" title={`${rows.length} requests`}>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No requests.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Owner</th>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Dates</th>
                  <th className="text-right px-3 py-2">Nights</th>
                  <th className="text-right px-3 py-2">Allowance</th>
                  <th className="text-right px-3 py-2">Owner charge</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink font-medium">{r.ownerName ?? r.ownerId}</td>
                    <td className="px-3 py-2 text-ink-secondary">{r.villaCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {r.requestedStart} → {r.requestedEnd}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-tertiary tabular-nums">
                      {r.allowanceNightsApplied + r.billableNights}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-tertiary tabular-nums">
                      {r.allowanceNightsApplied}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-tertiary tabular-nums">
                      {formatMoney(r.estimatedTotalOwnerChargeMinor, r.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/dashboard/owner-stays/requests/${r.id}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Detail →
                      </Link>
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
