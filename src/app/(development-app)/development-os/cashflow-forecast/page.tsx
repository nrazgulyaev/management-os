import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listCashflowForecasts } from "@/lib/development/server/cashflow/cashflow-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { projects } from "@/lib/db/schema/projects";
import { asc } from "drizzle-orm";
import { GenerateForecastForm, CashflowTransition } from "./_controls";

export const metadata: Metadata = {
  title: "Cashflow forecast · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  draft: "warning",
  active: "success",
  archived: "neutral",
  superseded: "neutral",
};

function formatMoney(minor: bigint | null | undefined) {
  if (minor === null || minor === undefined) return "—";
  const n = Number(minor) / 100;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default async function CashflowForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; scope?: string }>;
}) {
  const params = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Cashflow forecast" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const scopeFilter =
    params.scope === "project" || params.scope === "company_wide"
      ? params.scope
      : undefined;
  const [forecasts, projectList] = await Promise.all([
    safeQuery(
      "listCashflowForecasts",
      listCashflowForecasts({ status: params.status, scope: scopeFilter }),
      [],
      4000,
    ),
    safeQuery(
      "cashflow projects",
      db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
      [],
      4000,
    ),
  ]);
  const activeCount = forecasts.filter((f) => f.status === "active").length;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Cashflow forecast" },
        ]}
        eyebrow={`${activeCount} active / ${forecasts.length} total`}
        title="Monthly cashflow forecasts"
        description="JSONB snapshots of month-by-month inflow / outflow / cumulative cash. Forecasts are immutable after save; the auto-generate cron creates a fresh draft on the 1st of each month — operator must promote to `active`."
        actions={
          <div className="flex items-center gap-2">
            <GenerateForecastForm projects={projectList} />
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {forecasts.length === 0 ? (
        <EmptyState
          title="No forecasts yet"
          description="Generate via the auto-generate cron, or use the generateCashflowForecast server action."
        
          action={
            <Link href="/dashboard/jobs" className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40">View jobs</Link>
          }
        />
      ) : (
        <Section eyebrow="Forecasts" title="All forecasts (newest first)">
          <Table>
            <THead>
              <TR>
                <TH>Label</TH>
                <TH>Scope</TH>
                <TH>Start</TH>
                <TH>Horizon</TH>
                <TH className="text-right">Peak required</TH>
                <TH className="text-right">Ending cash</TH>
                <TH>Status</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {forecasts.map((f) => {
                const gaps =
                  Array.isArray(f.identifiedCashGaps)
                    ? (f.identifiedCashGaps as Array<unknown>).length
                    : 0;
                return (
                  <TR key={f.id}>
                    <TD className="text-sm">
                      {f.forecastLabel}
                      {gaps > 0 && (
                        <Badge tone="danger" className="ml-2">
                          {gaps} gap{gaps === 1 ? "" : "s"}
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <Badge tone="info">{f.scope}</Badge>
                    </TD>
                    <TD className="text-xs">{f.forecastStartMonth}</TD>
                    <TD className="text-xs">{f.forecastHorizonMonths}m</TD>
                    <TD className="text-right font-mono text-xs">
                      {formatMoney(f.peakCapitalRequiredMinor)}
                    </TD>
                    <TD className="text-right font-mono text-xs">
                      {formatMoney(f.endingCashMinor)}
                    </TD>
                    <TD>
                      <Badge tone={STATUS_TONE[f.status] ?? "neutral"}>
                        {f.status}
                      </Badge>
                    </TD>
                    <TD>
                      <CashflowTransition forecastId={f.id} status={f.status} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
