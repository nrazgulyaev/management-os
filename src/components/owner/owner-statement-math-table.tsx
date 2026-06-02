"use client";

import * as React from "react";
import { WhyLink } from "@/components/owner-portal/why-link";
import { WhyDrawer } from "@/components/owner-portal/why-drawer";
import type { ViewGroup } from "@/features/owner-statements/detail-view";

/**
 * owner-02 — "How the math worked" table (FC-OWNER-STATEMENTS §3). Desktop
 * view: the six category buckets, one row per line, the first line of each
 * bucket carrying a "why this number?" link that opens the explainer drawer.
 * Bold net total row at the foot.
 */
export function OwnerStatementMathTable({
  groups,
  netText,
  metaText,
}: {
  groups: ViewGroup[];
  netText: string;
  metaText: string;
}) {
  const [whyKey, setWhyKey] = React.useState<string | null>(null);

  return (
    <div className="card statement-math overflow-hidden">
      <div className="px-6 py-[18px] border-b border-line-soft">
        <h3 className="text-display text-[20px] font-medium text-ink m-0">
          How the math worked
        </h3>
        <div className="font-mono text-[11px] text-ink-tertiary tracking-[0.06em] uppercase mt-1">
          {metaText}
        </div>
      </div>

      <table className="data">
        <thead>
          <tr>
            <th className="w-[130px]">Category</th>
            <th>Line</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((g) =>
            g.lines.map((l, i) => (
              <tr key={`${g.bucket}-${i}`}>
                <td>
                  <span className={`sec-pill ${g.pill}`}>{g.label}</span>
                </td>
                <td>
                  {l.bold ? (
                    <strong className="font-medium">{l.description}</strong>
                  ) : (
                    l.description
                  )}
                  {i === 0 && <WhyLink categoryKey={l.explainerKey} onOpen={setWhyKey} />}
                </td>
                <td className={`num ${l.positive ? "pos" : "neg"}`}>{l.amountText}</td>
              </tr>
            )),
          )}
          <tr className="math-net">
            <td colSpan={2}>
              <span className="math-net-label">Net to you</span>
            </td>
            <td className="num">
              <span className="math-net-value">{netText}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <WhyDrawer categoryKey={whyKey} onOpenChange={(open) => !open && setWhyKey(null)} />
    </div>
  );
}
