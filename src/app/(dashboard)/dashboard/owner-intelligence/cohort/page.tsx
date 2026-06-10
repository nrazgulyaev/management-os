import Link from "next/link";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";
import { DbStatusNotice } from "@/components/admin/db-status";
import { EmptyState } from "@/components/ui/empty-state";
import { RiskPill } from "@/components/owners/risk-pill";
import { formatMoneyMinor } from "@/lib/money";
import { buildChurnCohort, listOwnerIntel } from "@/features/owners/owner-intel-service";
import { IntelViewSwitcher } from "../_views";
import { QuickCallButton } from "../_quick-call";

export const metadata = { title: "Owner intelligence · Churn cohort" };
export const dynamic = "force-dynamic";

/** Mock variant C — high-risk cohort with at-risk LTV projection. */

export default async function ChurnCohortPage() {
  const { allowed } = await requireCabinetAccess("owners");
  if (!allowed) return <CabinetGate cabinet="Owner intelligence" />;

  const rows = await listOwnerIntel();
  const { cohort, totalAtRiskLtvMinor, totalRunRateMinor } = buildChurnCohort(rows);
  const flagged = cohort.filter((c) => c.riskLevel === "flag").length;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/owner-intelligence">Owner intelligence</Link> /{" "}
            <span>Churn cohort</span>
          </div>
          <h1>
            Churn cohort{" "}
            <em className="text-terra italic">
              · {cohort.length} at risk · {formatMoneyMinor(totalRunRateMinor, "USD", { compact: true })}/mo
            </em>
          </h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Owners with an active retention signal, with the payout volume at risk if
            they leave. Flagged owners project over 90 days, watch-level over 180.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/owners" className="btn btn-secondary btn-sm">
            Owners CRM →
          </Link>
        </div>
      </div>

      <div className="mt-3 mb-[18px]">
        <IntelViewSwitcher active="cohort" />
      </div>

      <DbStatusNotice />

      {cohort.length === 0 ? (
        <EmptyState
          variant="caught-up"
          title="No owners at risk"
          body="The retention engine has no active churn signals. Re-check after the next statement run."
        />
      ) : (
        <div className="card p-5 max-w-[860px]">
          <h3 className="display-md">
            High-risk <em className="text-terra text-[16px]">· {flagged} flagged</em>
          </h3>
          <div className="label mt-1">run-rate × horizon = at-risk LTV</div>

          <div className="mt-3.5 flex flex-col gap-[7px]">
            {cohort.map((c) => (
              <div
                key={c.id}
                className={`oi-risk-row cohort ${c.riskLevel === "flag" ? "high" : "mid"}`}
              >
                <div className="nm">
                  <Link
                    href={`/dashboard/owner-intelligence/${c.id}`}
                    className="hover:text-terra"
                  >
                    {c.displayName}
                  </Link>
                  <span className="meta">
                    {c.nationality ?? "—"} · {c.villaCount} villa
                    {c.villaCount === 1 ? "" : "s"} ·{" "}
                    {formatMoneyMinor(c.monthlyRunRateMinor, "USD", { compact: true })}/mo ·{" "}
                    {c.riskSignalCount} signal{c.riskSignalCount === 1 ? "" : "s"}
                  </span>
                </div>
                <RiskPill level={c.riskLevel} />
                <span className={`risk ${c.riskLevel === "flag" ? "high" : "mid"}`}>
                  {formatMoneyMinor(c.atRiskLtvMinor, "USD", { compact: true })}
                  <span className="sub">{c.horizonDays}d LTV</span>
                </span>
                <span className="action-slot">
                  {c.riskLevel === "flag" ? <QuickCallButton ownerId={c.id} /> : null}
                </span>
              </div>
            ))}
          </div>

          <div className="mono text-[12px] text-ink-3 mt-4 leading-relaxed">
            Total at-risk LTV ·{" "}
            <strong className="text-ink">
              {formatMoneyMinor(totalAtRiskLtvMinor, "USD", { compact: true })}
            </strong>{" "}
            over the projection horizons
            <br />
            Saving one owner is usually cheaper than onboarding two new ones — open the
            drill-in for the save plan.
          </div>
        </div>
      )}
    </>
  );
}
