import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  TDNum,
} from "@/components/ui/table";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getAiAgentBudgets,
  getAiSpendWindows,
  getAiUsageByAssistant,
  getRecentAiRuns,
} from "@/lib/development/server/ai-usage";
import { safeQuery } from "@/lib/development/safe-query";
import { eq, and } from "drizzle-orm";
import {
  aiOrgQuotaLimits,
  aiOrgUsageMonthly,
} from "@/lib/db/schema/ai";
import {
  orgSubscriptions,
  subscriptionPlans,
} from "@/lib/db/schema/subscriptions";
import { organizations } from "@/lib/db/schema/saas";

export const metadata: Metadata = { title: "AI usage · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "soft" | "info"
> = {
  succeeded: "ok",
  success: "ok",
  dry_run: "info",
  failed: "danger",
  error: "danger",
  budget_exceeded: "warn",
  fallback: "warn",
  blocked: "warn",
  skipped: "soft",
  running: "info",
};

function fmtUsd(n: number): string {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

interface BreakdownEntry {
  runs?: number;
  costUsd?: number;
  promptTokens?: number;
  completionTokens?: number;
}

function BreakdownCard({
  title,
  data,
  keyLabel,
}: {
  title: string;
  data: Record<string, BreakdownEntry>;
  keyLabel: string;
}) {
  const rows = Object.entries(data ?? {})
    .map(([k, v]) => ({
      key: k,
      runs: v.runs ?? 0,
      costUsd: v.costUsd ?? 0,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);
  return (
    <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card">
      <div className="text-label mb-3">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-ink-tertiary">No runs aggregated yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-ink-tertiary">
            <tr>
              <th className="text-left font-normal pb-2">{keyLabel}</th>
              <th className="text-right font-normal pb-2">Runs</th>
              <th className="text-right font-normal pb-2">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line-soft">
                <td className="py-2 font-mono text-xs">{r.key}</td>
                <td className="py-2 text-right tabular-nums">{r.runs}</td>
                <td className="py-2 text-right tabular-nums">
                  {fmtUsd(r.costUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function AiUsagePage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <span>Settings</span> / <span>AI usage</span>
            </div>
            <h1>AI usage</h1>
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              Per-assistant spend, runs, and configured budgets.
            </p>
          </div>
        </div>
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

  // Stage 7.0 retrofit — org-quota + plan + JSONB breakdowns for the
  // first active org. (Multi-org switcher lands with Stage 7.E tenant
  // routing.) Falls back gracefully if any of these queries return null.
  const [defaultOrg] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.isActive, true))
    .limit(1);

  const orgQuotaRow = defaultOrg
    ? (
        await db
          .select()
          .from(aiOrgQuotaLimits)
          .where(eq(aiOrgQuotaLimits.organizationId, defaultOrg.id))
          .limit(1)
      )[0] ?? null
    : null;

  const now = new Date();
  const orgUsageRow = defaultOrg
    ? (
        await db
          .select()
          .from(aiOrgUsageMonthly)
          .where(
            and(
              eq(aiOrgUsageMonthly.organizationId, defaultOrg.id),
              eq(aiOrgUsageMonthly.year, now.getUTCFullYear()),
              eq(aiOrgUsageMonthly.month, now.getUTCMonth() + 1),
            ),
          )
          .limit(1)
      )[0] ?? null
    : null;

  const orgPlanRow = defaultOrg
    ? (
        await db
          .select({
            planCode: subscriptionPlans.planCode,
            displayName: subscriptionPlans.displayName,
            maxTier: subscriptionPlans.maxTier,
            markupPercent: subscriptionPlans.markupPercent,
            enabledAgentCodes: subscriptionPlans.enabledAgentCodes,
          })
          .from(orgSubscriptions)
          .innerJoin(
            subscriptionPlans,
            eq(subscriptionPlans.planCode, orgSubscriptions.planCode),
          )
          .where(eq(orgSubscriptions.organizationId, defaultOrg.id))
          .limit(1)
      )[0] ?? null
    : null;

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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Settings</span> / <span>AI usage</span>
          </div>
          <h1>AI usage</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-assistant spend, runs, and configured budgets. Budgets are
            checked before each provider call — spending stops when daily or
            monthly limits are hit.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Last 30 days</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Spend" value={fmtUsd(totalSpend30d)} sub="last 30 days" />
          <Kpi label="Runs" value={String(totalRuns30d)} />
          <Kpi
            label="Failures"
            value={String(totalFailures)}
            sub={totalRuns30d > 0 ? `${((totalFailures / totalRuns30d) * 100).toFixed(1)}%` : undefined}
          />
          <Kpi
            label="Budgets"
            value={String(budgets.length)}
            sub={
              budgets.filter((b) => b.isEnabled).length === budgets.length
                ? "all enabled"
                : `${budgets.filter((b) => b.isEnabled).length} enabled`
            }
          />
        </div>
      </div>

      <div>
        <div className="label mb-2.5">By assistant</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Aggregated over the last 30 days from ai_assistant_runs.
        </p>
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
                      <HandoffBadge tone="danger">{r.failureCount}</HandoffBadge>
                    ) : (
                      "—"
                    )}
                  </TDNum>
                  <TDNum>
                    {r.budgetExceededCount > 0 ? (
                      <HandoffBadge tone="warn">{r.budgetExceededCount}</HandoffBadge>
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
      </div>

      {budgetWindows.length > 0 && (
        <div>
          <div className="label mb-2.5">Budgets</div>
          <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
            Daily resets at 00:00 UTC. Monthly resets on the 1st. When
            utilisation reaches the alert threshold the next operations summary
            surfaces a warning.
          </p>
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
                        <HandoffBadge tone="soft">Disabled</HandoffBadge>
                      ) : exceeded ? (
                        <HandoffBadge tone="danger">Exceeded</HandoffBadge>
                      ) : warn ? (
                        <HandoffBadge tone="warn">Warning</HandoffBadge>
                      ) : (
                        <HandoffBadge tone="ok">OK</HandoffBadge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}

      {orgQuotaRow && (
        <div>
          <div className="label mb-2.5">
            Org quota · {defaultOrg?.name ?? "default"}
          </div>
          <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
            Stage 7.0 — per-org quota enforcement. Daily resets at 00:00 UTC;
            monthly resets on the 1st.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Kpi
              label="Plan"
              value={orgPlanRow?.displayName ?? "—"}
              sub={
                orgPlanRow
                  ? `Tier max ${orgPlanRow.maxTier} · ${orgPlanRow.markupPercent}% markup`
                  : "no subscription"
              }
            />
            <Kpi
              label="Daily cap"
              value={fmtUsd(Number(orgQuotaRow.dailyLimitUsd))}
              sub={`today: ${fmtUsd(Number(orgUsageRow?.todayCostUsd ?? 0))}`}
            />
            <Kpi
              label="Monthly cap"
              value={fmtUsd(Number(orgQuotaRow.monthlyLimitUsd))}
              sub={`month: ${fmtUsd(Number(orgUsageRow?.totalCostUsd ?? 0))}`}
            />
            <Kpi
              label="Quota state"
              value={
                orgQuotaRow.lastBlockedAt
                  ? "blocked"
                  : !orgQuotaRow.isEnabled
                    ? "disabled"
                    : "ok"
              }
              sub={
                orgQuotaRow.lastBlockedAt
                  ? `last blocked: ${orgQuotaRow.lastBlockedAt.toISOString().slice(0, 10)}`
                  : `warn≥${orgQuotaRow.warnThresholdPct}% high≥${orgQuotaRow.highThresholdPct}%`
              }
            />
          </div>

          {orgUsageRow && (
            <div className="grid md:grid-cols-3 gap-4">
              <BreakdownCard
                title="By tier"
                data={(orgUsageRow.byTier ?? {}) as Record<string, BreakdownEntry>}
                keyLabel="Tier"
              />
              <BreakdownCard
                title="By provider"
                data={(orgUsageRow.byProvider ?? {}) as Record<string, BreakdownEntry>}
                keyLabel="Provider"
              />
              <BreakdownCard
                title="By agent"
                data={(orgUsageRow.byAgent ?? {}) as Record<string, BreakdownEntry>}
                keyLabel="Agent"
              />
            </div>
          )}
        </div>
      )}

      <div>
        <div className="label mb-2.5">Runs</div>
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
                    <HandoffBadge tone={STATUS_TONE[r.status] ?? "soft"}>
                      {r.status}
                    </HandoffBadge>
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
      </div>
    </DevelopmentShell>
  );
}
