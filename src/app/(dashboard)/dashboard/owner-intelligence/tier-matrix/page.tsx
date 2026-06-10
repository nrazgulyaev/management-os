import Link from "next/link";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";
import { DbStatusNotice } from "@/components/admin/db-status";
import { formatMoneyMinor } from "@/lib/money";
import {
  buildTierMatrix,
  listOwnerIntel,
  LONG_TERM_YEARS,
  type TierMatrixCell,
} from "@/features/owners/owner-intel-service";
import { IntelViewSwitcher } from "../_views";

export const metadata = { title: "Owner intelligence · Tier matrix" };
export const dynamic = "force-dynamic";

/** Mock variant B — tier (A/B/C) × tenure (long-term ≥3y / new <3y). */

const TIERS = [
  { key: "platinum", letter: "A", label: "Platinum" },
  { key: "gold", letter: "B", label: "Gold" },
  { key: "silver", letter: "C", label: "Silver" },
] as const;

function Cell({ cell }: { cell: TierMatrixCell }) {
  if (cell.owners.length === 0) {
    return (
      <div className="card p-4 text-[13px] text-ink-3" aria-label="No owners in this segment">
        —
      </div>
    );
  }
  return (
    <div className="card p-4">
      <div className="text-[14px] text-ink">
        <strong>
          {cell.owners.length} owner{cell.owners.length === 1 ? "" : "s"}
        </strong>{" "}
        · {formatMoneyMinor(cell.ytdNetMinor, "USD", { compact: true })} YTD ·{" "}
        {cell.sharePct.toFixed(0)}%
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {cell.owners.map((o) => (
          <Link
            key={o.id}
            href={`/dashboard/owner-intelligence/${o.id}`}
            className="mono text-[11px] px-2 py-0.5 rounded-full border border-line-soft text-ink-3 hover:text-terra hover:border-line-strong transition-colors"
          >
            {o.displayName}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function TierMatrixPage() {
  const { allowed } = await requireCabinetAccess("owners");
  if (!allowed) return <CabinetGate cabinet="Owner intelligence" />;

  const rows = await listOwnerIntel();
  const matrix = buildTierMatrix(rows);
  const totalYtd = rows.reduce((acc, o) => acc + o.ytdNetMinor, 0n);

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/owner-intelligence">Owner intelligence</Link> /{" "}
            <span>Tier matrix</span>
          </div>
          <h1>
            Tier matrix <em className="text-terra italic">· A/B/C × tenure</em>
          </h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            {rows.length} owners · {formatMoneyMinor(totalYtd, "USD", { compact: true })}{" "}
            YTD net across the portfolio. Tier from villa count + projected ARR; tenure
            from the earliest ownership share.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/owners" className="btn btn-secondary btn-sm">
            Owners CRM →
          </Link>
        </div>
      </div>

      <div className="mt-3 mb-[18px]">
        <IntelViewSwitcher active="tier-matrix" />
      </div>

      <DbStatusNotice />

      <div className="card p-5">
        <div className="grid grid-cols-[64px_1fr_1fr] gap-2.5 items-start">
          <span aria-hidden />
          <span className="label">Long-term ≥{LONG_TERM_YEARS}y</span>
          <span className="label">New &lt;{LONG_TERM_YEARS}y</span>

          {TIERS.map((t) => (
            <div key={t.key} className="contents">
              <div className="pt-4">
                <span className="display text-[18px] text-ink">{t.letter}</span>
                <span className="label block mt-0.5">{t.label}</span>
              </div>
              <Cell cell={matrix[t.key].longTerm} />
              <Cell cell={matrix[t.key].fresh} />
            </div>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-ink-3 mt-3">
        Cell = owners · YTD net payout · share of portfolio YTD. Click an owner to open
        the churn drill-in.
      </p>
    </>
  );
}
