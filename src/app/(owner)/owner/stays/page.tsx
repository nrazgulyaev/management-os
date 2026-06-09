import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/state";
import { HeroTile } from "@/components/owner-portal/hero-tile";
import { PoolStatusLegend } from "@/components/owner-portal/pool-status-legend";
import { listOwnerStayRequestsForCurrentOwner } from "@/features/owner-stays/services";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { getOwnerStayQuota } from "@/features/owner-portal/owner-portal-queries";
import { getOwnerPoolState } from "@/features/owner-portal/get-pool-state";

/**
 * P1 owner-rental-pool — "My stays" re-skin.
 *
 * Re-skinned off the older dashboard primitives (SectionHeading/Card) onto
 * the owner-portal lineage (HeroTile + display headers + btn accents +
 * PoolStatusLegend). Surfaces the design's "My stays / Free nights" split:
 *   - Free nights: a HeroTile allowance counter (used / per-year + bar)
 *   - Pool status legend (in pool / cooling / out) for the owner's villas
 *   - My stays: the request list with public statuses
 *
 * Auth + scope: getCurrentOwnerContext gates the owner; every read
 * (requests / quota / pool state) is owner-scoped.
 */

export const metadata = { title: "My owner stays" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  requested: "info",
  availability_check: "info",
  requires_relocation: "warning",
  pending_admin_approval: "warning",
  approved: "success",
  confirmed: "success",
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
  confirmed: "Confirmed",
  rejected: "Not approved",
  cancelled: "Cancelled",
  completed: "Completed",
};

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export default async function OwnerStaysPage() {
  const owner = await getCurrentOwnerContext().catch(() => null);
  if (!owner) redirect("/dashboard");

  const [rows, quota, pool] = await Promise.all([
    listOwnerStayRequestsForCurrentOwner().catch(() => []),
    getOwnerStayQuota(owner.ownerId).catch(() => null),
    getOwnerPoolState(owner.ownerId).catch(() => ({ villas: [], coolingOffDays: 14 })),
  ]);

  const usedPct = quota
    ? Math.min(100, Math.round((quota.usedNights / Math.max(quota.freeNightsPerYear, 1)) * 100))
    : 0;
  const barColor =
    usedPct >= 90 ? "var(--terra)" : usedPct >= 60 ? "var(--gold)" : "var(--forest)";

  const poolCounts = pool.villas.reduce(
    (acc, v) => {
      if (v.isCoolingOff) acc.cooling += 1;
      else if (v.status === "out_of_pool") acc.outOfPool += 1;
      else acc.inPool += 1;
      return acc;
    },
    { inPool: 0, cooling: 0, outOfPool: 0 },
  );

  return (
    <div className="flex flex-col gap-10">
      {/* Header — owner-portal display headline + terra link, not SectionHeading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[200px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-tertiary mb-2">
            Portfolio · stays
          </div>
          <h1
            className="display"
            style={{ fontSize: 42, fontWeight: 400, margin: 0, lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--ink)" }}
          >
            My stays
          </h1>
          <p className="text-sm text-ink-secondary mt-3 max-w-[60ch]">
            Owner stays are welcome. Operational costs and rental-pool compensation
            may apply depending on your policy and selected dates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/owner/calendar" className="btn btn-secondary btn-sm">
            Open pool manager
          </Link>
          <Link href="/owner/stays/new" className="btn btn-accent btn-sm">
            + Request a stay
          </Link>
        </div>
      </div>

      {/* Free nights / pool status split */}
      <section className="flex flex-col gap-4">
        <h2 className="display" style={{ fontSize: 22, fontWeight: 400, margin: 0, color: "var(--ink)" }}>
          Free nights
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HeroTile
            variant="dark"
            label={`Allowance · ${quota?.year ?? new Date().getUTCFullYear()}`}
            value={
              <span className="tabular-nums">
                {quota?.usedNights ?? 0}
                <span className="opacity-60"> / {quota?.freeNightsPerYear ?? 14}</span>
              </span>
            }
            sub="Free nights used this year"
            foot={
              quota
                ? `${quota.remainingNights} remaining · ${quota.policyName}`
                : "Default 14 nights/year"
            }
          />
          <div className="hero-tile flat md:col-span-2 flex flex-col gap-3">
            <div className="ht-label">Pool status · your villas</div>
            <PoolStatusLegend counts={poolCounts} className="mt-1" />
            <div className="w-full h-2 rounded-full bg-cream-deep overflow-hidden mt-auto">
              <div
                className="h-full rounded-full"
                style={{ width: `${usedPct}%`, background: barColor }}
              />
            </div>
            <div className="text-[11px] text-ink-tertiary">
              {quota
                ? quota.freeNightsApplyToPeak
                  ? "Free nights apply during peak season."
                  : "Free nights apply outside peak season only."
                : "Confirm allowance specifics with your operator."}
              {quota?.peakSeasonStart && quota?.peakSeasonEnd && (
                <span className="font-mono">
                  {" "}
                  · Peak {quota.peakSeasonStart} → {quota.peakSeasonEnd}
                </span>
              )}
            </div>
            {quota && !quota.hasPolicy && (
              <p className="text-[11px] text-ink-tertiary italic">
                No explicit policy configured for your villas — showing the default
                14 nights/year allowance.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* My stays list */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="display" style={{ fontSize: 22, fontWeight: 400, margin: 0, color: "var(--ink)" }}>
            My stays
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-tertiary">
            {rows.length} request{rows.length === 1 ? "" : "s"}
          </span>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            variant="first-run"
            title="No owner-stay requests yet"
            body="Use 'Request a stay' to book one — or take a villa out of the rental pool from the calendar's pool manager to reserve it for personal use."
            actions={
              <Link href="/owner/stays/new" className="btn btn-accent btn-sm">
                + Request a stay
              </Link>
            }
          />
        ) : (
          <ul className="rounded-lg border border-line-soft bg-surface divide-y divide-line-soft overflow-hidden">
            {rows.map((r) => (
              <li key={r.id} className="p-4 flex items-start justify-between gap-4">
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
                    {formatMoney(r.estimatedTotalOwnerChargeMinor, r.currency)} estimated
                  </div>
                  <div className="text-[11px] text-ink-tertiary mt-1">
                    Last updated{" "}
                    <span className="tabular-nums">
                      {(r.completedAt ?? r.approvedAt ?? r.rejectedAt ?? r.createdAt)
                        .slice(0, 16)
                        .replace("T", " ")}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/owner/stays/${r.id}`}
                  className="text-xs text-terra no-underline hover:opacity-70 shrink-0 mt-1"
                >
                  Detail →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
