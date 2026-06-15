import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { SalesPipelineViews } from "@/components/development/sales/sales-pipeline-views";
import { LeadPipelineMetricsStrip } from "@/components/development/sales/lead-pipeline-metrics";
import { LeadModalForm } from "@/components/development/sales/lead-modal-form";
import { ExportButton } from "@/components/development/bulk-import/export-button";
import {
  getActiveLeadSources,
  getLeadPipelineMetrics,
  getLeadsPipeline,
} from "@/lib/development/server/leads";
import { getDb } from "@/lib/db/client";
import { mapPoolAll } from "@/lib/db/map-pool";
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
      await mapPoolAll([
        // Primary: pipeline data. Falls back to [] with a visible warning if it
        // fails — page still renders rather than throwing 500.
        () => safeQuery(
          "getLeadsPipeline",
          getLeadsPipeline(),
          [] as Awaited<ReturnType<typeof getLeadsPipeline>>,
          PRIMARY_TIMEOUT_MS,
          (t) => {
            onTiming(t);
            if (t.usedFallback) primaryError = "leads pipeline";
          },
        ),
        () => safeQuery(
          "getLeadPipelineMetrics",
          getLeadPipelineMetrics(),
          EMPTY_METRICS,
          SECONDARY_TIMEOUT_MS,
          onTiming,
        ),
        () => safeQuery<{ id: string; name: string }[]>(
          "projects select",
          db
            .select({ id: projects.id, name: projects.name })
            .from(projects)
            .orderBy(projects.name),
          [] as { id: string; name: string }[],
          SECONDARY_TIMEOUT_MS,
          onTiming,
        ),
        () => safeQuery<{
          code: string;
          category: string;
          id: string;
          campaignName?: string | null;
        }[]>(
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
        () => safeQuery<{ id: string; name: string }[]>(
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
        () => safeQuery(
          "getPendingDraftCountsByRole",
          getPendingDraftCountsByRole(),
          {} as Record<string, number>,
          SECONDARY_TIMEOUT_MS,
          onTiming,
        ),
      ] as const, 4);
  }

  logSafeQueryTimings("sales", timings);
  const degradedQueries = timings
    .filter((t) => t.usedFallback)
    .map((t) => t.label);
  const totalPending = Object.values(pendingDrafts).reduce((a, b) => a + b, 0);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Sales &amp; buyers</span>
          </div>
          <div className="label mt-1.5">
            {db
              ? `${metrics.total} active · ${totalPending} AI drafts pending review`
              : "Database not configured"}
          </div>
          <h1>Sales pipeline</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Live pipeline backed by the contacts foundation. Switch to the
            Pipeline view to drag a lead between stages — moves are FSM-guarded
            (one step at a time) and audit-logged.
          </p>
        </div>
        <div className="actions">
          <LeadModalForm
            projects={projectOptions}
            leadSources={sourceOptions.map((s) => ({
              id: s.id,
              displayName: s.campaignName ?? s.code,
            }))}
          />
          <ExportButton entity="leads" />
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      {!db && (
        <EmptyState
          title="Sales pipeline runs against the database"
          description="Database connection not configured. Contact support."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
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
          <div>
            <div className="label mb-2.5">Pipeline metrics</div>
            <LeadPipelineMetricsStrip metrics={metrics} />
          </div>

          <div>
            <div className="label mb-2.5">Pipeline</div>
            <SalesPipelineViews
              leads={leads}
              pendingDraftsByRoleId={pendingDrafts}
              filterOptions={{
                projects: projectOptions,
                sources: sourceOptions,
                agents: agentOptions,
              }}
            />
          </div>
        </>
      )}
    </DevelopmentShell>
  );
}
