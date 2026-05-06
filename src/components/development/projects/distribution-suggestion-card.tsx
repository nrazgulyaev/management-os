"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  requestDistributionSuggestion,
  approveDistributionSuggestion,
  rejectDistributionSuggestion,
  regenerateSuggestion,
} from "@/lib/development/server/distribution-suggestion-actions";

/**
 * HITL inline card for the Distribution Preview agent on a project's
 * Capital tab. Three states: no suggestion, draft suggestion (with
 * full action set), or — implicitly — suggestion already declared
 * (renders nothing; the declared distribution shows in the existing
 * distributions table).
 */

const CONFIDENCE_TONE = {
  low: "warning",
  medium: "info",
  high: "success",
} as const;

const TYPE_LABEL = {
  capital_return: "Capital return",
  profit_distribution: "Profit distribution",
  mixed: "Mixed",
  none: "No distribution",
} as const;

export interface SuggestionProp {
  id: string;
  status: "draft" | "reviewed";
  suggestedAmountUsdMinor: string;
  suggestedDistributionType:
    | "capital_return"
    | "profit_distribution"
    | "mixed"
    | "none";
  suggestedEffectiveDate: string;
  currentProjectBalanceUsdMinor: string;
  currentCompanyBalanceUsdMinor: string;
  bufferAmountUsdMinor: string;
  outstandingCapitalUsdMinor: string;
  outstandingCommitmentsUsdMinor: string;
  netCashFlow90dUsdMinor: string;
  isSelfSustaining: boolean;
  reasoning: string;
  confidenceLevel: "low" | "medium" | "high";
  riskFactors: string[] | null;
  recommendations: string[] | null;
  allocationPreview: Array<{
    commitmentCode: string;
    investorLegalName: string;
    capitalReturnAmountUsdMinor: string;
    profitAmountUsdMinor: string;
    totalAmountUsdMinor: string;
  }>;
  generatedAt: Date | string;
}

function fmtUsdMinor(s: string | number | bigint): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return "—";
  return `$${(n / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function DistributionSuggestionCard({
  projectId,
  isSelfSustaining,
  suggestion,
}: {
  projectId: string;
  isSelfSustaining: boolean;
  suggestion: SuggestionProp | null;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState<string>(
    suggestion ? String(Number(suggestion.suggestedAmountUsdMinor) / 100) : "",
  );
  const [type, setType] = useState<
    "capital_return" | "profit_distribution" | "mixed"
  >(
    suggestion && suggestion.suggestedDistributionType !== "none"
      ? suggestion.suggestedDistributionType
      : "capital_return",
  );
  const [effectiveDate, setEffectiveDate] = useState(
    suggestion?.suggestedEffectiveDate ??
      new Date().toISOString().slice(0, 10),
  );
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!suggestion) {
    return (
      <div className="rounded-md border border-line-soft bg-surface p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">AI distribution suggestion</h4>
          {!isSelfSustaining && (
            <Badge tone="warning">Not self-sustaining</Badge>
          )}
        </div>
        <p className="text-xs text-ink-secondary">
          Ask the AI to suggest whether and how much to distribute. The
          suggestion lands as a draft for your review — nothing is
          declared automatically.
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const out = await requestDistributionSuggestion({
                projectId,
                triggeredBy: "manual_request",
              });
              if (
                out.status === "failed" ||
                out.status === "budget_exceeded"
              ) {
                setError(out.errorMessage ?? "Generation failed");
              }
            });
          }}
        >
          {pending ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <Sparkles className="w-3 h-3 mr-1" />
          )}
          Request AI suggestion
        </Button>
      </div>
    );
  }

  const noDistribution =
    suggestion.suggestedDistributionType === "none" ||
    Number(suggestion.suggestedAmountUsdMinor) === 0;

  return (
    <div className="rounded-md border border-line-soft bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium">AI distribution suggestion</h4>
          <Badge tone={CONFIDENCE_TONE[suggestion.confidenceLevel]}>
            Confidence: {suggestion.confidenceLevel}
          </Badge>
          {!suggestion.isSelfSustaining && (
            <Badge tone="warning">Not self-sustaining</Badge>
          )}
        </div>
        <span className="text-[11px] text-ink-tertiary">
          {new Date(suggestion.generatedAt).toLocaleString()}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Suggested amount
          </div>
          <div className="text-2xl font-semibold mt-1">
            {fmtUsdMinor(suggestion.suggestedAmountUsdMinor)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Type
          </div>
          <div className="mt-1">
            {TYPE_LABEL[suggestion.suggestedDistributionType]}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Effective
          </div>
          <div className="mt-1">{suggestion.suggestedEffectiveDate}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-ink-secondary border-t border-line-soft pt-3">
        <Stat label="Project balance" value={fmtUsdMinor(suggestion.currentProjectBalanceUsdMinor)} />
        <Stat label="Buffer (6mo)" value={fmtUsdMinor(suggestion.bufferAmountUsdMinor)} />
        <Stat label="Outstanding capital" value={fmtUsdMinor(suggestion.outstandingCapitalUsdMinor)} />
        <Stat label="Net 90d cash flow" value={fmtUsdMinor(suggestion.netCashFlow90dUsdMinor)} />
      </div>

      <div className="text-sm text-ink whitespace-pre-wrap border-t border-line-soft pt-3">
        {suggestion.reasoning}
      </div>

      {suggestion.riskFactors && suggestion.riskFactors.length > 0 && (
        <div>
          <h5 className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-1">
            Risk factors
          </h5>
          <ul className="text-xs text-ink-secondary space-y-0.5">
            {suggestion.riskFactors.map((r, i) => (
              <li key={i} className="flex gap-1">
                <span className="text-warning">·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestion.recommendations && suggestion.recommendations.length > 0 && (
        <div>
          <h5 className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-1">
            Recommendations
          </h5>
          <ul className="text-xs text-ink-secondary space-y-0.5">
            {suggestion.recommendations.map((r, i) => (
              <li key={i} className="flex gap-1">
                <span>·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestion.allocationPreview.length > 0 && (
        <div className="border-t border-line-soft pt-3">
          <h5 className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-2">
            Allocation preview ({suggestion.allocationPreview.length} commitments)
          </h5>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-tertiary text-left">
                  <th className="py-1">Commitment</th>
                  <th>Investor</th>
                  <th className="text-right">Capital return</th>
                  <th className="text-right">Profit</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {suggestion.allocationPreview.map((a) => (
                  <tr key={a.commitmentCode} className="border-t border-line-soft">
                    <td className="py-1 font-mono">{a.commitmentCode}</td>
                    <td>{a.investorLegalName}</td>
                    <td className="text-right">{fmtUsdMinor(a.capitalReturnAmountUsdMinor)}</td>
                    <td className="text-right">{fmtUsdMinor(a.profitAmountUsdMinor)}</td>
                    <td className="text-right font-medium">
                      {fmtUsdMinor(a.totalAmountUsdMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      {editing && (
        <div className="border-t border-line-soft pt-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-tertiary">Amount (USD)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded border border-line-soft p-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-tertiary">Type</span>
              <select
                value={type}
                onChange={(e) =>
                  setType(
                    e.target.value as
                      | "capital_return"
                      | "profit_distribution"
                      | "mixed",
                  )
                }
                className="rounded border border-line-soft p-1.5 text-sm"
              >
                <option value="capital_return">Capital return</option>
                <option value="profit_distribution">Profit distribution</option>
                <option value="mixed">Mixed</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-tertiary">Effective date</span>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="rounded border border-line-soft p-1.5 text-sm"
              />
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-line-soft">
        {!editing && !noDistribution && (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await approveDistributionSuggestion({
                      suggestionId: suggestion.id,
                    });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Approve failed");
                  }
                });
              }}
            >
              Approve & declare distribution
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditing(true)}
            >
              Edit & approve
            </Button>
          </>
        )}
        {!editing && noDistribution && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setEditing(true)}
          >
            Override (declare anyway)
          </Button>
        )}
        {editing && (
          <>
            <Button
              size="sm"
              disabled={pending || Number(amount) <= 0}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    const minor = BigInt(
                      Math.round(Number(amount) * 100),
                    ).toString();
                    await approveDistributionSuggestion({
                      suggestionId: suggestion.id,
                      edits: {
                        amountUsdMinor: minor,
                        type,
                        effectiveDate,
                      },
                    });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Save failed");
                  }
                });
              }}
            >
              Save edits & declare
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await regenerateSuggestion({ suggestionId: suggestion.id });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Regenerate failed");
              }
            });
          }}
        >
          Regenerate
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowReject((v) => !v)}
        >
          Reject
        </Button>
        {showReject && (
          <div className="w-full mt-2 flex items-center gap-2">
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (required, ≥3 chars)"
              className="flex-1 rounded border border-line-soft p-2 text-sm"
            />
            <Button
              size="sm"
              disabled={pending || rejectReason.trim().length < 3}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await rejectDistributionSuggestion({
                      suggestionId: suggestion.id,
                      reason: rejectReason,
                    });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Reject failed");
                  }
                });
              }}
            >
              Confirm reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
