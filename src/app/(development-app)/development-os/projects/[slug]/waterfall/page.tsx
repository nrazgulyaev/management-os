import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listWaterfallRules } from "@/lib/development/server/waterfall/waterfall-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Waterfall rules · Development OS" };
export const dynamic = "force-dynamic";

export default async function ProjectWaterfallRulesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Waterfall rules" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;
  const rules = await safeQuery(
    "listWaterfallRules",
    listWaterfallRules({ projectId: project.realProjectId, activeOnly: false }),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Projects", href: "/development-os/projects" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          { label: "Waterfall rules" },
        ]}
        eyebrow={`${rules.filter((r) => r.isActive).length} active / ${rules.length} total`}
        title="Waterfall rules"
        description="Custom distribution waterfall rules. Six built-in rule types incl. Arconique 25% credit. Commitment-scoped rules override project-scoped rules. Math is in lib/development/server/waterfall/waterfall-helpers.ts (pure, runtime tested)."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href={`/development-os/projects/${slug}/waterfall/simulator`}>
                Simulator
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/development-os/projects/${slug}`}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Project
              </Link>
            </Button>
          </div>
        }
      />

      {rules.length === 0 ? (
        <EmptyState
          title="No waterfall rules configured"
          description="Use createWaterfallRule to declare the project's distribution waterfall. The 'arconique_25_credit' rule applies the Arconique-specific credit logic."
        />
      ) : (
        <Section eyebrow="Catalog" title="All rules (active + historical)">
          <Table>
            <THead>
              <TR>
                <TH>Label</TH>
                <TH>Type</TH>
                <TH>Scope</TH>
                <TH>Effective from</TH>
                <TH>Active</TH>
              </TR>
            </THead>
            <TBody>
              {rules.map((r) => (
                <TR key={r.id}>
                  <TD className="text-sm">{r.ruleLabel}</TD>
                  <TD className="text-xs font-mono">{r.ruleType}</TD>
                  <TD className="text-xs">{r.scope}</TD>
                  <TD className="text-xs">{r.effectiveFrom}</TD>
                  <TD>
                    {r.isActive ? (
                      <Badge tone="success">active</Badge>
                    ) : (
                      <Badge tone="neutral">historical</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
