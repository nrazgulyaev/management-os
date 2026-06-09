import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  date,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { projects, villas } from "./projects";
import { organizations } from "./saas";

export const owners = pgTable(
  "owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // type: individual | company | family_office
    type: text("type").notNull().default("individual"),
    displayName: text("display_name").notNull(),
    legalName: text("legal_name"),
    email: text("email"),
    phone: text("phone"),
    nationality: text("nationality"),
    taxResidency: text("tax_residency"),
    // status: active | inactive | onboarding | archived
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("owners_status_idx").on(t.status)],
);

export const ownershipShares = pgTable(
  "ownership_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  villa → project.organization_id (else the share's project_id).
     *  Not threaded into queries yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "restrict" }),
    // share_percent stored as 0-100 with up to 6 decimals
    sharePercent: numeric("share_percent", { precision: 9, scale: 6 }).notNull(),
    // model: individual | pooled | hybrid
    model: text("model").notNull().default("individual"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    // status: active | scheduled | ended
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ownership_shares_owner_idx").on(t.ownerId),
    index("ownership_shares_villa_idx").on(t.villaId),
    index("ownership_shares_project_idx").on(t.projectId),
    index("ownership_shares_organization_idx").on(t.organizationId),
  ],
);

export const payoutMethods = pgTable(
  "payout_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    // method_type: bank_idr | bank_intl | wise | crypto
    methodType: text("method_type").notNull(),
    currency: text("currency").notNull().default("IDR"),
    accountLabel: text("account_label").notNull(),
    bankName: text("bank_name"),
    accountLast4: text("account_last4"),
    wiseEmail: text("wise_email"),
    cryptoNetwork: text("crypto_network"),
    cryptoWalletLast6: text("crypto_wallet_last6"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payout_methods_owner_idx").on(t.ownerId)],
);

export type Owner = typeof owners.$inferSelect;
export type NewOwner = typeof owners.$inferInsert;
export type OwnershipShare = typeof ownershipShares.$inferSelect;
export type NewOwnershipShare = typeof ownershipShares.$inferInsert;
export type PayoutMethod = typeof payoutMethods.$inferSelect;
