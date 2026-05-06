/**
 * Pure (non-server) shapes for the project workspace.
 *
 * Lives outside `src/lib/development/server/*` so client components can
 * import them without dragging the `import "server-only"` guard into the
 * client bundle.
 */

import type { DevelopmentProject } from "@/lib/development/types";

export interface DevelopmentProjectListItem extends DevelopmentProject {
  /** Backing `projects.id` (uuid). */
  realProjectId: string;
  /** Source signal — used by `<SourceBadge>` in the UI. */
  source: "db" | "mock";
}

export interface BalanceInstallment {
  amount: number;
  currency: string;
  dueDate: string;
  status: "pending" | "paid" | "overdue" | "waived";
  paidAt?: string;
}

export interface DevelopmentLandPlot {
  id: string;
  plotCode: string;
  acquisitionMode: string;
  ownerContactName: string | null;
  areaSqm: number | null;
  acquisitionDate: string | null;
  purchasePriceMinor: bigint | null;
  purchaseCurrency: string | null;
  upfrontAmountMinor: bigint | null;
  balanceInstallments: BalanceInstallment[];
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  notes: string | null;
}

export interface DevelopmentUnitRow {
  villaId: string;
  unitCode: string;
  name: string | null;
  bedrooms: number;
  unitTypeId: string | null;
  unitTypeName: string | null;
  unitCategory: string;
  constructionStatus: string;
  constructionProgressPercent: number;
  locationCoefficient: number;
  locationDescription: string | null;
  costBasisMinor: bigint | null;
  costBasisCurrency: string | null;
  targetSalePriceMinor: bigint | null;
  targetSaleCurrency: string | null;
  currentMarketPriceMinor: bigint | null;
  currentMarketCurrency: string | null;
  contractPriceMinor: bigint | null;
  contractCurrency: string | null;
  unitTypeFrozen: boolean;
  isSold: boolean;
}

export interface ProjectPhaseRow {
  id: string;
  projectId: string;
  phaseType: string;
  status: string;
  plannedStartDate: string | null;
  actualStartDate: string | null;
  plannedEndDate: string | null;
  actualEndDate: string | null;
  notes: string | null;
}

export interface DevelopmentProjectMetaSummary {
  acquisitionMode: string;
  leaseTenureYears: number | null;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  landAreaSqm: number | null;
  grossSquareMeters: number | null;
  netSquareMeters: number | null;
  acquisitionDate: string | null;
  plannedHandoverDate: string | null;
  projectCurrency: string;
  operationalCurrency: string;
  notes: string | null;
}

export interface DevelopmentProjectDetail {
  project: DevelopmentProjectListItem;
  meta: DevelopmentProjectMetaSummary;
  phases: ProjectPhaseRow[];
  plots: DevelopmentLandPlot[];
  units: DevelopmentUnitRow[];
  source: "db" | "mock";
}
