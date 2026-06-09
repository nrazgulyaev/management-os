import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { projects } from "@/lib/db/schema/projects";
import { mockProjects } from "@/lib/mock/projects";
import type { ProjectDetail, ProjectListItem } from "./types";
import type { WithSource } from "@/features/types";

function fromMock(): WithSource<ProjectListItem>[] {
  return mockProjects.map((p) => ({
    source: "mock",
    id: p.id,
    slug: p.id,
    name: p.name,
    location: `Bali · ${p.area}`,
    area: p.area,
    status:
      p.status === "live"
        ? "managed"
        : p.status === "soft_open"
          ? "active"
          : "under_construction",
    managementStatus: p.status === "live" ? "managed" : "onboarding",
    totalVillas: p.villas,
    concept: p.tagline,
    description: p.description,
  }));
}

export async function listProjects(): Promise<WithSource<ProjectListItem>[]> {
  const db = getDb();
  if (!db) return fromMock();

  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.organizationId, organizationId))
    .orderBy(projects.name);
  return rows.map((r) => ({
    source: "db",
    id: r.id,
    slug: r.slug,
    name: r.name,
    location: r.location,
    area: r.area,
    status: r.status as ProjectListItem["status"],
    managementStatus: r.managementStatus as ProjectListItem["managementStatus"],
    totalVillas: r.totalVillas,
    concept: r.concept,
    description: r.description,
  }));
}

export async function getProjectBySlug(
  slug: string,
): Promise<WithSource<ProjectDetail> | null> {
  const db = getDb();
  if (!db) {
    const m = mockProjects.find((p) => p.id === slug);
    if (!m) return null;
    return {
      source: "mock",
      id: m.id,
      slug: m.id,
      name: m.name,
      location: `Bali · ${m.area}`,
      area: m.area,
      status:
        m.status === "live"
          ? "managed"
          : m.status === "soft_open"
            ? "active"
            : "under_construction",
      managementStatus: m.status === "live" ? "managed" : "onboarding",
      totalVillas: m.villas,
      concept: m.tagline,
      description: m.description,
      targetHandoverDate: null,
      leaseholdUntil: null,
      heroImageUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const organizationId = await requireOrgId();
  const [r] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.slug, slug), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!r) return null;

  return {
    source: "db",
    id: r.id,
    slug: r.slug,
    name: r.name,
    location: r.location,
    area: r.area,
    status: r.status as ProjectDetail["status"],
    managementStatus: r.managementStatus as ProjectDetail["managementStatus"],
    totalVillas: r.totalVillas,
    concept: r.concept,
    description: r.description,
    targetHandoverDate: r.targetHandoverDate,
    leaseholdUntil: r.leaseholdUntil,
    heroImageUrl: r.heroImageUrl,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function getProjectById(
  id: string,
): Promise<WithSource<ProjectDetail> | null> {
  const db = getDb();
  if (!db) return getProjectBySlug(id);

  const organizationId = await requireOrgId();
  const [r] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!r) return null;
  return {
    source: "db",
    id: r.id,
    slug: r.slug,
    name: r.name,
    location: r.location,
    area: r.area,
    status: r.status as ProjectDetail["status"],
    managementStatus: r.managementStatus as ProjectDetail["managementStatus"],
    totalVillas: r.totalVillas,
    concept: r.concept,
    description: r.description,
    targetHandoverDate: r.targetHandoverDate,
    leaseholdUntil: r.leaseholdUntil,
    heroImageUrl: r.heroImageUrl,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
