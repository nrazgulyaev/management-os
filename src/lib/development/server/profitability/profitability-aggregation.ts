import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  devBudgetLines,
  devCostCategories,
  devTransactions,
} from "@/lib/db/schema/dev-finance";
import { projects, villas } from "@/lib/db/schema/projects";
import { unitCostAllocations } from "@/lib/db/schema/profitability-cashflow";
import { residualInventoryUnits } from "@/lib/db/schema/residual-inventory";
import type { AllocationMethod } from "./profitability-helpers";
import { writeUnitAllocation } from "./profitability-actions";

/**
 * Stage 5.B.3 — Profitability cost-pool AGGREGATION engine.
 *
 * `recomputeUnitAllocation` is pure: it takes caller-supplied cost pools
 * (land / soft / marketing) + a saleable-asset list and writes one
 * `unit_cost_allocations` row per asset. Nothing rolled the source-of-truth
 * `dev_*` finance ledger into those pools — this module is that roll-up.
 *
 * Mapping (by ROOT cost-category code):
 *   - LAND                                  → land pool
 *   - DESIGN | PERMITS | OPERATIONS | OVERHEAD → soft-cost pool
 *   - CONSTRUCTION                          → hard-cost pool (per-asset)
 *   - MARKETING                             → marketing pool
 *   - INTEREST_EXPENSE | FX_LOSS            → financing pool
 *   - (sale_income / fee_income / …)        → ignored (revenue, not cost)
 *
 * The PLANNED basis is `dev_budget_lines.budgeted_amount_usd_minor`. When a
 * project has no budget rows we fall back to actual outflows in
 * `dev_transactions`. "Contingency used" is the positive overspend of
 * actual outflows beyond the planned budget (0 when on/under budget).
 *
 * Money is BIGINT minor units throughout; the math runs in `number` only
 * inside `recomputeUnitAllocation`'s helper (values are well under 2^53 for
 * realistic project sizes — a $100M project is 1e10 minor units).
 *
 * Idempotent: derived from source tables, re-runnable any time. Each run
 * writes fresh `is_current=true` allocations and demotes the prior ones
 * (handled atomically by `recomputeUnitAllocation`).
 */

/** Root category code → which cost pool the spend belongs to. */
type PoolKind = "land" | "soft" | "hard" | "marketing" | "financing" | "ignore";

function poolForRootCode(rootCode: string): PoolKind {
  switch (rootCode) {
    case "LAND":
      return "land";
    case "DESIGN":
    case "PERMITS":
    case "OPERATIONS":
    case "OVERHEAD":
      return "soft";
    case "CONSTRUCTION":
      return "hard";
    case "MARKETING":
      return "marketing";
    case "INTEREST_EXPENSE":
    case "FX_LOSS":
      return "financing";
    default:
      return "ignore";
  }
}

interface ProjectPools {
  land: bigint;
  soft: bigint;
  hard: bigint;
  marketing: bigint;
  financing: bigint;
  /** Positive overspend of actuals beyond planned budget (per project). */
  contingency: bigint;
}

function emptyPools(): ProjectPools {
  return {
    land: 0n,
    soft: 0n,
    hard: 0n,
    marketing: 0n,
    financing: 0n,
    contingency: 0n,
  };
}

interface SaleableAsset {
  assetId: string;
  sqm: number;
  expectedPrice: number;
  volume: number;
}

export interface ProjectAggregationResult {
  projectId: string;
  projectName: string;
  assetCount: number;
  allocationsWritten: number;
  pools: {
    landMinor: string;
    softMinor: string;
    hardMinor: string;
    marketingMinor: string;
    financingMinor: string;
    contingencyMinor: string;
  };
  allocationMethod: AllocationMethod;
  skippedReason?: string;
}

export interface AggregationRunResult {
  projectsScanned: number;
  projectsRecomputed: number;
  allocationsWritten: number;
  results: ProjectAggregationResult[];
}

/** Resolve, for each category id, the ROOT category code (walk parent). */
async function buildCategoryPoolMap(
  db: NonNullable<ReturnType<typeof getDb>>,
): Promise<Map<string, PoolKind>> {
  const cats = await db
    .select({
      id: devCostCategories.id,
      code: devCostCategories.categoryCode,
      parentId: devCostCategories.parentCategoryId,
    })
    .from(devCostCategories);

  const byId = new Map(cats.map((c) => [c.id, c]));
  const map = new Map<string, PoolKind>();
  for (const cat of cats) {
    // Walk up to the root (parent_category_id IS NULL). Guard against
    // cycles with a bounded loop.
    let cur: { id: string; code: string; parentId: string | null } | undefined =
      cat;
    let rootCode = cat.code;
    let guard = 0;
    while (cur?.parentId && guard < 16) {
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      rootCode = parent.code;
      cur = parent;
      guard += 1;
    }
    map.set(cat.id, poolForRootCode(rootCode));
  }
  return map;
}

/** Sum budgeted (current, non-superseded) lines per category for a project. */
async function loadBudgetByCategory(
  db: NonNullable<ReturnType<typeof getDb>>,
  projectId: string,
): Promise<Map<string, bigint>> {
  const rows = await db
    .select({
      categoryId: devBudgetLines.categoryId,
      total: sql<string>`coalesce(sum(${devBudgetLines.budgetedAmountUsdMinor}), 0)::text`,
    })
    .from(devBudgetLines)
    .where(
      and(
        eq(devBudgetLines.projectId, projectId),
        isNull(devBudgetLines.supersededAt),
      ),
    )
    .groupBy(devBudgetLines.categoryId);
  const out = new Map<string, bigint>();
  for (const r of rows) {
    if (r.categoryId) out.set(r.categoryId, BigInt(r.total));
  }
  return out;
}

/** Sum actual OUTFLOW transactions per category for a project. */
async function loadActualOutflowByCategory(
  db: NonNullable<ReturnType<typeof getDb>>,
  projectId: string,
): Promise<Map<string, bigint>> {
  const rows = await db
    .select({
      categoryId: devTransactions.categoryId,
      total: sql<string>`coalesce(sum(${devTransactions.amountUsdMinor}), 0)::text`,
    })
    .from(devTransactions)
    .where(
      and(
        eq(devTransactions.projectId, projectId),
        eq(devTransactions.direction, "outflow"),
        sql`${devTransactions.categoryId} IS NOT NULL`,
      ),
    )
    .groupBy(devTransactions.categoryId);
  const out = new Map<string, bigint>();
  for (const r of rows) {
    if (r.categoryId) out.set(r.categoryId, BigInt(r.total));
  }
  return out;
}

/**
 * Roll budget + actuals into the five cost pools using the category→pool
 * map. The planned basis is budget; when a project has no budget the actual
 * outflow stands in. Contingency = sum of positive per-category overspend
 * (actual − budget, floored at 0).
 */
function rollPools(
  poolMap: Map<string, PoolKind>,
  budgetByCat: Map<string, bigint>,
  actualByCat: Map<string, bigint>,
): ProjectPools {
  const pools = emptyPools();
  const categoryIds = new Set<string>([
    ...budgetByCat.keys(),
    ...actualByCat.keys(),
  ]);
  for (const catId of categoryIds) {
    const kind = poolMap.get(catId) ?? "ignore";
    if (kind === "ignore") continue;
    const budget = budgetByCat.get(catId) ?? 0n;
    const actual = actualByCat.get(catId) ?? 0n;
    // Planned pool = budget, falling back to actual when unbudgeted.
    const planned = budget > 0n ? budget : actual;
    const overspend = actual > budget ? actual - budget : 0n;
    pools[kind] += planned;
    pools.contingency += overspend;
  }
  return pools;
}

/**
 * Build the saleable-asset list for a project. Each asset needs sqm (floor
 * area), an expected sale price, and a volume metric. Expected price is
 * carried forward from the asset's current allocation, then residual
 * inventory list/market price, else 0.
 */
async function loadSaleableAssets(
  db: NonNullable<ReturnType<typeof getDb>>,
  projectId: string,
): Promise<SaleableAsset[]> {
  const rows = await db
    .select({
      id: villas.id,
      builtAreaSqm: villas.builtAreaSqm,
      currentExpected: unitCostAllocations.expectedSalePriceMinor,
      residualList: residualInventoryUnits.listPriceMinor,
      residualMarket: residualInventoryUnits.currentMarketValueMinor,
    })
    .from(villas)
    .leftJoin(
      unitCostAllocations,
      and(
        eq(unitCostAllocations.assetId, villas.id),
        eq(unitCostAllocations.isCurrent, true),
      ),
    )
    .leftJoin(
      residualInventoryUnits,
      eq(residualInventoryUnits.unitId, villas.id),
    )
    .where(eq(villas.projectId, projectId));

  return rows.map((r) => {
    const sqm = r.builtAreaSqm ? Number(r.builtAreaSqm) : 0;
    const expectedMinor =
      r.currentExpected ?? r.residualList ?? r.residualMarket ?? 0n;
    return {
      assetId: r.id,
      sqm,
      expectedPrice: Number(expectedMinor),
      // Volume proxy = floor area (m²) when no explicit volume is tracked;
      // only used when allocationMethod = by_volume.
      volume: sqm,
    };
  });
}

/** Pick the allocation method that the asset data can actually support. */
function pickMethod(assets: SaleableAsset[]): AllocationMethod {
  if (assets.some((a) => a.sqm > 0)) return "by_floor_area";
  if (assets.some((a) => a.expectedPrice > 0)) return "by_market_value";
  return "by_unit_count";
}

/**
 * Aggregate + recompute a single project's unit allocations. Returns a
 * structured summary even when skipped (no assets / no cost pools).
 */
export async function recomputeProjectProfitability(
  projectId: string,
  options?: { poolMap?: Map<string, PoolKind>; computedBy?: string | null },
): Promise<ProjectAggregationResult> {
  const db = getDb();
  if (!db) {
    return {
      projectId,
      projectName: projectId.slice(0, 8),
      assetCount: 0,
      allocationsWritten: 0,
      pools: zeroPools(),
      allocationMethod: "by_unit_count",
      skippedReason: "Database not configured.",
    };
  }

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const projectName = project?.name ?? projectId.slice(0, 8);

  const poolMap = options?.poolMap ?? (await buildCategoryPoolMap(db));
  const [budgetByCat, actualByCat, assets] = await Promise.all([
    loadBudgetByCategory(db, projectId),
    loadActualOutflowByCategory(db, projectId),
    loadSaleableAssets(db, projectId),
  ]);
  const pools = rollPools(poolMap, budgetByCat, actualByCat);

  const base: ProjectAggregationResult = {
    projectId,
    projectName,
    assetCount: assets.length,
    allocationsWritten: 0,
    pools: serializePools(pools),
    allocationMethod: "by_unit_count",
  };

  if (assets.length === 0) {
    return { ...base, skippedReason: "No saleable assets." };
  }
  const totalPool =
    pools.land + pools.soft + pools.hard + pools.marketing + pools.financing;
  if (totalPool === 0n) {
    return { ...base, skippedReason: "No cost pools (no budget or actuals)." };
  }

  const method = pickMethod(assets);

  // Hard cost is allocated per-asset by the same metric as the project
  // pools (it is project-shared construction spend, not asset-direct).
  const hardTotal = Number(pools.hard);
  const financingTotal = Number(pools.financing);
  const metricOf = (a: SaleableAsset): number => {
    switch (method) {
      case "by_floor_area":
        return a.sqm;
      case "by_market_value":
        return a.expectedPrice;
      case "by_volume":
        return a.volume;
      case "by_unit_count":
        return 1;
    }
  };
  const metricTotal = assets.reduce((acc, a) => acc + metricOf(a), 0);

  const allAssetsForCall = assets.map((a) => ({
    assetId: a.assetId,
    sqm: a.sqm,
    expectedPrice: a.expectedPrice,
    volume: a.volume,
  }));

  const computedBy = options?.computedBy ?? null;
  let written = 0;
  for (const asset of assets) {
    const share = metricTotal > 0 ? metricOf(asset) / metricTotal : 0;
    await writeUnitAllocation(
      {
        assetId: asset.assetId,
        projectId,
        projectTotalLandCost: Number(pools.land),
        projectTotalSoftCost: Number(pools.soft),
        projectTotalMarketingCost: Number(pools.marketing),
        allMarketingProjectAssets: allAssetsForCall,
        allocationMethod: method,
        // Construction spend that is not direct-to-asset is folded into the
        // per-asset hard-cost allocation by the project metric share.
        directCosts: 0,
        hardCostAllocated: Math.round(hardTotal * share),
        contingencyUsed: Math.round(Number(pools.contingency) * share),
        financingCost: Math.round(financingTotal * share),
        expectedSalePrice:
          asset.expectedPrice > 0 ? asset.expectedPrice : undefined,
        notes: "Aggregated from dev budget + actuals (profitability engine).",
      },
      computedBy,
    );
    written += 1;
  }

  return {
    ...base,
    allocationsWritten: written,
    allocationMethod: method,
  };
}

function zeroPools(): ProjectAggregationResult["pools"] {
  return {
    landMinor: "0",
    softMinor: "0",
    hardMinor: "0",
    marketingMinor: "0",
    financingMinor: "0",
    contingencyMinor: "0",
  };
}

function serializePools(p: ProjectPools): ProjectAggregationResult["pools"] {
  return {
    landMinor: p.land.toString(),
    softMinor: p.soft.toString(),
    hardMinor: p.hard.toString(),
    marketingMinor: p.marketing.toString(),
    financingMinor: p.financing.toString(),
    contingencyMinor: p.contingency.toString(),
  };
}

/**
 * Roll up + recompute EVERY non-archived project that has at least one
 * asset. Used by the weekly cron and the manual "Recompute" button.
 */
export async function recomputeAllProfitability(
  onProject?: (r: ProjectAggregationResult) => Promise<void> | void,
  computedBy: string | null = null,
  /**
   * Tenancy scope. Request/action callers pass a concrete org id so the
   * projects scan (and every per-project write) is confined to that tenant.
   * The all-orgs cron (`runDevOsProfitabilityRecompute`) passes `null` to
   * recompute every org. NEVER default this to a request org — the cron must
   * be able to run unscoped.
   */
  organizationId: string | null = null,
): Promise<AggregationRunResult> {
  const db = getDb();
  if (!db) {
    return {
      projectsScanned: 0,
      projectsRecomputed: 0,
      allocationsWritten: 0,
      results: [],
    };
  }

  const projectRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      organizationId
        ? and(
            sql`${projects.status} <> 'archived'`,
            eq(projects.organizationId, organizationId),
          )
        : sql`${projects.status} <> 'archived'`,
    );

  // Build the category→pool map once and reuse across projects.
  const poolMap = await buildCategoryPoolMap(db);

  const results: ProjectAggregationResult[] = [];
  let recomputed = 0;
  let written = 0;
  for (const p of projectRows) {
    const result = await recomputeProjectProfitability(p.id, {
      poolMap,
      computedBy,
    });
    results.push(result);
    if (result.allocationsWritten > 0) recomputed += 1;
    written += result.allocationsWritten;
    if (onProject) await onProject(result);
  }

  return {
    projectsScanned: projectRows.length,
    projectsRecomputed: recomputed,
    allocationsWritten: written,
    results,
  };
}
