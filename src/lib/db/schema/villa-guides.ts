import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects, villas } from "./projects";
import { appUsers } from "./identity";
import { organizations } from "./saas";

/**
 * V9E — editable guest-facing villa / project content. Resolution is
 * villa-first → project-fallback in the service layer; the partial unique
 * indexes enforce at-most-one row per (scope, section_key).
 */

export const villaGuideSections = pgTable(
  "villa_guide_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "cascade",
    }),
    /** TENANCY (migration 0152): nullable org anchor, backfilled via
     *  villa → project.organization_id (else project, else default org). Not
     *  threaded into queries yet; kept NULLABLE until app-layer scoping lands. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    sectionKey: text("section_key").notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md"),
    bodyJson: jsonb("body_json"),
    sortOrder: integer("sort_order").notNull().default(0),
    guestVisible: boolean("guest_visible").notNull().default(true),
    status: text("status").notNull().default("active"),
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
    uniqueIndex("villa_guide_sections_villa_unique")
      .on(t.villaId, t.sectionKey)
      .where(sql`${t.villaId} IS NOT NULL`),
    uniqueIndex("villa_guide_sections_project_unique")
      .on(t.projectId, t.sectionKey)
      .where(
        sql`${t.villaId} IS NULL AND ${t.projectId} IS NOT NULL`,
      ),
    index("villa_guide_sections_status_idx").on(t.status),
    index("villa_guide_sections_organization_idx").on(t.organizationId),
  ],
);

export const villaWifiCredentials = pgTable(
  "villa_wifi_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "cascade",
    }),
    networkName: text("network_name").notNull(),
    /** Legacy column from v9E. v9F left it; v9G replaces it with
     *  `passwordCiphertext`. Kept temporarily so the migration helper can
     *  read it; cleared as soon as a row is migrated. Will be dropped
     *  in v9H once every active row is on `passwordCiphertext`. */
    passwordEncrypted: text("password_encrypted"),
    /** v9G+ — base64url(IV || ciphertext || authTag) under
     *  AES-256-GCM with `password_key_version`. Never logged. */
    passwordCiphertext: text("password_ciphertext"),
    passwordKeyVersion: integer("password_key_version"),
    passwordMigratedAt: timestamp("password_migrated_at", {
      withTimezone: true,
    }),
    /** Legacy plaintext from v9E — admins migrate via
     *  `migratePlaintextWifiPasswords`, after which this column is set to
     *  NULL on the row. Never returned by the guest projection in v9G. */
    displayPassword: text("display_password"),
    instructionsMd: text("instructions_md"),
    status: text("status").notNull().default("active"),
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
    index("villa_wifi_credentials_villa_idx").on(t.villaId),
    index("villa_wifi_credentials_project_idx").on(t.projectId),
    index("villa_wifi_credentials_key_version_idx").on(t.passwordKeyVersion),
  ],
);

export const villaEmergencyContacts = pgTable(
  "villa_emergency_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "cascade",
    }),
    label: text("label").notNull(),
    contactType: text("contact_type").notNull(),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    address: text("address"),
    notesMd: text("notes_md"),
    sortOrder: integer("sort_order").notNull().default(0),
    guestVisible: boolean("guest_visible").notNull().default(true),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("villa_emergency_contacts_villa_idx").on(t.villaId),
    index("villa_emergency_contacts_project_idx").on(t.projectId),
    index("villa_emergency_contacts_type_idx").on(t.contactType),
  ],
);

export const villaNeighborhoodPlaces = pgTable(
  "villa_neighborhood_places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    descriptionMd: text("description_md"),
    address: text("address"),
    googleMapsUrl: text("google_maps_url"),
    distanceLabel: text("distance_label"),
    travelTimeLabel: text("travel_time_label"),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    guestVisible: boolean("guest_visible").notNull().default(true),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("villa_neighborhood_places_villa_idx").on(t.villaId),
    index("villa_neighborhood_places_project_idx").on(t.projectId),
    index("villa_neighborhood_places_category_idx").on(t.category),
  ],
);

export type VillaGuideSection = typeof villaGuideSections.$inferSelect;
export type NewVillaGuideSection = typeof villaGuideSections.$inferInsert;
export type VillaWifiCredential = typeof villaWifiCredentials.$inferSelect;
export type NewVillaWifiCredential =
  typeof villaWifiCredentials.$inferInsert;
export type VillaEmergencyContact =
  typeof villaEmergencyContacts.$inferSelect;
export type NewVillaEmergencyContact =
  typeof villaEmergencyContacts.$inferInsert;
export type VillaNeighborhoodPlace =
  typeof villaNeighborhoodPlaces.$inferSelect;
export type NewVillaNeighborhoodPlace =
  typeof villaNeighborhoodPlaces.$inferInsert;
