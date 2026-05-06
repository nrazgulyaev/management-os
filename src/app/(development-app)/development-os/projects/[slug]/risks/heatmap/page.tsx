import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listProjectRisks } from "@/lib/development/server/risks/risk-queries";

export const metadata: Metadata = { title: "Risk heatmap · Development OS" };
export const dynamic = "force-dynamic";

const PROBABILITIES = [
  "very_low",
  "low",
  "medium",
  "high",
  "very_high",
] as const;
const IMPACTS = ["minor", "moderate", "major", "severe", "catastrophic"] as const;

const PROB_SCORE: Record<string, number> = {
  very_low: 1,
  low: 2,
  medium: 3,
  high: 4,
  very_high: 5,
};
const IMPACT_SCORE: Record<string, number> = {
  minor: 1,
  moderate: 2,
  major: 3,
  severe: 4,
  catastrophic: 5,
};

function cellColor(score: number): string {
  if (score >= 16) return "bg-red-200";
  if (score >= 10) return "bg-amber-200";
  if (score >= 5) return "bg-yellow-100";
  return "bg-green-100";
}

export default async function RiskHeatmapPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Risk heatmap" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;
  const risks = await listProjectRisks({ projectId: project.realProjectId });

  // Bucket risks by (probability, impact) cell.
  const buckets: Record<string, typeof risks> = {};
  for (const r of risks) {
    const key = `${r.probability}|${r.impact}`;
    (buckets[key] ??= []).push(r);
  }

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Risks", href: `/development-os/projects/${slug}/risks` },
          { label: "Heatmap" },
        ]}
        eyebrow={`${risks.length} risks plotted`}
        title="Risk heatmap"
        description="Probability × impact matrix. Cells colored by risk score (P × I)."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/risks`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Risks
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Matrix" title="Probability × Impact">
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="p-2 text-right font-medium">P \ I</th>
                {IMPACTS.map((i) => (
                  <th key={i} className="p-2 text-center font-medium">
                    {i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...PROBABILITIES].reverse().map((p) => (
                <tr key={p}>
                  <td className="p-2 text-right font-medium pr-3">{p}</td>
                  {IMPACTS.map((i) => {
                    const score = PROB_SCORE[p] * IMPACT_SCORE[i];
                    const cell = buckets[`${p}|${i}`] ?? [];
                    return (
                      <td
                        key={i}
                        className={`p-2 border border-line-soft ${cellColor(score)} align-top`}
                        style={{ width: 130, height: 80 }}
                      >
                        <div className="text-[10px] uppercase tracking-wide opacity-70">
                          score {score}
                        </div>
                        {cell.length === 0 ? (
                          <div className="text-[11px] text-stone-500">—</div>
                        ) : (
                          <ul className="space-y-0.5">
                            {cell.slice(0, 3).map((r) => (
                              <li key={r.id} className="truncate">
                                <Link
                                  href={`/development-os/projects/${slug}/risks/${r.riskCode}`}
                                  className="font-mono hover:underline"
                                >
                                  {r.riskCode}
                                </Link>
                              </li>
                            ))}
                            {cell.length > 3 && (
                              <li className="text-[10px] text-stone-600">
                                +{cell.length - 3} more
                              </li>
                            )}
                          </ul>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-ink-tertiary mt-3">
          Score color bands: <span className="bg-green-100 px-1">1-4</span>{" "}
          <span className="bg-yellow-100 px-1">5-9</span>{" "}
          <span className="bg-amber-200 px-1">10-15</span>{" "}
          <span className="bg-red-200 px-1">16-25</span>. Risks scoring ≥ 15
          are flagged by the weekly elevation cron.
        </p>
      </Section>
    </DevelopmentShell>
  );
}
