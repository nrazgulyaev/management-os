import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  date,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY KEYSTONE (migration 0134): the root org anchor for the whole
    // Development tree — villas, ownership, contacts, land, bookings-via-villa
    // all reach their organization THROUGH a project.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    concept: text("concept"),
    location: text("location").notNull(),
    area: text("area"),
    description: text("description"),
    // status: planning | under_construction | active | managed | archived
    status: text("status").notNull().default("active"),
    // management_status: lead | onboarding | managed | paused | exited
    managementStatus: text("management_status").notNull().default("managed"),
    heroImageUrl: text("hero_image_url"),
    totalVillas: integer("total_villas"),
    targetHandoverDate: date("target_handover_date"),
    leaseholdUntil: date("leasehold_until"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("projects_status_idx").on(t.status),
    index("projects_organization_idx").on(t.organizationId),
  ],
);

export const villas = pgTable(
  "villas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    unitCode: text("unit_code").notNull(),
    name: text("name"),
    // status: available | occupied | checkout_pending | cleaning | inspection
    //         | ready | maintenance_blocked | owner_stay | out_of_service | archived
    status: text("status").notNull().default("ready"),
    bedrooms: integer("bedrooms").notNull().default(0),
    bathrooms: numeric("bathrooms", { precision: 4, scale: 1 }),
    builtAreaSqm: numeric("built_area_sqm", { precision: 10, scale: 2 }),
    landAreaSqm: numeric("land_area_sqm", { precision: 10, scale: 2 }),
    poolAreaSqm: numeric("pool_area_sqm", { precision: 10, scale: 2 }),
    viewType: text("view_type"), // ocean | rice_field | jungle | garden | other
    // management_model: individual | pooled | hybrid
    managementModel: text("management_model").notNull().default("individual"),
    currentNightlyRateUsd: numeric("current_nightly_rate_usd", {
      precision: 10,
      scale: 2,
    }),
    /** Stage 11.B.1 — optional geo anchor for field-PWA <GeoCheckIn>.
     *  Shape: `{ lat: number, lng: number, accuracy_m?: number, source?: string }`.
     *  NULL when not configured; <GeoCheckIn> falls back gracefully. */
    coordinates: jsonb("coordinates"),
    ownerVisible: boolean("owner_visible").notNull().default(true),
    /**
     * Stage 5.B.1 — multi-asset abstraction. References asset_types
     * registry. Defaults to 'villa' for backward compatibility (every
     * existing row was backfilled by migration 0057 inside one tx).
     */
    assetTypeId: uuid("asset_type_id").notNull(),
    /**
     * Type-specific attributes (JSONB). Schema varies by asset_type.
     * Examples: villa: {bedrooms, pool, sqm}, hotel_room: {category,
     * view, max_guests}, restaurant_table: {seats, location_type}.
     */
    assetAttributes: jsonb("asset_attributes")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("villas_project_idx").on(t.projectId),
    index("villas_status_idx").on(t.status),
    index("villas_asset_type_idx").on(t.assetTypeId),
  ],
);

export const villaStatusEvents = pgTable(
  "villa_status_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    source: text("source").notNull().default("manual"), // manual | booking | task | maintenance
    note: text("note"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("villa_status_events_villa_idx").on(t.villaId),
    index("villa_status_events_at_idx").on(t.createdAt),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Villa = typeof villas.$inferSelect;
export type NewVilla = typeof villas.$inferInsert;
export type VillaStatusEvent = typeof villaStatusEvents.$inferSelect;
