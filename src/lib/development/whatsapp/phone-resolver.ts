import "server-only";

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema/identity";
import { investors } from "@/lib/db/schema/investor-capital";
import { vendors } from "@/lib/db/schema/site-operations";
import { contacts } from "@/lib/db/schema/contacts";
import {
  whatsappPhoneNumbers,
  type NewWhatsappPhoneNumber,
} from "@/lib/db/schema/whatsapp";
import { normalisePhone } from "@/lib/whatsapp/providers";

/**
 * Phone resolver — maps an inbound WhatsApp phone number (E.164) to
 * the matching internal entity. Priority order:
 *
 *   1. app_users   (whatsapp_phone OR phone)
 *   2. investors   (whatsapp_phone OR contact_phone)
 *   3. vendors     (whatsapp_phone)
 *   4. contacts    (whatsapp_phone OR phone OR whatsapp)
 *   5. unknown     — logged to whatsapp_phone_numbers with type='unknown'
 *                    so an operator can resolve it manually later.
 *
 * On multiple matches in a single tier (rare): pick the most-recently-
 * active one. The resolver always logs/updates a row in
 * `whatsapp_phone_numbers` so dashboards can show "phone X belongs to
 * entity Y" without re-running the lookup.
 *
 * TENANCY: the registry row written for the SENDER must carry an
 * `organization_id` — otherwise the operator page reader
 * (`getWhatsappPhoneNumbers`) strict-filters org and the row never
 * renders, so an "unknown" inbound number can never be resolved. The
 * org is derived from the Arconique business number that RECEIVED the
 * message (`receivingPhone` = inbound webhook's `toPhone`), which is an
 * `arconique_inbound`/`arconique_outbound` row that already carries the
 * tenant's org. Resolution stays resilient: a missing/unknown receiving
 * number simply leaves org undefined (never throws), so ingestion never
 * breaks.
 */

export type ResolvedEntityType =
  | "app_user"
  | "investor"
  | "vendor"
  | "contact"
  | "unknown";

export interface PhoneResolution {
  phoneNumber: string;
  entityType: ResolvedEntityType;
  entityId?: string;
  entityName?: string;
  prefersWhatsapp: boolean;
  /** UUID of the row in `whatsapp_phone_numbers` for the resolved phone. */
  phoneRegistryId: string | null;
}

export async function resolveSenderPhone(
  rawPhone: string,
  /**
   * The Arconique business number that RECEIVED the inbound message
   * (the webhook's `toPhone`). Used only to derive the tenant org for
   * the sender's registry row — so unknown numbers render on the
   * operator page and can be resolved manually. Optional + best-effort:
   * an unknown/missing receiving number leaves org undefined.
   */
  receivingPhone?: string | null,
): Promise<PhoneResolution> {
  const phone = normalisePhone(rawPhone);
  const db = getDb();
  if (!db) {
    return {
      phoneNumber: phone,
      entityType: "unknown",
      prefersWhatsapp: false,
      phoneRegistryId: null,
    };
  }

  // Derive the tenant org from the receiving business number so every
  // registry write below is stamped (resilient — never throws).
  const organizationId = await resolveOrgFromReceivingNumber(receivingPhone);

  // 1) Try app_users.
  const appUserMatch = await db
    .select({
      id: appUsers.id,
      name: appUsers.fullName,
      prefers: appUsers.prefersWhatsapp,
    })
    .from(appUsers)
    .where(or(eq(appUsers.whatsappPhone, phone), eq(appUsers.phone, phone)))
    .limit(1);
  if (appUserMatch[0]) {
    const reg = await ensurePhoneRegistry({
      phoneNumber: phone,
      entityType: "app_user",
      entityId: appUserMatch[0].id,
      displayName: appUserMatch[0].name,
      organizationId,
    });
    return {
      phoneNumber: phone,
      entityType: "app_user",
      entityId: appUserMatch[0].id,
      entityName: appUserMatch[0].name,
      prefersWhatsapp: appUserMatch[0].prefers,
      phoneRegistryId: reg,
    };
  }

  // 2) Try investors. Joined to contacts for fallback phone column.
  const investorMatch = await db
    .select({
      id: investors.id,
      name: investors.legalName,
      prefers: investors.prefersWhatsapp,
    })
    .from(investors)
    .where(
      or(
        eq(investors.whatsappPhone, phone),
        eq(investors.contactPhone, phone),
      ),
    )
    .limit(1);
  if (investorMatch[0]) {
    const reg = await ensurePhoneRegistry({
      phoneNumber: phone,
      entityType: "investor",
      entityId: investorMatch[0].id,
      displayName: investorMatch[0].name,
      organizationId,
    });
    return {
      phoneNumber: phone,
      entityType: "investor",
      entityId: investorMatch[0].id,
      entityName: investorMatch[0].name,
      prefersWhatsapp: investorMatch[0].prefers,
      phoneRegistryId: reg,
    };
  }

  // 3) Try vendors.
  const vendorMatch = await db
    .select({
      id: vendors.id,
      name: vendors.legalName,
    })
    .from(vendors)
    .where(eq(vendors.whatsappPhone, phone))
    .limit(1);
  if (vendorMatch[0]) {
    const reg = await ensurePhoneRegistry({
      phoneNumber: phone,
      entityType: "vendor",
      entityId: vendorMatch[0].id,
      displayName: vendorMatch[0].name,
      organizationId,
    });
    return {
      phoneNumber: phone,
      entityType: "vendor",
      entityId: vendorMatch[0].id,
      entityName: vendorMatch[0].name,
      // Vendors don't have a prefers_whatsapp flag — treat as true
      // (vendors typically ARE on WhatsApp in Bali ops).
      prefersWhatsapp: true,
      phoneRegistryId: reg,
    };
  }

  // 4) Try contacts.
  const contactMatch = await db
    .select({
      id: contacts.id,
      name: contacts.fullName,
      prefers: contacts.prefersWhatsapp,
    })
    .from(contacts)
    .where(
      or(
        eq(contacts.whatsappPhone, phone),
        eq(contacts.phone, phone),
        eq(contacts.whatsapp, phone),
      ),
    )
    .limit(1);
  if (contactMatch[0]) {
    const reg = await ensurePhoneRegistry({
      phoneNumber: phone,
      entityType: "contact",
      entityId: contactMatch[0].id,
      displayName: contactMatch[0].name,
      organizationId,
    });
    return {
      phoneNumber: phone,
      entityType: "contact",
      entityId: contactMatch[0].id,
      entityName: contactMatch[0].name,
      prefersWhatsapp: contactMatch[0].prefers,
      phoneRegistryId: reg,
    };
  }

  // 5) Unknown — log so an operator can resolve later. Stamped with the
  // receiving business number's org so it renders on the operator page.
  const reg = await ensurePhoneRegistry({
    phoneNumber: phone,
    entityType: null,
    entityId: null,
    displayName: null,
    organizationId,
  });
  return {
    phoneNumber: phone,
    entityType: "unknown",
    prefersWhatsapp: false,
    phoneRegistryId: reg,
  };
}

interface RegistryUpsert {
  phoneNumber: string;
  entityType: "app_user" | "investor" | "vendor" | "contact" | null;
  entityId: string | null;
  displayName: string | null;
  /** Tenant org derived from the receiving business number (best-effort). */
  organizationId?: string | null;
}

async function ensurePhoneRegistry(
  args: RegistryUpsert,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const numberType = args.entityType === null ? "unknown" : "recipient";
  const values: NewWhatsappPhoneNumber = {
    phoneNumber: args.phoneNumber,
    displayName: args.displayName ?? undefined,
    numberType,
    organizationId: args.organizationId ?? undefined,
    resolvedEntityType: args.entityType ?? undefined,
    resolvedEntityId: args.entityId ?? undefined,
    provider: "twilio",
  };
  const inserted = await db
    .insert(whatsappPhoneNumbers)
    .values(values)
    .onConflictDoUpdate({
      target: whatsappPhoneNumbers.phoneNumber,
      set: {
        // Re-resolve in case the entity was previously unknown and is
        // now known — but never downgrade a known phone to unknown.
        resolvedEntityType: sql`COALESCE(EXCLUDED.resolved_entity_type, ${whatsappPhoneNumbers.resolvedEntityType})`,
        resolvedEntityId: sql`COALESCE(EXCLUDED.resolved_entity_id, ${whatsappPhoneNumbers.resolvedEntityId})`,
        displayName: sql`COALESCE(EXCLUDED.display_name, ${whatsappPhoneNumbers.displayName})`,
        // Backfill org on rows that were inserted before the org was
        // derivable — but never re-home a row that already has an org.
        organizationId: sql`COALESCE(${whatsappPhoneNumbers.organizationId}, EXCLUDED.organization_id)`,
        numberType: sql`CASE
          WHEN ${whatsappPhoneNumbers.numberType} = 'unknown' AND EXCLUDED.number_type = 'recipient'
            THEN 'recipient'
          ELSE ${whatsappPhoneNumbers.numberType}
        END`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: whatsappPhoneNumbers.id });
  return inserted[0]?.id ?? null;
}

/**
 * Best-effort: map the Arconique business number that received an
 * inbound message to its tenant org. The receiving number is an
 * `arconique_inbound`/`arconique_outbound` row already stamped with an
 * org (see `createWhatsappPhoneNumber`). Returns undefined (never
 * throws) when the number is missing/unknown so message ingestion is
 * never blocked by an org lookup.
 */
async function resolveOrgFromReceivingNumber(
  receivingPhone?: string | null,
): Promise<string | undefined> {
  if (!receivingPhone) return undefined;
  const db = getDb();
  if (!db) return undefined;
  try {
    const normalised = normalisePhone(receivingPhone);
    const [row] = await db
      .select({ organizationId: whatsappPhoneNumbers.organizationId })
      .from(whatsappPhoneNumbers)
      .where(
        and(
          eq(whatsappPhoneNumbers.phoneNumber, normalised),
          inArray(whatsappPhoneNumbers.numberType, [
            "arconique_inbound",
            "arconique_outbound",
          ]),
        ),
      )
      .limit(1);
    return row?.organizationId ?? undefined;
  } catch {
    // Resilience: an org lookup failure must never break ingestion.
    return undefined;
  }
}
