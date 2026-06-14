import Link from "next/link";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/ai">AI assistants</Link> /{" "}
            <span>Token usage</span>
          </div>
          <h1>AI token usage</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-workspace AI spend, token volume, and run counts — derived from
            the same audit log every agent writes to. Money is shown in USD.
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">This month</div>
        {!current ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No usage recorded yet for your workspace. The first agent run lands a
            row here automatically.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Spend · MTD"
              value={fmtUsd(current.totalCostUsdMinor)}
              sub={`${current.totalRuns} runs`}
            />
            <Kpi
              label="Spend · today"
              value={fmtUsd(current.todayCostUsdMinor)}
              sub={`${current.todayRuns} runs today`}
            />
            <Kpi
              label="Tokens · MTD"
              value={fmtTokens(totalTokensThisMonth)}
              sub={`${fmtTokens(current.totalPromptTokens)} in / ${fmtTokens(current.totalCompletionTokens)} out`}
            />
            <Kpi
              label="Runs · MTD"
              value={String(current.totalRuns)}
              sub="all agents"
            />
          </div>
        )}
      </div>

      <div>
        <div className="label mb-2.5">By agent</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Live per-agent roll-up from the run audit log.
        </p>
        {breakdown.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No agent runs this month.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col" className="num">Runs</th>
                  <th scope="col" className="num">Tokens</th>
                  <th scope="col" className="num">Cost</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b) => (
                  <tr key={b.assistantKey}>
                    <td className="row-title">
                      {b.assistantKey.replace(/_/g, " ")}
                    </td>
                    <td className="num tabular-nums">
                      {b.runs}
                    </td>
                    <td className="num tabular-nums text-ink-tertiary">
                      {fmtTokens(b.totalTokens)}
                    </td>
                    <td className="num tabular-nums text-ink-tertiary">
                      {fmtUsd(b.costUsdMinor)}
                    </td>
                    <td className="text-right">
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
      </div>

      <div>
        <div className="label mb-2.5">History</div>
        {history.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No history yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className="num">Runs</th>
                  <th scope="col" className="num">Prompt tok</th>
                  <th scope="col" className="num">Completion tok</th>
                  <th scope="col" className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {history.map((m) => (
                  <tr key={`${m.year}-${m.month}`}>
                    <td className="row-title">
                      {MONTHS[m.month - 1] ?? m.month} {m.year}
                    </td>
                    <td className="num tabular-nums">
                      {m.totalRuns}
                    </td>
                    <td className="num tabular-nums text-ink-tertiary">
                      {fmtTokens(m.totalPromptTokens)}
                    </td>
                    <td className="num tabular-nums text-ink-tertiary">
                      {fmtTokens(m.totalCompletionTokens)}
                    </td>
                    <td className="num tabular-nums">
                      <HandoffBadge tone="soft">{fmtUsd(m.totalCostUsdMinor)}</HandoffBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
