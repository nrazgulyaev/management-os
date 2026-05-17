import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { NoItemsYet } from "@/components/ui/primitives";
import { listOwnerStayRequestsForCurrentOwner } from "@/features/owner-stays/services";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { getOwnerStayQuota } from "@/features/owner-portal/owner-portal-queries";

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
  const owner = await getCurrentOwnerContext().catch(() => null);
  const [rows, quota] = await Promise.all([
    listOwnerStayRequestsForCurrentOwner().catch(() => []),
    owner ? getOwnerStayQuota(owner.ownerId).catch(() => null) : Promise.resolve(null),
  ]);
  const usedPct = quota
    ? Math.min(100, Math.round((quota.usedNights / Math.max(quota.freeNightsPerYear, 1)) * 100))
    : 0;

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

      {/* OWNER-PORTAL-1B — quota panel */}
      {quota && (
        <Section eyebrow={`Allowance · ${quota.year}`} title={quota.policyName} variant="panel">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="text-display text-[28px] leading-tight font-medium text-ink tabular-nums">
                  {quota.usedNights} <span className="text-ink-tertiary">/ {quota.freeNightsPerYear}</span>
                </div>
                <div className="text-xs text-ink-tertiary mt-1">
                  free nights used · {quota.remainingNights} remaining
                  {quota.requestsCount > 0 ? ` · ${quota.requestsCount} request${quota.requestsCount === 1 ? "" : "s"}` : ""}
                </div>
              </div>
              <div className="text-right text-[11px] text-ink-tertiary">
                {quota.freeNightsApplyToPeak
                  ? "Free nights apply during peak season."
                  : "Free nights apply outside peak season only."}
                {quota.peakSeasonStart && quota.peakSeasonEnd && (
                  <div className="mt-1 font-mono">
                    Peak: {quota.peakSeasonStart} → {quota.peakSeasonEnd}
                  </div>
                )}
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-cream-deep overflow-hidden">
              <div
                style={{
                  width: `${usedPct}%`,
                  height: "100%",
                  background: usedPct >= 90 ? "var(--terra)" : usedPct >= 60 ? "var(--gold)" : "var(--forest)",
                  borderRadius: 999,
                }}
              />
            </div>
            {!quota.hasPolicy && (
              <p className="text-[11px] text-ink-tertiary italic">
                No explicit policy configured for your villas — showing the default 14
                nights/year allowance. Confirm specifics with your operator.
              </p>
            )}
          </div>
        </Section>
      )}

      <Section eyebrow="Your requests" title={`${rows.length} requests`}>
        {rows.length === 0 ? (
          <NoItemsYet
            entityLabel="owner-stay requests"
            description="No owner-stay requests yet. Use the 'Request a stay' button to submit one — your portfolio's owner-stay quota policy decides whether it counts against your annual allowance."
          />
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
