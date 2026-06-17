"use server";
import "server-only";

/**
 * AI-agents cabinet — agent-output review actions.
 *
 * Every agent run lands in `agent_outputs` with status="awaiting_review"
 * and there was previously NO action anywhere that updated that row, so
 * the inbox queue could never be cleared. These actions let an internal
 * operator approve / reject / edit-and-approve a queued output.
 *
 * Org-scoped (requireOrgId + requireInternalUser) and audited, following
 * the same shape as contract-actions.ts. The UI lives in
 * `src/components/development/agent-output-detail.tsx`.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";

const baseSchema = z.object({
  outputCode: z.string().min(2).max(120),
  reviewerNotes: z.string().max(4000).optional(),
});

const editSchema = baseSchema.extend({
  editedSummary: z.string().min(2).max(8000).optional(),
  editedActions: z.array(z.string().min(1).max(2000)).max(50).optional(),
});

type ReviewResult = { ok: true } | { ok: false; error: string };

async function loadOutput(outputCode: string, organizationId: string) {
  const db = getDb();
  if (!db) return { db: null, row: null };
  const [row] = await db
    .select({
      id: agentOutputs.id,
      status: agentOutputs.status,
      agentKey: agentOutputs.agentKey,
    })
    .from(agentOutputs)
    .where(
      and(
        eq(agentOutputs.outputCode, outputCode),
        eq(agentOutputs.organizationId, organizationId),
      ),
    )
    .limit(1);
  return { db, row: row ?? null };
}

function slugFor(agentKey: string): string {
  return agentKey.replace(/_/g, "-");
}

function revalidate(outputCode: string, agentKey: string) {
  const slug = slugFor(agentKey);
  revalidatePath(`/development-os/ai-agents/${slug}`);
  revalidatePath(`/development-os/ai-agents/${slug}/outputs/${outputCode}`);
  revalidatePath("/development-os/ai-agents/inbox");
  revalidatePath(`/development-os/ai-agents/${slug}/outputs`);
}

/** Approve a queued agent output as-is. */
export async function approveAgentOutput(
  input: z.input<typeof baseSchema>,
): Promise<ReviewResult> {
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const { db, row } = await loadOutput(parsed.data.outputCode, organizationId);
  if (!db) return { ok: false, error: "DB not configured" };
  if (!row) return { ok: false, error: "Output not found" };

  await db
    .update(agentOutputs)
    .set({
      status: "approved",
      reviewedBy: ctx.appUser?.id ?? null,
      reviewedAt: new Date(),
      reviewerNotes: parsed.data.reviewerNotes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentOutputs.id, row.id),
        eq(agentOutputs.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "agent_output.approve",
    entityType: "agent_output",
    entityId: row.id,
    before: { status: row.status },
    after: { status: "approved" },
    metadata: { organizationId, outputCode: parsed.data.outputCode, agentKey: row.agentKey },
  });

  revalidate(parsed.data.outputCode, row.agentKey);
  return { ok: true };
}

/** Reject a queued agent output. Reviewer notes recommended. */
export async function rejectAgentOutput(
  input: z.input<typeof baseSchema>,
): Promise<ReviewResult> {
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const { db, row } = await loadOutput(parsed.data.outputCode, organizationId);
  if (!db) return { ok: false, error: "DB not configured" };
  if (!row) return { ok: false, error: "Output not found" };

  await db
    .update(agentOutputs)
    .set({
      status: "rejected",
      reviewedBy: ctx.appUser?.id ?? null,
      reviewedAt: new Date(),
      reviewerNotes: parsed.data.reviewerNotes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentOutputs.id, row.id),
        eq(agentOutputs.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "agent_output.reject",
    entityType: "agent_output",
    entityId: row.id,
    before: { status: row.status },
    after: { status: "rejected" },
    metadata: { organizationId, outputCode: parsed.data.outputCode, agentKey: row.agentKey },
  });

  revalidate(parsed.data.outputCode, row.agentKey);
  return { ok: true };
}

/**
 * Edit the operator-facing summary and/or recommended actions, then
 * approve. Stores the overrides in editedSummary / editedActions (the
 * detail view already prefers these over the raw agent text) and marks
 * the row "edited_and_approved".
 */
export async function editAndApproveAgentOutput(
  input: z.input<typeof editSchema>,
): Promise<ReviewResult> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (
    parsed.data.editedSummary === undefined &&
    parsed.data.editedActions === undefined
  ) {
    return { ok: false, error: "Provide an edited summary or actions to save." };
  }
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const { db, row } = await loadOutput(parsed.data.outputCode, organizationId);
  if (!db) return { ok: false, error: "DB not configured" };
  if (!row) return { ok: false, error: "Output not found" };

  const patch: Partial<typeof agentOutputs.$inferInsert> = {
    status: "edited_and_approved",
    reviewedBy: ctx.appUser?.id ?? null,
    reviewedAt: new Date(),
    reviewerNotes: parsed.data.reviewerNotes ?? null,
    updatedAt: new Date(),
  };
  if (parsed.data.editedSummary !== undefined) {
    patch.editedSummary = parsed.data.editedSummary;
  }
  if (parsed.data.editedActions !== undefined) {
    patch.editedActions = parsed.data.editedActions;
  }

  await db
    .update(agentOutputs)
    .set(patch)
    .where(
      and(
        eq(agentOutputs.id, row.id),
        eq(agentOutputs.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "agent_output.edit_and_approve",
    entityType: "agent_output",
    entityId: row.id,
    before: { status: row.status },
    after: { status: "edited_and_approved" },
    metadata: { organizationId, outputCode: parsed.data.outputCode, agentKey: row.agentKey },
  });

  revalidate(parsed.data.outputCode, row.agentKey);
  return { ok: true };
}
