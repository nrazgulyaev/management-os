import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  drawings,
  drawingRevisions,
  drawingDistributionLog,
} from "@/lib/db/schema/drawings";
import { requireInternalUser } from "@/features/auth/permissions";

const DRAWING_TYPES = [
  "architectural",
  "structural",
  "mep_electrical",
  "mep_plumbing",
  "mep_hvac",
  "landscape",
  "pool",
  "site_plan",
  "detail",
  "shop_drawing",
  "as_built",
  "sketch",
  "other",
] as const;

const DRAWING_PHASES = [
  "concept",
  "schematic_design",
  "design_development",
  "permit_set",
  "construction_set",
  "as_built",
] as const;

const REV_STATUSES = [
  "draft",
  "for_review",
  "approved",
  "issued_for_construction",
  "superseded",
  "rejected",
] as const;

const VALID_NEXT: Record<string, string[]> = {
  draft: ["for_review", "rejected"],
  for_review: ["approved", "rejected", "draft"],
  approved: ["issued_for_construction", "rejected"],
  issued_for_construction: ["superseded"],
  superseded: [],
  rejected: ["draft"],
};

const createDrawingSchema = z.object({
  drawingCode: z.string().min(1),
  drawingNumber: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  projectId: z.string().uuid(),
  villaId: z.string().uuid().nullable().optional(),
  drawingType: z.enum(DRAWING_TYPES),
  drawingPhase: z.enum(DRAWING_PHASES).nullable().optional(),
  authorFirm: z.string().nullable().optional(),
  authorName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function createDrawing(input: z.input<typeof createDrawingSchema>) {
  const ctx = await requireInternalUser();
  const parsed = createDrawingSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(drawings)
    .values({
      drawingCode: parsed.drawingCode,
      drawingNumber: parsed.drawingNumber,
      title: parsed.title,
      description: parsed.description ?? null,
      projectId: parsed.projectId,
      villaId: parsed.villaId ?? null,
      drawingType: parsed.drawingType,
      drawingPhase: parsed.drawingPhase ?? null,
      authorFirm: parsed.authorFirm ?? null,
      authorName: parsed.authorName ?? null,
      notes: parsed.notes ?? null,
      createdBy: ctx.appUser?.id ?? null,
    })
    .returning();
  return row;
}

const addRevisionSchema = z.object({
  drawingId: z.string().uuid(),
  revisionLabel: z.string().min(1),
  revisionDate: z.string().optional(),
  revisionReason: z.string().nullable().optional(),
  documentId: z.string().uuid(),
  notes: z.string().nullable().optional(),
});

export async function addDrawingRevision(
  input: z.input<typeof addRevisionSchema>,
) {
  await requireInternalUser();
  const parsed = addRevisionSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(drawingRevisions)
    .values({
      drawingId: parsed.drawingId,
      revisionLabel: parsed.revisionLabel,
      revisionDate:
        parsed.revisionDate ?? new Date().toISOString().slice(0, 10),
      revisionReason: parsed.revisionReason ?? null,
      documentId: parsed.documentId,
      notes: parsed.notes ?? null,
      status: "draft",
    })
    .returning();
  return row;
}

const transitionSchema = z.object({
  revisionId: z.string().uuid(),
  to: z.enum(REV_STATUSES),
  approvalNotes: z.string().nullable().optional(),
});

export async function transitionDrawingRevision(
  input: z.input<typeof transitionSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = transitionSchema.parse(input);
  const db = requireDb();

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(drawingRevisions)
      .where(eq(drawingRevisions.id, parsed.revisionId))
      .limit(1);
    if (!current) throw new Error("revision not found");
    if (!VALID_NEXT[current.status].includes(parsed.to)) {
      throw new Error(
        `cannot transition revision from '${current.status}' to '${parsed.to}'`,
      );
    }

    // If we're issuing for construction, first supersede any existing IFC
    // revision on the same drawing (defense-in-depth — DB partial unique
    // index would otherwise reject the insert).
    if (parsed.to === "issued_for_construction") {
      const [existingIfc] = await tx
        .select()
        .from(drawingRevisions)
        .where(
          and(
            eq(drawingRevisions.drawingId, current.drawingId),
            eq(drawingRevisions.status, "issued_for_construction"),
          ),
        )
        .limit(1);
      if (existingIfc && existingIfc.id !== current.id) {
        await tx
          .update(drawingRevisions)
          .set({
            status: "superseded",
            supersededAt: new Date(),
            supersededByRevisionId: current.id,
          })
          .where(eq(drawingRevisions.id, existingIfc.id));
      }
    }

    const updates: Record<string, unknown> = { status: parsed.to };
    if (parsed.to === "approved") {
      updates.approvedBy = ctx.appUser?.id ?? null;
      updates.approvedAt = new Date();
      if (parsed.approvalNotes) updates.approvalNotes = parsed.approvalNotes;
    }
    if (parsed.to === "issued_for_construction") {
      updates.issuedForConstructionAt = new Date();
      updates.issuedBy = ctx.appUser?.id ?? null;
    }
    if (parsed.to === "superseded") {
      updates.supersededAt = new Date();
    }

    const [row] = await tx
      .update(drawingRevisions)
      .set(updates)
      .where(eq(drawingRevisions.id, parsed.revisionId))
      .returning();
    return row;
  });
}

const distributionSchema = z.object({
  revisionId: z.string().uuid(),
  vendorId: z.string().uuid(),
  distributionMethod: z.enum([
    "whatsapp",
    "email",
    "physical_print",
    "platform_download",
    "other",
  ]),
  notes: z.string().nullable().optional(),
});

export async function logDrawingDistribution(
  input: z.input<typeof distributionSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = distributionSchema.parse(input);
  if (!ctx.appUser?.id) {
    throw new Error("logDrawingDistribution: requires authenticated app user");
  }
  const db = requireDb();
  const [row] = await db
    .insert(drawingDistributionLog)
    .values({
      revisionId: parsed.revisionId,
      vendorId: parsed.vendorId,
      distributedBy: ctx.appUser.id,
      distributionMethod: parsed.distributionMethod,
      notes: parsed.notes ?? null,
    })
    .returning();
  return row;
}
