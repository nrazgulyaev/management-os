import type { Metadata } from "next";
import Link from "next/link";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
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

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "info"> = {
  draft: "warn",
  active: "ok",
  archived: "info",
  superseded: "info",
};

function formatMoney(minor: bigint | null | undefined): string {
  if (minor === null || minor === undefined) return "—";
  const n = Number(minor) / 100;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

type MonthlyRow = {
  month?: string;
  net?: number;
  cumulativeCash?: number;
};

/**
 * Recover the forecast's opening balance from its first projection.
 * The generator seeds `cumulative = startingCash` then writes the first
 * month as `cumulativeCash = startingCash + net`, so the opening balance
 * is `firstMonth.cumulativeCash − firstMonth.net`. Returns null when no
 * projection rows exist (honest "—" rather than a false $0). Units match
 * the sibling trough / ending-cash KPIs (cumulativeCash basis).
 */
function startingCashFromMonths(months: MonthlyRow[]): number | null {
  const first = months[0];
  if (!first) return null;
  return Number(first.cumulativeCash ?? 0) - Number(first.net ?? 0);
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
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> / Cashflow
              forecast
            </div>
            <h1>Cashflow forecast.</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
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
      db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .orderBy(asc(projects.name)),
      [],
      4000,
    ),
  ]);
  const activeCount = forecasts.filter((f) => f.status === "active").length;

  // Chart + KPI strip derive from the headline forecast (active first,
  // else the newest). Data wiring is preserved — only the read shape is
  // reused for the visualization.
  const headline = forecasts.find((f) => f.status === "active") ?? forecasts[0];
  const months: MonthlyRow[] = Array.isArray(headline?.monthlyProjections)
    ? (headline.monthlyProjections as MonthlyRow[])
    : [];
  const maxNetAbs = Math.max(
    1,
    ...months.map((m) => Math.abs(Number(m.net ?? 0))),
  );
  const trough = months.reduce<MonthlyRow | null>((lo, m) => {
    const c = Number(m.cumulativeCash ?? 0);
    if (lo === null || c < Number(lo.cumulativeCash ?? 0)) return m;
    return lo;
  }, null);
  const startingCash = startingCashFromMonths(months);
  const totalGaps = forecasts.reduce(
    (acc, f) =>
      acc +
      (Array.isArray(f.identifiedCashGaps)
        ? (f.identifiedCashGaps as unknown[]).length
        : 0),
    0,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> / Cashflow
            forecast
          </div>
          <h1>
            Cashflow <em>forecast</em>.
          </h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Net cashflow per month + cumulative cash on hand. JSONB snapshots
            are immutable after save; the auto-generate cron creates a fresh
            draft on the 1st — operator promotes to active.
          </p>
        </div>
        <div className="actions">
          <GenerateForecastForm projects={projectList} />
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            Command center
          </Link>
        </div>
      </div>

      <div className="cfo-kpis cfo-kpis-4">
        <Kpi
          label="Cash today"
          value={
            startingCash !== null
              ? formatMoney(BigInt(Math.round(startingCash)))
              : "—"
          }
          sub="starting balance"
          tone="success"
        />
        <Kpi
          label="Peak required"
          value={formatMoney(headline?.peakCapitalRequiredMinor)}
          sub="capital draw"
          tone="accent"
        />
        <Kpi
          label="Trough · cumulative"
          value={
            trough ? formatMoney(BigInt(Math.round(Number(trough.cumulativeCash ?? 0)))) : "—"
          }
          sub={trough?.month ?? "—"}
          tone="warn"
        />
        <Kpi
          label="Ending cash"
          value={formatMoney(headline?.endingCashMinor)}
          sub={`${activeCount} active / ${forecasts.length} total`}
        />
      </div>

      {headline && months.length > 0 && (
        <Card padding="default" className="mb-[18px]">
          <div className="cfo-card-head">
            <h3 className="cfo-card-title">
              Net + cumulative · {headline.forecastHorizonMonths} months
            </h3>
            <span className="label">{headline.forecastLabel} · USD</span>
          </div>
          <div className="fin-bars">
            {months.map((m, i) => {
              const net = Number(m.net ?? 0);
              const h = Math.max(4, (Math.abs(net) / maxNetAbs) * 150);
              const cls = net < 0 ? "fin-bar neg" : "fin-bar";
              return (
                <div className="fin-bar-col" key={`${m.month ?? i}`}>
                  <i className={cls} style={{ height: `${h}px` }} />
                  <span>{m.month ?? `M${i + 1}`}</span>
                </div>
              );
            })}
          </div>
          {totalGaps > 0 && (
            <div className="fin-note">
              <strong className="text-[var(--danger)]">
                {totalGaps} cash gap{totalGaps === 1 ? "" : "s"}
              </strong>{" "}
              identified across forecasts — review the rows below before
              promoting a draft to active.
            </div>
          )}
        </Card>
      )}

      {forecasts.length === 0 ? (
        <EmptyState
          title="No forecasts yet"
          description="Generate via the auto-generate cron, or use the generateCashflowForecast server action."
          action={
            <Link href="/dashboard/jobs" className="btn btn-secondary btn-sm">
              View jobs
            </Link>
          }
        />
      ) : (
        <Card padding="default">
          <div className="cfo-card-head">
            <h3 className="cfo-card-title">All forecasts</h3>
            <span className="label">newest first</span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>Label</th>
                <th>Scope</th>
                <th>Start</th>
                <th>Horizon</th>
                <th className="num">Peak required</th>
                <th className="num">Ending cash</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {forecasts.map((f) => {
                const gaps = Array.isArray(f.identifiedCashGaps)
                  ? (f.identifiedCashGaps as Array<unknown>).length
                  : 0;
                return (
                  <tr key={f.id}>
                    <td>
                      {f.forecastLabel}
                      {gaps > 0 && (
                        <span className="ml-2">
                          <HandoffBadge tone="danger">
                            {gaps} gap{gaps === 1 ? "" : "s"}
                          </HandoffBadge>
                        </span>
                      )}
                    </td>
                    <td>
                      <HandoffBadge tone="info">{f.scope}</HandoffBadge>
                    </td>
                    <td className="text-[var(--ink-3)]">
                      {f.forecastStartMonth}
                    </td>
                    <td className="text-[var(--ink-3)]">
                      {f.forecastHorizonMonths}m
                    </td>
                    <td className="num">
                      {formatMoney(f.peakCapitalRequiredMinor)}
                    </td>
                    <td className="num">{formatMoney(f.endingCashMinor)}</td>
                    <td>
                      <HandoffBadge tone={STATUS_TONE[f.status] ?? "info"}>
                        {f.status}
                      </HandoffBadge>
                    </td>
                    <td>
                      <CashflowTransition
                        forecastId={f.id}
                        status={f.status}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </DevelopmentShell>
  );
}
