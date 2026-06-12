import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { villas, projects } from "@/lib/db/schema/projects";
import { mockVillas } from "@/lib/mock/villas";
import type { VillaStatus } from "@/components/ui/status-pill";
import type { WithSource } from "@/features/types";

export interface VillaListItem {
  id: string;
  unitCode: string;
  slug: string;
  name: string | null;
  projectId: string;
  projectName: string;
  status: VillaStatus;
  bedrooms: number;
  managementModel: "individual" | "pooled" | "hybrid";
  currentNightlyRateUsd: number | null;
  ownerVisible: boolean;
}

export interface VillaDetail extends VillaListItem {
  bathrooms: number | null;
  builtAreaSqm: number | null;
  landAreaSqm: number | null;
  poolAreaSqm: number | null;
  viewType: string | null;
  createdAt: string;
  updatedAt: string;
}

function toNumber(v: string | null): number | null {
  return v === null ? null : Number(v);
}

function fromMock(): WithSource<VillaListItem>[] {
  return mockVillas.map((v) => ({
    source: "mock",
    id: v.id,
    unitCode: v.code,
    slug: v.id,
    name: v.name,
    projectId: v.projectId,
    projectName: v.project,
    status: v.status,
    bedrooms: v.bedrooms,
    managementModel:
      v.projectId === "enso-villas"
        ? "pooled"
        : v.projectId === "ahau-gardens"
          ? "individual"
          : "hybrid",
    currentNightlyRateUsd: Math.round(v.adr / 100_000_000),
    ownerVisible: true,
  }));
}

export async function listVillas(opts?: { projectId?: string }): Promise<WithSource<VillaListItem>[]> {
  const db = getDb();
  if (!db) {
    const list = fromMock();
    return opts?.projectId ? list.filter((v) => v.projectId === opts.projectId) : list;
  }

  // TENANCY: villas have no org column — they belong to an org transitively
  // via their project. Scope to the caller's org through projects.org_id so a
  // tenant never sees another org's (or leftover demo) villas. Mirrors the
  // listProjects() scoping pattern.
  const organizationId = await requireOrgId();

  const rows = await db
    .select({
      id: villas.id,
      unitCode: villas.unitCode,
      slug: villas.slug,
      name: villas.name,
      projectId: villas.projectId,
      projectName: projects.name,
      status: villas.status,
      bedrooms: villas.bedrooms,
      managementModel: villas.managementModel,
      rate: villas.currentNightlyRateUsd,
      ownerVisible: villas.ownerVisible,
    })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(eq(projects.organizationId, organizationId))
    .orderBy(asc(projects.name), asc(villas.unitCode));

  const filtered = opts?.projectId ? rows.filter((r) => r.projectId === opts.projectId) : rows;

  return filtered.map((r) => ({
    source: "db",
    id: r.id,
    unitCode: r.unitCode,
    slug: r.slug,
    name: r.name,
    projectId: r.projectId,
    projectName: r.projectName,
    status: r.status as VillaStatus,
    bedrooms: r.bedrooms,
    managementModel: r.managementModel as VillaListItem["managementModel"],
    currentNightlyRateUsd: toNumber(r.rate),
    ownerVisible: r.ownerVisible,
  }));
}

export async function getVillaById(id: string): Promise<WithSource<VillaDetail> | null> {
  const db = getDb();
  if (!db) {
    const v = mockVillas.find((m) => m.id === id);
    if (!v) return null;
    return {
      source: "mock",
      id: v.id,
      unitCode: v.code,
      slug: v.id,
      name: v.name,
      projectId: v.projectId,
      projectName: v.project,
      status: v.status,
      bedrooms: v.bedrooms,
      managementModel:
        v.projectId === "enso-villas"
          ? "pooled"
          : v.projectId === "ahau-gardens"
            ? "individual"
            : "hybrid",
      currentNightlyRateUsd: Math.round(v.adr / 100_000_000),
      ownerVisible: true,
      bathrooms: null,
      builtAreaSqm: null,
      landAreaSqm: null,
      poolAreaSqm: null,
      viewType: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // TENANCY: AND the villa id with the caller's org (via project) so a
  // cross-org villa id reads as not-found instead of leaking the record.
  const organizationId = await requireOrgId();
  const [r] = await db
    .select({
      v: villas,
      pName: projects.name,
    })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(and(eq(villas.id, id), eq(projects.organizationId, organizationId)))
    .limit(1);

  if (!r) return null;
  return {
    source: "db",
    id: r.v.id,
    unitCode: r.v.unitCode,
    slug: r.v.slug,
    name: r.v.name,
    projectId: r.v.projectId,
    projectName: r.pName,
    status: r.v.status as VillaStatus,
    bedrooms: r.v.bedrooms,
    managementModel: r.v.managementModel as VillaDetail["managementModel"],
    currentNightlyRateUsd: toNumber(r.v.currentNightlyRateUsd),
    ownerVisible: r.v.ownerVisible,
    bathrooms: toNumber(r.v.bathrooms),
    builtAreaSqm: toNumber(r.v.builtAreaSqm),
    landAreaSqm: toNumber(r.v.landAreaSqm),
    poolAreaSqm: toNumber(r.v.poolAreaSqm),
    viewType: r.v.viewType,
    createdAt: r.v.createdAt.toISOString(),
    updatedAt: r.v.updatedAt.toISOString(),
  };
}
