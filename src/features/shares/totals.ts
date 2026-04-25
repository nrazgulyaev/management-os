import type { OwnershipShareRow } from "@/features/owners/services";

/**
 * Aggregate active share percentages by villa and by project (pool).
 * Returns one entry per (villaId|projectId) plus a flag indicating whether
 * the total is invalid (>100% or NaN).
 */
export interface ShareTotal {
  scope: "villa" | "pool";
  scopeId: string;
  scopeLabel: string;
  totalPercent: number;
  /** True when totalPercent > 100 (with float tolerance). */
  exceedsHundred: boolean;
  /** True when 100 - totalPercent > 0.01 (rounded), i.e. unallocated. */
  underAllocated: boolean;
  shares: number;
}

export function computeShareTotals(rows: OwnershipShareRow[]): ShareTotal[] {
  const map = new Map<string, ShareTotal>();
  for (const r of rows) {
    if (r.status !== "active") continue;
    const key =
      (r.villaId ? `villa:${r.villaId}` : null) ??
      (r.projectId && r.model === "pooled" ? `pool:${r.projectId}` : null);
    if (!key) continue;
    const scope: "villa" | "pool" = key.startsWith("villa") ? "villa" : "pool";
    const scopeId = key.split(":")[1];
    const scopeLabel =
      scope === "villa"
        ? `Villa · ${r.villaCode ?? scopeId}`
        : `Pool · ${r.projectName ?? scopeId}`;

    const cur = map.get(key) ?? {
      scope,
      scopeId,
      scopeLabel,
      totalPercent: 0,
      exceedsHundred: false,
      underAllocated: false,
      shares: 0,
    };
    cur.totalPercent = round(cur.totalPercent + r.sharePercent);
    cur.shares += 1;
    map.set(key, cur);
  }
  for (const v of map.values()) {
    v.exceedsHundred = v.totalPercent > 100.01;
    v.underAllocated = v.totalPercent < 99.99;
  }
  return [...map.values()].sort((a, b) => b.totalPercent - a.totalPercent);
}

function round(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
