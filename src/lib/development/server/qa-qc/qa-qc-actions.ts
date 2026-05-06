"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  qaQcIssues,
  qaQcInspections,
  qaQcIssuePhotos,
} from "@/lib/db/schema/qa-qc";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  assertValidQaQcTransition,
  type QaQcStatus,
  type QaQcSeverity,
} from "./qa-qc-helpers";

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

const createIssueSchema = z.object({
  title: z.string().min(1),
  projectId: z.string().uuid(),
  villaId: z.string().uuid().nullable().optional(),
  zoneReference: z.string().nullable().optional(),
  workPackageId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid(),
  severity: z.enum(SEVERITIES),
  description: z.string().min(1),
  responsibleVendorId: z.string().uuid().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  deadlineAt: z.string().nullable().optional(),
  estimatedReworkCostMinor: z.bigint().nullable().optional(),
  currency: z.string().default("IDR"),
  notes: z.string().nullable().optional(),
});

export async function createQaQcIssue(input: z.input<typeof createIssueSchema>) {
  const ctx = await requireInternalUser();
  const parsed = createIssueSchema.parse(input);
  const db = requireDb();
  if (!ctx.appUser?.id) {
    throw new Error("createQaQcIssue: requires authenticated app user");
  }
  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(qaQcIssues);
  const year = new Date().getFullYear();
  const seq = String(Number(count ?? "0") + 1).padStart(4, "0");
  const issueCode = `QC-${year}-${seq}`;

  const initialStatus: QaQcStatus = parsed.assignedTo ? "assigned" : "open";

  const [row] = await db
    .insert(qaQcIssues)
    .values({
      issueCode,
      title: parsed.title,
      projectId: parsed.projectId,
      villaId: parsed.villaId ?? null,
      zoneReference: parsed.zoneReference ?? null,
      workPackageId: parsed.workPackageId ?? null,
      categoryId: parsed.categoryId,
      severity: parsed.severity,
      description: parsed.description,
      responsibleVendorId: parsed.responsibleVendorId ?? null,
      reportedBy: ctx.appUser.id,
      assignedTo: parsed.assignedTo ?? null,
      status: initialStatus,
      deadlineAt: parsed.deadlineAt ?? null,
      estimatedReworkCostMinor: parsed.estimatedReworkCostMinor ?? null,
      currency: parsed.currency,
      notes: parsed.notes ?? null,
    })
    .returning();
  return row;
}

const transitionSchema = z.object({
  issueId: z.string().uuid(),
  to: z.enum([
    "open",
    "assigned",
    "in_progress",
    "ready_for_reinspection",
    "rejected",
    "accepted",
    "closed",
  ]),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function transitionQaQcIssue(
  input: z.input<typeof transitionSchema>,
) {
  await requireInternalUser();
  const parsed = transitionSchema.parse(input);
  const db = requireDb();

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(qaQcIssues)
      .where(eq(qaQcIssues.id, parsed.issueId))
      .limit(1);
    if (!current) throw new Error(`issue ${parsed.issueId} not found`);

    assertValidQaQcTransition(
      current.status as QaQcStatus,
      parsed.to as QaQcStatus,
    );

    const updates: Record<string, unknown> = {
      status: parsed.to,
      statusChangedAt: new Date(),
    };
    if (parsed.to === "assigned" && parsed.assignedTo) {
      updates.assignedTo = parsed.assignedTo;
    }
    if (parsed.to === "accepted") {
      updates.resolvedAt = new Date();
    }
    if (parsed.to === "closed") {
      updates.closedAt = new Date();
    }
    if (parsed.notes) {
      updates.notes = parsed.notes;
    }

    const [row] = await tx
      .update(qaQcIssues)
      .set(updates)
      .where(eq(qaQcIssues.id, parsed.issueId))
      .returning();
    return row;
  });
}

const recordInspectionSchema = z.object({
  issueId: z.string().uuid(),
  result: z.enum(["passed", "failed", "partial_pass"]),
  resultNotes: z.string().nullable().optional(),
});

/**
 * Record an inspection. Atomic: writes the inspection row + transitions
 * the issue status (passed → accepted, failed → rejected, partial_pass
 * → ready_for_reinspection again) inside a single transaction.
 */
export async function recordQaQcInspection(
  input: z.input<typeof recordInspectionSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = recordInspectionSchema.parse(input);
  const db = requireDb();
  if (!ctx.appUser?.id) {
    throw new Error("recordQaQcInspection: requires authenticated app user");
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(qaQcIssues)
      .where(eq(qaQcIssues.id, parsed.issueId))
      .limit(1);
    if (!current) throw new Error(`issue ${parsed.issueId} not found`);
    if (current.status !== "ready_for_reinspection") {
      throw new Error(
        `qa_qc: can only inspect issues in 'ready_for_reinspection' status (got '${current.status}')`,
      );
    }

    const [{ maxN }] = await tx
      .select({
        maxN: sql<string>`COALESCE(MAX(${qaQcInspections.inspectionNumber}), 0)::text`,
      })
      .from(qaQcInspections)
      .where(eq(qaQcInspections.issueId, parsed.issueId));
    const nextNumber = Number(maxN ?? "0") + 1;

    const [inspection] = await tx
      .insert(qaQcInspections)
      .values({
        issueId: parsed.issueId,
        inspectionNumber: nextNumber,
        inspectorId: ctx.appUser!.id,
        inspectionDate: new Date().toISOString().slice(0, 10),
        result: parsed.result,
        resultNotes: parsed.resultNotes ?? null,
      })
      .returning();

    const newStatus: QaQcStatus =
      parsed.result === "passed"
        ? "accepted"
        : parsed.result === "failed"
          ? "rejected"
          : "ready_for_reinspection"; // partial_pass — operator decides next.

    if (newStatus !== current.status) {
      const updates: Record<string, unknown> = {
        status: newStatus,
        statusChangedAt: new Date(),
      };
      if (newStatus === "accepted") updates.resolvedAt = new Date();
      await tx
        .update(qaQcIssues)
        .set(updates)
        .where(eq(qaQcIssues.id, parsed.issueId));
    }

    return { inspection, newStatus };
  });
}

const attachPhotoSchema = z.object({
  issueId: z.string().uuid(),
  documentId: z.string().uuid(),
  photoRole: z.enum([
    "initial_defect",
    "work_in_progress",
    "resolution_proof",
    "reinspection",
  ]),
  inspectionId: z.string().uuid().nullable().optional(),
  caption: z.string().nullable().optional(),
});

export async function attachQaQcPhoto(
  input: z.input<typeof attachPhotoSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = attachPhotoSchema.parse(input);
  const db = requireDb();
  if (!ctx.appUser?.id) {
    throw new Error("attachQaQcPhoto: requires authenticated app user");
  }
  const [row] = await db
    .insert(qaQcIssuePhotos)
    .values({
      issueId: parsed.issueId,
      documentId: parsed.documentId,
      photoRole: parsed.photoRole,
      inspectionId: parsed.inspectionId ?? null,
      caption: parsed.caption ?? null,
      uploadedBy: ctx.appUser.id,
    })
    .returning();
  return row;
}
