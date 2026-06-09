import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  crmTags,
  crmTagAssignments,
  crmCustomFieldDefs,
  crmCustomFieldValues,
} from "@/lib/db/schema/crm-custom-fields";
import {
  coerceFieldValue,
  isFieldType,
  toTagColor,
  type CustomFieldView,
  type TagView,
} from "./shared";

/**
 * CRM-CUSTOM-FIELDS-TAGS — read layer (server components).
 *
 * Every read is org-scoped (requireOrgId → explicit WHERE org). getDb() may
 * be null (demo / no DB): all readers degrade to empty results so detail
 * pages still render.
 */

/** Coerce a stored options jsonb into a string[] (or null). */
function parseOptions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((x): x is string => typeof x === "string");
  return out.length > 0 ? out : null;
}

/** Every tag in the org's vocabulary (active first), for chip pickers/filters. */
export async function listOrgTags(): Promise<TagView[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db
    .select()
    .from(crmTags)
    .where(and(eq(crmTags.organizationId, orgId), eq(crmTags.isArchived, false)))
    .orderBy(asc(crmTags.label));
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    slug: r.slug,
    color: toTagColor(r.color),
    description: r.description,
  }));
}

/** The tags currently assigned to ONE subject. */
export async function listTagsForSubject(
  subjectType: string,
  subjectId: string,
): Promise<TagView[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db
    .select({ tag: crmTags })
    .from(crmTagAssignments)
    .innerJoin(crmTags, eq(crmTags.id, crmTagAssignments.tagId))
    .where(
      and(
        eq(crmTagAssignments.organizationId, orgId),
        eq(crmTagAssignments.subjectType, subjectType),
        eq(crmTagAssignments.subjectId, subjectId),
        eq(crmTags.isArchived, false),
      ),
    )
    .orderBy(asc(crmTags.label));
  return rows.map((r) => ({
    id: r.tag.id,
    label: r.tag.label,
    slug: r.tag.slug,
    color: toTagColor(r.tag.color),
    description: r.tag.description,
  }));
}

/**
 * Subject ids (of one type) that carry a given tag — drives the list filter.
 * Returns an empty array in demo mode (no DB).
 */
export async function listSubjectIdsWithTag(
  subjectType: string,
  tagId: string,
): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db
    .select({ subjectId: crmTagAssignments.subjectId })
    .from(crmTagAssignments)
    .where(
      and(
        eq(crmTagAssignments.organizationId, orgId),
        eq(crmTagAssignments.subjectType, subjectType),
        eq(crmTagAssignments.tagId, tagId),
      ),
    );
  return rows.map((r) => r.subjectId);
}

/**
 * Tags for MANY subjects at once (list pages) → Map<subjectId, TagView[]>.
 * One round-trip instead of N.
 */
export async function listTagsForSubjects(
  subjectType: string,
  subjectIds: string[],
): Promise<Map<string, TagView[]>> {
  const out = new Map<string, TagView[]>();
  const db = getDb();
  if (!db || subjectIds.length === 0) return out;
  const orgId = await requireOrgId();
  const rows = await db
    .select({ subjectId: crmTagAssignments.subjectId, tag: crmTags })
    .from(crmTagAssignments)
    .innerJoin(crmTags, eq(crmTags.id, crmTagAssignments.tagId))
    .where(
      and(
        eq(crmTagAssignments.organizationId, orgId),
        eq(crmTagAssignments.subjectType, subjectType),
        inArray(crmTagAssignments.subjectId, subjectIds),
        eq(crmTags.isArchived, false),
      ),
    )
    .orderBy(asc(crmTags.label));
  for (const r of rows) {
    const list = out.get(r.subjectId) ?? [];
    list.push({
      id: r.tag.id,
      label: r.tag.label,
      slug: r.tag.slug,
      color: toTagColor(r.tag.color),
      description: r.tag.description,
    });
    out.set(r.subjectId, list);
  }
  return out;
}

/**
 * Custom fields for ONE subject — joins the org's field defs (for `entity`)
 * with this subject's values via a LEFT join, so unset fields still appear
 * (value: null). Ordered by displayOrder.
 */
export async function listCustomFieldsForSubject(
  entity: string,
  subjectId: string,
): Promise<CustomFieldView[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db
    .select({ def: crmCustomFieldDefs, val: crmCustomFieldValues })
    .from(crmCustomFieldDefs)
    .leftJoin(
      crmCustomFieldValues,
      and(
        eq(crmCustomFieldValues.defId, crmCustomFieldDefs.id),
        eq(crmCustomFieldValues.subjectType, entity),
        eq(crmCustomFieldValues.subjectId, subjectId),
      ),
    )
    .where(
      and(
        eq(crmCustomFieldDefs.organizationId, orgId),
        eq(crmCustomFieldDefs.entity, entity),
        eq(crmCustomFieldDefs.isArchived, false),
      ),
    )
    .orderBy(asc(crmCustomFieldDefs.displayOrder), asc(crmCustomFieldDefs.label));
  return rows.map((r) => {
    const fieldType = isFieldType(r.def.fieldType) ? r.def.fieldType : "text";
    return {
      defId: r.def.id,
      key: r.def.key,
      label: r.def.label,
      fieldType,
      options: parseOptions(r.def.options),
      helpText: r.def.helpText,
      displayOrder: r.def.displayOrder,
      value: r.val ? coerceFieldValue(fieldType, r.val.value) : null,
    };
  });
}

/** The org's custom-field DEFS for an entity (for the settings/admin view). */
export async function listFieldDefs(entity: string): Promise<
  Array<{
    id: string;
    key: string;
    label: string;
    fieldType: CustomFieldView["fieldType"];
    options: string[] | null;
    helpText: string | null;
    displayOrder: number;
  }>
> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db
    .select()
    .from(crmCustomFieldDefs)
    .where(
      and(
        eq(crmCustomFieldDefs.organizationId, orgId),
        eq(crmCustomFieldDefs.entity, entity),
        eq(crmCustomFieldDefs.isArchived, false),
      ),
    )
    .orderBy(asc(crmCustomFieldDefs.displayOrder), asc(crmCustomFieldDefs.label));
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    fieldType: isFieldType(r.fieldType) ? r.fieldType : "text",
    options: parseOptions(r.options),
    helpText: r.helpText,
    displayOrder: r.displayOrder,
  }));
}
