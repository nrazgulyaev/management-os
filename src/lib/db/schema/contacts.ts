import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { unitTypes } from "./development";
import { guests } from "./bookings";
import { owners } from "./ownership";
import { documents } from "./documents";
import { aiAssistantRuns } from "./ai";
import { organizations } from "./saas";

/**
 * Development OS — Stage 2.2.A schema (contacts foundation).
 *
 * One shared person entity (`contacts`) carries a bag of role records via
 * `contact_roles`. Anything a person *does* in the Development OS — be a
 * lead, become a buyer, sign as an agent, contribute land in a JV — is
 * a row in `contact_roles`, never a separate person table.
 *
 * `contacts.linked_*` FKs bridge to Management OS without forcing a
 * cross-schema migration: the same human can exist as a `guest` in the
 * booking system and an `owner` after handover, all linked to one
 * `contacts.id` for audit and AI grounding.
 *
 * See docs/development-os-architecture.md.
 */

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via a
     *  project-scoped contact_role → projects.organization_id (else default).
     *  Not threaded into queries yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    fullName: text("full_name").notNull(),
    displayName: text("display_name"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    /** Stage 3.D — WhatsApp routing flag (whatsapp_phone column added separately for E.164 normalised lookups). */
    whatsappPhone: text("whatsapp_phone"),
    prefersWhatsapp: boolean("prefers_whatsapp").notNull().default(false),
    preferredLanguage: text("preferred_language").notNull().default("en"),
    /** 'email' | 'whatsapp' | 'phone' | 'in_person' */
    preferredCommunicationChannel: text("preferred_communication_channel"),
    /** ISO 3166-1 alpha-2 */
    countryOfResidence: text("country_of_residence"),
    citizenship: text("citizenship"),
    taxResidency: text("tax_residency"),
    /** 'website' | 'instagram' | 'meta_ads' | 'agent' | 'referral' | 'cold' | 'other' */
    acquisitionSource: text("acquisition_source"),
    acquisitionSourceDetail: text("acquisition_source_detail"),
    /** Bridge into Management OS without forcing schema unification. */
    linkedGuestId: uuid("linked_guest_id").references(() => guests.id, {
      onDelete: "set null",
    }),
    linkedOwnerId: uuid("linked_owner_id").references(() => owners.id, {
      onDelete: "set null",
    }),
    linkedAppUserId: uuid("linked_app_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
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
    index("contacts_email_lower_idx").on(sql`lower(${t.email})`),
    index("contacts_phone_idx").on(t.phone),
    index("contacts_acquisition_source_idx")
      .on(t.acquisitionSource)
      .where(sql`${t.isArchived} = false`),
    index("contacts_organization_idx").on(t.organizationId),
  ],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .unique()
      .references(() => contacts.id, { onDelete: "restrict" }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  contact → contacts.organization_id. Not threaded into queries yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    agencyName: text("agency_name"),
    agreementSignedAt: date("agreement_signed_at"),
    agreementDocumentId: uuid("agreement_document_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),
    defaultCommissionPercent: numeric("default_commission_percent", {
      precision: 6,
      scale: 3,
    }),
    /** 'percent_of_sale' | 'flat_fee' | 'tiered' */
    defaultCommissionStructure: text("default_commission_structure"),
    /** 'draft' | 'active' | 'paused' | 'terminated' */
    agreementStatus: text("agreement_status").notNull().default("draft"),
    agreementNotes: text("agreement_notes"),
    isPreferredPartner: boolean("is_preferred_partner")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agents_status_active_idx")
      .on(t.agreementStatus)
      .where(sql`${t.agreementStatus} = 'active'`),
    index("agents_organization_idx").on(t.organizationId),
  ],
);

export const leadSources = pgTable(
  "lead_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** TENANCY (migration 0154): nullable org anchor. lead_sources have no
     *  tenant parent — backfilled to ARCONIQUE_DEFAULT. Not threaded yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    sourceCode: text("source_code").notNull().unique(),
    /** 'website' | 'paid_ads' | 'organic_social' | 'agent' | 'referral' | 'event' | 'cold' | 'other' */
    sourceCategory: text("source_category").notNull().default("other"),
    campaignName: text("campaign_name"),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lead_sources_category_active_idx")
      .on(t.sourceCategory)
      .where(sql`${t.isActive} = true`),
    index("lead_sources_organization_idx").on(t.organizationId),
  ],
);

export const contactRoles = pgTable(
  "contact_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  scope_project → projects.organization_id (else the contact's org).
     *  Not threaded into queries yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    /** 'lead' | 'buyer' | 'investor' | 'owner' | 'agent' | 'tenant' | 'landowner' | 'vendor' | 'employee' */
    role: text("role").notNull(),
    /** 'global' | 'project' | 'unit' */
    scope: text("scope").notNull().default("global"),
    scopeProjectId: uuid("scope_project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    scopeUnitId: uuid("scope_unit_id").references(() => villas.id, {
      onDelete: "cascade",
    }),
    /** Pipeline status (lead-stage values; see architecture doc for full set). */
    status: text("status").notNull().default("new"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** 'converted' | 'lost' | 'completed' | 'transferred' */
    endReason: text("end_reason"),
    assignedTo: uuid("assigned_to").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    sourceId: uuid("source_id").references(() => leadSources.id, {
      onDelete: "set null",
    }),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    unitTypeInterestId: uuid("unit_type_interest_id").references(
      () => unitTypes.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("contact_roles_contact_idx").on(t.contactId),
    index("contact_roles_organization_idx").on(t.organizationId),
    index("contact_roles_role_status_idx").on(t.role, t.status),
    index("contact_roles_project_idx").on(t.scopeProjectId),
    index("contact_roles_assigned_active_idx")
      .on(t.assignedTo)
      .where(sql`${t.endedAt} IS NULL`),
    /** At most one active role of a kind per project per contact. */
    uniqueIndex("contact_roles_active_unique")
      .on(t.contactId, t.role, t.scopeProjectId)
      .where(sql`${t.endedAt} IS NULL`),
  ],
);

export const contactInteractions = pgTable(
  "contact_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  project → projects.organization_id (else the contact's org).
     *  Not threaded into queries yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    /** 'call' | 'whatsapp_message' | 'whatsapp_voice' | 'email_in' | 'email_out'
     *  | 'zoom_meeting' | 'site_meeting' | 'sms' | 'in_person' | 'note'
     *  | 'system_event' | 'ai_draft' */
    interactionType: text("interaction_type").notNull(),
    /** 'inbound' | 'outbound' | 'internal_note' */
    direction: text("direction").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds"),
    subject: text("subject"),
    body: text("body"),
    documentIds: jsonb("document_ids"),

    aiSummary: text("ai_summary"),
    /** 'positive' | 'neutral' | 'negative' | 'urgent' */
    aiSentiment: text("ai_sentiment"),
    aiActionItems: jsonb("ai_action_items"),
    aiGeneratedAt: timestamp("ai_generated_at", { withTimezone: true }),
    aiModel: text("ai_model"),
    aiRunId: uuid("ai_run_id").references(() => aiAssistantRuns.id, {
      onDelete: "set null",
    }),

    /** HITL state. AI drafts start at 'pending'; manual logs at 'not_required'. */
    reviewStatus: text("review_status").notNull().default("not_required"),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),

    relatedRoleId: uuid("related_role_id").references(() => contactRoles.id, {
      onDelete: "set null",
    }),
    followUpRequired: boolean("follow_up_required").notNull().default(false),
    followUpDueAt: timestamp("follow_up_due_at", { withTimezone: true }),
    followUpAssignedTo: uuid("follow_up_assigned_to").references(
      () => appUsers.id,
      { onDelete: "set null" },
    ),
    followUpCompleted: boolean("follow_up_completed").notNull().default(false),

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
    index("contact_interactions_contact_at_idx").on(
      t.contactId,
      sql`${t.occurredAt} desc`,
    ),
    index("contact_interactions_project_at_idx").on(
      t.projectId,
      sql`${t.occurredAt} desc`,
    ),
    index("contact_interactions_followup_due_idx")
      .on(t.followUpDueAt)
      .where(
        sql`${t.followUpRequired} = true AND ${t.followUpCompleted} = false`,
      ),
    index("contact_interactions_review_pending_idx")
      .on(t.reviewStatus)
      .where(sql`${t.reviewStatus} = 'pending'`),
    index("contact_interactions_organization_idx").on(t.organizationId),
  ],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type ContactRole = typeof contactRoles.$inferSelect;
export type NewContactRole = typeof contactRoles.$inferInsert;
export type ContactInteraction = typeof contactInteractions.$inferSelect;
export type NewContactInteraction = typeof contactInteractions.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type LeadSource = typeof leadSources.$inferSelect;
export type NewLeadSource = typeof leadSources.$inferInsert;
