import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listOwnerStayRequests } from "@/features/owner-stays/services";

export const metadata = { title: "Owner stay requests" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "soft" | "info" | "warn" | "ok" | "danger"> = {
  requested: "info",
  availability_check: "info",
  requires_relocation: "warn",
  pending_admin_approval: "warn",
  approved: "ok",
  rejected: "danger",
  cancelled: "soft",
  completed: "soft",
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-stays">Owner stays</Link> /{" "}
            <span>Requests</span>
          </div>
          <h1>Requests</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Owner-portal requests. Approve to materialise an owner_stay calendar
            block; reject to surface a reason in the owner inbox.
          </p>
        </div>
      </div>

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

      <div>
        <div className="label mb-2.5">Inbox · {rows.length} requests</div>
        {rows.length === 0 ? (
          <Card padding="default">
            <p className="text-[13px] text-ink-3 italic m-0">No requests.</p>
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Owner</th>
                  <th scope="col">Villa</th>
                  <th scope="col">Dates</th>
                  <th scope="col" className="num">Nights</th>
                  <th scope="col" className="num">Allowance</th>
                  <th scope="col" className="num">Owner charge</th>
                  <th scope="col">Status</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="row-title">{r.ownerName ?? r.ownerId}</td>
                    <td>{r.villaCode ?? "—"}</td>
                    <td className="tabular-nums">
                      {r.requestedStart} → {r.requestedEnd}
                    </td>
                    <td className="num">
                      {r.allowanceNightsApplied + r.billableNights}
                    </td>
                    <td className="num">{r.allowanceNightsApplied}</td>
                    <td className="num">
                      {formatMoney(r.estimatedTotalOwnerChargeMinor, r.currency)}
                    </td>
                    <td>
                      <HandoffBadge tone={STATUS_TONES[r.status] ?? "soft"}>
                        {r.status.replace(/_/g, " ")}
                      </HandoffBadge>
                    </td>
                    <td className="text-right">
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
          </Card>
        )}
      </div>
    </div>
  );
}
