import "server-only";

import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db/client";
import {
  villaGuideSections,
  villaWifiCredentials,
  villaEmergencyContacts,
  villaNeighborhoodPlaces,
} from "@/lib/db/schema/villa-guides";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";
import {
  resolveByKey,
  resolveListWithFallback,
} from "./resolve-pure";

/**
 * V9E — DB-aware villa-guide reads. The pure resolver lives in
 * `resolve-pure.ts` and returns the merged set; the service layer just
 * fetches villa-scoped + project-scoped rows together.
 */

export interface GuideSectionRow {
  id: string;
  projectId: string | null;
  villaId: string | null;
  sectionKey: string;
  title: string;
  bodyMd: string | null;
  bodyJson: unknown;
  sortOrder: number;
  guestVisible: boolean;
  status: string;
  updatedAt: string;
}

function rowsForScope<T>(rows: T[]): T[] {
  return rows;
}

async function fetchScoped(
  db: ReturnType<typeof getDb>,
  villaId: string | null,
  projectId: string | null,
) {
  if (!db) return null;
  const orFilters = [];
  if (villaId) orFilters.push(eq(villaGuideSections.villaId, villaId));
  if (projectId) {
    orFilters.push(
      and(eq(villaGuideSections.projectId, projectId), isNull(villaGuideSections.villaId)),
    );
  }
  if (orFilters.length === 0) return [];
  const rows = await db
    .select()
    .from(villaGuideSections)
    .where(or(...orFilters))
    .orderBy(asc(villaGuideSections.sortOrder));
  return rows;
}

export async function listGuideSectionsForGuest(opts: {
  villaId: string;
  projectId: string | null;
}): Promise<GuideSectionRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = (await fetchScoped(db, opts.villaId, opts.projectId)) ?? [];
  const merged = resolveByKey(
    rows.map((r) => ({
      id: r.id,
      villaId: r.villaId,
      projectId: r.projectId,
      sectionKey: r.sectionKey,
      status: r.status,
      guestVisible: r.guestVisible,
      sortOrder: r.sortOrder,
      title: r.title,
      bodyMd: r.bodyMd,
      bodyJson: r.bodyJson,
      updatedAt: r.updatedAt,
    })),
  );
  return merged
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => ({
      id: m.id,
      projectId: m.projectId,
      villaId: m.villaId,
      sectionKey: m.sectionKey,
      title: m.title,
      bodyMd: m.bodyMd,
      bodyJson: m.bodyJson,
      sortOrder: m.sortOrder,
      guestVisible: m.guestVisible ?? true,
      status: m.status,
      updatedAt: (m.updatedAt as Date).toISOString(),
    }));
}

export async function listGuideSectionsAdmin(opts?: {
  villaId?: string;
  projectId?: string;
}): Promise<GuideSectionRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters = [eq(villaGuideSections.organizationId, organizationId)];
  if (opts?.villaId) filters.push(eq(villaGuideSections.villaId, opts.villaId));
  if (opts?.projectId)
    filters.push(eq(villaGuideSections.projectId, opts.projectId));
  const rows = await db
    .select({
      g: villaGuideSections,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(villaGuideSections)
    .leftJoin(villas, eq(villas.id, villaGuideSections.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villaGuideSections.projectId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      asc(villaGuideSections.sectionKey),
      asc(villaGuideSections.sortOrder),
    );
  return rows.map((r) => ({
    id: r.g.id,
    projectId: r.g.projectId,
    villaId: r.g.villaId,
    sectionKey: r.g.sectionKey,
    title: r.g.title,
    bodyMd: r.g.bodyMd,
    bodyJson: r.g.bodyJson,
    sortOrder: r.g.sortOrder,
    guestVisible: r.g.guestVisible,
    status: r.g.status,
    updatedAt: r.g.updatedAt.toISOString(),
  }));
}

// -----------------------------------------------------------------------------
// Wi-Fi
// -----------------------------------------------------------------------------

/**
 * Guest-facing Wi-Fi projection. v9G: never returns plaintext or
 * ciphertext. The portal asks for a reveal via a server action that
 * re-validates token + verification gate, decrypts server-side, and
 * logs a `wifi_viewed` security event.
 */
export async function listWifiForGuest(opts: {
  villaId: string;
  projectId: string | null;
}): Promise<
  Array<{
    id: string;
    networkName: string;
    instructionsMd: string | null;
    hasPassword: boolean;
    passwordKeyVersion: number | null;
  }>
> {
  const db = getDb();
  if (!db) return [];
  const orFilters = [eq(villaWifiCredentials.villaId, opts.villaId)];
  if (opts.projectId) {
    orFilters.push(
      and(
        eq(villaWifiCredentials.projectId, opts.projectId),
        isNull(villaWifiCredentials.villaId),
      ) as never,
    );
  }
  const rows = await db
    .select()
    .from(villaWifiCredentials)
    .where(or(...orFilters));
  const resolved = resolveListWithFallback(
    rows.map((r) => ({
      id: r.id,
      villaId: r.villaId,
      projectId: r.projectId,
      status: r.status,
      networkName: r.networkName,
      hasPassword: Boolean(r.passwordCiphertext) || Boolean(r.displayPassword),
      passwordKeyVersion: r.passwordKeyVersion,
      instructionsMd: r.instructionsMd,
    })),
  );
  return rowsForScope(resolved).map((r) => ({
    id: r.id,
    networkName: r.networkName,
    instructionsMd: r.instructionsMd,
    hasPassword: r.hasPassword,
    passwordKeyVersion: r.passwordKeyVersion,
  }));
}

export async function listWifiAdmin(opts?: {
  villaId?: string;
  projectId?: string;
}) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  // villa_wifi_credentials has no org column. Scope via projects: rows can be
  // project-scoped (projectId set) or villa-scoped (villaId set, projectId
  // NULL). Require the caller's org on either path.
  const wifiVillaProject = alias(projectsTable, "wifi_villa_project");
  const filters = [
    or(
      eq(projectsTable.organizationId, organizationId),
      eq(wifiVillaProject.organizationId, organizationId),
    ),
  ];
  if (opts?.villaId) filters.push(eq(villaWifiCredentials.villaId, opts.villaId));
  if (opts?.projectId)
    filters.push(eq(villaWifiCredentials.projectId, opts.projectId));
  const rows = await db
    .select({
      w: villaWifiCredentials,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(villaWifiCredentials)
    .leftJoin(villas, eq(villas.id, villaWifiCredentials.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villaWifiCredentials.projectId))
    .leftJoin(wifiVillaProject, eq(wifiVillaProject.id, villas.projectId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(villaWifiCredentials.networkName));
  return rows.map((r) => ({
    id: r.w.id,
    villaId: r.w.villaId,
    villaCode: r.villaCode ?? null,
    projectId: r.w.projectId,
    projectName: r.projectName ?? null,
    networkName: r.w.networkName,
    /** v9G: list view never returns plaintext or ciphertext.
     *  Use the per-row /dashboard/villa-guides/wifi/[id] editor instead. */
    hasCiphertext: Boolean(r.w.passwordCiphertext),
    hasLegacyPlaintext: Boolean(r.w.displayPassword),
    keyVersion: r.w.passwordKeyVersion ?? null,
    migratedAt: r.w.passwordMigratedAt
      ? r.w.passwordMigratedAt.toISOString()
      : null,
    instructionsMd: r.w.instructionsMd,
    status: r.w.status,
  }));
}

// -----------------------------------------------------------------------------
// Emergency contacts
// -----------------------------------------------------------------------------

export async function listEmergencyContactsForGuest(opts: {
  villaId: string;
  projectId: string | null;
}) {
  const db = getDb();
  if (!db) return [];
  const orFilters = [eq(villaEmergencyContacts.villaId, opts.villaId)];
  if (opts.projectId) {
    orFilters.push(
      and(
        eq(villaEmergencyContacts.projectId, opts.projectId),
        isNull(villaEmergencyContacts.villaId),
      ) as never,
    );
  }
  const rows = await db
    .select()
    .from(villaEmergencyContacts)
    .where(or(...orFilters))
    .orderBy(asc(villaEmergencyContacts.sortOrder));
  const resolved = resolveListWithFallback(
    rows.map((r) => ({
      id: r.id,
      villaId: r.villaId,
      projectId: r.projectId,
      status: r.status,
      guestVisible: r.guestVisible,
      sortOrder: r.sortOrder,
      label: r.label,
      contactType: r.contactType,
      phone: r.phone,
      whatsapp: r.whatsapp,
      email: r.email,
      address: r.address,
      notesMd: r.notesMd,
    })),
  );
  return resolved.map((r) => ({
    id: r.id,
    label: r.label,
    contactType: r.contactType,
    phone: r.phone,
    whatsapp: r.whatsapp,
    email: r.email,
    address: r.address,
    notesMd: r.notesMd,
  }));
}

export async function listEmergencyContactsAdmin(opts?: {
  villaId?: string;
  projectId?: string;
}) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  // villa_emergency_contacts has no org column. Scope via projects on either
  // the project-scoped path (projectId) or the villa-scoped path
  // (villaId → villas.projectId).
  const contactVillaProject = alias(projectsTable, "contact_villa_project");
  const filters = [
    or(
      eq(projectsTable.organizationId, organizationId),
      eq(contactVillaProject.organizationId, organizationId),
    ),
  ];
  if (opts?.villaId)
    filters.push(eq(villaEmergencyContacts.villaId, opts.villaId));
  if (opts?.projectId)
    filters.push(eq(villaEmergencyContacts.projectId, opts.projectId));
  const rows = await db
    .select({
      c: villaEmergencyContacts,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(villaEmergencyContacts)
    .leftJoin(villas, eq(villas.id, villaEmergencyContacts.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villaEmergencyContacts.projectId))
    .leftJoin(contactVillaProject, eq(contactVillaProject.id, villas.projectId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      asc(villaEmergencyContacts.contactType),
      asc(villaEmergencyContacts.sortOrder),
    );
  return rows.map((r) => ({
    id: r.c.id,
    villaId: r.c.villaId,
    villaCode: r.villaCode ?? null,
    projectId: r.c.projectId,
    projectName: r.projectName ?? null,
    label: r.c.label,
    contactType: r.c.contactType,
    phone: r.c.phone,
    whatsapp: r.c.whatsapp,
    email: r.c.email,
    address: r.c.address,
    notesMd: r.c.notesMd,
    sortOrder: r.c.sortOrder,
    guestVisible: r.c.guestVisible,
    status: r.c.status,
  }));
}

// -----------------------------------------------------------------------------
// Neighborhood
// -----------------------------------------------------------------------------

export async function listNeighborhoodForGuest(opts: {
  villaId: string;
  projectId: string | null;
}) {
  const db = getDb();
  if (!db) return [];
  const orFilters = [eq(villaNeighborhoodPlaces.villaId, opts.villaId)];
  if (opts.projectId) {
    orFilters.push(
      and(
        eq(villaNeighborhoodPlaces.projectId, opts.projectId),
        isNull(villaNeighborhoodPlaces.villaId),
      ) as never,
    );
  }
  const rows = await db
    .select()
    .from(villaNeighborhoodPlaces)
    .where(or(...orFilters))
    .orderBy(asc(villaNeighborhoodPlaces.sortOrder));
  const resolved = resolveListWithFallback(
    rows.map((r) => ({
      id: r.id,
      villaId: r.villaId,
      projectId: r.projectId,
      status: r.status,
      guestVisible: r.guestVisible,
      sortOrder: r.sortOrder,
      name: r.name,
      category: r.category,
      descriptionMd: r.descriptionMd,
      address: r.address,
      googleMapsUrl: r.googleMapsUrl,
      distanceLabel: r.distanceLabel,
      travelTimeLabel: r.travelTimeLabel,
      imageUrl: r.imageUrl,
    })),
  );
  return resolved.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    descriptionMd: r.descriptionMd,
    address: r.address,
    googleMapsUrl: r.googleMapsUrl,
    distanceLabel: r.distanceLabel,
    travelTimeLabel: r.travelTimeLabel,
    imageUrl: r.imageUrl,
  }));
}

export async function listNeighborhoodAdmin(opts?: {
  villaId?: string;
  projectId?: string;
}) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  // villa_neighborhood_places has no org column. Scope via projects on either
  // the project-scoped path (projectId) or the villa-scoped path
  // (villaId → villas.projectId).
  const placeVillaProject = alias(projectsTable, "place_villa_project");
  const filters = [
    or(
      eq(projectsTable.organizationId, organizationId),
      eq(placeVillaProject.organizationId, organizationId),
    ),
  ];
  if (opts?.villaId)
    filters.push(eq(villaNeighborhoodPlaces.villaId, opts.villaId));
  if (opts?.projectId)
    filters.push(eq(villaNeighborhoodPlaces.projectId, opts.projectId));
  const rows = await db
    .select({
      p: villaNeighborhoodPlaces,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(villaNeighborhoodPlaces)
    .leftJoin(villas, eq(villas.id, villaNeighborhoodPlaces.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villaNeighborhoodPlaces.projectId))
    .leftJoin(placeVillaProject, eq(placeVillaProject.id, villas.projectId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      asc(villaNeighborhoodPlaces.category),
      asc(villaNeighborhoodPlaces.sortOrder),
    );
  return rows.map((r) => ({
    id: r.p.id,
    villaId: r.p.villaId,
    villaCode: r.villaCode ?? null,
    projectId: r.p.projectId,
    projectName: r.projectName ?? null,
    name: r.p.name,
    category: r.p.category,
    descriptionMd: r.p.descriptionMd,
    address: r.p.address,
    googleMapsUrl: r.p.googleMapsUrl,
    distanceLabel: r.p.distanceLabel,
    travelTimeLabel: r.p.travelTimeLabel,
    imageUrl: r.p.imageUrl,
    sortOrder: r.p.sortOrder,
    guestVisible: r.p.guestVisible,
    status: r.p.status,
  }));
}

// Suppress unused-import warning.
export const _drizzle = { inArray };
