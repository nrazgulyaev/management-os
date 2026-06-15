import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  contactInteractions,
  contacts,
  contactRoles,
  type ContactInteraction,
  type NewContactInteraction,
} from "@/lib/db/schema/contacts";
import type { InteractionListItem } from "@/lib/development/types/sales";

/**
 * Re-export shared types so existing server-side imports keep working.
 * Client components should import from `@/lib/development/types/sales`
 * directly to avoid pulling this module's `server-only` guard into the
 * client bundle.
 */
export type { InteractionListItem } from "@/lib/development/types/sales";

function rowToItem(row: ContactInteraction): InteractionListItem {
  return {
    id: row.id,
    contactId: row.contactId,
    projectId: row.projectId,
    interactionType: row.interactionType,
    direction: row.direction,
    occurredAt: row.occurredAt instanceof Date ? row.occurredAt.toISOString() : String(row.occurredAt),
    durationSeconds: row.durationSeconds,
    subject: row.subject,
    body: row.body,
    aiSummary: row.aiSummary,
    aiSentiment: row.aiSentiment,
    aiActionItems: row.aiActionItems,
    aiGeneratedAt:
      row.aiGeneratedAt instanceof Date ? row.aiGeneratedAt.toISOString() : null,
    aiModel: row.aiModel,
    reviewStatus: row.reviewStatus,
    reviewedAt:
      row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : null,
    reviewNotes: row.reviewNotes,
    followUpRequired: row.followUpRequired,
    followUpDueAt:
      row.followUpDueAt instanceof Date ? row.followUpDueAt.toISOString() : null,
    followUpCompleted: row.followUpCompleted,
  };
}

export async function getContactInteractions(
  contactId: string,
): Promise<InteractionListItem[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(contactInteractions)
    .where(
      and(
        eq(contactInteractions.contactId, contactId),
        eq(contactInteractions.organizationId, organizationId),
      ),
    )
    .orderBy(desc(contactInteractions.occurredAt));
  return rows.map(rowToItem);
}

/** AI drafts awaiting human review for a given contact. */
export async function getPendingDraftsForContact(
  contactId: string,
): Promise<InteractionListItem[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(contactInteractions)
    .where(
      and(
        eq(contactInteractions.contactId, contactId),
        eq(contactInteractions.organizationId, organizationId),
        eq(contactInteractions.reviewStatus, "pending"),
      ),
    )
    .orderBy(desc(contactInteractions.occurredAt));
  return rows.map(rowToItem);
}

export async function getProjectInteractions(
  projectId: string,
  limit = 50,
): Promise<InteractionListItem[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(contactInteractions)
    .where(
      and(
        eq(contactInteractions.projectId, projectId),
        eq(contactInteractions.organizationId, organizationId),
      ),
    )
    .orderBy(desc(contactInteractions.occurredAt))
    .limit(limit);
  return rows.map(rowToItem);
}

export async function logInteraction(
  input: NewContactInteraction,
): Promise<ContactInteraction> {
  const db = getDb();
  if (!db) {
    throw new Error("Database is not configured. logInteraction requires DATABASE_URL.");
  }
  const organizationId = await requireOrgId();

  // Never trust input-supplied FKs: prove the contact (and any related role)
  // belong to the caller's org before inserting.
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, input.contactId),
        eq(contacts.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!contact) {
    throw new Error("Contact not found in this organization");
  }

  if (input.relatedRoleId) {
    const [role] = await db
      .select({ id: contactRoles.id })
      .from(contactRoles)
      .where(
        and(
          eq(contactRoles.id, input.relatedRoleId),
          eq(contactRoles.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!role) {
      throw new Error("Related role not found in this organization");
    }
  }

  const inserted = await db
    .insert(contactInteractions)
    .values({ ...input, organizationId })
    .returning();
  if (!inserted[0]) throw new Error("Insert returned no row");
  return inserted[0];
}

export async function markFollowUpCompleted(
  interactionId: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const organizationId = await requireOrgId();
  await db
    .update(contactInteractions)
    .set({ followUpCompleted: true, updatedAt: new Date() })
    .where(
      and(
        eq(contactInteractions.id, interactionId),
        eq(contactInteractions.organizationId, organizationId),
      ),
    );
}

/** Count of pending AI drafts across the workspace — used in topbar badges. */
export async function getPendingDraftCount(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const organizationId = await requireOrgId();
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(contactInteractions)
    .where(
      and(
        eq(contactInteractions.reviewStatus, "pending"),
        eq(contactInteractions.organizationId, organizationId),
      ),
    );
  return Number(row?.c ?? 0);
}
