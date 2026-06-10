"use server";

/**
 * CRM ACTIVITY TIMELINE (#169 · migration 0144) — record + list server module.
 *
 * The relationship-layer spine: every CRM surface records into and reads from
 * this one stream. Both exports are async (BUILD-SAFETY for "use server"); all
 * sync types/constants live in ./types.
 *
 * Org-scoped: writes stamp organizationId via requireOrgId(); reads AND the
 * org into the WHERE so a tenant never sees another tenant's feed (with a
 * legacy-null fallback so pre-existing nullable rows remain visible to their
 * own surface). DB may be unconfigured (getDb() === null) — guarded everywhere.
 *
 * Audit-logged: a recorded activity also emits an `crm.activity.record` audit
 * event (best-effort, never blocks the primary write).
 */

import { and, desc, eq, or, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { crmActivities } from "@/lib/db/schema/crm-activities";
import { contacts } from "@/lib/db/schema/contacts";
import { buyers } from "@/lib/db/schema/buyers";
import { leads } from "@/lib/db/schema/marketing";
import { projects } from "@/lib/db/schema/projects";
import { ownershipShares } from "@/lib/db/schema/ownership";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { recordAuditEvent } from "@/features/audit/services";
import {
  isCrmActivityKind,
  isCrmSubjectType,
  type CrmActivityKind,
  type CrmActivityView,
  type CrmSubjectType,
  type RecordCrmActivityInput,
} from "./types";

function toView(row: typeof crmActivities.$inferSelect): CrmActivityView {
  return {
    id: row.id,
    subjectType: (isCrmSubjectType(row.subjectType)
      ? row.subjectType
      : "contact") as CrmSubjectType,
    subjectId: row.subjectId,
    kind: (isCrmActivityKind(row.kind) ? row.kind : "note") as CrmActivityKind,
    title: row.title,
    body: row.body,
    actorAppUserId: row.actorAppUserId,
    actorName: row.actorName,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    occurredAt: row.occurredAt.toISOString(),
  };
}

/**
 * Lightweight tenant guard: does `subjectId` exist within `organizationId`
 * for the given subject type? `contact`/`buyer` carry `organization_id`
 * directly; `owner` anchors via `ownership_shares`; `lead` has no direct
 * org column so it anchors via its `contact` or `project`. Returns true on
 * the legacy/unknown path so we never harden into a regression for subject
 * types that lack a resolvable org anchor.
 *
 * Local (non-exported) on purpose: this is a "use server" module, so only
 * async *exports* are permitted — internal helpers are unrestricted.
 */
async function subjectBelongsToOrg(
  db: NonNullable<ReturnType<typeof getDb>>,
  subjectType: CrmSubjectType,
  subjectId: string,
  organizationId: string,
): Promise<boolean> {
  switch (subjectType) {
    case "contact": {
      const [r] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(eq(contacts.id, subjectId), eq(contacts.organizationId, organizationId)),
        )
        .limit(1);
      return Boolean(r);
    }
    case "buyer": {
      const [r] = await db
        .select({ id: buyers.id })
        .from(buyers)
        .where(
          and(eq(buyers.id, subjectId), eq(buyers.organizationId, organizationId)),
        )
        .limit(1);
      return Boolean(r);
    }
    case "lead": {
      // leads has no direct org column — anchor via its contact, else its
      // project. A lead in-org by either anchor passes.
      const [byContact] = await db
        .select({ id: leads.id })
        .from(leads)
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .where(
          and(eq(leads.id, subjectId), eq(contacts.organizationId, organizationId)),
        )
        .limit(1);
      if (byContact) return true;
      const [byProject] = await db
        .select({ id: leads.id })
        .from(leads)
        .innerJoin(projects, eq(projects.id, leads.projectId))
        .where(
          and(eq(leads.id, subjectId), eq(projects.organizationId, organizationId)),
        )
        .limit(1);
      return Boolean(byProject);
    }
    case "owner": {
      // owners has no direct org column — the anchor is on ownership_shares.
      const [r] = await db
        .select({ id: ownershipShares.id })
        .from(ownershipShares)
        .where(
          and(
            eq(ownershipShares.ownerId, subjectId),
            eq(ownershipShares.organizationId, organizationId),
          ),
        )
        .limit(1);
      return Boolean(r);
    }
    default:
      return true;
  }
}

/**
 * Append one activity to the unified stream. Returns the new id (or null when
 * the DB is unconfigured / the write is skipped). The actor is resolved from
 * the current session; system-generated events pass no actor and are stamped
 * with the session user if one exists.
 *
 * Designed to be called from inside other server actions (status changes, note
 * adds) — best-effort: never throw, so the caller's primary write is never
 * broken by a timeline failure.
 */
export async function recordCrmActivity(
  input: RecordCrmActivityInput,
): Promise<string | null> {
  if (!isCrmSubjectType(input.subjectType)) return null;
  if (!isCrmActivityKind(input.kind)) return null;
  const title = input.title.trim();
  if (!title) return null;

  const db = getDb();
  if (!db) return null;

  try {
    const organizationId = await requireOrgId();

    // Tenant-integrity guard: never append a timeline entry against a subject
    // that does not belong to the caller's org. The org is stamped on the
    // row, but the caller-supplied subjectId is otherwise untrusted — verify
    // the subject exists within this org before writing (behaviour-neutral
    // under single-tenant; closes a cross-tenant write under multi-tenant).
    if (!(await subjectBelongsToOrg(db, input.subjectType, input.subjectId, organizationId))) {
      return null;
    }

    const ctx = await getCurrentUserContext();
    const actorAppUserId = ctx.appUser?.id ?? null;
    const actorName = ctx.appUser?.fullName ?? null;

    const [row] = await db
      .insert(crmActivities)
      .values({
        organizationId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        kind: input.kind,
        title: title.slice(0, 280),
        body: input.body?.trim() ? input.body.trim().slice(0, 8000) : null,
        actorAppUserId,
        actorName,
        metadata: input.metadata ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      })
      .returning({ id: crmActivities.id });

    // Audit (best-effort — must not break the timeline write).
    await recordAuditEvent({
      actorUserId: actorAppUserId,
      action: "crm.activity.record",
      entityType: `crm_${input.subjectType}`,
      entityId: input.subjectId,
      metadata: { kind: input.kind, title: title.slice(0, 280) },
    });

    return row?.id ?? null;
  } catch (err) {
    // Timeline failures must never break the caller's primary action.
    console.error("[crm-activity] failed to record", err);
    return null;
  }
}

/**
 * List the activity feed for one subject, newest first. Org-scoped: only the
 * caller's tenant rows (plus legacy null-org rows) are returned. Returns []
 * when the DB is unconfigured.
 */
export async function listCrmActivities(
  subjectType: CrmSubjectType,
  subjectId: string,
  opts?: { limit?: number; kind?: CrmActivityKind },
): Promise<CrmActivityView[]> {
  if (!isCrmSubjectType(subjectType)) return [];

  const db = getDb();
  if (!db) return [];

  try {
    const organizationId = await requireOrgId();
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);

    const conds = [
      eq(crmActivities.subjectType, subjectType),
      eq(crmActivities.subjectId, subjectId),
      // Tenant isolation — own-org rows + legacy null-org rows.
      or(
        eq(crmActivities.organizationId, organizationId),
        isNull(crmActivities.organizationId),
      ),
    ];
    if (opts?.kind && isCrmActivityKind(opts.kind)) {
      conds.push(eq(crmActivities.kind, opts.kind));
    }

    const rows = await db
      .select()
      .from(crmActivities)
      .where(and(...conds))
      .orderBy(desc(crmActivities.occurredAt))
      .limit(limit);

    return rows.map(toView);
  } catch (err) {
    console.error("[crm-activity] failed to list", err);
    return [];
  }
}
