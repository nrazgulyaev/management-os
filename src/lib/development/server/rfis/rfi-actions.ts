"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { rfis } from "@/lib/db/schema/rfis";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import { route as routeRfi } from "@/features/ai-agents/projects/rfi-router";
import {
  RFI_DISCIPLINES,
  canTransition,
  makeRfiRef,
  rfiStatus,
  type RfiStatus,
} from "@/features/development/rfi/rfi-routing";

const DEV_PROJECTS = "/development-os/projects";

const PRIORITIES = ["low", "medium", "high", "critical"] as const;

const composeSchema = z.object({
  projectId: z.string().uuid(),
  /** Used only to build the human-readable ref (RFI-<CODE>-NNNN). */
  projectCode: z.string().min(1),
  projectSlug: z.string().min(1),
  question: z.string().min(3),
  discipline: z.enum(RFI_DISCIPLINES as unknown as [string, ...string[]]),
  priority: z.enum(PRIORITIES).default("medium"),
});

export interface ComposeRfiResult {
  id: string;
  ref: string;
  routedTo: string;
  routedToContactId: string | null;
}

/**
 * Composes a new RFI: generates a project-scoped ref, runs the real
 * rfi-router (discipline → on-roster contact via contact_roles), inserts the
 * row, and audit-logs it. Returns the ref + routing for the compose modal's
 * confirmation chip.
 */
export async function composeRfi(
  input: z.input<typeof composeSchema>,
): Promise<ComposeRfiResult> {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = composeSchema.parse(input);
  const db = requireDb();

  const discipline = parsed.discipline as (typeof RFI_DISCIPLINES)[number];

  // Route first so routedToContactId / routedByAgent land on the insert.
  // Pass the server-derived org so the router scopes the contact_roles read to
  // this tenant (the projectId is client-supplied and not pre-validated here).
  const routed = await routeRfi({ organizationId, projectId: parsed.projectId, discipline });

  // Per-project sequence for the ref. The router does not write; the unique
  // rfis.ref constraint is the backstop against a racing duplicate.
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
          organizationId,
          projectId: parsed.projectId,
          ref,
          question: parsed.question,
          discipline,
          priority: parsed.priority ?? "medium",
          routedToContactId: routed.routedToContactId,
          routedByAgent: routed.routedToContactId !== null,
        })
        .returning();
    } catch (err) {
      // Unique ref collision under concurrency — append a disambiguator and retry.
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
    after: {
      ref: row.ref,
      discipline,
      priority: row.priority,
      routedToContactId: routed.routedToContactId,
      matchedRole: routed.matchedRole,
    },
    metadata: { projectId: parsed.projectId, routedByAgent: routed.routedToContactId !== null },
  });

  revalidatePath(`${DEV_PROJECTS}/${parsed.projectSlug}/rfis`);
  return {
    id: row.id,
    ref: row.ref,
    routedTo: routed.routedTo,
    routedToContactId: routed.routedToContactId,
  };
}

const respondSchema = z.object({
  rfiId: z.string().uuid(),
  projectSlug: z.string().min(1),
  responseText: z.string().min(1),
});

/**
 * Records an answer on an RFI (FSM open → answered). Idempotent on the text
 * for an already-answered RFI; rejects answering a closed RFI.
 */
export async function respondToRfi(input: z.input<typeof respondSchema>) {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = respondSchema.parse(input);
  const db = requireDb();

  // SECURITY: scope the RFI load + write to the caller org (rfis carries
  // organization_id) so a foreign RFI id cannot be answered.
  const [current] = await db
    .select({ respondedAt: rfis.respondedAt, resolvedAt: rfis.resolvedAt })
    .from(rfis)
    .where(and(eq(rfis.id, parsed.rfiId), eq(rfis.organizationId, organizationId)))
    .limit(1);
  if (!current) throw new Error("RFI not found");
  const from = rfiStatus(current);
  if (from === "closed") {
    throw new Error("Cannot respond to a closed RFI");
  }

  const [row] = await db
    .update(rfis)
    .set({
      responseText: parsed.responseText,
      respondedAt: current.respondedAt ?? new Date(),
    })
    .where(and(eq(rfis.id, parsed.rfiId), eq(rfis.organizationId, organizationId)))
    .returning();

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "rfi.respond",
    entityType: "rfi",
    entityId: parsed.rfiId,
    after: { responseText: parsed.responseText, status: "answered" },
    metadata: { from },
  });

  revalidatePath(`${DEV_PROJECTS}/${parsed.projectSlug}/rfis/${parsed.rfiId}`);
  revalidatePath(`${DEV_PROJECTS}/${parsed.projectSlug}/rfis`);
  return row;
}

const transitionSchema = z.object({
  rfiId: z.string().uuid(),
  projectSlug: z.string().min(1),
  to: z.enum(["answered", "closed"]),
});

/**
 * Drives the RFI status FSM (open → answered → closed). Validates the
 * transition against the pure FSM and stamps respondedAt / resolvedAt to
 * persist the new derived status.
 */
export async function transitionRfi(input: z.input<typeof transitionSchema>) {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = transitionSchema.parse(input);
  const db = requireDb();

  // SECURITY: scope the RFI load + write to the caller org so a foreign RFI id
  // cannot be transitioned.
  const [current] = await db
    .select({ respondedAt: rfis.respondedAt, resolvedAt: rfis.resolvedAt })
    .from(rfis)
    .where(and(eq(rfis.id, parsed.rfiId), eq(rfis.organizationId, organizationId)))
    .limit(1);
  if (!current) throw new Error("RFI not found");

  const from = rfiStatus(current);
  const to = parsed.to as RfiStatus;
  if (!canTransition(from, to)) {
    throw new Error(`Illegal RFI transition ${from} → ${to}`);
  }

  const now = new Date();
  const updates: Partial<typeof rfis.$inferInsert> = {};
  if (to === "answered") {
    updates.respondedAt = current.respondedAt ?? now;
  } else if (to === "closed") {
    // Closing implies an answer timestamp exists; backfill if it was closed
    // directly from open.
    updates.respondedAt = current.respondedAt ?? now;
    updates.resolvedAt = now;
  }

  const [row] = await db
    .update(rfis)
    .set(updates)
    .where(and(eq(rfis.id, parsed.rfiId), eq(rfis.organizationId, organizationId)))
    .returning();

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "rfi.transition",
    entityType: "rfi",
    entityId: parsed.rfiId,
    metadata: { from, to },
  });

  revalidatePath(`${DEV_PROJECTS}/${parsed.projectSlug}/rfis/${parsed.rfiId}`);
  revalidatePath(`${DEV_PROJECTS}/${parsed.projectSlug}/rfis`);
  return row;
}
