import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projects, villas } from "@/lib/db/schema/projects";
import {
  developmentProjectMeta,
  landPlots,
  projectPhases,
  unitDevelopmentMeta,
  unitTypes,
} from "@/lib/db/schema/development";
import {
  mockDevelopmentProjects,
  mockProjectHealth,
} from "@/lib/development/mock-data";
import type {
  DevelopmentProject,
  ProjectHealth,
} from "@/lib/development/types";
import type {
  BalanceInstallment,
  DevelopmentProjectDetail,
  DevelopmentProjectListItem,
  DevelopmentUnitRow,
  ProjectPhaseRow,
} from "@/lib/development/types/projects";

/**
 * Re-export shared types so existing server-side imports keep working.
 * Client components must import directly from
 * `@/lib/development/types/projects` to avoid pulling this module's
 * `server-only` guard into the client bundle.
 */
export type {
  BalanceInstallment,
  DevelopmentLandPlot,
  DevelopmentProjectDetail,
  DevelopmentProjectListItem,
  DevelopmentUnitRow,
  ProjectPhaseRow,
} from "@/lib/development/types/projects";

const SLUG_TO_MOCK = new Map(
  mockDevelopmentProjects.map((p) => [p.slug, p]),
);
const MOCK_HEALTH = new Map(
  mockProjectHealth.map((h) => [h.projectId, h]),
);

/**
 * Maps a Management OS `projects.status` value to the Development OS
 * lifecycle phase the UI uses for filtering / coloring.
 */
function mapProjectPhase(status: string): DevelopmentProject["phase"] {
  switch (status) {
    case "planning":
      return "permitting";
    case "under_construction":
      return "under_construction";
    case "active":
      return "managed";
    case "managed":
      return "managed";
    case "archived":
      return "archived";
    default:
      return "under_construction";
  }
}

/**
 * Best-effort risk read derived from phase + sales velocity. Replaced by
 * the AI Construction Analyst run in Stage 2.4.
 */
function riskFor(
  status: string,
  unitsSold: number,
  units: number,
): DevelopmentProject["aiRiskScore"] {
  if (status === "planning" && unitsSold === 0) return "high";
  if (units > 0 && unitsSold / units >= 0.5) return "low";
  return "medium";
}

function num(v: string | number | null | undefined, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  return typeof v === "string" ? Number(v) : v;
}

/**
 * Fetches all development projects, joining the `developmentProjectMeta`
 * extension and aggregating unit counts per project.
 *
 * Falls back to `mockDevelopmentProjects` when the DB is not configured —
 * keeps the dashboard usable in marketing/demo environments.
 */
export async function getDevelopmentProjects(): Promise<DevelopmentProjectListItem[]> {
  const db = getDb();
  if (!db) {
    return mockDevelopmentProjects.map((p) => ({
      ...p,
      realProjectId: p.id,
      source: "mock" as const,
    }));
  }

  // P116A — swallow missing-relation errors so the page renders mock data
  // when the development OS schema hasn't been applied to this DB.
  let rows;
  try {
    rows = await db
      .select({
        id: projects.id,
        slug: projects.slug,
        name: projects.name,
        location: projects.location,
        status: projects.status,
        meta: developmentProjectMeta,
      })
      .from(projects)
      .leftJoin(
        developmentProjectMeta,
        eq(developmentProjectMeta.projectId, projects.id),
      )
      .orderBy(projects.createdAt);
  } catch {
    return mockDevelopmentProjects.map((p) => ({
      ...p,
      realProjectId: p.id,
      source: "mock" as const,
    }));
  }

  if (rows.length === 0) {
    return mockDevelopmentProjects.map((p) => ({
      ...p,
      realProjectId: p.id,
      source: "mock" as const,
    }));
  }

  // Aggregate units per project in one round trip.
  let unitAgg: Array<{
    projectId: string | null;
    total: number;
    sold: number;
    avgProgress: string;
    costSum: string;
    targetSum: string;
  }> = [];
  try {
    unitAgg = await db
      .select({
        projectId: villas.projectId,
        total: sql<number>`count(*)`,
        sold: sql<number>`count(*) filter (where ${unitDevelopmentMeta.unitTypeFrozen} = true)`,
        avgProgress: sql<string>`coalesce(avg(${unitDevelopmentMeta.constructionProgressPercent})::numeric(5,2), 0)`,
        costSum: sql<string>`coalesce(sum(${unitDevelopmentMeta.costBasisMinor})::numeric, 0)`,
        targetSum: sql<string>`coalesce(sum(${unitDevelopmentMeta.targetSalePriceMinor})::numeric, 0)`,
      })
      .from(villas)
      .leftJoin(unitDevelopmentMeta, eq(unitDevelopmentMeta.villaId, villas.id))
      .groupBy(villas.projectId);
  } catch {
    unitAgg = [];
  }

  const aggByProject = new Map(unitAgg.map((a) => [a.projectId, a]));

  return rows.map<DevelopmentProjectListItem>((r) => {
    const agg = aggByProject.get(r.id);
    const totalUnits = Number(agg?.total ?? r.meta?.netSquareMeters ?? 0) || 0;
    const soldUnits = Number(agg?.sold ?? 0) || 0;
    const progressPct = num(agg?.avgProgress ?? "0");
    const costUsed = BigInt(Math.round(num(agg?.costSum ?? "0")));
    const totalBudget = BigInt(Math.round(num(agg?.targetSum ?? "0")));

    return {
      id: r.id,
      realProjectId: r.id,
      slug: r.slug,
      name: r.name,
      location: r.location,
      phase: mapProjectPhase(r.status),
      startDate:
        r.meta?.acquisitionDate ?? r.meta?.leaseStartDate ?? new Date().toISOString().slice(0, 10),
      expectedHandover: r.meta?.plannedHandoverDate ?? null,
      totalBudgetMinor: totalBudget,
      budgetUsedMinor: costUsed,
      currency: (r.meta?.projectCurrency as DevelopmentProject["currency"]) ?? "USD",
      units: totalUnits,
      unitsSold: soldUnits,
      constructionProgressPct: Math.round(progressPct),
      aiRiskScore: riskFor(r.status, soldUnits, totalUnits),
      nextMilestone: null,
      heroToken:
        SLUG_TO_MOCK.get(r.slug)?.heroToken ??
        "linear-gradient(180deg, rgba(14,59,46,0.1) 0%, rgba(14,59,46,0.45) 100%)",
      source: "db" as const,
    };
  });
}

export async function getDevelopmentProjectBySlug(
  slug: string,
): Promise<DevelopmentProjectDetail | null> {
  const all = await getDevelopmentProjects();
  const project = all.find((p) => p.slug === slug);
  if (!project) return null;

  const db = getDb();
  if (!db || project.source === "mock") {
    // Fallback synthetic detail derived from mock data.
    return {
      project,
      meta: {
        acquisitionMode: "leasehold",
        leaseTenureYears: 30,
        leaseStartDate: project.startDate,
        leaseEndDate: null,
        landAreaSqm: null,
        grossSquareMeters: null,
        netSquareMeters: null,
        acquisitionDate: project.startDate,
        plannedHandoverDate: project.expectedHandover,
        projectCurrency: project.currency,
        operationalCurrency: "IDR",
        notes: null,
      },
      phases: [],
      plots: [],
      units: [],
      source: "mock",
    };
  }

  const [metaRow] = await db
    .select()
    .from(developmentProjectMeta)
    .where(eq(developmentProjectMeta.projectId, project.realProjectId));

  const phaseRows = await db
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.projectId, project.realProjectId))
    .orderBy(projectPhases.plannedStartDate);

  const plotRows = await db
    .select()
    .from(landPlots)
    .where(eq(landPlots.projectId, project.realProjectId))
    .orderBy(landPlots.plotCode);

  const unitRows = await db
    .select({
      villaId: villas.id,
      unitCode: villas.unitCode,
      name: villas.name,
      bedrooms: villas.bedrooms,
      meta: unitDevelopmentMeta,
      typeName: unitTypes.name,
    })
    .from(villas)
    .leftJoin(unitDevelopmentMeta, eq(unitDevelopmentMeta.villaId, villas.id))
    .leftJoin(unitTypes, eq(unitTypes.id, unitDevelopmentMeta.unitTypeId))
    .where(eq(villas.projectId, project.realProjectId))
    .orderBy(villas.unitCode);

  return {
    project,
    meta: {
      acquisitionMode: metaRow?.acquisitionMode ?? "leasehold",
      leaseTenureYears: metaRow?.leaseTenureYears ?? null,
      leaseStartDate: metaRow?.leaseStartDate ?? null,
      leaseEndDate: metaRow?.leaseEndDate ?? null,
      landAreaSqm: metaRow?.landAreaSqm ? num(metaRow.landAreaSqm) : null,
      grossSquareMeters: metaRow?.grossSquareMeters
        ? num(metaRow.grossSquareMeters)
        : null,
      netSquareMeters: metaRow?.netSquareMeters
        ? num(metaRow.netSquareMeters)
        : null,
      acquisitionDate: metaRow?.acquisitionDate ?? null,
      plannedHandoverDate: metaRow?.plannedHandoverDate ?? null,
      projectCurrency: metaRow?.projectCurrency ?? "USD",
      operationalCurrency: metaRow?.operationalCurrency ?? "IDR",
      notes: metaRow?.notes ?? null,
    },
    phases: phaseRows.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      phaseType: p.phaseType,
      status: p.status,
      plannedStartDate: p.plannedStartDate,
      actualStartDate: p.actualStartDate,
      plannedEndDate: p.plannedEndDate,
      actualEndDate: p.actualEndDate,
      notes: p.notes,
    })),
    plots: plotRows.map((pl) => ({
      id: pl.id,
      plotCode: pl.plotCode,
      acquisitionMode: pl.acquisitionMode,
      ownerContactName: pl.ownerContactName,
      areaSqm: pl.areaSqm ? num(pl.areaSqm) : null,
      acquisitionDate: pl.acquisitionDate,
      purchasePriceMinor: pl.purchasePriceMinor,
      purchaseCurrency: pl.purchaseCurrency,
      upfrontAmountMinor: pl.upfrontAmountMinor,
      balanceInstallments: Array.isArray(pl.balanceInstallments)
        ? (pl.balanceInstallments as BalanceInstallment[])
        : [],
      leaseStartDate: pl.leaseStartDate,
      leaseEndDate: pl.leaseEndDate,
      notes: pl.notes,
    })),
    units: unitRows.map<DevelopmentUnitRow>((u) => ({
      villaId: u.villaId,
      unitCode: u.unitCode,
      name: u.name,
      bedrooms: u.bedrooms,
      unitTypeId: u.meta?.unitTypeId ?? null,
      unitTypeName: u.typeName ?? null,
      unitCategory: u.meta?.unitCategory ?? "villa",
      constructionStatus: u.meta?.constructionStatus ?? "planning",
      constructionProgressPercent: num(u.meta?.constructionProgressPercent ?? "0"),
      locationCoefficient: num(u.meta?.locationCoefficient ?? "1"),
      locationDescription: u.meta?.locationDescription ?? null,
      costBasisMinor: u.meta?.costBasisMinor ?? null,
      costBasisCurrency: u.meta?.costBasisCurrency ?? null,
      targetSalePriceMinor: u.meta?.targetSalePriceMinor ?? null,
      targetSaleCurrency: u.meta?.targetSaleCurrency ?? null,
      currentMarketPriceMinor: u.meta?.currentMarketPriceMinor ?? null,
      currentMarketCurrency: u.meta?.currentMarketCurrency ?? null,
      contractPriceMinor: u.meta?.contractPriceMinor ?? null,
      contractCurrency: u.meta?.contractCurrency ?? null,
      unitTypeFrozen: u.meta?.unitTypeFrozen ?? false,
      isSold: u.meta?.unitTypeFrozen ?? false,
    })),
    source: "db",
  };
}

export async function getProjectPhases(projectId: string): Promise<ProjectPhaseRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(projectPhases.plannedStartDate);
  return rows.map((p) => ({
    id: p.id,
    projectId: p.projectId,
    phaseType: p.phaseType,
    status: p.status,
    plannedStartDate: p.plannedStartDate,
    actualStartDate: p.actualStartDate,
    plannedEndDate: p.plannedEndDate,
    actualEndDate: p.actualEndDate,
    notes: p.notes,
  }));
}

/** Project-health snapshot. Mock for 2.1; populated by 2.4 site-report intel. */
export function getProjectHealth(projectSlug: string): ProjectHealth | undefined {
  const mockId =
    SLUG_TO_MOCK.get(projectSlug)?.id ?? `dev-${projectSlug}`;
  return MOCK_HEALTH.get(mockId);
}

/** Read a project by uuid. Used by the [id] route, where `id` is the uuid. */
export async function getDevelopmentProjectById(
  id: string,
): Promise<DevelopmentProjectDetail | null> {
  const all = await getDevelopmentProjects();
  const match = all.find((p) => p.realProjectId === id);
  if (!match) return null;
  return getDevelopmentProjectBySlug(match.slug);
}

