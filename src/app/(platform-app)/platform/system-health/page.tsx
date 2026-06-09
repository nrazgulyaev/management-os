/**
 * P1 SUPERADMIN-SYSTEM-HEALTH — platform-level system-health cabinet.
 *
 * There was no platform-scoped system-health surface: the only health
 * pages were org-scoped under /dashboard/system (per-tenant). This page
 * gives the super-admin operator a cross-tenant view by reusing the
 * EXISTING job / health infra:
 *   - services status grid (DB connections, queue depth, cron success,
 *     email bounce, sign-in) via getPlatformHealthSnapshot()
 *   - deployment-gate + env readiness via the existing deployment infra
 *   - job-queue panel (recent job runs + stale locks) via listJobRuns()
 *   - agent-runs panel via agent_runs
 *
 * Gating: the parent (platform-app)/layout.tsx already enforces
 * super_admin via isSuperAdminContext(); no extra auth needed here
 * (matches the sibling /platform/agents, /platform/audit pages).
 *
 * Read-only v1: the org-scoped job runner only exposes manual-run /
 * lock actions behind org RBAC (`requirePermission("jobs.run")`) which
 * revalidate /dashboard/jobs paths — there is no platform-scoped
 * pause-workers / dead-letter-replay primitive. So actions deep-link
 * to the existing /dashboard job + lock action cabinets rather than
 * re-gating an org write onto a super-admin surface.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DashboardKpi, ListTableCard } from "@/components/ui/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { JobStatusPill } from "@/components/jobs/job-status-pill";
import {
  getPlatformHealthSnapshot,
  getJobHealthPanel,
  type ServiceStatus,
} from "@/features/system/platform-health";
import { listJobRuns } from "@/features/jobs/services";
import { getProductionGateReport } from "@/lib/deployment/production-gates";
import { getEnvReadinessReport } from "@/lib/env/validation";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { hasPermission } from "@/features/auth/permission-matrix";
import {
  DispatchJobButton,
  ClearLockButton,
  PauseWorkersControl,
} from "@/components/platform/job-control-panel";

export const metadata: Metadata = {
  title: "System health · Platform Admin OS",
};
export const dynamic = "force-dynamic";

function serviceTone(status: ServiceStatus): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "operational":
      return "success";
    case "degraded":
      return "warning";
    case "down":
      return "danger";
    default:
      return "neutral";
  }
}

function serviceKpiStatus(
  status: ServiceStatus,
): "good" | "warn" | "bad" | "neutral" {
  switch (status) {
    case "operational":
      return "good";
    case "degraded":
      return "warn";
    case "down":
      return "bad";
    default:
      return "neutral";
  }
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export default async function PlatformSystemHealthPage() {
  const [snapshot, recentRuns, jobHealth, userCtx] = await Promise.all([
    getPlatformHealthSnapshot(),
    listJobRuns({ limit: 15 }).catch(() => []),
    getJobHealthPanel().catch(() => null),
    getCurrentUserContext().catch(() => null),
  ]);
  const gates = getProductionGateReport();
  const envReport = getEnvReadinessReport();

  // Only render a wired action button if the caller actually holds the
  // permission the underlying server action requires; otherwise the row is
  // read-only (the action still re-checks server-side — this is the visual
  // gate, not the security gate).
  const canDispatch = userCtx ? hasPermission(userCtx, "jobs.run") : false;
  const canClearLocks = userCtx ? hasPermission(userCtx, "job_lock.manage") : false;

  const jobPanelTone: ServiceStatus = jobHealth?.status ?? "unknown";

  const downCount = snapshot.services.filter((s) => s.status === "down").length;
  const degradedCount = snapshot.services.filter(
    (s) => s.status === "degraded",
  ).length;
  const operationalCount = snapshot.services.filter(
    (s) => s.status === "operational",
  ).length;
  const gatesPassed = gates.results.filter((g) => g.ok).length;

  const overallStatus: ServiceStatus =
    downCount > 0 ? "down" : degradedCount > 0 ? "degraded" : "operational";
  const overallLabel =
    overallStatus === "down"
      ? "Action needed"
      : overallStatus === "degraded"
        ? "Degraded"
        : "All systems go";

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Platform Admin OS", href: "/platform" },
          { label: "System health" },
        ]}
        eyebrow="Platform operations"
        title="System health"
        description="Cross-tenant platform health: a live service status grid (DB, queue, cron, email, sign-in), deployment-gate readiness, a cron / job-health control panel (dispatch, replay dead-letters, clear leaked locks — wired to the real job runner), and AI agent-run telemetry. Reuses the existing job / health infra at platform scope."
      />

      {!snapshot.dbConfigured && (
        <div className="rounded-md border border-line-soft bg-warning-weak/30 px-5 py-3 text-xs leading-relaxed text-warning">
          Database is not configured (demo mode). Live service metrics are
          unavailable — connect DATABASE_URL to populate this view.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardKpi
          variant="hero"
          tone={overallStatus === "down" ? "coral-soft" : "emerald-soft"}
          label="Platform status"
          value={overallLabel}
          status={serviceKpiStatus(overallStatus)}
          hint={`${operationalCount} operational · ${degradedCount} degraded · ${downCount} down`}
          className="sm:col-span-2 lg:col-span-2"
        />
        <DashboardKpi
          label="Deployment gates"
          value={`${gatesPassed}/${gates.results.length}`}
          status={gates.ok ? "good" : "bad"}
          hint={`${gates.mode} · ${gates.ok ? "passing" : "blocked"}`}
        />
        <DashboardKpi
          label="Env readiness"
          value={envReport.ok ? "OK" : `${envReport.fatalCount} fatal`}
          status={envReport.ok ? "good" : "bad"}
          hint={`${envReport.warningCount} warn · ${envReport.mode}`}
        />
      </div>

      {/* Services status grid */}
      <ListTableCard
        eyebrow="Services"
        title="Status grid"
        count={snapshot.services.length}
      >
        <Table>
          <THead>
            <TR>
              <TH>Service</TH>
              <TH>Status</TH>
              <TH className="text-right">Metric</TH>
              <TH>Detail</TH>
            </TR>
          </THead>
          <TBody>
            {snapshot.services.map((s) => (
              <TR key={s.key}>
                <TD className="font-medium text-ink">{s.label}</TD>
                <TD>
                  <Badge tone={serviceTone(s.status)}>{s.status}</Badge>
                </TD>
                <TDNum className="font-mono tabular-nums">{s.metric}</TDNum>
                <TD className="text-xs text-ink-tertiary">{s.detail}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </ListTableCard>

      {/* Stale locks (dead-letter-ish queue health) */}
      <ListTableCard
        eyebrow="Job locks"
        title="Stale locks"
        count={snapshot.staleLocks.length}
        actions={
          snapshot.activeLocks > 0 ? (
            <Badge tone="outline">{snapshot.activeLocks} active</Badge>
          ) : undefined
        }
      >
        {snapshot.staleLocks.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-ink-tertiary">
            {snapshot.activeLocks > 0
              ? `${snapshot.activeLocks} active lock${snapshot.activeLocks === 1 ? "" : "s"}, none stale. A stale lock is one whose expiry has passed but the row was not released — clear them from the Mgmt OS jobs / locks cabinet.`
              : "No active job locks. Locks appear here while a singleton job holds its mutex; stale (expired-but-unreleased) locks are flagged for clearing."}
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Job</TH>
                <TH>Locked by</TH>
                <TH>Locked at</TH>
                <TH>Expired at</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {snapshot.staleLocks.map((l) => (
                <TR key={l.jobKey}>
                  <TD className="font-mono text-xs">{l.jobKey}</TD>
                  <TD className="font-mono text-xs text-ink-tertiary">
                    {l.lockedBy}
                  </TD>
                  <TD className="text-xs text-ink-tertiary tabular-nums">
                    {fmtDateTime(l.lockedAt)}
                  </TD>
                  <TD className="text-xs">
                    <Badge tone="danger">{fmtDateTime(l.expiresAt)}</Badge>
                  </TD>
                  <TD className="text-right">
                    {canClearLocks ? (
                      <ClearLockButton jobKey={l.jobKey} />
                    ) : (
                      <Link
                        href="/dashboard/jobs/locks"
                        className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-accent"
                      >
                        Clear in jobs cabinet
                        <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </Link>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </ListTableCard>

      {/* Cron / job-health control panel — real wired actions where the
          runner exposes them, honest read-only where it does not. */}
      <ListTableCard
        eyebrow="Cron / workers"
        title="Job-health controls"
        count={jobHealth?.deadLetterCount ?? 0}
        actions={
          <Badge tone={serviceTone(jobPanelTone)}>{jobPanelTone}</Badge>
        }
      >
        <div className="flex flex-col gap-5 px-6 py-5">
          {/* Live queue-depth signals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-md border border-line-soft bg-surface px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                In-flight runs
              </div>
              <div className="mt-1 font-mono text-lg tabular-nums text-ink">
                {jobHealth?.runningCount ?? "—"}
              </div>
              <div className="text-[11px] text-ink-tertiary">
                jobs currently <code>running</code>
              </div>
            </div>
            <div className="rounded-md border border-line-soft bg-surface px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                Stuck runs
              </div>
              <div
                className={`mt-1 font-mono text-lg tabular-nums ${
                  (jobHealth?.stuckCount ?? 0) > 0 ? "text-danger" : "text-ink"
                }`}
              >
                {jobHealth?.stuckCount ?? "—"}
              </div>
              <div className="text-[11px] text-ink-tertiary">
                running &gt; {jobHealth?.staleJobMinutes ?? "—"}m (drives 503)
              </div>
            </div>
            <div className="rounded-md border border-line-soft bg-surface px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                Dead-letter
              </div>
              <div
                className={`mt-1 font-mono text-lg tabular-nums ${
                  (jobHealth?.deadLetterCount ?? 0) > 0
                    ? "text-warning"
                    : "text-ink"
                }`}
              >
                {jobHealth?.deadLetterCount ?? "—"}
              </div>
              <div className="text-[11px] text-ink-tertiary">
                failed (24h), no later success
              </div>
            </div>
          </div>

          {/* Pause-workers — honest read-only (no runner pause primitive) */}
          <PauseWorkersControl />

          {/* Dead-letter list with a real Replay (= dispatch the same job) */}
          {jobHealth && jobHealth.deadLetters.length > 0 ? (
            <div className="rounded-md border border-line-soft overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-line-soft">
                <span className="text-xs font-medium text-ink">
                  Dead-letter queue
                </span>
                <span className="text-[11px] text-ink-tertiary">
                  {canDispatch
                    ? "Replay re-runs the job from scratch (no in-place replay)."
                    : "Read-only — jobs.run permission required to replay."}
                </span>
              </div>
              <Table>
                <THead>
                  <TR>
                    <TH>Job</TH>
                    <TH>Failed</TH>
                    <TH>Error</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {jobHealth.deadLetters.map((d) => (
                    <TR key={d.runId}>
                      <TD className="font-mono text-xs">
                        <Link
                          href={`/dashboard/jobs/runs/${d.runId}`}
                          className="hover:text-accent"
                        >
                          {d.jobKey}
                        </Link>
                      </TD>
                      <TD className="text-xs text-ink-tertiary tabular-nums whitespace-nowrap">
                        {fmtDateTime(d.failedAt)}
                      </TD>
                      <TD className="text-xs text-danger truncate max-w-[320px]">
                        {d.errorMessage ?? d.resultSummary ?? "—"}
                      </TD>
                      <TD className="text-right">
                        {canDispatch ? (
                          <DispatchJobButton
                            jobKey={d.jobKey}
                            label="Replay"
                            replay
                          />
                        ) : (
                          <Link
                            href="/dashboard/jobs"
                            className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-accent justify-end"
                          >
                            Replay in jobs cabinet
                            <ArrowUpRight
                              className="w-3.5 h-3.5"
                              strokeWidth={1.75}
                            />
                          </Link>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-md border border-line-soft px-4 py-6 text-center text-xs text-ink-tertiary">
              {jobHealth?.dbConfigured === false
                ? "Database not configured — job-health controls are unavailable in demo mode."
                : "No dead-letter jobs in the last 24h. Failed runs with no subsequent success would appear here with a Replay control."}
            </div>
          )}

          <p className="text-[11px] text-ink-tertiary leading-relaxed">
            Dispatch / replay is gated by <code>jobs.run</code>; lock release by{" "}
            <code>job_lock.manage</code>. Both server actions re-check the
            permission and audit-log the run — the buttons above only appear
            when you hold the grant. Pause-workers is intentionally read-only
            (no runner primitive). Queue / dead-letter figures read live{" "}
            <code>job_runs</code>.
          </p>
        </div>
      </ListTableCard>

      {/* Background job queue */}
      <ListTableCard
        eyebrow="Job queue"
        title="Recent job runs"
        count={recentRuns.length}
        actions={
          <Link
            href="/dashboard/jobs"
            className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-accent"
          >
            Dispatch / manage jobs
            <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </Link>
        }
      >
        {recentRuns.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-ink-tertiary">
            No job runs recorded yet. Cron + manual runs surface here with
            status, duration and summary.
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Job</TH>
                <TH>Trigger</TH>
                <TH>Status</TH>
                <TH className="text-right">Duration</TH>
                <TH>Summary</TH>
              </TR>
            </THead>
            <TBody>
              {recentRuns.map((r) => (
                <TR key={r.id}>
                  <TD className="text-xs text-ink-tertiary tabular-nums whitespace-nowrap">
                    {fmtDateTime(r.startedAt)}
                  </TD>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/dashboard/jobs/runs/${r.id}`}
                      className="hover:text-accent"
                    >
                      {r.jobKey}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone="outline">{r.triggerType}</Badge>
                  </TD>
                  <TD>
                    <JobStatusPill status={r.status} />
                  </TD>
                  <TDNum className="font-mono tabular-nums text-xs">
                    {fmtDuration(r.durationMs)}
                  </TDNum>
                  <TD className="text-xs text-ink-secondary truncate max-w-[360px]">
                    {r.resultSummary ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </ListTableCard>

      {/* AI agent runs */}
      <ListTableCard
        eyebrow="AI agents"
        title="Recent agent runs"
        count={snapshot.recentAgentRuns.length}
        actions={
          <div className="flex items-center gap-2">
            {snapshot.agentRunFailures24h > 0 && (
              <Badge tone="danger">
                {snapshot.agentRunFailures24h} failed · 24h
              </Badge>
            )}
            <Link
              href="/platform/agents"
              className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-accent"
            >
              Agents cabinet
              <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Link>
          </div>
        }
      >
        {snapshot.recentAgentRuns.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-ink-tertiary">
            No agent runs recorded yet. Once customer orgs invoke a subscribed
            agent, each run (success / error / budget / rate-limit) surfaces
            here.
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Agent</TH>
                <TH>Org</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH className="text-right">Latency</TH>
              </TR>
            </THead>
            <TBody>
              {snapshot.recentAgentRuns.map((r) => (
                <TR key={r.id}>
                  <TD className="text-xs text-ink-tertiary tabular-nums whitespace-nowrap">
                    {fmtDateTime(r.startedAt)}
                  </TD>
                  <TD>
                    <div className="text-sm text-ink font-medium">
                      {r.agentName}
                    </div>
                    <div className="text-[11px] font-mono text-ink-tertiary">
                      {r.agentCode}
                    </div>
                  </TD>
                  <TD className="text-sm text-ink-secondary">
                    {r.orgName ?? "—"}
                  </TD>
                  <TD>
                    <Badge tone="outline">{r.runType.replace(/_/g, " ")}</Badge>
                  </TD>
                  <TD>
                    <Badge
                      tone={
                        r.status === "success"
                          ? "success"
                          : r.status === "in_progress"
                            ? "info"
                            : "danger"
                      }
                    >
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </TD>
                  <TDNum className="font-mono tabular-nums text-xs">
                    {fmtDuration(r.latencyMs)}
                  </TDNum>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </ListTableCard>

      <p className="text-[11px] text-ink-tertiary leading-relaxed">
        Live actions (dispatch a job, replay a dead-letter, force-release a
        leaked lock) run against the existing job runner and are gated by the{" "}
        <code>jobs.run</code> / <code>job_lock.manage</code> permissions and
        audit-logged. Pause-workers is honestly read-only — the runner has no
        worker pool to pause (crons are stateless scheduled GETs). The fuller
        run history + retry-policy editing live in the Mgmt OS jobs cabinet (
        <code>/dashboard/jobs</code>). Metrics reuse <code>job_runs</code>,{" "}
        <code>job_locks</code>, <code>notification_deliveries</code>,{" "}
        <code>auth_login_attempts</code> and <code>agent_runs</code>.
      </p>
    </div>
  );
}
