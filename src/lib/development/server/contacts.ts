import "server-only";

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  contactRoles,
  contacts,
  type Contact,
  type ContactRole,
} from "@/lib/db/schema/contacts";

/** Normalizes a string for comparison: trim + lowercase. Returns null when empty. */
function norm(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  return v.length > 0 ? v.toLowerCase() : null;
}

export interface FindOrCreateContactInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  preferredLanguage?: string | null;
  preferredCommunicationChannel?: string | null;
  countryOfResidence?: string | null;
  citizenship?: string | null;
  acquisitionSource?: string | null;
  acquisitionSourceDetail?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface FindOrCreateContactResult {
  contact: Contact;
  created: boolean;
}

/**
 * Dedup-aware insert. Match priority:
 *   1. exact lower(email) match
 *   2. exact phone match
 *   3. otherwise insert new
 *
 * Updates non-null fields on the existing row (e.g. fills in phone if the
 * existing record only had email).
 */
export async function findOrCreateContact(
  input: FindOrCreateContactInput,
): Promise<FindOrCreateContactResult> {
  const db = getDb();
  if (!db) {
    throw new Error(
      "Database is not configured. findOrCreateContact requires DATABASE_URL.",
    );
  }
  const organizationId = await requireOrgId();
  const email = norm(input.email);
  const phone = input.phone?.trim() ?? null;

  let existing: Contact | undefined;
  if (email) {
    const rows = await db
      .select()
      .from(contacts)
      .where(
        and(
          sql`lower(${contacts.email}) = ${email}`,
          eq(contacts.organizationId, organizationId),
        ),
      )
      .limit(1);
    existing = rows[0];
  }
  if (!existing && phone) {
    const rows = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.phone, phone),
          eq(contacts.organizationId, organizationId),
        ),
      )
      .limit(1);
    existing = rows[0];
  }

  if (existing) {
    // Patch in any new non-null fields without clobbering existing values.
    const patch: Partial<Contact> = {};
    if (!existing.email && input.email) patch.email = input.email;
    if (!existing.phone && input.phone) patch.phone = input.phone;
    if (!existing.whatsapp && input.whatsapp) patch.whatsapp = input.whatsapp;
    if (!existing.preferredCommunicationChannel && input.preferredCommunicationChannel)
      patch.preferredCommunicationChannel = input.preferredCommunicationChannel;
    if (!existing.countryOfResidence && input.countryOfResidence)
      patch.countryOfResidence = input.countryOfResidence;
    if (!existing.citizenship && input.citizenship)
      patch.citizenship = input.citizenship;
    if (Object.keys(patch).length > 0) {
      await db
        .update(contacts)
        .set({ ...patch, updatedAt: new Date() })
        .where(
          and(
            eq(contacts.id, existing.id),
            eq(contacts.organizationId, organizationId),
          ),
        );
    }
    return { contact: { ...existing, ...patch }, created: false };
  }

  const inserted = await db
    .insert(contacts)
    .values({
      organizationId,
      fullName: input.fullName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      whatsapp: input.whatsapp ?? null,
      preferredLanguage: input.preferredLanguage ?? "en",
      preferredCommunicationChannel: input.preferredCommunicationChannel ?? null,
      countryOfResidence: input.countryOfResidence ?? null,
      citizenship: input.citizenship ?? null,
      acquisitionSource: input.acquisitionSource ?? null,
      acquisitionSourceDetail: input.acquisitionSourceDetail ?? null,
      notes: input.notes ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  if (!inserted[0]) {
    throw new Error("Insert returned no row");
  }
  return { contact: inserted[0], created: true };
}

export async function getContactById(id: string): Promise<Contact | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(contacts)
    .where(
      and(eq(contacts.id, id), eq(contacts.organizationId, organizationId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface ContactWithRoles {
  contact: Contact;
  roles: ContactRole[];
}

export async function getContactWithRoles(
  id: string,
): Promise<ContactWithRoles | null> {
  const db = getDb();
  if (!db) return null;
  const contact = await getContactById(id);
  if (!contact) return null;
  const roles = await db
    .select()
    .from(contactRoles)
    .where(eq(contactRoles.contactId, id))
    .orderBy(sql`${contactRoles.startedAt} desc`);
  return { contact, roles };
}

/** Used by autocomplete in the new-lead drawer. */
export async function searchContacts(query: string): Promise<Contact[]> {
  const db = getDb();
  if (!db) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q.toLowerCase()}%`;
  const rows = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.isArchived, false),
        or(
          sql`lower(${contacts.fullName}) like ${like}`,
          sql`lower(${contacts.email}) like ${like}`,
          sql`${contacts.phone} like ${like.replace(/%/g, "")}%`,
        ),
      ),
    )
    .limit(20);
  return rows;
}

/**
 * Returns the active lead role for a given contact + project, if any.
 * Used by the new-lead drawer to detect an existing pipeline entry.
 */
export async function getActiveLeadRole(
  contactId: string,
  projectId: string,
): Promise<ContactRole | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(contactRoles)
    .where(
      and(
        eq(contactRoles.contactId, contactId),
        eq(contactRoles.role, "lead"),
        eq(contactRoles.scopeProjectId, projectId),
        isNull(contactRoles.endedAt),
        eq(contactRoles.organizationId, organizationId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
