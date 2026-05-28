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

export type VillaPhotoKind = "hero" | "gallery" | "floorplan" | "aerial" | "room" | "outside";

export const villaPhotos = pgTable(
  "villa_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    /** Storage URL (signed or public). */
    url: text("url").notNull(),
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
  ],
);

export type VillaPhoto = typeof villaPhotos.$inferSelect;
export type NewVillaPhoto = typeof villaPhotos.$inferInsert;
