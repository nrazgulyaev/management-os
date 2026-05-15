"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  vendors,
  vendorEngagements,
} from "@/lib/db/schema/site-operations";
import {
  ENGAGEMENT_STATUSES,
  VENDOR_STATUSES,
  VENDOR_TYPES,
} from "@/lib/development/constants/vendor-constants";
import { requireOrgId } from "@/features/auth/require-org";

const vendorCreateSchema = z.object({
  vendorCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  legalName: z.string().min(1).max(256),
  legalEntityType: z.string().optional().nullable(),
  primaryContactId: z.string().uuid().optional().nullable(),
  vendorType: z.enum(VENDOR_TYPES),
  primaryEmail: z.string().email().optional().nullable(),
  primaryPhone: z.string().max(64).optional().nullable(),
  whatsappPhone: z.string().max(64).optional().nullable(),
  address: z.string().optional().nullable(),
  taxId: z.string().max(64).optional().nullable(),
  businessLicenseNumber: z.string().max(128).optional().nullable(),
  businessLicenseExpiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  bankName: z.string().optional().nullable(),
  bankAccountHolder: z.string().optional().nullable(),
  bankAccountNumber: z.string().optional().nullable(),
  bankSwift: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function createVendor(
  input: z.input<typeof vendorCreateSchema>,
): Promise<{ id: string; vendorCode: string }> {
  const parsed = vendorCreateSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [row] = await db
    .insert(vendors)
    .values({
      organizationId,
      vendorCode: parsed.vendorCode,
      legalName: parsed.legalName,
      legalEntityType: parsed.legalEntityType ?? null,
      primaryContactId: parsed.primaryContactId ?? null,
      vendorType: parsed.vendorType,
      primaryEmail: parsed.primaryEmail ?? null,
      primaryPhone: parsed.primaryPhone ?? null,
      whatsappPhone: parsed.whatsappPhone ?? null,
      address: parsed.address ?? null,
      taxId: parsed.taxId ?? null,
      businessLicenseNumber: parsed.businessLicenseNumber ?? null,
      businessLicenseExpiry: parsed.businessLicenseExpiry ?? null,
      bankName: parsed.bankName ?? null,
      bankAccountHolder: parsed.bankAccountHolder ?? null,
      bankAccountNumber: parsed.bankAccountNumber ?? null,
      bankSwift: parsed.bankSwift ?? null,
      notes: parsed.notes ?? null,
    })
    .returning({ id: vendors.id, vendorCode: vendors.vendorCode });
  return row;
}

export async function updateVendor(
  id: string,
  patch: Partial<z.input<typeof vendorCreateSchema>>,
): Promise<void> {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  // Pass-through known fields only
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) updates[k] = v;
  }
  await db
    .update(vendors)
    .set(updates)
    .where(
      and(eq(vendors.id, id), eq(vendors.organizationId, organizationId)),
    );
}

export async function setVendorStatus(
  id: string,
  status: (typeof VENDOR_STATUSES)[number],
  blacklistReason?: string,
): Promise<void> {
  const parsed = z.enum(VENDOR_STATUSES).parse(status);
  const db = requireDb();
  const organizationId = await requireOrgId();
  await db
    .update(vendors)
    .set({
      status: parsed,
      blacklistReason: parsed === "blacklisted" ? blacklistReason ?? "—" : null,
      blacklistedAt: parsed === "blacklisted" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(vendors.id, id), eq(vendors.organizationId, organizationId)),
    );
}

const performanceSchema = z.object({
  vendorId: z.string().uuid(),
  onTimeRate: z.number().min(0).max(100),
  qualityRating: z.number().min(0).max(5),
});

export async function recordVendorPerformance(
  input: z.input<typeof performanceSchema>,
): Promise<void> {
  const parsed = performanceSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();
  await db
    .update(vendors)
    .set({
      onTimeDeliveryRate: parsed.onTimeRate.toFixed(2),
      qualityRating: parsed.qualityRating.toFixed(2),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(vendors.id, parsed.vendorId),
        eq(vendors.organizationId, organizationId),
      ),
    );
}

// ---------------------------------------------------------------------------
// Engagements
// ---------------------------------------------------------------------------

const engagementCreateSchema = z.object({
  vendorId: z.string().uuid(),
  projectId: z.string().uuid(),
  engagementCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  scopeDescription: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  commitmentLedgerId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function createVendorEngagement(
  input: z.input<typeof engagementCreateSchema>,
): Promise<{ id: string; engagementCode: string }> {
  const parsed = engagementCreateSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(vendorEngagements)
      .values({
        organizationId,
        vendorId: parsed.vendorId,
        projectId: parsed.projectId,
        engagementCode: parsed.engagementCode,
        scopeDescription: parsed.scopeDescription,
        startDate: parsed.startDate,
        expectedEndDate: parsed.expectedEndDate ?? null,
        commitmentLedgerId: parsed.commitmentLedgerId ?? null,
        notes: parsed.notes ?? null,
      })
      .returning({
        id: vendorEngagements.id,
        engagementCode: vendorEngagements.engagementCode,
      });

    // Bump vendor's last_engagement_at + commitments_count.
    await tx.execute(sql`
      UPDATE vendors
         SET last_engagement_at = ${parsed.startDate},
             total_commitments_count = total_commitments_count + 1,
             updated_at = now()
       WHERE id = ${parsed.vendorId}
         AND organization_id = ${organizationId}
    `);

    return row;
  });
}

export async function terminateVendorEngagement(
  id: string,
  reason: string,
): Promise<void> {
  if (!reason || reason.trim().length < 3) {
    throw new Error("terminateVendorEngagement: reason required (≥3 chars)");
  }
  const db = requireDb();
  const organizationId = await requireOrgId();
  await db
    .update(vendorEngagements)
    .set({
      status: "terminated",
      actualEndDate: new Date().toISOString().slice(0, 10),
      terminationReason: reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(vendorEngagements.id, id),
        eq(vendorEngagements.organizationId, organizationId),
      ),
    );
}

export async function setEngagementStatus(
  id: string,
  status: (typeof ENGAGEMENT_STATUSES)[number],
): Promise<void> {
  const parsed = z.enum(ENGAGEMENT_STATUSES).parse(status);
  const db = requireDb();
  const organizationId = await requireOrgId();
  const updates: Record<string, unknown> = {
    status: parsed,
    updatedAt: new Date(),
  };
  if (parsed === "completed") {
    updates.actualEndDate = new Date().toISOString().slice(0, 10);
  }
  await db
    .update(vendorEngagements)
    .set(updates)
    .where(
      and(
        eq(vendorEngagements.id, id),
        eq(vendorEngagements.organizationId, organizationId),
      ),
    );
}
