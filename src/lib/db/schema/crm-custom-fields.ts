import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./saas";
import { appUsers } from "./identity";

/**
 * CRM-CUSTOM-FIELDS-TAGS (migration 0147) — Attio-style generic
 * tagging + custom-field overlay for ANY CRM subject.
 *
 * Three tables, all org-scoped (TENANT) and audit-logged at the action
 * layer. Deliberately generic via a `subject_type` discriminator so the
 * same machinery serves owners, contacts, leads, guests, villas — anything
 * the CRM ever needs to annotate — WITHOUT a per-entity column sprawl.
 *
 *   crm_tags                — the org's tag vocabulary (label + colour).
 *   crm_tag_assignments     — join: (subject_type, subject_id) → tag.
 *   crm_custom_field_defs   — org-scoped field schema per entity
 *                             (key, label, type, select-options).
 *   crm_custom_field_values — (subject + def) → typed value bag.
 *
 * `subject_type` is a plain text discriminator (no FK) precisely so this
 * never has to know about the modules it annotates — the action layer
 * validates the subject exists + belongs to the org before writing.
 *
 * Custom-field VALUE is stored as a single `value` jsonb column so one
 * row serves text | number | date | select uniformly; the def's `fieldType`
 * tells readers how to coerce it. No money lives here (CRM metadata only).
 */

/** Known subject discriminators. Generic — extend freely; no DB enum. */
export const CRM_SUBJECT_TYPES = [
  "owner",
  "contact",
  "lead",
  "guest",
  "villa",
] as const;
export type CrmSubjectType = (typeof CRM_SUBJECT_TYPES)[number];

/** Custom-field value types. */
export const CRM_FIELD_TYPES = ["text", "number", "date", "select"] as const;
export type CrmFieldType = (typeof CRM_FIELD_TYPES)[number];

// -----------------------------------------------------------------------------
// crm_tags — the org's tag vocabulary.
// -----------------------------------------------------------------------------
export const crmTags = pgTable(
  "crm_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Human label, e.g. "VIP", "At risk", "Repeat buyer". */
    label: text("label").notNull(),
    /** Lower-cased slug for case-insensitive uniqueness within the org. */
    slug: text("slug").notNull(),
    /** Layer-B token name (e.g. 'accent' | 'gold' | 'success' | 'danger' |
     *  'info' | 'warning' | 'neutral') — drives the chip tone. */
    color: text("color").notNull().default("neutral"),
    description: text("description"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One tag slug per org (case-insensitive via stored lower-case slug).
    uniqueIndex("crm_tags_org_slug_unique").on(t.organizationId, t.slug),
    index("crm_tags_org_active_idx")
      .on(t.organizationId)
      .where(sql`${t.isArchived} = false`),
  ],
);

// -----------------------------------------------------------------------------
// crm_tag_assignments — join (subject_type, subject_id) → tag.
// -----------------------------------------------------------------------------
export const crmTagAssignments = pgTable(
  "crm_tag_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => crmTags.id, { onDelete: "cascade" }),
    /** Generic discriminator — see CRM_SUBJECT_TYPES. No FK (cross-module). */
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    assignedBy: uuid("assigned_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // A tag is on a subject at most once.
    uniqueIndex("crm_tag_assignments_unique").on(
      t.tagId,
      t.subjectType,
      t.subjectId,
    ),
    // "What tags are on this subject?" — the detail-page read.
    index("crm_tag_assignments_subject_idx").on(
      t.organizationId,
      t.subjectType,
      t.subjectId,
    ),
    // "Which subjects carry this tag?" — the list filter.
    index("crm_tag_assignments_tag_idx").on(t.organizationId, t.tagId),
  ],
);

// -----------------------------------------------------------------------------
// crm_custom_field_defs — org-scoped field schema per entity.
// -----------------------------------------------------------------------------
export const crmCustomFieldDefs = pgTable(
  "crm_custom_field_defs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Which entity this field applies to — see CRM_SUBJECT_TYPES. */
    entity: text("entity").notNull(),
    /** Stable machine key (snake_case), unique per (org, entity). */
    key: text("key").notNull(),
    label: text("label").notNull(),
    /** 'text' | 'number' | 'date' | 'select' — see CRM_FIELD_TYPES. */
    fieldType: text("field_type").notNull(),
    /** For 'select': the allowed option strings. JSON array of strings. */
    options: jsonb("options"),
    helpText: text("help_text"),
    displayOrder: integer("display_order").notNull().default(100),
    isArchived: boolean("is_archived").notNull().default(false),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_custom_field_defs_key_unique").on(
      t.organizationId,
      t.entity,
      t.key,
    ),
    index("crm_custom_field_defs_entity_idx")
      .on(t.organizationId, t.entity, t.displayOrder)
      .where(sql`${t.isArchived} = false`),
  ],
);

// -----------------------------------------------------------------------------
// crm_custom_field_values — (subject + def) → typed value.
// -----------------------------------------------------------------------------
export const crmCustomFieldValues = pgTable(
  "crm_custom_field_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    defId: uuid("def_id")
      .notNull()
      .references(() => crmCustomFieldDefs.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** Uniform value bag — coerced per the def's fieldType by readers.
     *  text → string · number → number · date → 'YYYY-MM-DD' · select → string. */
    value: jsonb("value"),
    updatedBy: uuid("updated_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One value per (def, subject).
    uniqueIndex("crm_custom_field_values_unique").on(
      t.defId,
      t.subjectType,
      t.subjectId,
    ),
    index("crm_custom_field_values_subject_idx").on(
      t.organizationId,
      t.subjectType,
      t.subjectId,
    ),
  ],
);

export type CrmTag = typeof crmTags.$inferSelect;
export type NewCrmTag = typeof crmTags.$inferInsert;
export type CrmTagAssignment = typeof crmTagAssignments.$inferSelect;
export type NewCrmTagAssignment = typeof crmTagAssignments.$inferInsert;
export type CrmCustomFieldDef = typeof crmCustomFieldDefs.$inferSelect;
export type NewCrmCustomFieldDef = typeof crmCustomFieldDefs.$inferInsert;
export type CrmCustomFieldValue = typeof crmCustomFieldValues.$inferSelect;
export type NewCrmCustomFieldValue = typeof crmCustomFieldValues.$inferInsert;
