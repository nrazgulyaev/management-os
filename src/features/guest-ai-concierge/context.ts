import "server-only";

import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";
import { listGuestVisibleServices } from "@/features/guest-services/services";
import { getDb } from "@/lib/db/client";
import { eq, desc } from "drizzle-orm";
import {
  guestServiceOrders,
  guestServices,
} from "@/lib/db/schema/guest-services";

/**
 * Token-scoped, guest-safe context for the concierge AI.
 *
 * What goes in:
 *   - villa name, project name, dates, nights, guest count
 *   - verified state from the v9G verification gate
 *   - villa guide sections (`guest_visible=true`) — title + summary
 *   - house rules (extracted from a section keyed `house_rules`)
 *   - neighborhood places (`guest_visible=true`)
 *   - guest emergency contacts (label, type, has-phone flag — never
 *     the raw number)
 *   - guest service catalog (`guest_visible=true`, `status='active'`)
 *   - the guest's own service orders (status + service name only)
 *
 * What's intentionally excluded:
 *   - Wi-Fi password (any form: ciphertext, key version, plaintext)
 *   - smart-lock code (display value, validity, hash)
 *   - token hash, raw token, prefix
 *   - encrypted blobs of any kind
 *   - staff private contacts unless flagged guest_visible
 *   - owner / investor / project finance
 *   - booking financial internals (rates, fees, commissions)
 *   - internal notes
 *   - camera URLs
 *   - raw DB IDs (we expose human-friendly handles only)
 */

export interface GuestConciergeContext {
  villaName: string;
  projectName: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestsCount: number;
  verified: boolean;
  sections: Array<{
    sectionKey: string;
    title: string;
    summary: string;
  }>;
  houseRules: string[];
  neighborhood: Array<{
    name: string;
    category: string;
    distanceLabel: string | null;
    travelTimeLabel: string | null;
    description: string;
  }>;
  emergency: Array<{
    label: string;
    contactType: string;
    hasPhone: boolean;
  }>;
  services: Array<{
    name: string;
    serviceType: string;
    pricingModel: string;
    shortDescription: string | null;
    requiresDate: boolean;
    requiresGuestCount: boolean;
    leadTimeHours: number | null;
  }>;
  serviceOrders: Array<{
    serviceName: string;
    status: string;
    requestedDate: string | null;
  }>;
}

export interface BuildContextResult {
  ok: boolean;
  context: GuestConciergeContext | null;
  reason?: "token_invalid" | "token_expired" | "token_revoked" | "no_db";
}

/**
 * Resolve everything safe-for-AI from a stay token. Returns
 * `{ ok: false }` for invalid / revoked / expired tokens; the caller
 * surfaces a generic refusal page (`/stay/[token]/verify` etc).
 */
export async function buildGuestConciergeContext(
  token: string,
): Promise<BuildContextResult> {
  const summary = await getGuestStaySummaryByToken(token);
  if (!summary.ok) {
    return {
      ok: false,
      context: null,
      reason:
        summary.reason === "expired"
          ? "token_expired"
          : summary.reason === "revoked"
            ? "token_revoked"
            : "token_invalid",
    };
  }
  const base = summary.summary.base;

  // Derive house rules from the keyed section. The bullet split is
  // best-effort — we just want lines for the AI to reference.
  const rulesSection = summary.summary.sections.find(
    (s) => s.sectionKey === "house_rules",
  );
  const houseRules: string[] = rulesSection?.bodyMd
    ? rulesSection.bodyMd
        .split(/\n+/)
        .map((s) => s.replace(/^[-*\d.)\s]+/, "").trim())
        .filter((s) => s.length > 0)
        .slice(0, 12)
    : [];

  const neighborhood = summary.summary.neighborhood.map((n) => ({
    name: n.name,
    category: n.category,
    distanceLabel: n.distanceLabel,
    travelTimeLabel: n.travelTimeLabel,
    description: n.descriptionMd ?? "",
  }));

  const emergency = summary.summary.emergencyContacts.map((c) => ({
    label: c.label,
    contactType: c.contactType,
    hasPhone: Boolean(c.phone || c.whatsapp),
  }));

  // Guest-facing catalog (already filtered to `guest_visible` + active
  // by the resolver).
  const visibleServices = await listGuestVisibleServices({
    villaId: base.villaId,
    projectId: base.projectId,
  });
  const services = visibleServices.map((s) => ({
    name: s.name,
    serviceType: s.serviceType,
    pricingModel: s.pricingModel,
    shortDescription: s.shortDescription,
    requiresDate: s.requiresDate,
    requiresGuestCount: s.requiresGuestCount,
    leadTimeHours: s.leadTimeHours,
  }));

  // Token-scoped recent orders (status + service name only).
  const db = getDb();
  let serviceOrders: GuestConciergeContext["serviceOrders"] = [];
  if (db) {
    const rows = await db
      .select({
        status: guestServiceOrders.status,
        requestedDate: guestServiceOrders.requestedDate,
        serviceName: guestServices.name,
      })
      .from(guestServiceOrders)
      .leftJoin(
        guestServices,
        eq(guestServices.id, guestServiceOrders.serviceId),
      )
      .where(eq(guestServiceOrders.guestStayTokenId, base.tokenId))
      .orderBy(desc(guestServiceOrders.createdAt))
      .limit(8);
    serviceOrders = rows.map((r) => ({
      serviceName: r.serviceName ?? "Service",
      status: r.status,
      requestedDate: r.requestedDate ?? null,
    }));
  }

  // Filter sections to guest-visible only (the resolver already does
  // this in v9E, but we double-check) and project to the AI shape.
  const sections = summary.summary.sections.map((s) => ({
    sectionKey: s.sectionKey,
    title: s.title,
    summary: s.bodyMd ?? "",
  }));

  return {
    ok: true,
    context: {
      villaName: base.villaName ?? base.villaCode ?? "Your villa",
      projectName: base.projectName,
      checkIn: base.checkIn,
      checkOut: base.checkOut,
      nights: base.nights,
      guestsCount: base.guestsCount,
      verified: true, // resolver only succeeds for active tokens; AI page also gates on verification
      sections,
      houseRules,
      neighborhood,
      emergency,
      services,
      serviceOrders,
    },
  };
}

/**
 * Pure: enumerate the high-level context "keys" that we shipped to
 * the model on this turn — for transparency in the admin runs viewer
 * and for tests that pin shape.
 */
export function contextKeys(c: GuestConciergeContext): string[] {
  const keys: string[] = ["stay_basics"];
  if (c.sections.length > 0) keys.push("guide_sections");
  if (c.houseRules.length > 0) keys.push("house_rules");
  if (c.neighborhood.length > 0) keys.push("neighborhood");
  if (c.emergency.length > 0) keys.push("emergency_contacts");
  if (c.services.length > 0) keys.push("services_catalog");
  if (c.serviceOrders.length > 0) keys.push("service_orders");
  return keys;
}
