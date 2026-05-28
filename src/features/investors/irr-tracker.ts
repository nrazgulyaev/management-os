/**
 * Phase 2.4 dev-03 — IRR tracker (XIRR-style).
 *
 * Pure XIRR using Newton's method. Cashflows are signed (outflow
 * negative, inflow positive) with ISO dates. Returns null if the
 * series can't converge (no sign change, etc).
 *
 * Used by the irr-tracker agent + the LP detail card.
 */

export interface CashFlow {
  date: string;
  amount: number;
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

function npv(rate: number, flows: CashFlow[], anchor: Date): number {
  return flows.reduce((sum, f) => {
    const days = daysBetween(anchor, new Date(f.date + "T00:00:00Z"));
    return sum + f.amount / Math.pow(1 + rate, days / 365);
  }, 0);
}

function npvDerivative(rate: number, flows: CashFlow[], anchor: Date): number {
  return flows.reduce((sum, f) => {
    const days = daysBetween(anchor, new Date(f.date + "T00:00:00Z"));
    if (days === 0) return sum;
    return sum - (days / 365) * f.amount / Math.pow(1 + rate, days / 365 + 1);
  }, 0);
}

export function computeXIRR(flows: CashFlow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;
  const hasIn = flows.some((f) => f.amount > 0);
  const hasOut = flows.some((f) => f.amount < 0);
  if (!hasIn || !hasOut) return null;

  const anchor = new Date(flows[0].date + "T00:00:00Z");
  let rate = guess;
  for (let i = 0; i < 60; i++) {
    const val = npv(rate, flows, anchor);
    const d = npvDerivative(rate, flows, anchor);
    if (Math.abs(d) < 1e-12) return null;
    const next = rate - val / d;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - rate) < 1e-7) return next;
    rate = next;
  }
  return null;
}

export interface PositionKpis {
  moic: number;
  dpi: number;
  tvpi: number;
  irr: number | null;
}

export interface LpPositionInput {
  contributions: CashFlow[];
  distributions: CashFlow[];
  /** Current unrealised NAV. */
  navIdr: number;
  /** ISO date for NAV measurement. */
  navAt: string;
}

export function computePositionKpis(input: LpPositionInput): PositionKpis {
  const contributed = input.contributions.reduce((n, f) => n + Math.abs(f.amount), 0);
  const distributed = input.distributions.reduce((n, f) => n + f.amount, 0);
  const dpi = contributed > 0 ? distributed / contributed : 0;
  const tvpi = contributed > 0 ? (distributed + input.navIdr) / contributed : 0;
  const moic = tvpi;
  const flows: CashFlow[] = [
    ...input.contributions.map((c) => ({ ...c, amount: -Math.abs(c.amount) })),
    ...input.distributions,
    { date: input.navAt, amount: input.navIdr },
  ];
  const irr = computeXIRR(flows);
  return { moic, dpi, tvpi, irr };
}
