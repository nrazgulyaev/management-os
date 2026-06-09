"use client";

/**
 * W1a — Fund waterfall + capital-call panel.
 *
 * Mounts two previously-orphaned tools over real fund/LP data:
 *   1. an interactive European distribution waterfall fed by the
 *      canonical `runWaterfall()` (DistributionPreviewWaterfall);
 *   2. the pro-rata `CapitalCallModal`, wired to the new
 *      `issueCapitalCallAction` server action.
 *
 * Money is carried as USD MINOR units (cents) for the waterfall math so
 * the canonical calculator's integer pro-rata stays exact; the capital
 * call total is entered in whole USD and converted to cents at issue.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DistributionPreviewWaterfall } from "@/components/investors/distribution-preview-waterfall";
import { CapitalCallModal } from "@/components/investors/capital-call-modal";
import { runWaterfall } from "@/features/investors/waterfall-calculator";
import type { CapitalCallDraft } from "@/features/investors/capital-call-issuer";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import { issueCapitalCallAction } from "@/lib/development/server/capital-call-actions";

export interface FundLpForClient {
  commitmentId: string;
  investorId: string;
  investorCode: string;
  investorLegalName: string;
  committedUsdMinor: string;
  contributedUsdMinor: string;
  pctOfFund: number;
}

export interface FundForClient {
  projectId: string;
  projectName: string;
  projectSlug: string | null;
  totalCommittedUsdMinor: string;
  totalContributedUsdMinor: string;
  lpCount: number;
  lps: FundLpForClient[];
}

export interface FundWaterfallPanelProps {
  funds: FundForClient[];
}

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function FundWaterfallPanel({ funds }: FundWaterfallPanelProps) {
  const router = useRouter();
  const [fundId, setFundId] = React.useState(funds[0]?.projectId ?? "");
  const fund = React.useMemo(
    () => funds.find((f) => f.projectId === fundId) ?? funds[0],
    [funds, fundId],
  );

  // Waterfall inputs (proceeds in whole USD; pref/carry in %).
  const [proceedsUsd, setProceedsUsd] = React.useState<number>(0);
  const [prefReturnPct, setPrefReturnPct] = React.useState<number>(8);
  const [carrySplitPct, setCarrySplitPct] = React.useState<number>(20);
  const [holdYears, setHoldYears] = React.useState<number>(1);

  // Capital-call modal.
  const [callOpen, setCallOpen] = React.useState(false);
  const [issuing, setIssuing] = React.useState(false);
  const [issueError, setIssueError] = React.useState<string | null>(null);
  const [lastIssuedRef, setLastIssuedRef] = React.useState<string | null>(null);

  if (!fund) {
    return (
      <Section eyebrow="Waterfall" title="Distribution waterfall">
        <p className="text-sm text-ink-secondary">
          No funds with active commitments yet. Add a commitment to a project
          to model distributions and issue capital calls.
        </p>
      </Section>
    );
  }

  // Build the waterfall input in USD MINOR units (cents). Contributed
  // capital comes from received drawdowns; fall back to committed when
  // nothing has been drawn yet so the chart is still meaningful.
  const totalContributedCents = BigInt(fund.totalContributedUsdMinor);
  const totalCommittedCents = BigInt(fund.totalCommittedUsdMinor);
  const useCommittedBasis = totalContributedCents === 0n;

  const lpsForMath = fund.lps.map((l) => {
    const contributed = useCommittedBasis
      ? Number(BigInt(l.committedUsdMinor))
      : Number(BigInt(l.contributedUsdMinor));
    return {
      lpId: l.investorId,
      pctOfFund: l.pctOfFund,
      contributedIdr: contributed,
    };
  });

  const result = runWaterfall({
    params: {
      fundId: fund.projectId,
      mgmtFeePct: 0,
      prefReturnPct: clampPct(prefReturnPct),
      catchUpPct: 100,
      carrySplitPct: clampPct(carrySplitPct),
    },
    proceedsIdr: Math.round(proceedsUsd * 100), // whole USD → cents
    holdYears: Math.max(0, holdYears),
    lps: lpsForMath,
  });

  const lpNameById = new Map(
    fund.lps.map((l) => [l.investorId, l.investorLegalName]),
  );

  // runWaterfall builds its KPI strings as raw localized cents
  // (.toLocaleString()), which the shared DistributionPreviewWaterfall then
  // renders verbatim. Re-format the three MONEY KPIs (Proceeds, LPs, GP)
  // through formatUsdMinor so they match the "$1,234.56" formatting used by
  // the LP distribution table below; "Carry split" is already a percentage
  // and is passed through untouched. We derive the raw cent values from the
  // canonical result fields rather than re-parsing the localized strings.
  const lpTotalCents = result.lpDistributions.reduce(
    (n, d) => n + d.amount,
    0,
  );
  const moneyKpiLabels = new Set(["Proceeds", "LPs", "GP"]);
  const formattedKpis = result.kpis.map((k) => {
    if (!moneyKpiLabels.has(k.label)) return k;
    const cents =
      k.label === "Proceeds"
        ? Math.round(proceedsUsd * 100)
        : k.label === "LPs"
        ? lpTotalCents
        : result.gpTotal;
    return { label: k.label, value: formatUsdMinor(cents) };
  });

  // Capital-call modal expects { lpId, lpName, pctOfFund }. Collapse to
  // one entry per investor (the modal's preview is keyed by lpId).
  const callLps = Array.from(
    fund.lps
      .reduce((m, l) => {
        const prev = m.get(l.investorId);
        m.set(l.investorId, {
          lpId: l.investorId,
          lpName: l.investorLegalName,
          pctOfFund: (prev?.pctOfFund ?? 0) + l.pctOfFund,
        });
        return m;
      }, new Map<string, { lpId: string; lpName: string; pctOfFund: number }>())
      .values(),
  );

  const nextCallNumber = 1; // server re-derives the authoritative number

  async function handleIssue(draft: CapitalCallDraft) {
    setIssuing(true);
    setIssueError(null);
    try {
      // The modal collects the total in whole units; treat it as USD and
      // convert to cents for the server (which re-derives the pro-rata).
      const totalUsdMinor = String(Math.round(draft.totalUsd * 100));
      const res = await issueCapitalCallAction({
        projectId: fund!.projectId,
        totalUsdMinor,
        kind: "construction_milestone",
        purpose: draft.purpose,
        noticeAt: draft.noticeAt.slice(0, 10),
        dueAt: draft.dueAt.slice(0, 10),
      });
      setLastIssuedRef(res.ref);
      setCallOpen(false);
      router.refresh();
    } catch (err) {
      setIssueError(
        err instanceof Error ? err.message : "Failed to issue capital call.",
      );
      throw err; // keep the modal open so the user can retry
    } finally {
      setIssuing(false);
    }
  }

  return (
    <>
      <Section
        eyebrow="Model"
        title="Distribution waterfall"
        description="European 4-tier waterfall (return of capital → pref → GP catch-up → carry), pro-rata across LPs by committed share. Math is canonical and server-defined; this is a what-if preview only."
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="field">
            <span className="field-label">Fund (project)</span>
            <select
              className="input"
              value={fund.projectId}
              onChange={(e) => {
                setFundId(e.target.value);
                setLastIssuedRef(null);
                setIssueError(null);
              }}
            >
              {funds.map((f) => (
                <option key={f.projectId} value={f.projectId}>
                  {f.projectName} ({f.lpCount} LP{f.lpCount === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Proceeds (USD)</span>
            <input
              className="input"
              type="number"
              min={0}
              step={1000}
              value={proceedsUsd}
              onChange={(e) => setProceedsUsd(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="field-label">Pref return %</span>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={prefReturnPct}
              onChange={(e) => setPrefReturnPct(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="field-label">Carry to GP %</span>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              step={1}
              value={carrySplitPct}
              onChange={(e) => setCarrySplitPct(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
          <Badge tone="neutral">
            Committed {formatUsdMinor(totalCommittedCents)}
          </Badge>
          <Badge tone="neutral">
            Contributed {formatUsdMinor(totalContributedCents)}
          </Badge>
          <Badge tone="neutral">{fund.lpCount} LPs</Badge>
          <label className="ml-auto flex items-center gap-2">
            <span>Hold years</span>
            <input
              className="input w-20"
              type="number"
              min={0}
              step={0.5}
              value={holdYears}
              onChange={(e) => setHoldYears(Number(e.target.value))}
            />
          </label>
        </div>

        {proceedsUsd > 0 ? (
          <>
            <DistributionPreviewWaterfall
              result={{ ...result, kpis: formattedKpis }}
              unit="USD cents"
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-tertiary">
                    <th className="py-2 pr-4">LP</th>
                    <th className="py-2 pr-4">% of fund</th>
                    <th className="py-2 text-right">Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lpDistributions.map((d) => (
                    <tr key={d.lpId} className="border-t border-line-soft">
                      <td className="py-2 pr-4 font-medium">
                        {lpNameById.get(d.lpId) ?? d.lpId}
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-ink-secondary">
                        {(
                          fund.lps.find((l) => l.investorId === d.lpId)
                            ?.pctOfFund ?? 0
                        ).toFixed(2)}
                        %
                      </td>
                      <td className="py-2 text-right tabular-nums font-mono">
                        {formatUsdMinor(d.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-line-soft">
                    <td className="py-2 pr-4 font-semibold">GP carry + catch-up</td>
                    <td className="py-2 pr-4 text-ink-secondary">
                      {clampPct(carrySplitPct).toFixed(0)}%
                    </td>
                    <td className="py-2 text-right tabular-nums font-mono font-semibold">
                      {formatUsdMinor(result.gpTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-secondary">
            Enter a proceeds amount to preview the distribution waterfall.
          </p>
        )}
      </Section>

      <Section
        eyebrow="Issue"
        title="Capital call"
        description="Draft a pro-rata capital call across this fund's LPs by committed share. Issuing writes the call and per-LP allocations and is logged."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setIssueError(null);
              setCallOpen(true);
            }}
            disabled={callLps.length === 0}
          >
            Issue capital call
          </button>
          {callLps.length === 0 && (
            <span className="text-sm text-ink-secondary">
              No LPs on this fund to call.
            </span>
          )}
          {lastIssuedRef && (
            <Badge tone="success">Issued {lastIssuedRef}</Badge>
          )}
          {issueError && <Badge tone="warning">{issueError}</Badge>}
        </div>
      </Section>

      <CapitalCallModal
        open={callOpen}
        onOpenChange={(o) => {
          if (!issuing) setCallOpen(o);
        }}
        fundId={fund.projectId}
        fundName={fund.projectName}
        number={nextCallNumber}
        lps={callLps}
        onIssue={handleIssue}
      />
    </>
  );
}
