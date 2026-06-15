import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listWaterfallRules } from "@/lib/development/server/waterfall/waterfall-queries";
import { safeQuery } from "@/lib/development/safe-query";
import {
  NewWaterfallRuleButton,
  WaterfallRuleRowControls,
} from "./_controls";

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
        <div className="page-header">
          <div className="left">
            <h1>Waterfall rules</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/projects">Projects</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link> /{" "}
            <span>Waterfall rules</span>
          </div>
          <h1>Waterfall rules</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Custom distribution waterfall rules. Six built-in rule types incl.
            Arconique 25% credit. Commitment-scoped rules override project-scoped
            rules. Math is in
            lib/development/server/waterfall/waterfall-helpers.ts (pure, runtime
            tested).
          </p>
        </div>
        <div className="actions">
          <div className="flex gap-2">
            <NewWaterfallRuleButton slug={slug} projectId={project.realProjectId} />
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
        </div>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          title="No waterfall rules configured"
          description="Use createWaterfallRule to declare the project's distribution waterfall. The 'arconique_25_credit' rule applies the Arconique-specific credit logic."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Catalog</div>
          <Table>
            <THead>
              <TR>
                <TH>Label</TH>
                <TH>Type</TH>
                <TH>Scope</TH>
                <TH>Effective from</TH>
                <TH>Active</TH>
                <TH>Actions</TH>
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
                      <HandoffBadge tone="ok">active</HandoffBadge>
                    ) : (
                      <HandoffBadge tone="soft">historical</HandoffBadge>
                    )}
                  </TD>
                  <TD>
                    <WaterfallRuleRowControls
                      slug={slug}
                      id={r.id}
                      isActive={r.isActive}
                      ruleParameters={r.ruleParameters}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </DevelopmentShell>
  );
}
