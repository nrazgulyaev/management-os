/**
 * Stage 5.A.3 — Method statements + quality standards.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const methodStatements = pgTable(
  "method_statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    methodCode: text("method_code").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    /**
     * 'structural' | 'mep_electrical' | 'mep_plumbing' | 'mep_hvac'
     * | 'finishing' | 'safety' | 'demolition' | 'site_preparation'
     * | 'inspection' | 'handover' | 'general'
     */
    category: text("category").notNull(),
    applicableWorkTypes: text("applicable_work_types").array(),
    applicableSpecifications: uuid("applicable_specifications")
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** [{step, instruction, duration}] */
    procedureSteps: jsonb("procedure_steps").notNull(),
    requiredTools: text("required_tools").array(),
    requiredMaterials: text("required_materials").array(),
    requiredPpe: text("required_ppe").array(),
    qualityCheckpoints: jsonb("quality_checkpoints"),
    safetyHazards: text("safety_hazards").array(),
    hazardMitigations: text("hazard_mitigations").array(),
    referenceDocuments: uuid("reference_documents")
      .array()
      .notNull()
      .default(sql`'{}'`),
    referenceVideoUrls: text("reference_video_urls").array(),
    versionNumber: integer("version_number").notNull().default(1),
    /**
     * 'draft' | 'under_review' | 'approved' | 'active' | 'superseded' | 'archived'
     */
    status: text("status").notNull().default("draft"),
    effectiveFrom: date("effective_from"),
    effectiveUntil: date("effective_until"),
    supersededBy: uuid("superseded_by"),
    approvedBy: uuid("approved_by").references(() => appUsers.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    categoryIdx: index("method_statements_category_idx").on(t.category),
    statusIdx: index("method_statements_status_idx").on(t.status),
  }),
);

export const qualityStandards = pgTable(
  "quality_standards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    standardCode: text("standard_code").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    acceptanceCriteria: text("acceptance_criteria").notNull(),
    measurementMethod: text("measurement_method"),
    /** {dimension, tolerance, unit} */
    toleranceSpecification: jsonb("tolerance_specification"),
    referencePhotosAcceptable: uuid("reference_photos_acceptable")
      .array()
      .notNull()
      .default(sql`'{}'`),
    referencePhotosUnacceptable: uuid("reference_photos_unacceptable")
      .array()
      .notNull()
      .default(sql`'{}'`),
    referenceDocuments: uuid("reference_documents")
      .array()
      .notNull()
      .default(sql`'{}'`),
    industryStandardsReference: text("industry_standards_reference").array(),
    applicableSpecifications: uuid("applicable_specifications")
      .array()
      .notNull()
      .default(sql`'{}'`),
    applicableMethodStatements: uuid("applicable_method_statements")
      .array()
      .notNull()
      .default(sql`'{}'`),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    categoryIdx: index("quality_standards_category_idx").on(t.category),
    activeIdx: index("quality_standards_active_idx").on(t.isActive),
  }),
);

export type MethodStatement = typeof methodStatements.$inferSelect;
export type NewMethodStatement = typeof methodStatements.$inferInsert;
export type QualityStandard = typeof qualityStandards.$inferSelect;
export type NewQualityStandard = typeof qualityStandards.$inferInsert;
