import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { rfis, type RfiDiscipline } from "@/lib/db/schema/rfis";
import { contacts } from "@/lib/db/schema/contacts";
import {
  isRfiDiscipline,
  rfiStatus,
  type RfiStatus,
} from "@/features/development/rfi/rfi-routing";

/** A list row enriched with the routed contact's display name + derived status. */
export interface RfiListRow {
  id: string;
  ref: string;
  question: string;
  discipline: RfiDiscipline;
  priority: string;
  status: RfiStatus;
  routedToContactId: string | null;
  routedToName: string | null;
  routedByAgent: boolean;
  openedAt: Date;
  respondedAt: Date | null;
  resolvedAt: Date | null;
}

/** A single RFI with the routed contact + full body for the detail view. */
export interface RfiDetailRow extends RfiListRow {
  projectId: string;
  responseText: string | null;
}

function statusOf(row: { respondedAt: Date | null; resolvedAt: Date | null }): RfiStatus {
  return rfiStatus(row);
}

/**
 * Lists a project's RFIs (newest first), optionally filtered by discipline
 * and/or derived status. The status filter is applied in JS because status
 * is derived from the responded/resolved timestamps, not a stored column.
 */
export async function listProjectRfis(filters: {
  projectId: string;
  discipline?: string;
  status?: string;
}): Promise<RfiListRow[]> {
  const db = requireDb();
  // TENANCY — scope to the caller's org in addition to the project filter.
  // Single-tenant today, so this hides nothing; it is the multi-tenant guard.
  const organizationId = await requireOrgId();
  const conditions = [
    eq(rfis.organizationId, organizationId),
    eq(rfis.projectId, filters.projectId),
  ];
  if (filters.discipline && isRfiDiscipline(filters.discipline)) {
    conditions.push(eq(rfis.discipline, filters.discipline));
  }

  const rows = await db
    .select({
      id: rfis.id,
      ref: rfis.ref,
      question: rfis.question,
      discipline: rfis.discipline,
      priority: rfis.priority,
      routedToContactId: rfis.routedToContactId,
      routedByAgent: rfis.routedByAgent,
      openedAt: rfis.openedAt,
      respondedAt: rfis.respondedAt,
      resolvedAt: rfis.resolvedAt,
      routedToName: contacts.fullName,
      routedToDisplay: contacts.displayName,
    })
    .from(rfis)
    .leftJoin(contacts, eq(rfis.routedToContactId, contacts.id))
    .where(and(...conditions))
    .orderBy(desc(rfis.openedAt));

  const mapped: RfiListRow[] = rows.map((r) => ({
    id: r.id,
    ref: r.ref,
    question: r.question,
    discipline: r.discipline as RfiDiscipline,
    priority: r.priority,
    status: statusOf(r),
    routedToContactId: r.routedToContactId,
    routedToName: r.routedToDisplay ?? r.routedToName,
    routedByAgent: r.routedByAgent,
    openedAt: r.openedAt,
    respondedAt: r.respondedAt,
    resolvedAt: r.resolvedAt,
  }));

  const wanted = filters.status;
  if (wanted === "open" || wanted === "answered" || wanted === "closed") {
    return mapped.filter((r) => r.status === wanted);
  }
  return mapped;
}

/** Loads a single RFI by id, joined to the routed contact. Null when absent. */
export async function getRfiById(id: string): Promise<RfiDetailRow | null> {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [r] = await db
    .select({
      id: rfis.id,
      projectId: rfis.projectId,
      ref: rfis.ref,
      question: rfis.question,
      discipline: rfis.discipline,
      priority: rfis.priority,
      routedToContactId: rfis.routedToContactId,
      routedByAgent: rfis.routedByAgent,
      openedAt: rfis.openedAt,
      respondedAt: rfis.respondedAt,
      resolvedAt: rfis.resolvedAt,
      responseText: rfis.responseText,
      routedToName: contacts.fullName,
      routedToDisplay: contacts.displayName,
    })
    .from(rfis)
    .leftJoin(contacts, eq(rfis.routedToContactId, contacts.id))
    .where(and(eq(rfis.organizationId, organizationId), eq(rfis.id, id)))
    .limit(1);

  if (!r) return null;
  return {
    id: r.id,
    projectId: r.projectId,
    ref: r.ref,
    question: r.question,
    discipline: r.discipline as RfiDiscipline,
    priority: r.priority,
    status: statusOf(r),
    routedToContactId: r.routedToContactId,
    routedToName: r.routedToDisplay ?? r.routedToName,
    routedByAgent: r.routedByAgent,
    openedAt: r.openedAt,
    respondedAt: r.respondedAt,
    resolvedAt: r.resolvedAt,
    responseText: r.responseText,
  };
}

/** Count of currently-open RFIs on the project (for the inbox eyebrow). */
export async function countOpenProjectRfis(projectId: string): Promise<number> {
  const rows = await listProjectRfis({ projectId, status: "open" });
  return rows.length;
}
