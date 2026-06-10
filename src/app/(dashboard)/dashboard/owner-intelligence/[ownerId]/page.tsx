import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";
import { DbStatusNotice } from "@/components/admin/db-status";
import { RiskPill } from "@/components/owners/risk-pill";
import { TierRing } from "@/components/owners/tier-ring";
import { formatMoneyMinor } from "@/lib/money";
import { getOwnerById, listOwnershipShares } from "@/features/owners/services";
import { deriveTier } from "@/features/owners/derive-tier";
import { getOwnerChurnView } from "@/features/owners/retention-churn-service";
import { listOwnerStatements } from "@/features/finance/services";
import { OwnerChurnPanel } from "../../owners/[id]/_churn-panel";

export const metadata = { title: "Owner intelligence · Drill-in" };
export const dynamic = "force-dynamic";

/**
 * Mock §03 — owner drill-in: single owner investigation.
 * Score breakdown, signals timeline, save plan and the intervention
 * actions all come from the existing churn engine (OwnerChurnPanel);
 * this page adds the owner-intel framing: identity header with tier,
 * tenure, YTD net and the churn score band.
 */

const BAND_TONE: Record<"ok" | "watch" | "flag", string> = {
  ok: "text-success",
  watch: "text-warn",
  flag: "text-danger",
};

const BAND_WORD: Record<"ok" | "watch" | "flag", string> = {
  ok: "LOW",
  watch: "RISING",
  flag: "HIGH",
};

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export default async function OwnerIntelDrillIn({
  params,
}: {
  params: Promise<{ ownerId: string }>;
}) {
  const { allowed } = await requireCabinetAccess("owners");
  if (!allowed) return <CabinetGate cabinet="Owner intelligence" />;

  const { ownerId } = await params;
  const owner = await getOwnerById(ownerId).catch(() => null);
  if (!owner) notFound();

  const shares = await listOwnershipShares();
  const ownShares = shares.filter((s) => s.ownerId === ownerId);
  const villaIds = [
    ...new Set(ownShares.map((s) => s.villaId).filter((v): v is string => Boolean(v))),
  ];

  const earliestStart = ownShares
    .map((s) => s.startsOn)
    .filter(Boolean)
    .sort()[0];
  const tenureYears = earliestStart
    ? Math.max(0, (Date.now() - new Date(earliestStart).getTime()) / MS_PER_YEAR)
    : null;

  const [churn, statements] = await Promise.all([
    getOwnerChurnView(ownerId, villaIds).catch(() => null),
    listOwnerStatements({ ownerId }).catch(() => []),
  ]);

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const ytdNetMinor = statements
    .filter((s) => s.periodStart >= yearStart)
    .reduce((acc, s) => acc + s.netPayoutMinor, 0n);
  const lastStatement = statements[0] ?? null;
  const tier = deriveTier({ villaCount: villaIds.length, projectedArrUsd: 0 });

  const band = churn?.breakdown.band ?? "ok";
  const score = churn?.breakdown.score ?? 0;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/owner-intelligence">Owner intelligence</Link> /{" "}
            <span>{owner.displayName}</span>
          </div>
          <h1>
            {owner.displayName}{" "}
            <em className={`italic ${BAND_TONE[band]}`}>
              · churn {score}/100 {BAND_WORD[band]}
            </em>
          </h1>
          <div className="mono text-[11px] text-ink-3 mt-2.5 flex flex-wrap gap-x-4 gap-y-1 items-center">
            <span className="inline-flex items-center gap-1.5">
              <TierRing tier={tier} verbose />
            </span>
            <span>{owner.nationality ?? "—"}</span>
            <span>
              {villaIds.length} villa{villaIds.length === 1 ? "" : "s"}
            </span>
            <span>{tenureYears !== null ? `${tenureYears.toFixed(1)}y tenure` : "tenure —"}</span>
            <span>
              YTD net{" "}
              <strong className="text-ink">
                {formatMoneyMinor(ytdNetMinor, "USD", { compact: true })}
              </strong>
            </span>
            <span>
              last statement{" "}
              <strong className="text-ink">
                {lastStatement ? lastStatement.periodLabel : "—"}
              </strong>
            </span>
            <RiskPill level={band} />
          </div>
        </div>
        <div className="actions">
          <Link href={`/dashboard/owners/${ownerId}`} className="btn btn-secondary btn-sm">
            Owner CRM →
          </Link>
          <Link href="/dashboard/operations" className="btn btn-secondary btn-sm">
            Open support queue →
          </Link>
        </div>
      </div>

      <DbStatusNotice />

      {churn ? (
        <div className="card p-0 overflow-hidden mt-[18px]">
          <OwnerChurnPanel ownerId={ownerId} view={churn} />
        </div>
      ) : (
        <div className="card p-5 mt-[18px]">
          <p className="text-[13px] text-ink-3">
            Churn view unavailable — the retention engine needs a configured database.
          </p>
        </div>
      )}
    </>
  );
}
