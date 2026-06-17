import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgressBar } from "@/components/projects/progress-bar";
import { NumKpi } from "@/components/projects/num-kpi";
import { loadCfoCapitalCallDetail } from "@/lib/development/server/investor/cfo-capital-call-reads";
import { RecordReceiptButton } from "./_receipt-control";

/**
 * Phase 2.2 dev-02 — Capital call detail.
 *
 * Header + summary KPIs + allocations table. W1c de-mocks this with
 * `loadCfoCapitalCallDetail` (capital_calls + capital_call_allocations
 * joined to investors, org-scoped) and mounts the
 * RecordCapitalReceivedModal from each unpaid allocation row via the
 * `RecordReceiptButton` island → `recordCapitalReceivedAction`.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await loadCfoCapitalCallDetail(id);
  return { title: c ? `${c.ref} · Capital call` : "Capital call" };
}

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

export default async function CapitalCallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await loadCfoCapitalCallDetail(id);
  if (!c) notFound();

  const pct =
    c.totalUsdMinor > 0 ? (c.receivedUsdMinor / c.totalUsdMinor) * 100 : 0;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/cfo">CFO</Link>
            <span>·</span>
            <Link href="/development-os/cfo/capital-calls">Capital calls</Link>
            <span>·</span>
            <span>{c.ref}</span>
          </div>
          <h1>{c.ref}</h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            {c.projectLabel} · issued {c.issuedAt} · due {c.dueAt}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/cfo/capital-calls"
            className="btn btn-secondary btn-sm"
          >
            ← All capital calls
          </Link>
        </div>
      </div>

      <div className="cfo-detail-kpis">
        <NumKpi label="Total" value={fmt(c.totalUsdMinor)} tone="accent" />
        <NumKpi label="Received" value={fmt(c.receivedUsdMinor)} tone="ok" />
        <NumKpi
          label="Outstanding"
          value={fmt(c.totalUsdMinor - c.receivedUsdMinor)}
          tone="warn"
        />
        <NumKpi
          label="Investors paid"
          value={`${c.investorsPaid} / ${c.investorsTotal}`}
        />
      </div>

      <div className="mt-[18px] mb-7">
        <ProgressBar
          pct={pct}
          caption="Overall receipt"
          label={`${Math.round(pct)}%`}
          tone={pct >= 99 ? "ok" : pct >= 50 ? "accent" : "warn"}
        />
      </div>

      <h2 className="display text-[22px] mb-3">Allocations</h2>
      {c.allocations.length === 0 ? (
        <p className="text-[14px] text-[var(--ink-3)]">
          No investor allocations on this call yet.
        </p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Investor</th>
              <th className="num">Expected</th>
              <th className="num">Received</th>
              <th>Wire ref</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {c.allocations.map((a) => (
              <tr key={a.id}>
                <td>{a.investorName}</td>
                <td className="num mono">{fmt(a.expectedUsdMinor)}</td>
                <td
                  className={
                    "num mono " +
                    (a.settled ? "text-ok" : "text-[var(--ink-3)]")
                  }
                >
                  {fmt(a.receivedUsdMinor)}
                </td>
                <td className="mono text-[11px] text-[var(--ink-3)]">
                  {a.wireRef ?? "—"}
                </td>
                <td>
                  {a.receivedAt ? (
                    <span className="badge badge-ok">
                      Received {a.receivedAt}
                    </span>
                  ) : (
                    <RecordReceiptButton
                      allocation={{
                        id: a.id,
                        investorName: a.investorName,
                        expectedUsdMinor: a.expectedUsdMinor,
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
