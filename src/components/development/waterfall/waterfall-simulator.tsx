"use client";

import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  computeWaterfallAllocation,
  type WaterfallRuleType,
} from "@/lib/development/server/waterfall/waterfall-helpers";

/**
 * Interactive waterfall simulator. Operator types the scenario inputs;
 * the pure helper runs entirely client-side (no network round-trip),
 * and the allocation + reasoning markdown render live.
 *
 * Imports the pure helper directly — it carries no `server-only` guard
 * and no DB imports, so it bundles cleanly into the client.
 */

const RULE_TYPES: Array<{ value: WaterfallRuleType; label: string }> = [
  { value: "generic_50_50", label: "Generic 50/50" },
  { value: "arconique_25_credit", label: "Arconique 25% credit" },
  { value: "preferred_return_then_split", label: "Preferred return → split" },
  { value: "waterfall_with_hurdle", label: "Waterfall with hurdle" },
  { value: "capital_first_then_split", label: "Capital first → split" },
  { value: "tiered_promote", label: "Tiered promote" },
];

export function WaterfallSimulator() {
  const [ruleType, setRuleType] = useState<WaterfallRuleType>(
    "arconique_25_credit",
  );
  const [totalDist, setTotalDist] = useState("4000");
  const [arcCap, setArcCap] = useState("1000");
  const [arcReturned, setArcReturned] = useState("0");
  const [invCap, setInvCap] = useState("1000");
  const [invReturned, setInvReturned] = useState("0");
  const [creditPct, setCreditPct] = useState("25");
  const [prefPct, setPrefPct] = useState("8");
  const [splitAfter, setSplitAfter] = useState("50");

  const result = useMemo(() => {
    try {
      const params: Record<string, unknown> = {};
      if (ruleType === "arconique_25_credit") {
        params.credit_percentage = Number(creditPct);
      } else if (ruleType === "preferred_return_then_split") {
        params.preferred_return_pct = Number(prefPct);
        params.split_after = Number(splitAfter);
      } else if (ruleType === "capital_first_then_split") {
        params.split_after_capital = Number(splitAfter);
      } else if (ruleType === "tiered_promote") {
        params.tiers = [
          { up_to_irr: 8, split: 100 },
          { up_to_irr: 15, split: 80 },
          { above: 15, split: 60 },
        ];
      } else if (ruleType === "waterfall_with_hurdle") {
        params.hurdle_irr = 12;
        params.below_split = 70;
        params.above_split = 50;
      }
      return computeWaterfallAllocation({
        totalDistributable: Number(totalDist) * 100, // major → minor
        arconiqueCapitalContributed: Number(arcCap) * 100,
        arconiqueCapitalReturned: Number(arcReturned) * 100,
        investorCapitalContributed: Number(invCap) * 100,
        investorCapitalReturned: Number(invReturned) * 100,
        cumulativeProfitDistributed: 0,
        ruleType,
        ruleParameters: params,
      });
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "compute failed",
      };
    }
  }, [
    ruleType,
    totalDist,
    arcCap,
    arcReturned,
    invCap,
    invReturned,
    creditPct,
    prefPct,
    splitAfter,
  ]);

  function money(minor: number): string {
    return `$${(minor / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-md border border-line-soft bg-surface p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-ink-secondary" />
          <h4 className="text-sm font-medium">Inputs</h4>
        </div>

        <label className="block text-sm">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Rule type
          </span>
          <select
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as WaterfallRuleType)}
            className="mt-1 block w-full rounded border border-line-soft p-1.5 text-sm"
          >
            {RULE_TYPES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <NumInput
            label="Total distributable ($, major)"
            value={totalDist}
            onChange={setTotalDist}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumInput
            label="Arconique cap. contributed"
            value={arcCap}
            onChange={setArcCap}
          />
          <NumInput
            label="Arconique cap. returned"
            value={arcReturned}
            onChange={setArcReturned}
          />
          <NumInput
            label="Investor cap. contributed"
            value={invCap}
            onChange={setInvCap}
          />
          <NumInput
            label="Investor cap. returned"
            value={invReturned}
            onChange={setInvReturned}
          />
        </div>

        {ruleType === "arconique_25_credit" && (
          <NumInput
            label="Credit % (default 25)"
            value={creditPct}
            onChange={setCreditPct}
          />
        )}
        {ruleType === "preferred_return_then_split" && (
          <div className="grid grid-cols-2 gap-2">
            <NumInput
              label="Pref return % / yr"
              value={prefPct}
              onChange={setPrefPct}
            />
            <NumInput
              label="Investor split %"
              value={splitAfter}
              onChange={setSplitAfter}
            />
          </div>
        )}
        {ruleType === "capital_first_then_split" && (
          <NumInput
            label="Investor split % after capital"
            value={splitAfter}
            onChange={setSplitAfter}
          />
        )}
      </div>

      <div className="rounded-md border border-line-soft bg-surface p-4 space-y-3">
        <h4 className="text-sm font-medium">Allocation</h4>
        {"error" in result ? (
          <p className="text-sm text-danger">{result.error}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded border border-line-soft p-3">
                <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                  Arconique
                </div>
                <div className="text-lg font-mono">
                  {money(result.arconiqueAllocation.total)}
                </div>
                <div className="text-[11px] text-ink-tertiary mt-1">
                  capital {money(result.arconiqueAllocation.capitalReturn)} ·
                  profit {money(result.arconiqueAllocation.profitShare)} ·
                  credit {money(result.arconiqueAllocation.economicCredit)}
                </div>
              </div>
              <div className="rounded border border-line-soft p-3">
                <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                  Investor
                </div>
                <div className="text-lg font-mono">
                  {money(result.investorAllocation.total)}
                </div>
                <div className="text-[11px] text-ink-tertiary mt-1">
                  capital {money(result.investorAllocation.capitalReturn)} ·
                  profit {money(result.investorAllocation.profitShare)}
                </div>
              </div>
            </div>
            <Badge tone="info">{result.appliedRule}</Badge>
            <pre className="text-[11px] text-ink-secondary whitespace-pre-wrap font-sans border-t border-line-soft pt-2">
              {result.reasoning}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded border border-line-soft p-1.5 text-sm font-mono"
      />
    </label>
  );
}
