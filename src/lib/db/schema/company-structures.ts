/**
 * Stage 4.B.1 — Project company structure (SPV / JV / partnership).
 *
 * Multiple structures per project over time, only one active at a time
 * (enforced by partial unique index on `is_active = true`).
 *
 * Shareholders sum to exactly 100% per structure (DEFERRABLE-INITIALLY-
 * DEFERRED trigger enforces at COMMIT).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  numeric,
  boolean,
  bigint,
  index,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { investors } from "./investor-capital";

export const projectCompanyStructures = pgTable(
  "project_company_structures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    structureLabel: text("structure_label").notNull(),
    /**
     * 'arconique_owned' | 'klr_real_estate' | 'new_spv' | 'joint_venture'
     * | 'landowner_partnership' | 'nominee_structure' | 'custom'
     */
    structureType: text("structure_type").notNull(),

    companyName: text("company_name"),
    companyRegistrationNumber: text("company_registration_number"),
    country: text("country"),
    region: text("region"),
    /**
     * 'planned' | 'in_progress' | 'registered' | 'dissolved' | 'on_hold'
     */
    registrationStatus: text("registration_status").notNull().default("planned"),
    registrationDate: date("registration_date"),
    dissolutionDate: date("dissolution_date"),

    setupCostMinor: bigint("setup_cost_minor", { mode: "bigint" }),
    setupCurrency: text("setup_currency").default("USD"),
    responsibleLegalConsultant: text("responsible_legal_consultant"),

    isActive: boolean("is_active").notNull().default(true),
    effectiveFrom: date("effective_from").notNull(),
    effectiveUntil: date("effective_until"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("project_company_structures_project_idx").on(t.projectId),
    activeIdx: index("project_company_structures_active_idx").on(t.isActive),
  }),
);

export const companyStructureShareholders = pgTable(
  "company_structure_shareholders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    structureId: uuid("structure_id")
      .notNull()
      .references(() => projectCompanyStructures.id, { onDelete: "cascade" }),

    /**
     * 'arconique' | 'investor' | 'klr_real_estate' | 'land_owner' | 'external_party'
     */
    shareholderType: text("shareholder_type").notNull(),
    investorId: uuid("investor_id").references(() => investors.id),

    displayName: text("display_name").notNull(),

    ownershipPercentage: numeric("ownership_percentage", {
      precision: 7,
      scale: 4,
    }).notNull(),

    roleInCompany: text("role_in_company"),
    isManagingParty: boolean("is_managing_party").notNull().default(false),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    structureIdx: index("company_structure_shareholders_structure_idx").on(
      t.structureId,
    ),
    investorIdx: index("company_structure_shareholders_investor_idx").on(
      t.investorId,
    ),
  }),
);

export type ProjectCompanyStructure =
  typeof projectCompanyStructures.$inferSelect;
export type NewProjectCompanyStructure =
  typeof projectCompanyStructures.$inferInsert;
export type CompanyStructureShareholder =
  typeof companyStructureShareholders.$inferSelect;
export type NewCompanyStructureShareholder =
  typeof companyStructureShareholders.$inferInsert;
