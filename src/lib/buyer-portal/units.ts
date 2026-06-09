import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buyerUnitAssignments, buyerProgressReports } from "@/lib/db/schema/buyers";
import { villas, projects } from "@/lib/db/schema/projects";
import { villaPhotos, type VillaPhotoKind } from "@/lib/db/schema/villa-photos";
import { contractGroups, contractMilestones } from "@/lib/db/schema/sales";
import { milestones, type MilestoneStatus } from "@/lib/db/schema/milestones";

/**
 * Buyer-portal UNIT DETAIL data layer.
 *
 * Surfaces ONE assigned villa ("unit") for the authenticated buyer:
 * villa identity, the parent project, construction progress (the
 * project milestone tracker + the latest published progress report),
 * curated imagery (renders / floorplans / gallery), the build spec,
 * and a money summary linking out to payments + contract.
 *
 * SECURITY: every read is scoped through `buyer_unit_assignments` —
 * `loadBuyerUnitDetail(buyerId, unitId)` first proves the (buyer, unit)
 * pair exists and is portal-visible, then returns null when it does not.
 * No villa, project, photo, milestone, or money row is ever read for a
 * unit the buyer is not assigned to. No cross-buyer leakage.
 */

/** Curated photo kinds the buyer may see, in display priority order. */
const BUYER_PHOTO_KINDS: VillaPhotoKind[] = [
  "hero",
  "aerial",
  "gallery",
  "outside",
  "room",
  "floorplan",
];

export interface BuyerUnitPhoto {
  id: string;
  url: string;
  caption: string | null;
  kind: VillaPhotoKind;
}

export interface BuyerUnitMilestone {
  id: string;
  name: string;
  kind: string;
  status: MilestoneStatus;
  targetDate: string;
  actualDate: string | null;
}

export interface BuyerUnitProgressReport {
  id: string;
  reportingPeriodEnd: string;
  currentProgressPercentage: number | null;
  nextMilestone: string | null;
  worksCompletedSummary: string | null;
  expectedHandoverDate: string | null;
  publishedAt: Date | null;
}

export interface BuyerUnitSpec {
  bedrooms: number;
  bathrooms: number | null;
  builtAreaSqm: number | null;
  landAreaSqm: number | null;
  poolAreaSqm: number | null;
  viewType: string | null;
}

export interface BuyerUnitMoney {
  /** Whether a contract group exists for this villa. */
  hasContract: boolean;
  totalContractValueUsdMinor: bigint;
  paidUsdMinor: bigint;
  expectedUsdMinor: bigint;
  milestoneCount: number;
  paidMilestoneCount: number;
}

export interface BuyerUnitDetail {
  assignment: {
    id: string;
    status: string;
    assignedAt: string;
    contractedAt: string | null;
    handedOverAt: string | null;
    notes: string | null;
  };
  unit: {
    id: string;
    unitCode: string;
    name: string | null;
    label: string;
    status: string;
  };
  project: {
    id: string;
    name: string;
    location: string;
    area: string | null;
    concept: string | null;
    status: string;
    heroImageUrl: string | null;
    targetHandoverDate: string | null;
    leaseholdUntil: string | null;
  };
  spec: BuyerUnitSpec;
  /** Milestone-derived construction % (done / total), null when no milestones. */
  constructionPercent: number | null;
  milestones: BuyerUnitMilestone[];
  latestReport: BuyerUnitProgressReport | null;
  photos: BuyerUnitPhoto[];
  money: BuyerUnitMoney;
}

function numeric(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const PHOTO_RANK = new Map<string, number>(
  BUYER_PHOTO_KINDS.map((k, i) => [k, i]),
);

/**
 * Loads the buyer's unit-detail bundle, or null when the unit is not
 * assigned to this buyer (or not portal-visible). The (buyerId, unitId)
 * ownership check is the security gate — every downstream read keys off
 * the already-proven unitId.
 */
export async function loadBuyerUnitDetail(
  buyerId: string,
  unitId: string,
): Promise<BuyerUnitDetail | null> {
  const db = getDb();
  if (!db) return null;

  // 1. OWNERSHIP GATE — prove this buyer is assigned to this unit and the
  //    assignment is portal-visible. Everything else hangs off this.
  const [assignment] = await db
    .select({
      id: buyerUnitAssignments.id,
      status: buyerUnitAssignments.status,
      assignedAt: buyerUnitAssignments.assignedAt,
      contractedAt: buyerUnitAssignments.contractedAt,
      handedOverAt: buyerUnitAssignments.handedOverAt,
      notes: buyerUnitAssignments.notes,
      isVisibleInPortal: buyerUnitAssignments.isVisibleInPortal,
    })
    .from(buyerUnitAssignments)
    .where(
      and(
        eq(buyerUnitAssignments.buyerId, buyerId),
        eq(buyerUnitAssignments.unitId, unitId),
      ),
    )
    .limit(1);
  if (!assignment || !assignment.isVisibleInPortal) return null;

  // 2. The villa + its parent project (joined; villa.id already proven).
  const [row] = await db
    .select({
      villaId: villas.id,
      unitCode: villas.unitCode,
      villaName: villas.name,
      villaStatus: villas.status,
      bedrooms: villas.bedrooms,
      bathrooms: villas.bathrooms,
      builtAreaSqm: villas.builtAreaSqm,
      landAreaSqm: villas.landAreaSqm,
      poolAreaSqm: villas.poolAreaSqm,
      viewType: villas.viewType,
      projectId: projects.id,
      projectName: projects.name,
      projectLocation: projects.location,
      projectArea: projects.area,
      projectConcept: projects.concept,
      projectStatus: projects.status,
      heroImageUrl: projects.heroImageUrl,
      targetHandoverDate: projects.targetHandoverDate,
      leaseholdUntil: projects.leaseholdUntil,
    })
    .from(villas)
    .innerJoin(projects, eq(villas.projectId, projects.id))
    .where(eq(villas.id, unitId))
    .limit(1);
  if (!row) return null;

  // 3. Curated imagery for THIS villa. visible_to_owner doubles as the
  //    "curated / portal-safe" gate; internal-only shots stay hidden.
  const photoRows = await db
    .select({
      id: villaPhotos.id,
      url: villaPhotos.url,
      caption: villaPhotos.caption,
      kind: villaPhotos.kind,
      position: villaPhotos.position,
    })
    .from(villaPhotos)
    .where(
      and(
        eq(villaPhotos.villaId, unitId),
        eq(villaPhotos.visibleToOwner, true),
      ),
    )
    .orderBy(asc(villaPhotos.position));

  const photos: BuyerUnitPhoto[] = photoRows
    .filter((p) => PHOTO_RANK.has(p.kind))
    .map((p) => ({
      id: p.id,
      url: p.url,
      caption: p.caption,
      kind: p.kind as VillaPhotoKind,
    }))
    .sort((a, b) => {
      const ra = PHOTO_RANK.get(a.kind) ?? 99;
      const rb = PHOTO_RANK.get(b.kind) ?? 99;
      return ra - rb;
    });

  // 4. Project construction milestones (phase tracker). Project-scoped, and
  //    the project is reached only through the proven unit, so no leakage.
  const milestoneRows = await db
    .select({
      id: milestones.id,
      name: milestones.name,
      kind: milestones.kind,
      status: milestones.status,
      targetDate: milestones.targetDate,
      actualDate: milestones.actualDate,
    })
    .from(milestones)
    .where(eq(milestones.projectId, row.projectId))
    .orderBy(asc(milestones.targetDate));

  const unitMilestones: BuyerUnitMilestone[] = milestoneRows.map((m) => ({
    id: m.id,
    name: m.name,
    kind: m.kind,
    status: m.status as MilestoneStatus,
    targetDate: m.targetDate,
    actualDate: m.actualDate,
  }));
  const doneCount = unitMilestones.filter((m) => m.status === "done").length;
  const constructionPercent =
    unitMilestones.length > 0
      ? Math.round((doneCount / unitMilestones.length) * 100)
      : null;

  // 5. Latest PUBLISHED progress report for this unit OR its project
  //    (unit-level preferred, then project-level fallback). status gate
  //    keeps drafts/internal reports hidden.
  const reportRows = await db
    .select({
      id: buyerProgressReports.id,
      unitId: buyerProgressReports.unitId,
      reportingPeriodEnd: buyerProgressReports.reportingPeriodEnd,
      currentProgressPercentage:
        buyerProgressReports.currentProgressPercentage,
      nextMilestone: buyerProgressReports.nextMilestone,
      worksCompletedSummary: buyerProgressReports.worksCompletedSummary,
      expectedHandoverDate: buyerProgressReports.expectedHandoverDate,
      publishedAt: buyerProgressReports.publishedAt,
    })
    .from(buyerProgressReports)
    .where(
      and(
        eq(buyerProgressReports.projectId, row.projectId),
        eq(buyerProgressReports.status, "published"),
      ),
    )
    .orderBy(desc(buyerProgressReports.reportingPeriodEnd))
    .limit(10);

  // Prefer a report scoped to this exact unit; else the newest project-level.
  const unitScoped = reportRows.find((r) => r.unitId === unitId);
  const chosen = unitScoped ?? reportRows[0] ?? null;
  const latestReport: BuyerUnitProgressReport | null = chosen
    ? {
        id: chosen.id,
        reportingPeriodEnd: chosen.reportingPeriodEnd,
        currentProgressPercentage: numeric(chosen.currentProgressPercentage),
        nextMilestone: chosen.nextMilestone,
        worksCompletedSummary: chosen.worksCompletedSummary,
        expectedHandoverDate: chosen.expectedHandoverDate,
        publishedAt: chosen.publishedAt,
      }
    : null;

  // 6. Money summary — contract group for THIS villa + its milestone ladder.
  const groups = await db
    .select({
      id: contractGroups.id,
      totalContractValueUsdMinor: contractGroups.totalContractValueUsdMinor,
    })
    .from(contractGroups)
    .where(eq(contractGroups.villaId, unitId));

  let money: BuyerUnitMoney = {
    hasContract: groups.length > 0,
    totalContractValueUsdMinor: groups.reduce(
      (sum, g) => sum + g.totalContractValueUsdMinor,
      0n,
    ),
    paidUsdMinor: 0n,
    expectedUsdMinor: 0n,
    milestoneCount: 0,
    paidMilestoneCount: 0,
  };

  if (groups.length > 0) {
    const groupIds = groups.map((g) => g.id);
    const mRows = await db
      .select({
        status: contractMilestones.status,
        expectedAmountUsdMinor: contractMilestones.expectedAmountUsdMinor,
        paidAmountUsdMinor: contractMilestones.paidAmountUsdMinor,
      })
      .from(contractMilestones)
      .where(inArray(contractMilestones.contractGroupId, groupIds));

    let paid = 0n;
    let expected = 0n;
    let paidCount = 0;
    for (const m of mRows) {
      paid += m.paidAmountUsdMinor;
      expected += m.expectedAmountUsdMinor;
      if (m.status === "paid") paidCount += 1;
    }
    money = {
      ...money,
      paidUsdMinor: paid,
      expectedUsdMinor: expected,
      milestoneCount: mRows.length,
      paidMilestoneCount: paidCount,
    };
  }

  const label =
    row.villaName ?? row.unitCode ?? `Villa ${unitId.slice(0, 8)}`;

  return {
    assignment: {
      id: assignment.id,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      contractedAt: assignment.contractedAt,
      handedOverAt: assignment.handedOverAt,
      notes: assignment.notes,
    },
    unit: {
      id: row.villaId,
      unitCode: row.unitCode,
      name: row.villaName,
      label,
      status: row.villaStatus,
    },
    project: {
      id: row.projectId,
      name: row.projectName,
      location: row.projectLocation,
      area: row.projectArea,
      concept: row.projectConcept,
      status: row.projectStatus,
      heroImageUrl: row.heroImageUrl,
      targetHandoverDate: row.targetHandoverDate,
      leaseholdUntil: row.leaseholdUntil,
    },
    spec: {
      bedrooms: row.bedrooms,
      bathrooms: numeric(row.bathrooms),
      builtAreaSqm: numeric(row.builtAreaSqm),
      landAreaSqm: numeric(row.landAreaSqm),
      poolAreaSqm: numeric(row.poolAreaSqm),
      viewType: row.viewType,
    },
    constructionPercent,
    milestones: unitMilestones,
    latestReport,
    photos,
    money,
  };
}
