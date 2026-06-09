"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import { recordAuditEvent } from "@/features/audit/services";
import { rfis } from "@/lib/db/schema/rfis";
import { submittals } from "@/lib/db/schema/submittals";
import { qaQcIssues } from "@/lib/db/schema/qa-qc";
import { drawingRevisions, drawings } from "@/lib/db/schema/drawings";
import {
  coordinationPins,
  coordinationMessages,
  coordinationLinkColumns,
  COORDINATION_ITEM_KINDS,
} from "@/lib/db/schema/coordination";
import { SUBMITTAL_TYPES, SUBMITTAL_STATUSES } from "@/lib/db/schema/submittals";
import {
  canTransitionSubmittal,
  makeSubmittalRef,
  type CoordinationItemKind,
} from "@/features/development/coordination/coordination-model";
import {
  listThreadMessages as loadThreadMessages,
} from "./coordination-queries";
import type { CoordinationThreadMessage } from "./coordination-queries";

export type { CoordinationThreadMessage };
import {
  RFI_DISCIPLINES,
  makeRfiRef,
} from "@/features/development/rfi/rfi-routing";
import type { SubmittalStatus } from "@/lib/db/schema/submittals";

const COORDINATION = "/development-os/coordination";

/**
 * Client-callable wrapper around the server-only thread query so the item
 * drawer (a client component) can fetch the reply thread without importing the
 * `server-only` query module directly.
 */
export async function fetchCoordinationThread(input: {
  kind: CoordinationItemKind;
  id: string;
}): Promise<CoordinationThreadMessage[]> {
  await requireInternalUser();
  return loadThreadMessages(input);
}

const PRIORITIES = ["low", "medium", "high", "critical"] as const;

/** Re-validates the cabinet view for the revision a write touched. */
function revalidateRevision(revisionId: string) {
  revalidatePath(`${COORDINATION}?revision=${revisionId}`);
  revalidatePath(COORDINATION);
}

/**
 * Resolves the project that owns a drawing revision. The cabinet always pins
 * against a revision, so this is the authoritative project guard for writes.
 */
async function projectIdForRevision(
  db: ReturnType<typeof requireDb>,
  revisionId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ projectId: drawings.projectId })
    .from(drawingRevisions)
    .innerJoin(drawings, eq(drawings.id, drawingRevisions.drawingId))
    .where(eq(drawingRevisions.id, revisionId))
    .limit(1);
  return row?.projectId ?? null;
}

// ── Create a submittal (the missing register) ─────────────────────────
const createSubmittalSchema = z.object({
  projectId: z.string().uuid(),
  /** Used only to build the human ref SUB-<CODE>-NNNN. */
  projectCode: z.string().min(1),
  title: z.string().min(3),
  submittalType: z.enum(SUBMITTAL_TYPES as unknown as [string, ...string[]]),
  discipline: z.enum(RFI_DISCIPLINES as unknown as [string, ...string[]]),
  specSection: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(PRIORITIES).default("medium"),
});

export interface CreatedItem {
  id: string;
  ref: string;
}

export async function createSubmittal(
  input: z.input<typeof createSubmittalSchema>,
): Promise<CreatedItem> {
  const ctx = await requireInternalUser();
  const parsed = createSubmittalSchema.parse(input);
  const db = requireDb();

  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(submittals)
    .where(eq(submittals.projectId, parsed.projectId));
  const seq = Number(count ?? "0") + 1;

  let ref = makeSubmittalRef(parsed.projectCode, seq);
  let row: typeof submittals.$inferSelect | undefined;
  for (let attempt = 0; attempt < 3 && !row; attempt++) {
    try {
      [row] = await db
        .insert(submittals)
        .values({
          projectId: parsed.projectId,
          ref,
          title: parsed.title,
          submittalType: parsed.submittalType,
          discipline: parsed.discipline,
          specSection: parsed.specSection ?? null,
          description: parsed.description ?? null,
          priority: parsed.priority ?? "medium",
          status: "submitted",
          submittedAt: new Date(),
          createdBy: ctx.appUser?.id ?? null,
        })
        .returning();
    } catch (err) {
      if (attempt === 2) throw err;
      ref = `${makeSubmittalRef(parsed.projectCode, seq)}-${String(Date.now()).slice(-3)}`;
    }
  }
  if (!row) throw new Error("Failed to create submittal");

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "submittal.create",
    entityType: "submittal",
    entityId: row.id,
    after: {
      ref: row.ref,
      submittalType: row.submittalType,
      discipline: row.discipline,
      status: row.status,
    },
    metadata: { projectId: parsed.projectId },
  });

  revalidatePath(COORDINATION);
  return { id: row.id, ref: row.ref };
}

// ── Create an RFI inline (mirrors the RFI cabinet's ref scheme) ────────
const createRfiSchema = z.object({
  projectId: z.string().uuid(),
  projectCode: z.string().min(1),
  question: z.string().min(3),
  discipline: z.enum(RFI_DISCIPLINES as unknown as [string, ...string[]]),
  priority: z.enum(PRIORITIES).default("medium"),
});

export async function createCoordinationRfi(
  input: z.input<typeof createRfiSchema>,
): Promise<CreatedItem> {
  const ctx = await requireInternalUser();
  const parsed = createRfiSchema.parse(input);
  const db = requireDb();

  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(rfis)
    .where(eq(rfis.projectId, parsed.projectId));
  const seq = Number(count ?? "0") + 1;

  let ref = makeRfiRef(parsed.projectCode, seq);
  let row: typeof rfis.$inferSelect | undefined;
  for (let attempt = 0; attempt < 3 && !row; attempt++) {
    try {
      [row] = await db
        .insert(rfis)
        .values({
          projectId: parsed.projectId,
          ref,
          question: parsed.question,
          discipline: parsed.discipline,
          priority: parsed.priority ?? "medium",
        })
        .returning();
    } catch (err) {
      if (attempt === 2) throw err;
      ref = `${makeRfiRef(parsed.projectCode, seq)}-${String(Date.now()).slice(-3)}`;
    }
  }
  if (!row) throw new Error("Failed to open RFI");

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "rfi.create",
    entityType: "rfi",
    entityId: row.id,
    after: { ref: row.ref, discipline: row.discipline, priority: row.priority },
    metadata: { projectId: parsed.projectId, via: "coordination" },
  });

  revalidatePath(COORDINATION);
  return { id: row.id, ref: row.ref };
}

// ── Place a pin (links an existing item to a revision position) ────────
const placePinSchema = z.object({
  revisionId: z.string().uuid(),
  itemKind: z.enum(COORDINATION_ITEM_KINDS as unknown as [string, ...string[]]),
  itemId: z.string().uuid(),
  xPct: z.number().min(0).max(100),
  yPct: z.number().min(0).max(100),
});

export async function placeCoordinationPin(
  input: z.input<typeof placePinSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = placePinSchema.parse(input);
  const db = requireDb();

  const projectId = await projectIdForRevision(db, parsed.revisionId);
  if (!projectId) throw new Error("Drawing revision not found");

  const kind = parsed.itemKind as (typeof COORDINATION_ITEM_KINDS)[number];
  const link = coordinationLinkColumns(kind, parsed.itemId);

  // Verify the linked item exists AND belongs to the revision's project.
  let belongs = false;
  if (kind === "rfi") {
    const [r] = await db
      .select({ projectId: rfis.projectId })
      .from(rfis)
      .where(eq(rfis.id, parsed.itemId))
      .limit(1);
    belongs = r?.projectId === projectId;
  } else if (kind === "submittal") {
    const [s] = await db
      .select({ projectId: submittals.projectId })
      .from(submittals)
      .where(eq(submittals.id, parsed.itemId))
      .limit(1);
    belongs = s?.projectId === projectId;
  } else {
    const [d] = await db
      .select({ projectId: qaQcIssues.projectId })
      .from(qaQcIssues)
      .where(eq(qaQcIssues.id, parsed.itemId))
      .limit(1);
    belongs = d?.projectId === projectId;
  }
  if (!belongs) throw new Error("Item does not belong to this project");

  const [row] = await db
    .insert(coordinationPins)
    .values({
      projectId,
      revisionId: parsed.revisionId,
      xPct: parsed.xPct,
      yPct: parsed.yPct,
      itemKind: kind,
      ...link,
      createdBy: ctx.appUser?.id ?? null,
    })
    .returning();

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "coordination.pin.place",
    entityType: "coordination_pin",
    entityId: row?.id ?? null,
    after: { itemKind: kind, itemId: parsed.itemId, xPct: parsed.xPct, yPct: parsed.yPct },
    metadata: { projectId, revisionId: parsed.revisionId },
  });

  revalidateRevision(parsed.revisionId);
  return row;
}

const removePinSchema = z.object({ pinId: z.string().uuid() });

export async function removeCoordinationPin(
  input: z.input<typeof removePinSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = removePinSchema.parse(input);
  const db = requireDb();

  const [deleted] = await db
    .delete(coordinationPins)
    .where(eq(coordinationPins.id, parsed.pinId))
    .returning({ id: coordinationPins.id, revisionId: coordinationPins.revisionId });
  if (!deleted) return null;

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "coordination.pin.remove",
    entityType: "coordination_pin",
    entityId: parsed.pinId,
  });

  revalidateRevision(deleted.revisionId);
  return deleted;
}

// ── Reply thread ──────────────────────────────────────────────────────
const replySchema = z.object({
  itemKind: z.enum(COORDINATION_ITEM_KINDS as unknown as [string, ...string[]]),
  itemId: z.string().uuid(),
  body: z.string().min(1),
});

export async function postCoordinationReply(
  input: z.input<typeof replySchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = replySchema.parse(input);
  const db = requireDb();
  const kind = parsed.itemKind as (typeof COORDINATION_ITEM_KINDS)[number];
  const link = coordinationLinkColumns(kind, parsed.itemId);

  const [row] = await db
    .insert(coordinationMessages)
    .values({
      itemKind: kind,
      ...link,
      body: parsed.body.trim(),
      authorUserId: ctx.appUser?.id ?? null,
      authorName: ctx.appUser?.fullName ?? null,
    })
    .returning();

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "coordination.reply",
    entityType: kind,
    entityId: parsed.itemId,
    metadata: { messageId: row?.id ?? null },
  });

  revalidatePath(COORDINATION);
  return row;
}

// ── Approve / close lifecycle ─────────────────────────────────────────
const transitionSchema = z.object({
  itemKind: z.enum(COORDINATION_ITEM_KINDS as unknown as [string, ...string[]]),
  itemId: z.string().uuid(),
  /**
   * RFI: "answered" | "closed"
   * Submittal: any SUBMITTAL_STATUSES value
   * Defect: not transitionable here (use the QA/QC cabinet) — guarded below.
   */
  to: z.string().min(1),
});

export async function transitionCoordinationItem(
  input: z.input<typeof transitionSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = transitionSchema.parse(input);
  const db = requireDb();
  const kind = parsed.itemKind as (typeof COORDINATION_ITEM_KINDS)[number];

  if (kind === "defect") {
    throw new Error(
      "Defect lifecycle is managed in the QA/QC cabinet, not Coordination.",
    );
  }

  if (kind === "rfi") {
    if (parsed.to !== "answered" && parsed.to !== "closed") {
      throw new Error(`Illegal RFI transition target: ${parsed.to}`);
    }
    const now = new Date();
    const [current] = await db
      .select({ respondedAt: rfis.respondedAt, resolvedAt: rfis.resolvedAt })
      .from(rfis)
      .where(eq(rfis.id, parsed.itemId))
      .limit(1);
    if (!current) throw new Error("RFI not found");
    if (current.resolvedAt) throw new Error("RFI already closed");

    const updates: Partial<typeof rfis.$inferInsert> = {
      respondedAt: current.respondedAt ?? now,
    };
    if (parsed.to === "closed") updates.resolvedAt = now;

    const [row] = await db
      .update(rfis)
      .set(updates)
      .where(eq(rfis.id, parsed.itemId))
      .returning();

    await recordAuditEvent({
      actorUserId: ctx.appUser?.id ?? null,
      action: "rfi.transition",
      entityType: "rfi",
      entityId: parsed.itemId,
      metadata: { to: parsed.to, via: "coordination" },
    });
    revalidatePath(COORDINATION);
    return row;
  }

  // submittal
  if (
    !(SUBMITTAL_STATUSES as readonly string[]).includes(parsed.to)
  ) {
    throw new Error(`Unknown submittal status: ${parsed.to}`);
  }
  const to = parsed.to as SubmittalStatus;
  const [current] = await db
    .select({ status: submittals.status })
    .from(submittals)
    .where(eq(submittals.id, parsed.itemId))
    .limit(1);
  if (!current) throw new Error("Submittal not found");
  const from = current.status as SubmittalStatus;
  if (!canTransitionSubmittal(from, to)) {
    throw new Error(`Illegal submittal transition ${from} → ${to}`);
  }

  const now = new Date();
  const updates: Partial<typeof submittals.$inferInsert> = {
    status: to,
    updatedAt: now,
  };
  if (["approved", "approved_as_noted", "rejected", "revise_resubmit"].includes(to)) {
    updates.reviewedAt = now;
  }
  if (to === "closed") updates.closedAt = now;

  const [row] = await db
    .update(submittals)
    .set(updates)
    .where(eq(submittals.id, parsed.itemId))
    .returning();

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "submittal.transition",
    entityType: "submittal",
    entityId: parsed.itemId,
    metadata: { from, to, via: "coordination" },
  });
  revalidatePath(COORDINATION);
  return row;
}
