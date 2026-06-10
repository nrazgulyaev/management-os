import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgressBar } from "@/components/projects/progress-bar";
import { NumKpi } from "@/components/projects/num-kpi";

/**
 * Phase 2.2 dev-02 — Capital call detail.
 *
 * Header + summary KPIs + allocations table. The
 * RecordCapitalReceivedModal opens from the "Record receipt" action
 * on a row in the data PR; today the rows are static.
 *
 * Pixel-redesign (cabinets/dev-p1/cfo.html lineage): legacy
 * PageHeader/Button/DevelopmentShell + inline styles swapped for the
 * dev `.page-header` brick, `.btn` lineage, and tokenised utilities so
 * the detail matches the redesigned CFO console. Static MOCK_DETAIL +
 * notFound() wiring preserved verbatim.
 */

export const dynamic = "force-dynamic";

const MOCK_DETAIL = {
  "cc-001": {
    id: "cc-001",
    ref: "CC-EV02-2026-Q1",
    projectLabel: "Eternal Phase 02 · Foundation pour",
    totalUsdMinor: 800_000_00,
    receivedUsdMinor: 600_000_00,
    issuedAt: "2026-01-12",
    dueAt: "2026-02-11",
    allocations: [
      { id: "a1", investor: "Whitmore Capital", expected: 200_000_00, received: 200_000_00, ref: "MT103-WC-22" },
      { id: "a2", investor: "Chen Family Trust", expected: 150_000_00, received: 150_000_00, ref: "MT103-CFT-08" },
      { id: "a3", investor: "Park Investments", expected: 150_000_00, received: 150_000_00, ref: "MT103-PI-14" },
      { id: "a4", investor: "Lopez Holdings", expected: 100_000_00, received: 100_000_00, ref: "MT103-LH-03" },
      { id: "a5", investor: "Singh Ventures", expected: 100_000_00, received: 0, ref: null },
      { id: "a6", investor: "O'Brien Family", expected: 100_000_00, received: 0, ref: null },
    ],
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = (MOCK_DETAIL as Record<string, { ref: string }>)[id];
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
  const c = (MOCK_DETAIL as Record<string, (typeof MOCK_DETAIL)["cc-001"]>)[id];
  if (!c) notFound();

  const pct = (c.receivedUsdMinor / c.totalUsdMinor) * 100;
  const paid = c.allocations.filter((a) => a.received > 0).length;

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
        <NumKpi label="Outstanding" value={fmt(c.totalUsdMinor - c.receivedUsdMinor)} tone="warn" />
        <NumKpi
          label="Investors paid"
          value={`${paid} / ${c.allocations.length}`}
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
          {c.allocations.map((a) => {
            const settled = a.received >= a.expected;
            return (
              <tr key={a.id}>
                <td>{a.investor}</td>
                <td className="num mono">{fmt(a.expected)}</td>
                <td
                  className={
                    "num mono " +
                    (settled ? "text-ok" : "text-[var(--ink-3)]")
                  }
                >
                  {fmt(a.received)}
                </td>
                <td className="mono text-[11px] text-[var(--ink-3)]">
                  {a.ref ?? "—"}
                </td>
                <td>
                  {settled ? (
                    <span className="badge badge-ok">Received</span>
                  ) : (
                    <button className="btn btn-ghost btn-sm" disabled>
                      Record receipt
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
