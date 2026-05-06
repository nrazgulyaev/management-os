import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listOwnerStayRequestsForCurrentOwner } from "@/features/owner-stays/services";

export const metadata = { title: "My owner stays" };
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

const PUBLIC_STATUS: Record<string, string> = {
  requested: "Submitted",
  availability_check: "Checking availability",
  requires_relocation: "Awaiting admin review",
  pending_admin_approval: "Awaiting admin review",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
  completed: "Completed",
};

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export default async function OwnerStaysPage() {
  const rows = await listOwnerStayRequestsForCurrentOwner();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Owner portal", href: "/owner" }, { label: "Stays" }]}
        title="Your owner stays"
        description="Owner stays are welcome. Operational costs and rental-pool compensation may apply depending on your policy and selected dates."
        actions={
          <Link
            href="/owner/stays/new"
            className="text-sm px-3 py-1.5 rounded-sm border border-line-soft hover:border-line-strong"
          >
            + Request a stay
          </Link>
        }
      />

      <Section eyebrow="Your requests" title={`${rows.length} requests`}>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No requests yet. Use the button above to submit one.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="p-4 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>
                        {PUBLIC_STATUS[r.status] ?? r.status.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-[11px] text-ink-tertiary tabular-nums">
                        {r.requestedStart} → {r.requestedEnd}
                      </span>
                    </div>
                    <div className="text-sm text-ink font-medium mt-2">
                      {r.villaCode ?? "Villa"}
                    </div>
                    <div className="text-xs text-ink-tertiary mt-1">
                      {r.allowanceNightsApplied} allowance · {r.billableNights} billable ·{" "}
                      {formatMoney(r.estimatedTotalOwnerChargeMinor, r.currency)} estimated charge
                    </div>
                    <div className="text-[11px] text-ink-tertiary mt-1">
                      Last updated{" "}
                      <span className="tabular-nums">
                        {(
                          r.completedAt ??
                          r.approvedAt ??
                          r.rejectedAt ??
                          r.createdAt
                        )
                          .slice(0, 16)
                          .replace("T", " ")}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/owner/stays/${r.id}`}
                    className="text-xs text-ink hover:underline underline-offset-4"
                  >
                    Detail →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}
