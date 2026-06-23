"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  villaGuideSections,
  villaWifiCredentials,
  villaEmergencyContacts,
  villaNeighborhoodPlaces,
} from "@/lib/db/schema/villa-guides";
import { projects, villas } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  idSchema,
  upsertEmergencyContactSchema,
  upsertGuideSectionSchema,
  upsertNeighborhoodPlaceSchema,
  upsertWifiSchema,
} from "./schema";
import type { ActionResult } from "@/features/projects/actions";

// -----------------------------------------------------------------------------
// TENANCY helper for the no-org guide tables.
//
// `villa_wifi_credentials`, `villa_emergency_contacts` and
// `villa_neighborhood_places` have NO organization_id column — they anchor org
// via villaId/projectId -> projects.organizationId. Before mutating an existing
// row we must verify the row's villa or project belongs to the caller's org.
// Returns true when the (villaId | projectId) pair resolves to `organizationId`.
// -----------------------------------------------------------------------------
async function anchorBelongsToOrg(
  db: NonNullable<ReturnType<typeof getDb>>,
  organizationId: string,
  anchor: { villaId: string | null; projectId: string | null },
): Promise<boolean> {
  if (anchor.villaId) {
    const [row] = await db
      .select({ orgId: projects.organizationId })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(
        and(
          eq(villas.id, anchor.villaId),
          eq(projects.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (row) return true;
  }
  if (anchor.projectId) {
    const [row] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, anchor.projectId),
          eq(projects.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (row) return true;
  }
  return false;
}

// -----------------------------------------------------------------------------
// Sections
// -----------------------------------------------------------------------------

function parseSectionForm(form: FormData) {
  const raw = Object.fromEntries(form.entries());
  return {
    id: raw.id || undefined,
    villaId: raw.villaId || null,
    projectId: raw.projectId || null,
    sectionKey: raw.sectionKey,
    title: raw.title,
    bodyMd: raw.bodyMd || null,
    sortOrder: raw.sortOrder ? Number(raw.sortOrder) : 0,
    guestVisible: raw.guestVisible === "on" || raw.guestVisible === "true",
  };
}

export async function upsertGuideSectionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { sectionId?: string }> {
  // SESSION-RESOLUTION-1 P6 — return friendly errors instead of letting
  // requirePermission throw bubble up to the framework "Server Components
  // render error" banner. Mirrors P5 fix in calendar-sync actions.
  try {
    await requirePermission("villa_guide.write");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Permission denied";
    return { ok: false, error: msg };
  }
  const parsed = upsertGuideSectionSchema.safeParse(parseSectionForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser().catch(() => null);

  let sectionId: string | undefined;
  try {
    if (parsed.data.id) {
      // TENANCY: villa_guide_sections.organization_id is NOT NULL — gate the
      // update so an admin in tenant A cannot rewrite tenant B's section.
      const organizationId = await requireOrgId();
      const [updated] = await db
        .update(villaGuideSections)
        .set({
          title: parsed.data.title,
          bodyMd: parsed.data.bodyMd ?? null,
          sortOrder: parsed.data.sortOrder,
          guestVisible: parsed.data.guestVisible ?? true,
          updatedBy: me?.id ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(villaGuideSections.id, parsed.data.id),
            eq(villaGuideSections.organizationId, organizationId),
          ),
        )
        .returning({ id: villaGuideSections.id });
      if (!updated) return { ok: false, error: "Section not found." };
      sectionId = updated.id;
    } else {
      const organizationId = await requireOrgId();
      // TENANCY: when a villa/project FK is supplied, verify it belongs to the
      // caller's org so a section cannot be anchored to another tenant's villa
      // or project. A both-null anchor is a legitimate org-global section
      // (villa_guide_sections has its own NOT NULL organization_id, stamped
      // below, and listSectionsAdmin scopes strictly by it).
      if (
        (parsed.data.villaId || parsed.data.projectId) &&
        !(await anchorBelongsToOrg(db, organizationId, {
          villaId: parsed.data.villaId ?? null,
          projectId: parsed.data.projectId ?? null,
        }))
      ) {
        return { ok: false, error: "Villa or project not found." };
      }
      const [row] = await db
        .insert(villaGuideSections)
        .values({
          organizationId,
          villaId: parsed.data.villaId ?? null,
          projectId: parsed.data.projectId ?? null,
          sectionKey: parsed.data.sectionKey,
          title: parsed.data.title,
          bodyMd: parsed.data.bodyMd ?? null,
          sortOrder: parsed.data.sortOrder,
          guestVisible: parsed.data.guestVisible ?? true,
          updatedBy: me?.id ?? null,
        })
        .returning({ id: villaGuideSections.id });
      sectionId = row?.id;
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes("23505")) {
      return {
        ok: false,
        error: "A section with this key already exists for this villa or project.",
      };
    }
    return { ok: false, error: raw.slice(0, 300) };
  }

  // Audit log is best-effort — never fail the user action because the log
  // couldn't write.
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: parsed.data.id
      ? "villa_guide.section.update"
      : "villa_guide.section.create",
    entityType: "villa_guide_section",
    entityId: sectionId ?? null,
    after: {
      sectionKey: parsed.data.sectionKey,
      villaId: parsed.data.villaId ?? null,
      projectId: parsed.data.projectId ?? null,
    },
  }).catch(() => null);

  revalidatePath("/dashboard/villa-guides");
  revalidatePath("/dashboard/villa-guides/sections");
  return { ok: true, sectionId };
}

export async function archiveGuideSectionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("villa_guide.write");
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // TENANCY: gate the archive to the caller's org so a foreign section cannot
  // be archived cross-tenant.
  const organizationId = await requireOrgId();
  const [archived] = await db
    .update(villaGuideSections)
    .set({ status: "archived", updatedAt: new Date(), updatedBy: me?.id ?? null })
    .where(
      and(
        eq(villaGuideSections.id, parsed.data.id),
        eq(villaGuideSections.organizationId, organizationId),
      ),
    )
    .returning({ id: villaGuideSections.id });
  if (!archived) return { ok: false, error: "Section not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "villa_guide.section.archive",
    entityType: "villa_guide_section",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/villa-guides/sections");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Wi-Fi
// -----------------------------------------------------------------------------

function parseWifiForm(form: FormData) {
  const raw = Object.fromEntries(form.entries());
  return {
    id: raw.id || undefined,
    villaId: raw.villaId || null,
    projectId: raw.projectId || null,
    networkName: raw.networkName,
    displayPassword: raw.displayPassword || null,
    instructionsMd: raw.instructionsMd || null,
  };
}

export async function upsertWifiAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { wifiId?: string }> {
  await requirePermission("villa_guide.write");
  const parsed = upsertWifiSchema.safeParse(parseWifiForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  // v9G: the `displayPassword` form field is encrypted at write-time.
  // Plaintext is never stored in `display_password` for new rows.
  let ciphertext: string | null = null;
  let keyVersion: number | null = null;
  if (parsed.data.displayPassword) {
    const { encryptForStorage } = await import("./wifi-crypto");
    const enc = await encryptForStorage(parsed.data.displayPassword);
    ciphertext = enc.ciphertext;
    keyVersion = enc.keyVersion;
  }

  let wifiId: string | undefined;
  if (parsed.data.id) {
    // TENANCY: villa_wifi_credentials has NO organization_id — verify the
    // existing row's villa/project belongs to the caller's org before updating.
    const organizationId = await requireOrgId();
    const [existing] = await db
      .select({
        villaId: villaWifiCredentials.villaId,
        projectId: villaWifiCredentials.projectId,
      })
      .from(villaWifiCredentials)
      .where(eq(villaWifiCredentials.id, parsed.data.id))
      .limit(1);
    if (!existing) return { ok: false, error: "WiFi credential not found." };
    if (!(await anchorBelongsToOrg(db, organizationId, existing)))
      return { ok: false, error: "WiFi credential not found." };

    const updates: Record<string, unknown> = {
      networkName: parsed.data.networkName,
      instructionsMd: parsed.data.instructionsMd ?? null,
      updatedBy: me?.id ?? null,
      updatedAt: new Date(),
    };
    if (parsed.data.displayPassword) {
      updates.passwordCiphertext = ciphertext;
      updates.passwordKeyVersion = keyVersion;
      updates.passwordMigratedAt = new Date();
      updates.displayPassword = null; // never persist plaintext post-v9G
    }
    await db
      .update(villaWifiCredentials)
      .set(updates)
      .where(eq(villaWifiCredentials.id, parsed.data.id));
    wifiId = parsed.data.id;
  } else {
    // TENANCY: villa_wifi_credentials has NO organization_id — verify the
    // villa/project FK belongs to the caller's org before inserting so a
    // credential cannot be anchored to another tenant's villa or project.
    const organizationId = await requireOrgId();
    if (
      !(await anchorBelongsToOrg(db, organizationId, {
        villaId: parsed.data.villaId ?? null,
        projectId: parsed.data.projectId ?? null,
      }))
    ) {
      return { ok: false, error: "Villa or project not found." };
    }
    const [row] = await db
      .insert(villaWifiCredentials)
      .values({
        villaId: parsed.data.villaId ?? null,
        projectId: parsed.data.projectId ?? null,
        networkName: parsed.data.networkName,
        passwordCiphertext: ciphertext,
        passwordKeyVersion: keyVersion,
        passwordMigratedAt: ciphertext ? new Date() : null,
        instructionsMd: parsed.data.instructionsMd ?? null,
        updatedBy: me?.id ?? null,
      })
      .returning({ id: villaWifiCredentials.id });
    wifiId = row?.id;
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: parsed.data.id ? "villa_guide.wifi.update" : "villa_guide.wifi.create",
    entityType: "villa_wifi_credential",
    entityId: wifiId ?? null,
    after: {
      villaId: parsed.data.villaId ?? null,
      projectId: parsed.data.projectId ?? null,
      networkName: parsed.data.networkName,
    },
  });

  revalidatePath("/dashboard/villa-guides/wifi");
  return { ok: true, wifiId };
}

// -----------------------------------------------------------------------------
// Emergency contacts
// -----------------------------------------------------------------------------

function parseContactForm(form: FormData) {
  const raw = Object.fromEntries(form.entries());
  return {
    id: raw.id || undefined,
    villaId: raw.villaId || null,
    projectId: raw.projectId || null,
    label: raw.label,
    contactType: raw.contactType,
    phone: raw.phone || null,
    whatsapp: raw.whatsapp || null,
    email: raw.email || null,
    address: raw.address || null,
    notesMd: raw.notesMd || null,
    sortOrder: raw.sortOrder ? Number(raw.sortOrder) : 0,
    guestVisible: raw.guestVisible === "on" || raw.guestVisible === "true",
  };
}

export async function upsertEmergencyContactAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { contactId?: string }> {
  await requirePermission("villa_guide.write");
  const parsed = upsertEmergencyContactSchema.safeParse(parseContactForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  let contactId: string | undefined;
  if (parsed.data.id) {
    // TENANCY: villa_emergency_contacts has NO organization_id — verify the
    // existing row's villa/project belongs to the caller's org before updating.
    const organizationId = await requireOrgId();
    const [existing] = await db
      .select({
        villaId: villaEmergencyContacts.villaId,
        projectId: villaEmergencyContacts.projectId,
      })
      .from(villaEmergencyContacts)
      .where(eq(villaEmergencyContacts.id, parsed.data.id))
      .limit(1);
    if (!existing) return { ok: false, error: "Contact not found." };
    if (!(await anchorBelongsToOrg(db, organizationId, existing)))
      return { ok: false, error: "Contact not found." };

    await db
      .update(villaEmergencyContacts)
      .set({
        label: parsed.data.label,
        contactType: parsed.data.contactType,
        phone: parsed.data.phone ?? null,
        whatsapp: parsed.data.whatsapp ?? null,
        email: parsed.data.email ?? null,
        address: parsed.data.address ?? null,
        notesMd: parsed.data.notesMd ?? null,
        sortOrder: parsed.data.sortOrder,
        guestVisible: parsed.data.guestVisible ?? true,
        updatedAt: new Date(),
      })
      .where(eq(villaEmergencyContacts.id, parsed.data.id));
    contactId = parsed.data.id;
  } else {
    // TENANCY: villa_emergency_contacts has NO organization_id — verify the
    // villa/project FK belongs to the caller's org before inserting so a
    // contact cannot be anchored to another tenant's villa or project.
    const organizationId = await requireOrgId();
    if (
      !(await anchorBelongsToOrg(db, organizationId, {
        villaId: parsed.data.villaId ?? null,
        projectId: parsed.data.projectId ?? null,
      }))
    ) {
      return { ok: false, error: "Villa or project not found." };
    }
    const [row] = await db
      .insert(villaEmergencyContacts)
      .values({
        villaId: parsed.data.villaId ?? null,
        projectId: parsed.data.projectId ?? null,
        label: parsed.data.label,
        contactType: parsed.data.contactType,
        phone: parsed.data.phone ?? null,
        whatsapp: parsed.data.whatsapp ?? null,
        email: parsed.data.email ?? null,
        address: parsed.data.address ?? null,
        notesMd: parsed.data.notesMd ?? null,
        sortOrder: parsed.data.sortOrder,
        guestVisible: parsed.data.guestVisible ?? true,
      })
      .returning({ id: villaEmergencyContacts.id });
    contactId = row?.id;
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: parsed.data.id
      ? "villa_guide.contact.update"
      : "villa_guide.contact.create",
    entityType: "villa_emergency_contact",
    entityId: contactId ?? null,
    after: { label: parsed.data.label, contactType: parsed.data.contactType },
  });

  revalidatePath("/dashboard/villa-guides/emergency-contacts");
  return { ok: true, contactId };
}

// -----------------------------------------------------------------------------
// Neighborhood
// -----------------------------------------------------------------------------

function parsePlaceForm(form: FormData) {
  const raw = Object.fromEntries(form.entries());
  return {
    id: raw.id || undefined,
    villaId: raw.villaId || null,
    projectId: raw.projectId || null,
    name: raw.name,
    category: raw.category,
    descriptionMd: raw.descriptionMd || null,
    address: raw.address || null,
    googleMapsUrl: raw.googleMapsUrl || null,
    distanceLabel: raw.distanceLabel || null,
    travelTimeLabel: raw.travelTimeLabel || null,
    imageUrl: raw.imageUrl || null,
    sortOrder: raw.sortOrder ? Number(raw.sortOrder) : 0,
    guestVisible: raw.guestVisible === "on" || raw.guestVisible === "true",
  };
}

export async function upsertNeighborhoodPlaceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { placeId?: string }> {
  await requirePermission("villa_guide.write");
  const parsed = upsertNeighborhoodPlaceSchema.safeParse(parsePlaceForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const cleanUrl = (s?: string | null) => (s && s !== "" ? s : null);

  let placeId: string | undefined;
  if (parsed.data.id) {
    // TENANCY: villa_neighborhood_places has NO organization_id — verify the
    // existing row's villa/project belongs to the caller's org before updating.
    const organizationId = await requireOrgId();
    const [existing] = await db
      .select({
        villaId: villaNeighborhoodPlaces.villaId,
        projectId: villaNeighborhoodPlaces.projectId,
      })
      .from(villaNeighborhoodPlaces)
      .where(eq(villaNeighborhoodPlaces.id, parsed.data.id))
      .limit(1);
    if (!existing) return { ok: false, error: "Place not found." };
    if (!(await anchorBelongsToOrg(db, organizationId, existing)))
      return { ok: false, error: "Place not found." };

    await db
      .update(villaNeighborhoodPlaces)
      .set({
        name: parsed.data.name,
        category: parsed.data.category,
        descriptionMd: parsed.data.descriptionMd ?? null,
        address: parsed.data.address ?? null,
        googleMapsUrl: cleanUrl(parsed.data.googleMapsUrl),
        distanceLabel: parsed.data.distanceLabel ?? null,
        travelTimeLabel: parsed.data.travelTimeLabel ?? null,
        imageUrl: cleanUrl(parsed.data.imageUrl),
        sortOrder: parsed.data.sortOrder,
        guestVisible: parsed.data.guestVisible ?? true,
        updatedAt: new Date(),
      })
      .where(eq(villaNeighborhoodPlaces.id, parsed.data.id));
    placeId = parsed.data.id;
  } else {
    // TENANCY: villa_neighborhood_places has NO organization_id — verify the
    // villa/project FK belongs to the caller's org before inserting so a
    // place cannot be anchored to another tenant's villa or project.
    const organizationId = await requireOrgId();
    if (
      !(await anchorBelongsToOrg(db, organizationId, {
        villaId: parsed.data.villaId ?? null,
        projectId: parsed.data.projectId ?? null,
      }))
    ) {
      return { ok: false, error: "Villa or project not found." };
    }
    const [row] = await db
      .insert(villaNeighborhoodPlaces)
      .values({
        villaId: parsed.data.villaId ?? null,
        projectId: parsed.data.projectId ?? null,
        name: parsed.data.name,
        category: parsed.data.category,
        descriptionMd: parsed.data.descriptionMd ?? null,
        address: parsed.data.address ?? null,
        googleMapsUrl: cleanUrl(parsed.data.googleMapsUrl),
        distanceLabel: parsed.data.distanceLabel ?? null,
        travelTimeLabel: parsed.data.travelTimeLabel ?? null,
        imageUrl: cleanUrl(parsed.data.imageUrl),
        sortOrder: parsed.data.sortOrder,
        guestVisible: parsed.data.guestVisible ?? true,
      })
      .returning({ id: villaNeighborhoodPlaces.id });
    placeId = row?.id;
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: parsed.data.id ? "villa_guide.place.update" : "villa_guide.place.create",
    entityType: "villa_neighborhood_place",
    entityId: placeId ?? null,
    after: { name: parsed.data.name, category: parsed.data.category },
  });

  revalidatePath("/dashboard/villa-guides/neighborhood");
  return { ok: true, placeId };
}

// =============================================================================
// Stage 10.E.4 — Archive actions for emergency-contacts / neighborhood / wifi.
//
// Sections already had archiveGuideSectionAction. This sub-phase adds the
// missing 3 to close the audit's partial-CRUD finding for villa-guides.
// All 3 tables already have a `status text NOT NULL DEFAULT 'active'`
// column — soft-delete by flipping to "archived". No migration.
// =============================================================================

export async function archiveEmergencyContactAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("villa_guide.write");
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // TENANCY: villa_emergency_contacts has NO organization_id — verify the row's
  // villa/project belongs to the caller's org before archiving.
  const organizationId = await requireOrgId();
  const [existing] = await db
    .select({
      villaId: villaEmergencyContacts.villaId,
      projectId: villaEmergencyContacts.projectId,
    })
    .from(villaEmergencyContacts)
    .where(eq(villaEmergencyContacts.id, parsed.data.id))
    .limit(1);
  if (!existing) return { ok: false, error: "Contact not found." };
  if (!(await anchorBelongsToOrg(db, organizationId, existing)))
    return { ok: false, error: "Contact not found." };
  const [row] = await db
    .update(villaEmergencyContacts)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(villaEmergencyContacts.id, parsed.data.id))
    .returning({ id: villaEmergencyContacts.id });
  if (!row) return { ok: false, error: "Contact not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "villa_guide.contact.archive",
    entityType: "villa_emergency_contact",
    entityId: parsed.data.id,
    after: { status: "archived" },
  });
  revalidatePath("/dashboard/villa-guides/emergency-contacts");
  return { ok: true };
}

export async function archiveNeighborhoodPlaceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("villa_guide.write");
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // TENANCY: villa_neighborhood_places has NO organization_id — verify the row's
  // villa/project belongs to the caller's org before archiving.
  const organizationId = await requireOrgId();
  const [existing] = await db
    .select({
      villaId: villaNeighborhoodPlaces.villaId,
      projectId: villaNeighborhoodPlaces.projectId,
    })
    .from(villaNeighborhoodPlaces)
    .where(eq(villaNeighborhoodPlaces.id, parsed.data.id))
    .limit(1);
  if (!existing) return { ok: false, error: "Place not found." };
  if (!(await anchorBelongsToOrg(db, organizationId, existing)))
    return { ok: false, error: "Place not found." };
  const [row] = await db
    .update(villaNeighborhoodPlaces)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(villaNeighborhoodPlaces.id, parsed.data.id))
    .returning({ id: villaNeighborhoodPlaces.id });
  if (!row) return { ok: false, error: "Place not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "villa_guide.place.archive",
    entityType: "villa_neighborhood_place",
    entityId: parsed.data.id,
    after: { status: "archived" },
  });
  revalidatePath("/dashboard/villa-guides/neighborhood");
  return { ok: true };
}

export async function archiveWifiCredentialAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("villa_guide.write");
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  // TENANCY: villa_wifi_credentials has NO organization_id — verify the row's
  // villa/project belongs to the caller's org before archiving.
  const organizationId = await requireOrgId();
  const [existing] = await db
    .select({
      villaId: villaWifiCredentials.villaId,
      projectId: villaWifiCredentials.projectId,
    })
    .from(villaWifiCredentials)
    .where(eq(villaWifiCredentials.id, parsed.data.id))
    .limit(1);
  if (!existing) return { ok: false, error: "WiFi credential not found." };
  if (!(await anchorBelongsToOrg(db, organizationId, existing)))
    return { ok: false, error: "WiFi credential not found." };
  const [row] = await db
    .update(villaWifiCredentials)
    .set({ status: "archived", updatedAt: new Date(), updatedBy: me?.id ?? null })
    .where(eq(villaWifiCredentials.id, parsed.data.id))
    .returning({ id: villaWifiCredentials.id });
  if (!row) return { ok: false, error: "WiFi credential not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "villa_guide.wifi.archive",
    entityType: "villa_wifi_credential",
    entityId: parsed.data.id,
    after: { status: "archived" },
  });
  revalidatePath("/dashboard/villa-guides/wifi");
  return { ok: true };
}
