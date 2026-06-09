import "server-only";

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import {
  projectPermits,
  projectPermitDocuments,
} from "@/lib/db/schema/permits";
import { projects } from "@/lib/db/schema/projects";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Permit lifecycle actions. Status transitions are enforced loosely —
 * any operator-initiated transition is allowed, but the migration
 * CHECK enumerates the legal states.
 */

const createSchema = z.object({
  projectId: z.string().uuid(),
  permitType: z.enum([
    "pbg",
    "slf",
    "building_license",
    "environmental",
    "zoning_change",
    "business_license",
    "construction_permit",
    "utility_connection",
    "land_use_change",
    "custom",
  ]),
  permitLabel: z.string().min(1).max(300),
  status: z
    .enum([
      "planned",
      "preparing",
      "submitted",
      "under_review",
      "approved",
      "rejected",
      "expired",
      "renewed",
      "cancelled",
    ])
    .default("planned"),
  targetApprovalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  permitNumber: z.string().max(200).optional(),
  issuingAuthority: z.string().max(200).optional(),
  responsiblePerson: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export async function createPermit(
  input: z.input<typeof createSchema>,
): Promise<{ id: string }> {
  const parsed = createSchema.parse(input);
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();
  const [row] = await db
    .insert(projectPermits)
    .values({
      organizationId,
      projectId: parsed.projectId,
      permitType: parsed.permitType,
      permitLabel: parsed.permitLabel,
      status: parsed.status,
      targetApprovalDate: parsed.targetApprovalDate ?? null,
      expiresAt: parsed.expiresAt ?? null,
      permitNumber: parsed.permitNumber ?? null,
      issuingAuthority: parsed.issuingAuthority ?? null,
      responsiblePerson: parsed.responsiblePerson ?? null,
      notes: parsed.notes ?? null,
    })
    .returning({ id: projectPermits.id });
  await revalidatePermits(parsed.projectId);
  return { id: row.id };
}

const transitionSchema = z.object({
  permitId: z.string().uuid(),
  newStatus: z.enum([
    "planned",
    "preparing",
    "submitted",
    "under_review",
    "approved",
    "rejected",
    "expired",
    "renewed",
    "cancelled",
  ]),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rejectionReason: z.string().max(2000).optional(),
});

export async function transitionPermitStatus(
  input: z.input<typeof transitionSchema>,
): Promise<{ ok: true }> {
  const parsed = transitionSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();
  await db
    .update(projectPermits)
    .set({
      status: parsed.newStatus,
      receivedAt: parsed.receivedAt ?? null,
      expiresAt: parsed.expiresAt ?? null,
      rejectionReason: parsed.rejectionReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(projectPermits.id, parsed.permitId));
  return { ok: true };
}

const attachDocSchema = z.object({
  permitId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentRole: z.string().max(100).optional(),
});

export async function attachPermitDocument(
  input: z.input<typeof attachDocSchema>,
): Promise<{ ok: true }> {
  const parsed = attachDocSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();
  await db
    .insert(projectPermitDocuments)
    .values({
      permitId: parsed.permitId,
      documentId: parsed.documentId,
      documentRole: parsed.documentRole ?? null,
    })
    .onConflictDoNothing();
  return { ok: true };
}

// =========================================================================
// Read-side queries
// =========================================================================

export async function listPermitsByProject(projectId: string) {
  const db = requireDb();
  // TENANCY — scope to the caller's org (in addition to project_id).
  const organizationId = await requireOrgId();
  return await db
    .select()
    .from(projectPermits)
    .where(
      and(
        eq(projectPermits.organizationId, organizationId),
        eq(projectPermits.projectId, projectId),
      ),
    )
    .orderBy(asc(projectPermits.permitType));
}

export async function listExpiringPermits(daysAhead: number) {
  const db = requireDb();
  const cutoff = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return await db
    .select()
    .from(projectPermits)
    .where(
      and(
        sql`${projectPermits.expiresAt} IS NOT NULL`,
        lte(projectPermits.expiresAt, cutoff.toISOString().slice(0, 10)),
        sql`${projectPermits.status} NOT IN ('rejected','cancelled','expired')`,
      ),
    )
    .orderBy(asc(projectPermits.expiresAt));
}

export async function getPermit(permitId: string) {
  const db = requireDb();
  // TENANCY — scope the detail read to the caller's org.
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(projectPermits)
    .where(
      and(
        eq(projectPermits.organizationId, organizationId),
        eq(projectPermits.id, permitId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const docs = await db
    .select()
    .from(projectPermitDocuments)
    .where(eq(projectPermitDocuments.permitId, permitId));
  return { permit: row, documents: docs };
}

async function revalidatePermits(projectId: string): Promise<void> {
  const db = requireDb();
  const [p] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (p) revalidatePath(`/development-os/projects/${p.slug}/permits`);
}
