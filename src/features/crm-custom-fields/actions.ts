"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  getCurrentUserContext,
  requireInternalUser,
} from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import {
  crmTags,
  crmTagAssignments,
  crmCustomFieldDefs,
  crmCustomFieldValues,
} from "@/lib/db/schema/crm-custom-fields";
import {
  CRM_FIELD_TYPES,
  CRM_SUBJECT_TYPES,
  keyifyField,
  normaliseFieldValue,
  slugifyTag,
  CRM_TAG_COLORS,
} from "./shared";

/**
 * CRM-CUSTOM-FIELDS-TAGS — write layer ("use server"; every export async).
 *
 * Permission-gated (requireInternalUser) + org-scoped (requireOrgId → every
 * INSERT carries organization_id; every UPDATE/DELETE ANDs the org into the
 * WHERE) + audit-logged. getDb()/requireDb() throws under no-DB, so demo mode
 * never reaches these.
 */

/** Accept a plain string (the panel is generic) but validate membership at
 *  runtime so only known subject types ever reach the DB. */
const subjectEnum = z
  .string()
  .refine((s): s is (typeof CRM_SUBJECT_TYPES)[number] =>
    (CRM_SUBJECT_TYPES as readonly string[]).includes(s),
  { message: "Unknown subject type." });
const colorEnum = z.enum(CRM_TAG_COLORS);
const fieldTypeEnum = z.enum(CRM_FIELD_TYPES);

async function actorId(): Promise<string | null> {
  const ctx = await getCurrentUserContext();
  return ctx.appUser?.id ?? null;
}

// -----------------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------------

const createTagSchema = z.object({
  label: z.string().min(1).max(60),
  color: colorEnum.default("neutral"),
  description: z.string().max(280).optional().nullable(),
});

/** Create (or reuse) an org tag, returning its id. Idempotent on slug. */
export async function createTagAction(
  input: z.input<typeof createTagSchema>,
): Promise<{ id: string; label: string; color: string }> {
  const parsed = createTagSchema.parse(input);
  await requireInternalUser();
  const orgId = await requireOrgId();
  const db = requireDb();
  const slug = slugifyTag(parsed.label);
  if (!slug) throw new Error("Tag label must contain at least one letter or number.");

  // Reuse an existing (even archived) tag with the same slug — re-activate it.
  const [existing] = await db
    .select()
    .from(crmTags)
    .where(and(eq(crmTags.organizationId, orgId), eq(crmTags.slug, slug)))
    .limit(1);
  if (existing) {
    if (existing.isArchived) {
      await db
        .update(crmTags)
        .set({ isArchived: false, updatedAt: new Date() })
        .where(and(eq(crmTags.id, existing.id), eq(crmTags.organizationId, orgId)));
    }
    return { id: existing.id, label: existing.label, color: existing.color };
  }

  const actor = await actorId();
  const [row] = await db
    .insert(crmTags)
    .values({
      organizationId: orgId,
      label: parsed.label.trim(),
      slug,
      color: parsed.color,
      description: parsed.description ?? null,
      createdBy: actor,
    })
    .returning({ id: crmTags.id, label: crmTags.label, color: crmTags.color });

  await recordAuditEvent({
    actorUserId: actor,
    action: "crm_tag.create",
    entityType: "crm_tag",
    entityId: row.id,
    after: { label: row.label, slug, color: parsed.color },
    metadata: { organizationId: orgId },
  });
  return row;
}

const assignTagSchema = z.object({
  subjectType: subjectEnum,
  subjectId: z.string().uuid(),
  tagId: z.string().uuid(),
});

/** Put a tag on a subject (idempotent — no-op if already assigned). */
export async function assignTagAction(
  input: z.input<typeof assignTagSchema>,
): Promise<void> {
  const parsed = assignTagSchema.parse(input);
  await requireInternalUser();
  const orgId = await requireOrgId();
  const db = requireDb();

  // The tag must belong to this org (prevents cross-tenant assignment).
  const [tag] = await db
    .select({ id: crmTags.id })
    .from(crmTags)
    .where(and(eq(crmTags.id, parsed.tagId), eq(crmTags.organizationId, orgId)))
    .limit(1);
  if (!tag) throw new Error("Tag not found in this organization.");

  const actor = await actorId();
  // Idempotent: unique index (tag, subject_type, subject_id) → onConflict no-op.
  await db
    .insert(crmTagAssignments)
    .values({
      organizationId: orgId,
      tagId: parsed.tagId,
      subjectType: parsed.subjectType,
      subjectId: parsed.subjectId,
      assignedBy: actor,
    })
    .onConflictDoNothing();

  await recordAuditEvent({
    actorUserId: actor,
    action: "crm_tag.assign",
    entityType: parsed.subjectType,
    entityId: parsed.subjectId,
    after: { tagId: parsed.tagId },
    metadata: { organizationId: orgId },
  });
  revalidateSubject(parsed.subjectType, parsed.subjectId);
}

const removeTagSchema = assignTagSchema;

/** Take a tag off a subject. */
export async function removeTagAction(
  input: z.input<typeof removeTagSchema>,
): Promise<void> {
  const parsed = removeTagSchema.parse(input);
  await requireInternalUser();
  const orgId = await requireOrgId();
  const db = requireDb();
  const actor = await actorId();

  await db
    .delete(crmTagAssignments)
    .where(
      and(
        eq(crmTagAssignments.organizationId, orgId),
        eq(crmTagAssignments.tagId, parsed.tagId),
        eq(crmTagAssignments.subjectType, parsed.subjectType),
        eq(crmTagAssignments.subjectId, parsed.subjectId),
      ),
    );

  await recordAuditEvent({
    actorUserId: actor,
    action: "crm_tag.unassign",
    entityType: parsed.subjectType,
    entityId: parsed.subjectId,
    before: { tagId: parsed.tagId },
    metadata: { organizationId: orgId },
  });
  revalidateSubject(parsed.subjectType, parsed.subjectId);
}

/**
 * One-shot helper for the chip-row "add tag" box: create-or-reuse a tag by
 * label, then assign it. Returns the resolved tag.
 */
const createAndAssignSchema = z.object({
  subjectType: subjectEnum,
  subjectId: z.string().uuid(),
  label: z.string().min(1).max(60),
  color: colorEnum.default("neutral"),
});

export async function createAndAssignTagAction(
  input: z.input<typeof createAndAssignSchema>,
): Promise<{ id: string; label: string; color: string }> {
  const parsed = createAndAssignSchema.parse(input);
  const tag = await createTagAction({
    label: parsed.label,
    color: parsed.color,
  });
  await assignTagAction({
    subjectType: parsed.subjectType,
    subjectId: parsed.subjectId,
    tagId: tag.id,
  });
  return tag;
}

// -----------------------------------------------------------------------------
// Custom field defs
// -----------------------------------------------------------------------------

const createFieldDefSchema = z.object({
  entity: subjectEnum,
  label: z.string().min(1).max(60),
  fieldType: fieldTypeEnum,
  options: z.array(z.string().min(1).max(80)).max(40).optional().nullable(),
  helpText: z.string().max(280).optional().nullable(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
});

export async function createFieldDefAction(
  input: z.input<typeof createFieldDefSchema>,
): Promise<{ id: string; key: string }> {
  const parsed = createFieldDefSchema.parse(input);
  await requireInternalUser();
  const orgId = await requireOrgId();
  const db = requireDb();
  const key = keyifyField(parsed.label);
  if (!key) throw new Error("Field label must contain at least one letter or number.");
  if (parsed.fieldType === "select" && (!parsed.options || parsed.options.length === 0))
    throw new Error("A select field needs at least one option.");

  // Unique (org, entity, key) — reject duplicates with a clean message.
  const [dup] = await db
    .select({ id: crmCustomFieldDefs.id })
    .from(crmCustomFieldDefs)
    .where(
      and(
        eq(crmCustomFieldDefs.organizationId, orgId),
        eq(crmCustomFieldDefs.entity, parsed.entity),
        eq(crmCustomFieldDefs.key, key),
      ),
    )
    .limit(1);
  if (dup) throw new Error(`A field with key "${key}" already exists for ${parsed.entity}.`);

  const actor = await actorId();
  const [row] = await db
    .insert(crmCustomFieldDefs)
    .values({
      organizationId: orgId,
      entity: parsed.entity,
      key,
      label: parsed.label.trim(),
      fieldType: parsed.fieldType,
      options: parsed.fieldType === "select" ? (parsed.options ?? []) : null,
      helpText: parsed.helpText ?? null,
      displayOrder: parsed.displayOrder ?? 100,
      createdBy: actor,
    })
    .returning({ id: crmCustomFieldDefs.id, key: crmCustomFieldDefs.key });

  await recordAuditEvent({
    actorUserId: actor,
    action: "crm_field_def.create",
    entityType: "crm_custom_field_def",
    entityId: row.id,
    after: { entity: parsed.entity, key, fieldType: parsed.fieldType },
    metadata: { organizationId: orgId },
  });
  return row;
}

const archiveFieldDefSchema = z.object({ defId: z.string().uuid() });

export async function archiveFieldDefAction(
  input: z.input<typeof archiveFieldDefSchema>,
): Promise<void> {
  const parsed = archiveFieldDefSchema.parse(input);
  await requireInternalUser();
  const orgId = await requireOrgId();
  const db = requireDb();
  const actor = await actorId();
  await db
    .update(crmCustomFieldDefs)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(
      and(
        eq(crmCustomFieldDefs.id, parsed.defId),
        eq(crmCustomFieldDefs.organizationId, orgId),
      ),
    );
  await recordAuditEvent({
    actorUserId: actor,
    action: "crm_field_def.archive",
    entityType: "crm_custom_field_def",
    entityId: parsed.defId,
    metadata: { organizationId: orgId },
  });
}

// -----------------------------------------------------------------------------
// Custom field values
// -----------------------------------------------------------------------------

const setFieldValueSchema = z.object({
  defId: z.string().uuid(),
  subjectType: subjectEnum,
  subjectId: z.string().uuid(),
  /** Raw string from the form; coerced per the def's field type. */
  rawValue: z.string().max(2000).optional().nullable(),
});

/**
 * Upsert a custom-field value for a subject. An empty/blank rawValue clears
 * the value (deletes the row). Validates against the def's field type/options.
 */
export async function setFieldValueAction(
  input: z.input<typeof setFieldValueSchema>,
): Promise<void> {
  const parsed = setFieldValueSchema.parse(input);
  await requireInternalUser();
  const orgId = await requireOrgId();
  const db = requireDb();

  // Load the def (org-scoped) so we know the type/options to validate against.
  const [def] = await db
    .select()
    .from(crmCustomFieldDefs)
    .where(
      and(
        eq(crmCustomFieldDefs.id, parsed.defId),
        eq(crmCustomFieldDefs.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!def) throw new Error("Field definition not found in this organization.");
  if (def.entity !== parsed.subjectType)
    throw new Error("Field does not apply to this subject type.");

  const fieldType = (CRM_FIELD_TYPES as readonly string[]).includes(def.fieldType)
    ? (def.fieldType as (typeof CRM_FIELD_TYPES)[number])
    : "text";
  const options = Array.isArray(def.options)
    ? (def.options.filter((x): x is string => typeof x === "string"))
    : null;
  const normalised = normaliseFieldValue(fieldType, parsed.rawValue ?? null, options);

  const actor = await actorId();

  if (normalised === null) {
    // Clear → delete the value row (org-scoped).
    await db
      .delete(crmCustomFieldValues)
      .where(
        and(
          eq(crmCustomFieldValues.organizationId, orgId),
          eq(crmCustomFieldValues.defId, parsed.defId),
          eq(crmCustomFieldValues.subjectType, parsed.subjectType),
          eq(crmCustomFieldValues.subjectId, parsed.subjectId),
        ),
      );
  } else {
    // Upsert on the unique (def, subject) index.
    await db
      .insert(crmCustomFieldValues)
      .values({
        organizationId: orgId,
        defId: parsed.defId,
        subjectType: parsed.subjectType,
        subjectId: parsed.subjectId,
        value: normalised,
        updatedBy: actor,
      })
      .onConflictDoUpdate({
        target: [
          crmCustomFieldValues.defId,
          crmCustomFieldValues.subjectType,
          crmCustomFieldValues.subjectId,
        ],
        set: { value: normalised, updatedBy: actor, updatedAt: new Date() },
      });
  }

  await recordAuditEvent({
    actorUserId: actor,
    action: "crm_field_value.set",
    entityType: parsed.subjectType,
    entityId: parsed.subjectId,
    after: { defId: parsed.defId, key: def.key, value: normalised },
    metadata: { organizationId: orgId },
  });
  revalidateSubject(parsed.subjectType, parsed.subjectId);
}

// -----------------------------------------------------------------------------
// Local helpers (kept async-callable indirectly; these are NOT exported).
// -----------------------------------------------------------------------------

/** Best-effort cache bust for the subject's detail page (owner | contact). */
function revalidateSubject(subjectType: string, subjectId: string): void {
  try {
    if (subjectType === "owner")
      revalidatePath(`/dashboard/owners/${subjectId}`);
    // contact/lead detail lives under development-os/sales by contactRoleId,
    // not contactId — callers refresh client-side via router.refresh().
  } catch {
    // revalidatePath throws outside a request scope (e.g. tests) — ignore.
  }
}
