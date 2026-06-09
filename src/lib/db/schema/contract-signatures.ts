import {
  pgTable,
  uuid,
  text,
  bigint,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { contractGroups } from "./sales";
import { organizations } from "./saas";

/**
 * contract_signatures (migration 0137) — Block 02 BUYER MONEY.
 *
 * Append-only record of a buyer e-signature event on a contract group,
 * captured in the buyer portal. The `contracts` / `contract_groups` tables
 * already carry signing STATE (signed_at, first_signed_at, fully_signed_at,
 * status); this table records the legally-meaningful WHO/CONSENT/HASH that
 * those status columns cannot. There is no real e-sign provider — this is a
 * manual typed-name signature, mirroring the manual mark-paid pattern.
 *
 * `buyerId` is a plain uuid (no Drizzle FK) to avoid an import cycle with the
 * buyers module; ownership is enforced in the server action.
 */
export const contractSignatures = pgTable(
  "contract_signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    contractGroupId: uuid("contract_group_id")
      .notNull()
      .references(() => contractGroups.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id").notNull(),
    buyerCode: text("buyer_code").notNull(),
    signerName: text("signer_name").notNull(),
    signerEmail: text("signer_email"),
    /** 'buyer' for portal-captured signatures. */
    signerRole: text("signer_role").notNull().default("buyer"),
    /** 'typed_name' until a real e-sign provider lands. */
    method: text("method").notNull().default("typed_name"),
    consentText: text("consent_text").notNull(),
    signedValueUsdMinor: bigint("signed_value_usd_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    signedHash: text("signed_hash"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    signedAt: timestamp("signed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("contract_signatures_group_idx").on(t.contractGroupId),
    index("contract_signatures_buyer_idx").on(t.buyerId),
    uniqueIndex("contract_signatures_group_buyer_unique").on(
      t.contractGroupId,
      t.buyerId,
    ),
    index("contract_signatures_org_idx").on(t.organizationId),
  ],
);

export type ContractSignature = typeof contractSignatures.$inferSelect;
export type NewContractSignature = typeof contractSignatures.$inferInsert;
