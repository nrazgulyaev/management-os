import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { NumKpi } from "@/components/projects/num-kpi";
import { DeltaPill } from "@/components/boq/delta-pill";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { getBoqLineDetail } from "@/lib/development/server/boq/boq-queries";

/**
 * BOQ line detail — the line's planned baseline + its full posted-actuals
 * event log (boq_actuals) joined to the source PO, org-scoped. notFound()
 * for an unknown / cross-org / wrong-project line.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; lineId: string }>;
}): Promise<Metadata> {
  const { lineId } = await params;
  return { title: `BOQ ${lineId.slice(0, 8)}` };
}

export default async function BoqLineDetailPage({
  params,
}: {
  params: Promise<{ slug: string; lineId: string }>;
}) {
  const { slug, lineId } = await params;
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();

  const db = getDb();
  if (!db) notFound();

  const data = await getBoqLineDetail(detail.project.realProjectId, lineId);
  if (!data) notFound();

  const { line, document, actuals } = data;

  const actualQty = actuals.reduce((n, a) => n + a.qtyActual, 0);
  const actualSpend = actuals.reduce((n, a) => n + a.qtyActual * a.rateActual, 0);
  const plannedTotal = line.qtyPlanned * line.ratePlanned;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/projects">Projects</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>
              {detail.project.name}
            </Link>{" "}
            / <Link href={`/development-os/projects/${slug}/boq`}>BOQ</Link> /{" "}
            <span className="mono">{line.code}</span>
          </div>
          <h1>{line.code}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {line.description} · {document.boqCode}
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
        <NumKpi label="Planned qty" value={`${line.qtyPlanned.toLocaleString()} ${line.unit}`} />
        <NumKpi label="Planned rate" value={`$${line.ratePlanned.toFixed(2)}`} />
        <NumKpi
          label="Actual qty"
          value={`${actualQty.toLocaleString()} ${line.unit}`}
          tone="accent"
        />
        <NumKpi
          label="Δ vs plan"
          value={<DeltaPill value={actualSpend} baseline={plannedTotal} kind="cost" />}
        />
      </div>

      <h2 className="display text-[22px] mb-3" style={{ fontWeight: 500 }}>
        Actuals history
      </h2>
      {actuals.length === 0 ? (
        <EmptyState
          title="No actuals posted yet"
          description="This line is at its planned baseline — no deliveries or installs have been recorded against it."
        />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">Qty</th>
              <th className="num">Rate</th>
              <th className="num">Line total</th>
              <th>Source PO</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {actuals.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.recordedAt}</td>
                <td className="num mono">{a.qtyActual.toLocaleString()}</td>
                <td className="num mono">${a.rateActual.toFixed(2)}</td>
                <td className="num mono">
                  ${(a.qtyActual * a.rateActual).toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </td>
                <td>
                  {a.poCode ? (
                    <Link
                      href={`/development-os/materials/${a.poCode}`}
                      className="mono text-[12px] underline"
                    >
                      {a.poCode}
                    </Link>
                  ) : (
                    <span className="text-ink-3 text-[12px]">—</span>
                  )}
                </td>
                <td className="text-[12px] text-ink-2">{a.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DevelopmentShell>
  );
}
