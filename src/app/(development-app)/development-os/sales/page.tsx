import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { LeadPipelineBoard } from "@/components/development/sales/lead-pipeline-board";
import { LeadPipelineMetricsStrip } from "@/components/development/sales/lead-pipeline-metrics";
import { LeadModalForm } from "@/components/development/sales/lead-modal-form";
import { ExportButton } from "@/components/development/bulk-import/export-button";
import {
  getActiveLeadSources,
  getLeadPipelineMetrics,
  getLeadsPipeline,
} from "@/lib/development/server/leads";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import { agents, contactInteractions, contacts } from "@/lib/db/schema/contacts";
import {
  logSafeQueryTimings,
  safeQuery,
  type SafeQueryTiming,
} from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Sales · Development OS" };
export const dynamic = "force-dynamic";

const SECONDARY_TIMEOUT_MS = 4000;
const PRIMARY_TIMEOUT_MS = 6000;

const EMPTY_METRICS: Awaited<ReturnType<typeof getLeadPipelineMetrics>> = {
  total: 0,
  newThisWeek: 0,
  qualified: 0,
  inNegotiation: 0,
  convertedMtd: 0,
  lostMtd: 0,
};

async function getPendingDraftCountsByRole(): Promise<Record<string, number>> {
  const db = getDb();
  if (!db) return {};
  const rows = await db
    .select({
      relatedRoleId: contactInteractions.relatedRoleId,
      count: sql<number>`count(*)::int`,
    })
    .from(contactInteractions)
    .where(
      and(
        eq(contactInteractions.reviewStatus, "pending"),
        isNotNull(contactInteractions.relatedRoleId),
      ),
    )
    .groupBy(contactInteractions.relatedRoleId);
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.relatedRoleId) out[r.relatedRoleId] = Number(r.count);
  }
  return out;
}

export default async function SalesPage() {
  const db = getDb();
  const timings: SafeQueryTiming[] = [];
  const onTiming = (t: SafeQueryTiming) => timings.push(t);

  let leads: Awaited<ReturnType<typeof getLeadsPipeline>> = [];
  let metrics = EMPTY_METRICS;
  let projectOptions: { id: string; name: string }[] = [];
  let sourceOptions: {
    code: string;
    category: string;
    id: string;
    campaignName?: string | null;
  }[] = [];
  let agentOptions: { id: string; name: string }[] = [];
  let pendingDrafts: Record<string, number> = {};
  let primaryError: string | null = null;

  if (db) {
    [leads, metrics, projectOptions, sourceOptions, agentOptions, pendingDrafts] =
      await Promise.all([
        // Primary: pipeline data. Falls back to [] with a visible warning if it
        // fails — page still renders rather than throwing 500.
        safeQuery(
          "getLeadsPipeline",
          getLeadsPipeline(),
          [] as Awaited<ReturnType<typeof getLeadsPipeline>>,
          PRIMARY_TIMEOUT_MS,
          (t) => {
            onTiming(t);
            if (t.usedFallback) primaryError = "leads pipeline";
          },
        ),
        safeQuery(
          "getLeadPipelineMetrics",
          getLeadPipelineMetrics(),
          EMPTY_METRICS,
          SECONDARY_TIMEOUT_MS,
          onTiming,
        ),
        safeQuery(
          "projects select",
          db
            .select({ id: projects.id, name: projects.name })
            .from(projects)
            .orderBy(projects.name),
          [] as { id: string; name: string }[],
          SECONDARY_TIMEOUT_MS,
          onTiming,
        ),
        safeQuery(
          "getActiveLeadSources",
          getActiveLeadSources().then((rows) =>
            rows.map((s) => ({
              id: s.id,
              code: s.sourceCode,
              category: s.sourceCategory,
              campaignName: s.campaignName,
            })),
          ),
          [] as {
            code: string;
            category: string;
            id: string;
            campaignName?: string | null;
          }[],
          SECONDARY_TIMEOUT_MS,
          onTiming,
        ),
        safeQuery(
          "agents+contacts list",
          db
            .select({
              id: agents.id,
              agencyName: agents.agencyName,
              contactName: contacts.fullName,
            })
            .from(agents)
            .innerJoin(contacts, eq(contacts.id, agents.contactId))
            .orderBy(contacts.fullName)
            .then((rows) =>
              rows.map((a) => ({
                id: a.id,
                name: a.agencyName ?? a.contactName,
              })),
            ),
          [] as { id: string; name: string }[],
          SECONDARY_TIMEOUT_MS,
          onTiming,
        ),
        safeQuery(
          "getPendingDraftCountsByRole",
          getPendingDraftCountsByRole(),
          {} as Record<string, number>,
          SECONDARY_TIMEOUT_MS,
          onTiming,
        ),
      ]);
  }

  logSafeQueryTimings("sales", timings);
  const degradedQueries = timings
    .filter((t) => t.usedFallback)
    .map((t) => t.label);
  const totalPending = Object.values(pendingDrafts).reduce((a, b) => a + b, 0);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Sales & buyers" },
        ]}
        eyebrow={
          db
            ? `${metrics.total} active · ${totalPending} AI drafts pending review`
            : "Database not configured"
        }
        title="Sales pipeline"
        description="Live pipeline backed by the contacts foundation. Drag-and-drop is intentionally disabled — status changes flow through the lead detail to keep the audit trail clean."
        actions={
          <div className="flex items-center gap-2">
            <LeadModalForm
              projects={projectOptions}
              leadSources={sourceOptions.map((s) => ({
                id: s.id,
                displayName: s.campaignName ?? s.code,
              }))}
            />
            <ExportButton entity="leads" />
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {!db && (
        <EmptyState
          title="Sales pipeline runs against the database"
          description="Database connection not configured. Contact support."
          action={<Badge tone="warning">DATABASE_URL not set</Badge>}
        />
      )}

      {db && degradedQueries.length > 0 && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          <div className="font-medium">
            Some sales data is temporarily unavailable
          </div>
          <div className="text-xs text-amber-800/80 mt-1">
            {primaryError
              ? "Lead pipeline did not load — showing an empty board. "
              : "Auxiliary widgets fell back to defaults. "}
            Affected: {degradedQueries.join(", ")}. Refresh in a moment.
          </div>
        </div>
      )}

      {db && (
        <>
          <Section eyebrow="Pipeline metrics" title="At a glance">
            <LeadPipelineMetricsStrip metrics={metrics} />
          </Section>

          <Section
            eyebrow="Pipeline"
            title="Lead board"
            description="Filter by project, source, or agent. Click a card to open the lead workspace and review AI-drafted replies before sending."
          >
            <LeadPipelineBoard
              leads={leads}
              pendingDraftsByRoleId={pendingDrafts}
              filterOptions={{
                projects: projectOptions,
                sources: sourceOptions,
                agents: agentOptions,
              }}
            />
          </Section>
        </>
      )}
    </DevelopmentShell>
  );
}
