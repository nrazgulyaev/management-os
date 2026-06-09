import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { getTokenUsageView } from "@/features/ai-agents/agent-detail-queries";

/**
 * AI Cabinet depth pass — per-org AI token / budget usage.
 *
 * DERIVED from existing tables (no new migration):
 *   · ai_org_usage_monthly — authoritative per-org monthly aggregate
 *     (runs, prompt/completion tokens, cost, today's spend).
 *   · ai_assistant_runs    — live per-agent breakdown for this month.
 *
 * Money is USD minor units (bigint); rendered via fmtUsd.
 */

export const metadata = { title: "AI token usage" };
export const dynamic = "force-dynamic";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtUsd(minor: bigint): string {
  const usd = Number(minor) / 100;
  if (usd === 0) return "$0.00";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtTokens(n: bigint | number): string {
  return Number(n).toLocaleString("en-US");
}

export default async function AiTokenUsagePage() {
  const usage = await getTokenUsageView().catch(() => null);
  const current = usage?.current ?? null;
  const history = usage?.history ?? [];
  const breakdown = usage?.agentBreakdown ?? [];

  const totalTokensThisMonth = current
    ? current.totalPromptTokens + current.totalCompletionTokens
    : 0n;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "AI assistants", href: "/dashboard/ai" },
          { label: "Token usage" },
        ]}
        title="AI token usage"
        description="Per-workspace AI spend, token volume, and run counts — derived from the same audit log every agent writes to. Money is shown in USD."
      />

      <Section eyebrow="This month" title="Budget & volume">
        {!current ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No usage recorded yet for your workspace. The first agent run lands a
            row here automatically.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Spend · MTD"
              value={fmtUsd(current.totalCostUsdMinor)}
              hint={`${current.totalRuns} runs`}
            />
            <MetricCard
              label="Spend · today"
              value={fmtUsd(current.todayCostUsdMinor)}
              hint={`${current.todayRuns} runs today`}
            />
            <MetricCard
              label="Tokens · MTD"
              value={fmtTokens(totalTokensThisMonth)}
              hint={`${fmtTokens(current.totalPromptTokens)} in / ${fmtTokens(current.totalCompletionTokens)} out`}
            />
            <MetricCard
              label="Runs · MTD"
              value={String(current.totalRuns)}
              hint="all agents"
            />
          </div>
        )}
      </Section>

      <Section
        eyebrow="By agent"
        title="This month's breakdown"
        description="Live per-agent roll-up from the run audit log."
      >
        {breakdown.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No agent runs this month.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Agent</th>
                  <th className="text-right px-3 py-2">Runs</th>
                  <th className="text-right px-3 py-2">Tokens</th>
                  <th className="text-right px-3 py-2">Cost</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {breakdown.map((b) => (
                  <tr key={b.assistantKey}>
                    <td className="px-3 py-2 text-ink-secondary">
                      {b.assistantKey.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                      {b.runs}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-tertiary">
                      {fmtTokens(b.totalTokens)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-tertiary">
                      {fmtUsd(b.costUsdMinor)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/dashboard/ai/runs?agent=${b.assistantKey}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Runs →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section eyebrow="History" title="Last 12 months">
        {history.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No history yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Month</th>
                  <th className="text-right px-3 py-2">Runs</th>
                  <th className="text-right px-3 py-2">Prompt tok</th>
                  <th className="text-right px-3 py-2">Completion tok</th>
                  <th className="text-right px-3 py-2">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {history.map((m) => (
                  <tr key={`${m.year}-${m.month}`}>
                    <td className="px-3 py-2 text-ink-secondary">
                      {MONTHS[m.month - 1] ?? m.month} {m.year}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                      {m.totalRuns}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-tertiary">
                      {fmtTokens(m.totalPromptTokens)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-tertiary">
                      {fmtTokens(m.totalCompletionTokens)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Badge tone="neutral">{fmtUsd(m.totalCostUsdMinor)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
