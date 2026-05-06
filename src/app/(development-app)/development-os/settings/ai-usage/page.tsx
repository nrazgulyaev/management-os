import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  TDNum,
} from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getAiAgentBudgets,
  getAiSpendWindows,
  getAiUsageByAssistant,
  getRecentAiRuns,
} from "@/lib/development/server/ai-usage";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "AI usage · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "neutral" | "info"
> = {
  succeeded: "success",
  success: "success",
  dry_run: "info",
  failed: "danger",
  error: "danger",
  budget_exceeded: "warning",
  fallback: "warning",
  blocked: "warning",
  skipped: "neutral",
  running: "info",
};

function fmtUsd(n: number): string {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

export default async function AiUsagePage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: "Settings" },
            { label: "AI usage" },
          ]}
          title="AI usage"
          description="Per-assistant spend, runs, and configured budgets."
        />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to view AI usage."
        />
      </DevelopmentShell>
    );
  }

  const [usage, runs, budgets] = await Promise.all([
    safeQuery("getAiUsageByAssistant", getAiUsageByAssistant(), [], 4000),
    safeQuery("getRecentAiRuns", getRecentAiRuns({ limit: 100 }), [], 4000),
    safeQuery("getAiAgentBudgets", getAiAgentBudgets(), [], 4000),
  ]);

  // Spend windows for each configured budget — runs in parallel.
  const budgetWindows = await Promise.all(
    budgets.map(async (b) => ({
      budget: b,
      windows: await safeQuery(
        `getAiSpendWindows:${b.assistantKey}`,
        getAiSpendWindows(b.assistantKey),
        { todayUsd: 0, monthUsd: 0 },
        4000,
      ),
    })),
  );

  const totalSpend30d = usage.reduce((s, r) => s + r.totalCostUsd, 0);
  const totalRuns30d = usage.reduce((s, r) => s + r.runs, 0);
  const totalFailures = usage.reduce((s, r) => s + r.failureCount, 0);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Settings" },
          { label: "AI usage" },
        ]}
        eyebrow={`${totalRuns30d} runs · ${fmtUsd(totalSpend30d)} (last 30 days)`}
        title="AI usage"
        description="Per-assistant spend, runs, and configured budgets. Budgets are checked before each provider call — spending stops when daily or monthly limits are hit."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Last 30 days" title="Snapshot">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Spend"
            value={fmtUsd(totalSpend30d)}
            hint="last 30 days"
          />
          <MetricCard label="Runs" value={String(totalRuns30d)} />
          <MetricCard
            label="Failures"
            value={String(totalFailures)}
            hint={totalRuns30d > 0 ? `${((totalFailures / totalRuns30d) * 100).toFixed(1)}%` : undefined}
          />
          <MetricCard
            label="Budgets"
            value={String(budgets.length)}
            hint={
              budgets.filter((b) => b.isEnabled).length === budgets.length
                ? "all enabled"
                : `${budgets.filter((b) => b.isEnabled).length} enabled`
            }
          />
        </div>
      </Section>

      <Section
        eyebrow="By assistant"
        title="Spend + reliability per agent"
        description="Aggregated over the last 30 days from ai_assistant_runs."
      >
        {usage.length === 0 ? (
          <EmptyState
            title="No AI runs yet"
            description="No assistant has been invoked in the last 30 days."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Assistant</TH>
                <TH>Runs</TH>
                <TH>Success</TH>
                <TH>Failed</TH>
                <TH>Budget blocked</TH>
                <TH>Dry-run</TH>
                <TH>Tokens</TH>
                <TH>Spend (USD)</TH>
              </TR>
            </THead>
            <TBody>
              {usage.map((r) => (
                <TR key={r.assistantKey}>
                  <TD className="font-mono text-xs">{r.assistantKey}</TD>
                  <TDNum>{r.runs}</TDNum>
                  <TDNum>{r.successCount}</TDNum>
                  <TDNum>
                    {r.failureCount > 0 ? (
                      <Badge tone="danger">{r.failureCount}</Badge>
                    ) : (
                      "—"
                    )}
                  </TDNum>
                  <TDNum>
                    {r.budgetExceededCount > 0 ? (
                      <Badge tone="warning">{r.budgetExceededCount}</Badge>
                    ) : (
                      "—"
                    )}
                  </TDNum>
                  <TDNum>{r.dryRunCount}</TDNum>
                  <TDNum>{r.totalTokens.toLocaleString()}</TDNum>
                  <TDNum>{fmtUsd(r.totalCostUsd)}</TDNum>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      {budgetWindows.length > 0 && (
        <Section
          eyebrow="Budgets"
          title="Configured ceilings + utilisation"
          description="Daily resets at 00:00 UTC. Monthly resets on the 1st. When utilisation reaches the alert threshold the next operations summary surfaces a warning."
        >
          <Table>
            <THead>
              <TR>
                <TH>Assistant</TH>
                <TH>Daily limit</TH>
                <TH>Today</TH>
                <TH>Monthly limit</TH>
                <TH>This month</TH>
                <TH>Alert ≥</TH>
                <TH>State</TH>
              </TR>
            </THead>
            <TBody>
              {budgetWindows.map(({ budget, windows }) => {
                const dailyLimit = Number(budget.dailyLimitUsd);
                const monthlyLimit = Number(budget.monthlyLimitUsd);
                const dailyPct =
                  dailyLimit > 0
                    ? Math.min(100, (windows.todayUsd / dailyLimit) * 100)
                    : 0;
                const monthlyPct =
                  monthlyLimit > 0
                    ? Math.min(100, (windows.monthUsd / monthlyLimit) * 100)
                    : 0;
                const exceeded =
                  windows.todayUsd >= dailyLimit ||
                  windows.monthUsd >= monthlyLimit;
                const warn =
                  !exceeded &&
                  (dailyPct >= budget.alertThresholdPct ||
                    monthlyPct >= budget.alertThresholdPct);
                return (
                  <TR key={budget.id}>
                    <TD className="font-mono text-xs">{budget.assistantKey}</TD>
                    <TDNum>{fmtUsd(dailyLimit)}</TDNum>
                    <TDNum>
                      {fmtUsd(windows.todayUsd)}{" "}
                      <span className="text-[11px] text-ink-tertiary">
                        ({dailyPct.toFixed(0)}%)
                      </span>
                    </TDNum>
                    <TDNum>{fmtUsd(monthlyLimit)}</TDNum>
                    <TDNum>
                      {fmtUsd(windows.monthUsd)}{" "}
                      <span className="text-[11px] text-ink-tertiary">
                        ({monthlyPct.toFixed(0)}%)
                      </span>
                    </TDNum>
                    <TDNum>{budget.alertThresholdPct}%</TDNum>
                    <TD>
                      {!budget.isEnabled ? (
                        <Badge tone="neutral">Disabled</Badge>
                      ) : exceeded ? (
                        <Badge tone="danger">Exceeded</Badge>
                      ) : warn ? (
                        <Badge tone="warning">Warning</Badge>
                      ) : (
                        <Badge tone="success">OK</Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Section>
      )}

      <Section eyebrow="Runs" title="Last 100 chronologically">
        {runs.length === 0 ? (
          <EmptyState title="No runs yet" description="Trigger an AI assistant or wait for the next cron tick." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Started</TH>
                <TH>Assistant</TH>
                <TH>Status</TH>
                <TH>Model</TH>
                <TH>Tokens (in/out)</TH>
                <TH>Cost</TH>
                <TH>Latency</TH>
                <TH>Output / error</TH>
              </TR>
            </THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
                  <TD className="text-xs whitespace-nowrap">
                    {r.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                  </TD>
                  <TD className="font-mono text-xs">{r.assistantKey}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {r.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-ink-secondary">
                    {r.model ?? "—"}
                  </TD>
                  <TD className="text-xs">
                    {r.promptTokens != null && r.completionTokens != null
                      ? `${r.promptTokens.toLocaleString()} / ${r.completionTokens.toLocaleString()}`
                      : "—"}
                  </TD>
                  <TDNum>
                    {r.totalCostUsd != null ? fmtUsd(r.totalCostUsd) : "—"}
                  </TDNum>
                  <TDNum>{r.latencyMs != null ? `${r.latencyMs}ms` : "—"}</TDNum>
                  <TD className="text-xs">
                    {r.errorMessage
                      ? r.errorMessage.slice(0, 80)
                      : r.outputSummary
                        ? r.outputSummary.slice(0, 80)
                        : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
