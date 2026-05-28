/**
 * Phase 2.4 dev-03 — Capital call issuer.
 *
 * Pro-rata allocation across LPs with rounding pinned so the sum
 * always equals `totalIdr` exactly (no drift). Returns the notice
 * payload that the call-reminder agent later enqueues.
 */

export interface CapitalCallInput {
  fundId: string;
  number: number;
  totalIdr: number;
  purpose: string;
  noticeAt: string;
  dueAt: string;
  lps: { lpId: string; pctOfFund: number }[];
}

export interface CapitalCallAllocation {
  lpId: string;
  amount: number;
}

export interface CapitalCallDraft {
  fundId: string;
  number: number;
  totalIdr: number;
  purpose: string;
  noticeAt: string;
  dueAt: string;
  allocations: CapitalCallAllocation[];
  /** Sum across allocations — should equal totalIdr. */
  allocatedTotal: number;
}

export function draftCapitalCall(input: CapitalCallInput): CapitalCallDraft {
  const totalPct = input.lps.reduce((n, l) => n + l.pctOfFund, 0);
  const rough = input.lps.map((l) => ({
    lpId: l.lpId,
    raw: totalPct > 0 ? (input.totalIdr * l.pctOfFund) / totalPct : 0,
  }));
  const floored = rough.map((r) => ({ lpId: r.lpId, amount: Math.floor(r.raw) }));
  let drift = input.totalIdr - floored.reduce((n, r) => n + r.amount, 0);
  // Distribute drift to the LPs with the biggest fractional remainders.
  const orderedByFraction = rough
    .map((r, i) => ({ i, frac: r.raw - Math.floor(r.raw) }))
    .sort((a, b) => b.frac - a.frac);
  for (const o of orderedByFraction) {
    if (drift <= 0) break;
    floored[o.i].amount += 1;
    drift -= 1;
  }

  return {
    fundId: input.fundId,
    number: input.number,
    totalIdr: input.totalIdr,
    purpose: input.purpose,
    noticeAt: input.noticeAt,
    dueAt: input.dueAt,
    allocations: floored,
    allocatedTotal: floored.reduce((n, r) => n + r.amount, 0),
  };
}
