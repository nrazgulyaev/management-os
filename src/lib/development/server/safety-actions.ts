import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { safetyIncidents } from "@/lib/db/schema/site-operations";
import { projects } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";
import {
  SAFETY_CATEGORIES,
  SAFETY_SEVERITIES,
  SAFETY_STATUSES,
} from "@/lib/development/constants/safety-constants";

const incidentCreateSchema = z.object({
  incidentCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  projectId: z.string().uuid(),
  zoneId: z.string().uuid().optional().nullable(),
  relatedSiteReportId: z.string().uuid().optional().nullable(),
  incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  incidentTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional()
    .nullable(),
  severity: z.enum(SAFETY_SEVERITIES),
  category: z.enum(SAFETY_CATEGORIES),
  affectedWorkersCount: z.number().int().min(0).default(0),
  vendorEngagementId: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  immediateActionsTaken: z.string().optional().nullable(),
  reportedToAuthorities: z.boolean().default(false),
  authorityReportReference: z.string().optional().nullable(),
});

/**
 * safety_incidents has no organization_id; it anchors org through its
 * project. Verify the incident exists AND its project belongs to the
 * caller's org before any mutation, so a client cannot flip / resolve
 * another tenant's incident by posting its raw id. Throws on mismatch.
 */
async function assertIncidentInOrg(
  db: ReturnType<typeof requireDb>,
  incidentId: string,
  organizationId: string,
): Promise<void> {
  const [hit] = await db
    .select({ id: safetyIncidents.id })
    .from(safetyIncidents)
    .innerJoin(projects, eq(projects.id, safetyIncidents.projectId))
    .where(
      and(
        eq(safetyIncidents.id, incidentId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!hit) {
    throw new Error("Safety incident not found in your organization");
  }
}

/**
 * Records a safety incident. The cron job
 * `runOpenSafetyIncidentEscalation` watches for `severe` / `fatal`
 * incidents and escalates after 24h if still open. We don't fire any
 * notification synchronously here — keeps the action fast and lets
 * the cron pipeline handle delivery.
 */
export async function recordSafetyIncident(
  input: z.input<typeof incidentCreateSchema>,
): Promise<{ id: string; incidentCode: string }> {
  const parsed = incidentCreateSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();
  // safety_incidents has no org column; anchor via the project. Reject a
  // client-supplied projectId that is not in the caller's org.
  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, parsed.projectId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!proj) {
    throw new Error("recordSafetyIncident: project not found in your organization");
  }
  const [row] = await db
    .insert(safetyIncidents)
    .values({
      incidentCode: parsed.incidentCode,
      projectId: parsed.projectId,
      zoneId: parsed.zoneId ?? null,
      relatedSiteReportId: parsed.relatedSiteReportId ?? null,
      incidentDate: parsed.incidentDate,
      incidentTime: parsed.incidentTime ?? null,
      severity: parsed.severity,
      category: parsed.category,
      affectedWorkersCount: parsed.affectedWorkersCount,
      vendorEngagementId: parsed.vendorEngagementId ?? null,
      description: parsed.description,
      immediateActionsTaken: parsed.immediateActionsTaken ?? null,
      reportedToAuthorities: parsed.reportedToAuthorities,
      authorityReportReference: parsed.authorityReportReference ?? null,
    })
    .returning({
      id: safetyIncidents.id,
      incidentCode: safetyIncidents.incidentCode,
    });
  return row;
}

export async function setSafetyIncidentStatus(
  id: string,
  status: (typeof SAFETY_STATUSES)[number],
): Promise<void> {
  const parsed = z.enum(SAFETY_STATUSES).parse(status);
  const db = requireDb();
  const organizationId = await requireOrgId();
  await assertIncidentInOrg(db, id, organizationId);
  const updates: Record<string, unknown> = {
    status: parsed,
    updatedAt: new Date(),
  };
  if (parsed === "resolved" || parsed === "closed") {
    updates.resolvedAt = new Date();
  }
  await db.update(safetyIncidents).set(updates).where(eq(safetyIncidents.id, id));
}

export async function resolveSafetyIncident(
  id: string,
  resolutionNotes: string,
): Promise<void> {
  if (!resolutionNotes || resolutionNotes.trim().length < 3) {
    throw new Error("resolveSafetyIncident: resolutionNotes required (≥3 chars)");
  }
  const db = requireDb();
  const organizationId = await requireOrgId();
  await assertIncidentInOrg(db, id, organizationId);
  await db
    .update(safetyIncidents)
    .set({
      status: "resolved",
      resolutionNotes,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(safetyIncidents.id, id));
}
