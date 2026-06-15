import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { NumKpi } from "@/components/projects/num-kpi";
import { DeltaPill } from "@/components/boq/delta-pill";

/**
 * Phase 2.2 dev-03 — BOQ line detail.
 *
 * Shows the line's planned baseline, the rolled-up actuals, the
 * actuals history table, and the related POs that contributed to
 * the actuals total. Mock data today; real reads land in 2.2 data.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; lineId: string }>;
}): Promise<Metadata> {
  const { lineId } = await params;
  return { title: `BOQ ${lineId}` };
}

const MOCK_ACTUALS = [
  { date: "2026-01-12", qty: 120, rate: 38.2, po: "PO-EV02-0118", source: "Marble Karawang" },
  { date: "2026-01-28", qty: 80, rate: 39.4, po: "PO-EV02-0123", source: "Marble Karawang" },
  { date: "2026-02-04", qty: 60, rate: 52.1, po: "PO-EV02-0131", source: "Marble Hindari (premium)" },
];

export default async function BoqLineDetailPage({
  params,
}: {
  params: Promise<{ slug: string; lineId: string }>;
}) {
  const { slug, lineId } = await params;

  const planned = { qty: 220, rate: 38.2 };
  const actualQty = MOCK_ACTUALS.reduce((n, a) => n + a.qty, 0);
  const actualSpend = MOCK_ACTUALS.reduce((n, a) => n + a.qty * a.rate, 0);
  const plannedTotal = planned.qty * planned.rate;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/projects">Projects</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{slug}</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/boq`}>BOQ</Link> /{" "}
            <span>{lineId}</span>
          </div>
          <h1>Line {lineId}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Planned baseline + rolled-up actuals + the POs that contributed.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/boq`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to BOQ
            </Link>
          </Button>
        </div>
      </div>

      <div className="cfo-detail-kpis" style={{ marginBottom: 18 }}>
        <NumKpi label="Planned qty" value={`${planned.qty} m²`} />
        <NumKpi label="Planned rate" value={`$${planned.rate.toFixed(2)}`} />
        <NumKpi label="Actual qty" value={`${actualQty} m²`} tone="accent" />
        <NumKpi
          label="Δ vs plan"
          value={<DeltaPill value={actualSpend} baseline={plannedTotal} kind="cost" />}
        />
      </div>

      <h2 className="display text-[22px] mb-3" style={{ fontWeight: 500 }}>
        Actuals history
      </h2>
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th className="num">Line total</th>
            <th>Source PO</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_ACTUALS.map((a) => (
            <tr key={a.po}>
              <td className="mono">{a.date}</td>
              <td className="num mono">{a.qty}</td>
              <td className="num mono">${a.rate.toFixed(2)}</td>
              <td className="num mono">${(a.qty * a.rate).toLocaleString()}</td>
              <td>
                <Link href={`/development-os/materials/${a.po}`} className="mono text-[12px] underline">
                  {a.po}
                </Link>
                <span className="block text-[11px] text-ink-3">{a.source}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DevelopmentShell>
  );
}
