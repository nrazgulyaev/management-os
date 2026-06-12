/**
 * Packet C PR 1 (owner-data-l2) — villa_photos.
 *
 * Photo metadata for the Owner Portal Villa cabinet's hero gallery
 * + the Mgmt-side villa header. Actual bytes live in object
 * storage (Supabase / S3 / R2); this table stores URLs + ordering
 * + captions.
 */

import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { villas } from "./projects";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export type VillaPhotoKind = "hero" | "gallery" | "floorplan" | "aerial" | "room" | "outside";

export const villaPhotos = pgTable(
  "villa_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    /** TENANCY (migration 0152): nullable org anchor, backfilled via
     *  villa → project.organization_id. Not threaded into queries yet; kept
     *  NULLABLE until app-layer scoping lands. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    /** Storage URL (signed or public). */
    url: text("url").notNull(),
    /** VILLA-PHOTO-UPLOAD (migration 0174) — Supabase Storage tracking so a
     *  delete can also remove the object. NULL for externally-hosted/seed
     *  URLs (e.g. picsum). */
    storageBucket: text("storage_bucket"),
    storagePath: text("storage_path"),
    caption: text("caption"),
    /** Enum: hero | gallery | floorplan | aerial | room | outside. */
    kind: text("kind").notNull().default("hero"),
    /** Display order within (villaId, kind). */
    position: integer("position").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    visibleToOwner: boolean("visible_to_owner").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("villa_photos_villa_kind_position_idx").on(t.villaId, t.kind, t.position),
    index("villa_photos_villa_created_idx").on(t.villaId, t.createdAt),
    index("villa_photos_organization_idx").on(t.organizationId),
  ],
);

export type VillaPhoto = typeof villaPhotos.$inferSelect;
export type NewVillaPhoto = typeof villaPhotos.$inferInsert;
