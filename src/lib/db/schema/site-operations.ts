import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { contacts } from "./contacts";
import { documents } from "./documents";
import { devCommitmentsLedger } from "./dev-finance";
import { organizations } from "./saas";

/**
 * Development OS — Stage 2.4 schema (site operations + vendor CRM +
 * material tracking + safety incidents).
 *
 * 13 tables across four domains. All money in BIGINT minor units.
 * Generated columns (PostgreSQL `GENERATED ALWAYS AS ... STORED`) are
 * defined inline below as ordinary columns — Drizzle doesn't have
 * first-class generated-column syntax, so the migration owns the
 * `GENERATED` clause and we expose the column read-only here. INSERTs
 * MUST omit these columns.
 *
 * Generated read-only columns (omit on insert):
 *   - site_workforce_logs.totalManHours  (worker_count × hours_per_worker)
 *   - material_po_lines.lineTotalUsdMinor  (unit_price × quantity_ordered)
 *
 * Money cost columns on workforce_logs are NOT generated — they're
 * computed in the action layer so the post-FX USD conversion can use
 * the at-event rate from `dev_fx_snapshots`.
 *
 * See docs/development-os-architecture.md §"Stage 2.4" for the full
 * schema contract.
 */

// =============================================================================
// VENDOR CRM
// =============================================================================

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: migration 0072 added organization_id NOT NULL.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    vendorCode: text("vendor_code").notNull().unique(),
    legalName: text("legal_name").notNull(),
    legalEntityType: text("legal_entity_type"),
    primaryContactId: uuid("primary_contact_id").references(() => contacts.id, {
      onDelete: "restrict",
    }),

    /**
     * 'general_contractor' | 'subcontractor_civil' | 'subcontractor_mep'
     * | 'subcontractor_finishing' | 'subcontractor_landscaping'
     * | 'architect_designer' | 'engineer_consultant' | 'permits_legal'
     * | 'material_supplier' | 'equipment_rental' | 'logistics_transport'
     * | 'security_services' | 'cleaning_services' | 'other'
     */
    vendorType: text("vendor_type").notNull(),

    primaryPhone: text("primary_phone"),
    primaryEmail: text("primary_email"),
    whatsappPhone: text("whatsapp_phone"),
    address: text("address"),

    taxId: text("tax_id"),
    businessLicenseNumber: text("business_license_number"),
    businessLicenseExpiry: date("business_license_expiry"),

    bankName: text("bank_name"),
    bankAccountHolder: text("bank_account_holder"),
    bankAccountNumber: text("bank_account_number"),
    bankSwift: text("bank_swift"),

    totalCommitmentsCount: integer("total_commitments_count").notNull().default(0),
    totalCommitmentsValueUsdMinor: bigint("total_commitments_value_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    onTimeDeliveryRate: numeric("on_time_delivery_rate", {
      precision: 5,
      scale: 2,
    }),
    qualityRating: numeric("quality_rating", { precision: 3, scale: 2 }),
    lastEngagementAt: date("last_engagement_at"),

    /** 'active' | 'inactive' | 'blacklisted' */
    status: text("status").notNull().default("active"),
    blacklistReason: text("blacklist_reason"),
    blacklistedAt: timestamp("blacklisted_at", { withTimezone: true }),

    notes: text("notes"),
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
    index("vendors_status_idx").on(t.status),
    index("vendors_type_idx").on(t.vendorType),
    index("vendors_contact_idx").on(t.primaryContactId),
  ],
);

export type Vendor = typeof vendors.$inferSelect;
export type VendorInsert = typeof vendors.$inferInsert;

export const vendorEngagements = pgTable(
  "vendor_engagements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: migration 0072 added organization_id NOT NULL.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),

    engagementCode: text("engagement_code").notNull().unique(),
    scopeDescription: text("scope_description").notNull(),

    startDate: date("start_date").notNull(),
    expectedEndDate: date("expected_end_date"),
    actualEndDate: date("actual_end_date"),

    commitmentLedgerId: uuid("commitment_ledger_id").references(
      () => devCommitmentsLedger.id,
      { onDelete: "set null" },
    ),

    /** 'active' | 'paused' | 'completed' | 'terminated' */
    status: text("status").notNull().default("active"),
    terminationReason: text("termination_reason"),

    notes: text("notes"),
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
    index("vendor_engagements_vendor_idx").on(t.vendorId),
    index("vendor_engagements_project_idx").on(t.projectId),
    index("vendor_engagements_status_idx").on(t.status),
  ],
);

export type VendorEngagement = typeof vendorEngagements.$inferSelect;
export type VendorEngagementInsert = typeof vendorEngagements.$inferInsert;

// =============================================================================
// SITE OPERATIONS
// =============================================================================

export const siteZones = pgTable(
  "site_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    zoneCode: text("zone_code").notNull(),
    zoneName: text("zone_name").notNull(),
    zoneNameTranslations: jsonb("zone_name_translations"),

    /**
     * 'foundation' | 'structure' | 'mep' | 'finishing' | 'landscaping'
     * | 'infrastructure' | 'common_area' | 'other'
     */
    zoneType: text("zone_type").notNull(),

    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),

    expectedStartDate: date("expected_start_date"),
    expectedCompletionDate: date("expected_completion_date"),
    actualStartDate: date("actual_start_date"),
    actualCompletionDate: date("actual_completion_date"),

    displayOrder: integer("display_order").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("site_zones_project_code_unique").on(t.projectId, t.zoneCode),
    index("site_zones_project_idx").on(t.projectId),
    index("site_zones_type_idx").on(t.zoneType),
    index("site_zones_villa_idx").on(t.villaId),
  ],
);

export type SiteZone = typeof siteZones.$inferSelect;
export type SiteZoneInsert = typeof siteZones.$inferInsert;

export const siteReports = pgTable(
  "site_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    reportDate: date("report_date").notNull(),

    weatherConditions: text("weather_conditions"),
    weatherNotes: text("weather_notes"),
    temperatureCelsiusMin: integer("temperature_celsius_min"),
    temperatureCelsiusMax: integer("temperature_celsius_max"),

    totalWorkersPresent: integer("total_workers_present").notNull().default(0),
    totalWorkersPlanned: integer("total_workers_planned"),

    summary: text("summary"),
    summaryTranslations: jsonb("summary_translations"),

    reportedBy: uuid("reported_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    reporterRole: text("reporter_role"),

    /** 'draft' | 'submitted' | 'reviewed' | 'flagged' */
    status: text("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    reviewerNotes: text("reviewer_notes"),

    /** 'web' | 'whatsapp' | 'mobile_app' | 'api' */
    sourceChannel: text("source_channel").notNull().default("web"),
    sourceMessageId: text("source_message_id"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("site_reports_project_date_unique").on(t.projectId, t.reportDate),
    index("site_reports_project_date_idx").on(
      t.projectId,
      sql`${t.reportDate} desc`,
    ),
    index("site_reports_status_idx").on(t.status),
    index("site_reports_reporter_idx").on(t.reportedBy),
  ],
);

export type SiteReport = typeof siteReports.$inferSelect;
export type SiteReportInsert = typeof siteReports.$inferInsert;

export const siteReportZones = pgTable(
  "site_report_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    siteReportId: uuid("site_report_id")
      .notNull()
      .references(() => siteReports.id, { onDelete: "cascade" }),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => siteZones.id, { onDelete: "restrict" }),

    activitiesCompleted: text("activities_completed").array(),
    activitiesPlannedTomorrow: text("activities_planned_tomorrow").array(),

    workersInZone: integer("workers_in_zone").notNull().default(0),
    vendorEngagementId: uuid("vendor_engagement_id").references(
      () => vendorEngagements.id,
      { onDelete: "set null" },
    ),

    progressPercentToday: numeric("progress_percent_today", {
      precision: 5,
      scale: 2,
    }),
    cumulativeProgressPercent: numeric("cumulative_progress_percent", {
      precision: 5,
      scale: 2,
    }),

    hasBlocker: boolean("has_blocker").notNull().default(false),
    blockerDescription: text("blocker_description"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("site_report_zones_report_zone_unique").on(t.siteReportId, t.zoneId),
    index("site_report_zones_report_idx").on(t.siteReportId),
    index("site_report_zones_zone_idx").on(t.zoneId),
  ],
);

export type SiteReportZone = typeof siteReportZones.$inferSelect;
export type SiteReportZoneInsert = typeof siteReportZones.$inferInsert;

export const siteReportPhotos = pgTable(
  "site_report_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    siteReportId: uuid("site_report_id")
      .notNull()
      .references(() => siteReports.id, { onDelete: "cascade" }),
    zoneId: uuid("zone_id").references(() => siteZones.id, {
      onDelete: "set null",
    }),

    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "restrict" }),

    caption: text("caption"),
    photoTakenAt: timestamp("photo_taken_at", { withTimezone: true }).notNull(),

    /** Stage 3 fills these via the AI vision pipeline */
    aiAnalyzedAt: timestamp("ai_analyzed_at", { withTimezone: true }),
    aiDetectedObjects: jsonb("ai_detected_objects"),
    aiProgressInferred: numeric("ai_progress_inferred", {
      precision: 5,
      scale: 2,
    }),
    aiSafetyConcerns: text("ai_safety_concerns").array(),
    aiQualityConcerns: text("ai_quality_concerns").array(),

    gpsLat: numeric("gps_lat", { precision: 10, scale: 7 }),
    gpsLng: numeric("gps_lng", { precision: 10, scale: 7 }),

    uploadedBy: uuid("uploaded_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("site_report_photos_report_idx").on(t.siteReportId),
    index("site_report_photos_zone_idx").on(t.zoneId),
    index("site_report_photos_taken_idx").on(sql`${t.photoTakenAt} desc`),
  ],
);

export type SiteReportPhoto = typeof siteReportPhotos.$inferSelect;
export type SiteReportPhotoInsert = typeof siteReportPhotos.$inferInsert;

export const siteWorkforceLogs = pgTable(
  "site_workforce_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    siteReportId: uuid("site_report_id")
      .notNull()
      .references(() => siteReports.id, { onDelete: "cascade" }),
    vendorEngagementId: uuid("vendor_engagement_id").references(
      () => vendorEngagements.id,
      { onDelete: "restrict" },
    ),

    /**
     * 'foreman' | 'skilled_worker' | 'unskilled_worker' | 'specialist'
     * | 'equipment_operator' | 'helper'
     */
    roleCategory: text("role_category").notNull(),
    workerCount: integer("worker_count").notNull(),
    hoursPerWorker: numeric("hours_per_worker", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("8.0"),

    /**
     * GENERATED ALWAYS column owned by the migration. Read-only at the
     * Drizzle layer — never INSERT or UPDATE this column. Drizzle has
     * no native generated-column type so we expose it as a regular
     * numeric and leave the database to compute it.
     */
    totalManHours: numeric("total_man_hours", { precision: 10, scale: 2 }),

    ratePerHourMinor: bigint("rate_per_hour_minor", { mode: "bigint" }),
    rateCurrency: text("rate_currency"),
    estimatedCostMinor: bigint("estimated_cost_minor", { mode: "bigint" }),
    estimatedCostUsdMinor: bigint("estimated_cost_usd_minor", { mode: "bigint" }),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("site_workforce_logs_report_idx").on(t.siteReportId),
    index("site_workforce_logs_engagement_idx").on(t.vendorEngagementId),
  ],
);

export type SiteWorkforceLog = typeof siteWorkforceLogs.$inferSelect;
export type SiteWorkforceLogInsert = typeof siteWorkforceLogs.$inferInsert;

// =============================================================================
// MATERIAL TRACKING
// =============================================================================

export const materialPurchaseOrders = pgTable(
  "material_purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    poCode: text("po_code").notNull().unique(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),

    commitmentLedgerId: uuid("commitment_ledger_id").references(
      () => devCommitmentsLedger.id,
      { onDelete: "set null" },
    ),

    orderDate: date("order_date").notNull(),
    expectedDeliveryDate: date("expected_delivery_date"),
    /** 'draft' | 'ordered' | 'partially_delivered' | 'fully_delivered' | 'cancelled' */
    status: text("status").notNull().default("ordered"),

    // Money lifecycle (migration 0125). Distinct from the delivery `status`.
    /** 'unpaid' | 'partially_paid' | 'paid' */
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    /** Accumulated MANUAL payments against this PO, USD minor units. */
    paidAmountUsdMinor: bigint("paid_amount_usd_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(0n),
    /** Set when draft → ordered (order placed). */
    placedAt: timestamp("placed_at", { withTimezone: true }),
    /** PO-level receipt confirmation (money milestone). */
    receivedAt: timestamp("received_at", { withTimezone: true }),

    totalAmountUsdMinor: bigint("total_amount_usd_minor", {
      mode: "bigint",
    }).notNull(),
    totalAmountCurrency: text("total_amount_currency").notNull(),
    totalAmountOriginalMinor: bigint("total_amount_original_minor", {
      mode: "bigint",
    }).notNull(),
    fxRateAtOrder: numeric("fx_rate_at_order", { precision: 20, scale: 8 }).notNull(),

    poDocumentId: uuid("po_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),

    notes: text("notes"),
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
    index("material_pos_project_idx").on(t.projectId),
    index("material_pos_vendor_idx").on(t.vendorId),
    index("material_pos_status_idx").on(t.status),
    index("material_pos_payment_status_idx").on(t.paymentStatus),
    index("material_pos_expected_delivery_idx").on(t.expectedDeliveryDate),
  ],
);

export type MaterialPurchaseOrder =
  typeof materialPurchaseOrders.$inferSelect;
export type MaterialPurchaseOrderInsert =
  typeof materialPurchaseOrders.$inferInsert;

export const materialPoLines = pgTable(
  "material_po_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HF-5: added by migration 0072 (multi-tenant propagation).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    poId: uuid("po_id")
      .notNull()
      .references(() => materialPurchaseOrders.id, { onDelete: "cascade" }),

    lineNumber: integer("line_number").notNull(),

    materialName: text("material_name").notNull(),
    materialCategory: text("material_category"),
    unitOfMeasure: text("unit_of_measure").notNull(),
    quantityOrdered: numeric("quantity_ordered", { precision: 15, scale: 4 })
      .notNull(),
    unitPriceUsdMinor: bigint("unit_price_usd_minor", { mode: "bigint" })
      .notNull(),
    unitPriceOriginalMinor: bigint("unit_price_original_minor", {
      mode: "bigint",
    }).notNull(),

    /**
     * GENERATED — owned by the migration. Read-only.
     */
    lineTotalUsdMinor: bigint("line_total_usd_minor", { mode: "bigint" }),

    quantityDelivered: numeric("quantity_delivered", {
      precision: 15,
      scale: 4,
    })
      .notNull()
      .default("0"),
    quantityConsumed: numeric("quantity_consumed", { precision: 15, scale: 4 })
      .notNull()
      .default("0"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("material_po_lines_po_line_unique").on(t.poId, t.lineNumber),
    index("material_po_lines_po_idx").on(t.poId),
    index("material_po_lines_category_idx").on(t.materialCategory),
  ],
);

export type MaterialPoLine = typeof materialPoLines.$inferSelect;
export type MaterialPoLineInsert = typeof materialPoLines.$inferInsert;

export const materialDeliveries = pgTable(
  "material_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    deliveryCode: text("delivery_code").notNull().unique(),
    poId: uuid("po_id")
      .notNull()
      .references(() => materialPurchaseOrders.id, { onDelete: "restrict" }),

    deliveryDate: date("delivery_date").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receivedBy: uuid("received_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),

    relatedSiteReportId: uuid("related_site_report_id").references(
      () => siteReports.id,
      { onDelete: "set null" },
    ),

    deliveryNoteDocumentId: uuid("delivery_note_document_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),

    /** 'pending' | 'accepted' | 'partial_acceptance' | 'rejected' */
    qualityCheckStatus: text("quality_check_status")
      .notNull()
      .default("pending"),
    qualityNotes: text("quality_notes"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("material_deliveries_po_idx").on(t.poId),
    index("material_deliveries_date_idx").on(sql`${t.deliveryDate} desc`),
    index("material_deliveries_report_idx").on(t.relatedSiteReportId),
  ],
);

export type MaterialDelivery = typeof materialDeliveries.$inferSelect;
export type MaterialDeliveryInsert = typeof materialDeliveries.$inferInsert;

export const materialDeliveryLines = pgTable(
  "material_delivery_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => materialDeliveries.id, { onDelete: "cascade" }),
    poLineId: uuid("po_line_id")
      .notNull()
      .references(() => materialPoLines.id, { onDelete: "restrict" }),

    quantityReceived: numeric("quantity_received", {
      precision: 15,
      scale: 4,
    }).notNull(),
    qualityCheckPassed: boolean("quality_check_passed").notNull().default(true),
    rejectionReason: text("rejection_reason"),

    storedInZoneId: uuid("stored_in_zone_id").references(() => siteZones.id, {
      onDelete: "set null",
    }),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("material_delivery_lines_delivery_idx").on(t.deliveryId),
    index("material_delivery_lines_po_line_idx").on(t.poLineId),
  ],
);

export type MaterialDeliveryLine = typeof materialDeliveryLines.$inferSelect;
export type MaterialDeliveryLineInsert =
  typeof materialDeliveryLines.$inferInsert;

export const materialConsumptionLogs = pgTable(
  "material_consumption_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    siteReportId: uuid("site_report_id")
      .notNull()
      .references(() => siteReports.id, { onDelete: "restrict" }),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => siteZones.id, { onDelete: "restrict" }),
    poLineId: uuid("po_line_id")
      .notNull()
      .references(() => materialPoLines.id, { onDelete: "restrict" }),

    quantityConsumed: numeric("quantity_consumed", {
      precision: 15,
      scale: 4,
    }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull(),

    notes: text("notes"),
    recordedBy: uuid("recorded_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("material_consumption_report_idx").on(t.siteReportId),
    index("material_consumption_zone_idx").on(t.zoneId),
    index("material_consumption_po_line_idx").on(t.poLineId),
  ],
);

export type MaterialConsumptionLog =
  typeof materialConsumptionLogs.$inferSelect;
export type MaterialConsumptionLogInsert =
  typeof materialConsumptionLogs.$inferInsert;

// =============================================================================
// SAFETY
// =============================================================================

export const safetyIncidents = pgTable(
  "safety_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentCode: text("incident_code").notNull().unique(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    zoneId: uuid("zone_id").references(() => siteZones.id, {
      onDelete: "set null",
    }),
    relatedSiteReportId: uuid("related_site_report_id").references(
      () => siteReports.id,
      { onDelete: "set null" },
    ),

    incidentDate: date("incident_date").notNull(),
    incidentTime: time("incident_time"),

    /** 'near_miss' | 'minor' | 'moderate' | 'severe' | 'fatal' */
    severity: text("severity").notNull(),
    /**
     * 'fall' | 'electrical' | 'equipment' | 'material_handling' | 'fire'
     * | 'chemical' | 'structural' | 'vehicle' | 'weather' | 'other'
     */
    category: text("category").notNull(),

    affectedWorkersCount: integer("affected_workers_count").notNull().default(0),
    vendorEngagementId: uuid("vendor_engagement_id").references(
      () => vendorEngagements.id,
      { onDelete: "set null" },
    ),

    description: text("description").notNull(),

    immediateActionsTaken: text("immediate_actions_taken"),
    reportedToAuthorities: boolean("reported_to_authorities")
      .notNull()
      .default(false),
    authorityReportReference: text("authority_report_reference"),

    photoDocumentIds: uuid("photo_document_ids").array(),
    reportDocumentId: uuid("report_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),

    /** 'open' | 'under_investigation' | 'resolved' | 'closed' */
    status: text("status").notNull().default("open"),
    resolutionNotes: text("resolution_notes"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    reportedBy: uuid("reported_by").references(() => appUsers.id, {
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
    index("safety_incidents_project_idx").on(t.projectId),
    index("safety_incidents_severity_idx").on(t.severity),
    index("safety_incidents_status_idx").on(t.status),
    index("safety_incidents_date_idx").on(sql`${t.incidentDate} desc`),
  ],
);

export type SafetyIncident = typeof safetyIncidents.$inferSelect;
export type SafetyIncidentInsert = typeof safetyIncidents.$inferInsert;

// =============================================================================
// DEMO-3 — voice_notes (added by migration 0105).
// =============================================================================

export const voiceNotes = pgTable(
  "voice_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    siteReportId: uuid("site_report_id").references(() => siteReports.id, {
      onDelete: "set null",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    recordedBy: uuid("recorded_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    audioUrl: text("audio_url"),
    durationSeconds: integer("duration_seconds"),
    transcriptText: text("transcript_text"),
    transcriptLanguage: text("transcript_language"),
    transcribedByAi: boolean("transcribed_by_ai").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("voice_notes_org_idx").on(t.organizationId),
    index("voice_notes_site_report_idx").on(t.siteReportId),
    index("voice_notes_villa_idx").on(t.villaId),
    index("voice_notes_recorded_by_idx").on(t.recordedBy),
    index("voice_notes_created_idx").on(t.createdAt),
  ],
);

export type VoiceNote = typeof voiceNotes.$inferSelect;
export type VoiceNoteInsert = typeof voiceNotes.$inferInsert;
