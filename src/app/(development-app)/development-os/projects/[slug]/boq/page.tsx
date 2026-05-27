import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { BoqWorkspace } from "./_boq-client";
import type { WpNode } from "@/components/boq/wp-tree";
import type { BoqTableLine } from "@/components/boq/boq-table";

/**
 * Phase 2.2 dev-03 — BOQ table for a project.
 *
 * Virtualized via @tanstack/react-virtual. Left rail = WP tree;
 * click a WP to filter. Mock data today (~60 lines across 4 WPs)
 * — the real `boq_revisions` + `boq_lines` reads land in 2.2 data.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getDevelopmentProjectBySlug(slug);
  return { title: detail ? `${detail.project.name} · BOQ` : "BOQ" };
}

function mockData() {
  const wps = [
    { code: "WP-01", label: "Earthworks + foundation" },
    { code: "WP-02", label: "Structure" },
    { code: "WP-03", label: "Envelope + roof" },
    { code: "WP-04", label: "Finishes" },
  ];
  const nodes: WpNode[] = [];
  const lines: BoqTableLine[] = [];
  let lineNo = 0;
  for (const wp of wps) {
    let lineCount = 0;
    for (let sub = 1; sub <= 4; sub++) {
      const subCode = `${wp.code}.${String(sub).padStart(2, "0")}`;
      for (const letter of ["a", "b", "c"]) {
        lineNo++;
        const code = `${subCode}.${letter}`;
        const qty = Math.round(50 + Math.random() * 500);
        const rate = Math.round(10 + Math.random() * 80);
        const qtyActual = Math.random() > 0.4 ? Math.round(qty * (0.85 + Math.random() * 0.35)) : 0;
        const rateActual = qtyActual > 0 ? Math.round(rate * (0.9 + Math.random() * 0.25)) : 0;
        lines.push({
          id: `l-${lineNo}`,
          code,
          description: `Sample line ${code}`,
          wpCode: wp.code,
          unit: "m²",
          qtyPlanned: qty,
          ratePlanned: rate,
          qtyActual,
          rateActual,
        });
        lineCount++;
      }
    }
    nodes.push({ code: wp.code, label: wp.label, lineCount, depth: 0 });
  }
  return { nodes, lines };
}

export default async function ProjectBoqPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail) notFound();

  const { nodes, lines } = mockData();
  const linesWithHref: BoqTableLine[] = lines.map((l) => ({
    ...l,
    href: `/development-os/projects/${slug}/boq/${l.id}`,
  }));

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Projects", href: "/development-os/projects" },
          { label: detail.project.name, href: `/development-os/projects/${slug}` },
          { label: "BOQ" },
        ]}
        eyebrow={`${lines.length} lines · ${nodes.length} work packages`}
        title="Bill of quantities"
        description="Virtualized table. Click a WP on the left to filter; click a row for line detail + actuals history. Real data lands once the import wizard publishes a revision."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to project
            </Link>
          </Button>
        }
      />
      <BoqWorkspace nodes={nodes} lines={linesWithHref} />
    </DevelopmentShell>
  );
}
