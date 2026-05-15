"use server";

import { eq, sql, and } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  siteReports,
  siteReportZones,
  siteReportPhotos,
  siteWorkforceLogs,
  siteZones,
  materialConsumptionLogs,
  materialPoLines,
} from "@/lib/db/schema/site-operations";
import {
  SOURCE_CHANNELS,
  WORKFORCE_ROLES,
  ZONE_TYPES,
} from "@/lib/development/constants/site-constants";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Site report write actions. The submission flow is **atomic** — the
 * `createSiteReport` action accepts the parent + child rows
 * (zones, workforce, photos, consumption) in one input and writes
 * them in a single Drizzle transaction. If any leg fails, no rows
 * persist.
 *
 * Material consumption is tracked separately via
 * `recordMaterialConsumption`; that updates `material_po_lines.quantity_consumed`
 * atomically so the PO utilization view always reconciles.
 */

const zoneInputSchema = z.object({
  zoneId: z.string().uuid(),
  activitiesCompleted: z.array(z.string()).optional().default([]),
  activitiesPlannedTomorrow: z.array(z.string()).optional().default([]),
  workersInZone: z.number().int().min(0).default(0),
  vendorEngagementId: z.string().uuid().optional().nullable(),
  progressPercentToday: z.number().min(0).max(100).optional().nullable(),
  cumulativeProgressPercent: z.number().min(0).max(100).optional().nullable(),
  hasBlocker: z.boolean().default(false),
  blockerDescription: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const workforceInputSchema = z.object({
  vendorEngagementId: z.string().uuid().optional().nullable(),
  roleCategory: z.enum(WORKFORCE_ROLES),
  workerCount: z.number().int().min(0),
  hoursPerWorker: z.number().min(0).default(8),
  ratePerHourMinor: z.union([z.bigint(), z.string(), z.number()]).optional().nullable(),
  rateCurrency: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const createReportSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weatherConditions: z.string().optional().nullable(),
  weatherNotes: z.string().optional().nullable(),
  temperatureCelsiusMin: z.number().int().optional().nullable(),
  temperatureCelsiusMax: z.number().int().optional().nullable(),
  totalWorkersPresent: z.number().int().min(0).default(0),
  totalWorkersPlanned: z.number().int().min(0).optional().nullable(),
  summary: z.string().optional().nullable(),
  reporterRole: z.string().optional().nullable(),
  sourceChannel: z.enum(SOURCE_CHANNELS).default("web"),
  sourceMessageId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  zones: z.array(zoneInputSchema).default([]),
  workforce: z.array(workforceInputSchema).default([]),
});

const toBig = (v: bigint | string | number): bigint =>
  typeof v === "bigint" ? v : BigInt(typeof v === "number" ? Math.trunc(v) : v);

/**
 * Atomic site report creation. Inserts the parent + every child row
 * (zones, workforce) in one transaction. Photos are added separately
 * via `addPhotoToReport` since they typically come from a separate
 * upload endpoint.
 */
export async function createSiteReport(
  input: z.input<typeof createReportSchema>,
): Promise<{ id: string; reportDate: string; zoneCount: number; workforceCount: number }> {
  const parsed = createReportSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();

  return await db.transaction(async (tx) => {
    // 1. Parent row. UNIQUE (project_id, report_date) — duplicate raises.
    const [report] = await tx
      .insert(siteReports)
      .values({
        organizationId,
        projectId: parsed.projectId,
        reportDate: parsed.reportDate,
        weatherConditions: parsed.weatherConditions ?? null,
        weatherNotes: parsed.weatherNotes ?? null,
        temperatureCelsiusMin: parsed.temperatureCelsiusMin ?? null,
        temperatureCelsiusMax: parsed.temperatureCelsiusMax ?? null,
        totalWorkersPresent: parsed.totalWorkersPresent,
        totalWorkersPlanned: parsed.totalWorkersPlanned ?? null,
        summary: parsed.summary ?? null,
        reporterRole: parsed.reporterRole ?? null,
        sourceChannel: parsed.sourceChannel,
        sourceMessageId: parsed.sourceMessageId ?? null,
        notes: parsed.notes ?? null,
      })
      .returning({
        id: siteReports.id,
        reportDate: siteReports.reportDate,
      });

    // 2. Zones — verify each zone belongs to the same project.
    if (parsed.zones.length > 0) {
      const zoneIds = parsed.zones.map((z) => z.zoneId);
      const validZones = await tx
        .select({ id: siteZones.id })
        .from(siteZones)
        .where(
          and(
            eq(siteZones.projectId, parsed.projectId),
            sql`${siteZones.id} = ANY(${sql.raw(`ARRAY[${zoneIds.map((id) => `'${id}'::uuid`).join(",")}]`)})`,
          ),
        );
      const validIds = new Set(validZones.map((z) => z.id));
      for (const z of parsed.zones) {
        if (!validIds.has(z.zoneId)) {
          throw new Error(
            `Zone ${z.zoneId} does not belong to project ${parsed.projectId}`,
          );
        }
      }
      for (const z of parsed.zones) {
        await tx.insert(siteReportZones).values({
          organizationId,
          siteReportId: report.id,
          zoneId: z.zoneId,
          activitiesCompleted: z.activitiesCompleted ?? null,
          activitiesPlannedTomorrow: z.activitiesPlannedTomorrow ?? null,
          workersInZone: z.workersInZone,
          vendorEngagementId: z.vendorEngagementId ?? null,
          progressPercentToday:
            z.progressPercentToday != null
              ? z.progressPercentToday.toFixed(2)
              : null,
          cumulativeProgressPercent:
            z.cumulativeProgressPercent != null
              ? z.cumulativeProgressPercent.toFixed(2)
              : null,
          hasBlocker: z.hasBlocker,
          blockerDescription: z.blockerDescription ?? null,
          notes: z.notes ?? null,
        });
      }
    }

    // 3. Workforce logs.
    for (const w of parsed.workforce) {
      const ratePerHour = w.ratePerHourMinor != null ? toBig(w.ratePerHourMinor) : null;
      // estimated_cost_minor (in original currency) = rate × workers × hours
      const estimatedCost =
        ratePerHour != null
          ? ratePerHour * BigInt(w.workerCount) * BigInt(Math.trunc(w.hoursPerWorker))
          : null;
      await tx.insert(siteWorkforceLogs).values({
        organizationId,
        siteReportId: report.id,
        vendorEngagementId: w.vendorEngagementId ?? null,
        roleCategory: w.roleCategory,
        workerCount: w.workerCount,
        hoursPerWorker: w.hoursPerWorker.toFixed(2),
        ratePerHourMinor: ratePerHour,
        rateCurrency: w.rateCurrency ?? null,
        estimatedCostMinor: estimatedCost,
        // estimatedCostUsdMinor stays null at create time — operator
        // can backfill via the bridge action which does FX conversion.
        notes: w.notes ?? null,
      });
    }

    return {
      id: report.id,
      reportDate: String(report.reportDate),
      zoneCount: parsed.zones.length,
      workforceCount: parsed.workforce.length,
    };
  });
}

export async function submitSiteReport(reportId: string): Promise<void> {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [report] = await db
    .select({ status: siteReports.status })
    .from(siteReports)
    .where(
      and(
        eq(siteReports.id, reportId),
        eq(siteReports.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!report) throw new Error("Site report not found");
  if (report.status !== "draft") {
    throw new Error(
      `Cannot submit: report is ${report.status} (must be draft)`,
    );
  }
  await db
    .update(siteReports)
    .set({
      status: "submitted",
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(siteReports.id, reportId),
        eq(siteReports.organizationId, organizationId),
      ),
    );
}

const reviewSchema = z.object({
  reportId: z.string().uuid(),
  reviewerId: z.string().uuid(),
  notes: z.string().optional().nullable(),
  status: z.enum(["reviewed", "flagged"]),
});

export async function reviewSiteReport(
  input: z.input<typeof reviewSchema>,
): Promise<void> {
  const parsed = reviewSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [report] = await db
    .select({ status: siteReports.status })
    .from(siteReports)
    .where(
      and(
        eq(siteReports.id, parsed.reportId),
        eq(siteReports.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!report) throw new Error("Site report not found");
  if (report.status !== "submitted") {
    throw new Error(
      `Cannot review: report is ${report.status} (must be submitted)`,
    );
  }
  await db
    .update(siteReports)
    .set({
      status: parsed.status,
      reviewedAt: new Date(),
      reviewedBy: parsed.reviewerId,
      reviewerNotes: parsed.notes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(siteReports.id, parsed.reportId),
        eq(siteReports.organizationId, organizationId),
      ),
    );
}

const photoSchema = z.object({
  reportId: z.string().uuid(),
  documentId: z.string().uuid(),
  zoneId: z.string().uuid().optional().nullable(),
  caption: z.string().optional().nullable(),
  photoTakenAt: z.string().optional(),
  gpsLat: z.number().optional().nullable(),
  gpsLng: z.number().optional().nullable(),
});

export async function addPhotoToReport(
  input: z.input<typeof photoSchema>,
): Promise<{ id: string }> {
  const parsed = photoSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [row] = await db
    .insert(siteReportPhotos)
    .values({
      organizationId,
      siteReportId: parsed.reportId,
      documentId: parsed.documentId,
      zoneId: parsed.zoneId ?? null,
      caption: parsed.caption ?? null,
      photoTakenAt: parsed.photoTakenAt
        ? new Date(parsed.photoTakenAt)
        : new Date(),
      gpsLat: parsed.gpsLat != null ? parsed.gpsLat.toFixed(7) : null,
      gpsLng: parsed.gpsLng != null ? parsed.gpsLng.toFixed(7) : null,
    })
    .returning({ id: siteReportPhotos.id });
  return row;
}

const consumptionSchema = z.object({
  reportId: z.string().uuid(),
  zoneId: z.string().uuid(),
  poLineId: z.string().uuid(),
  quantityConsumed: z.number().positive(),
  consumedAt: z.string().optional(),
});

/**
 * Atomic: inserts consumption log + bumps `material_po_lines.quantity_consumed`
 * in the same transaction so the PO utilization view always reconciles.
 */
export async function recordMaterialConsumption(
  input: z.input<typeof consumptionSchema>,
): Promise<{ id: string; newQuantityConsumed: string }> {
  const parsed = consumptionSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();

  return await db.transaction(async (tx) => {
    const [poLine] = await tx
      .select({
        quantityOrdered: materialPoLines.quantityOrdered,
        quantityDelivered: materialPoLines.quantityDelivered,
        quantityConsumed: materialPoLines.quantityConsumed,
      })
      .from(materialPoLines)
      .where(
        and(
          eq(materialPoLines.id, parsed.poLineId),
          eq(materialPoLines.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!poLine) throw new Error("PO line not found");

    const currentConsumed = Number(poLine.quantityConsumed);
    const delivered = Number(poLine.quantityDelivered);
    const newConsumed = currentConsumed + parsed.quantityConsumed;
    if (newConsumed > delivered) {
      throw new Error(
        `Cannot consume ${parsed.quantityConsumed}: only ${delivered - currentConsumed} delivered-but-unconsumed remaining`,
      );
    }

    const [logRow] = await tx
      .insert(materialConsumptionLogs)
      .values({
        organizationId,
        siteReportId: parsed.reportId,
        zoneId: parsed.zoneId,
        poLineId: parsed.poLineId,
        quantityConsumed: parsed.quantityConsumed.toFixed(4),
        consumedAt: parsed.consumedAt ? new Date(parsed.consumedAt) : new Date(),
      })
      .returning({ id: materialConsumptionLogs.id });

    await tx
      .update(materialPoLines)
      .set({ quantityConsumed: newConsumed.toFixed(4) })
      .where(
        and(
          eq(materialPoLines.id, parsed.poLineId),
          eq(materialPoLines.organizationId, organizationId),
        ),
      );

    return {
      id: logRow.id,
      newQuantityConsumed: newConsumed.toFixed(4),
    };
  });
}

// ---------------------------------------------------------------------------
// Site zones
// ---------------------------------------------------------------------------

const zoneCreateSchema = z.object({
  projectId: z.string().uuid(),
  zoneCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  zoneName: z.string().min(1),
  zoneType: z.enum(ZONE_TYPES),
  villaId: z.string().uuid().optional().nullable(),
  expectedStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  expectedCompletionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  displayOrder: z.number().int().default(100),
  notes: z.string().optional().nullable(),
});

export async function createSiteZone(
  input: z.input<typeof zoneCreateSchema>,
): Promise<{ id: string; zoneCode: string }> {
  const parsed = zoneCreateSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [row] = await db
    .insert(siteZones)
    .values({
      organizationId,
      projectId: parsed.projectId,
      zoneCode: parsed.zoneCode,
      zoneName: parsed.zoneName,
      zoneType: parsed.zoneType,
      villaId: parsed.villaId ?? null,
      expectedStartDate: parsed.expectedStartDate ?? null,
      expectedCompletionDate: parsed.expectedCompletionDate ?? null,
      displayOrder: parsed.displayOrder,
      notes: parsed.notes ?? null,
    })
    .returning({ id: siteZones.id, zoneCode: siteZones.zoneCode });
  return row;
}
