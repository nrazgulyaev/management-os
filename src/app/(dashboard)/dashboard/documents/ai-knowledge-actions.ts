"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  feedOrgDocumentToAgentKnowledge,
  removeOrgDocumentFromAgentKnowledge,
} from "@/lib/agents/knowledge-actions";

/**
 * DOCS-AI-FEED — write surface for the documents cabinet's
 * "Feed to AI agent" loop (Documents Live mock).
 *
 * Mirrors the sibling pattern in `src/features/documents/app-actions.ts`:
 * permission gate (`document` entity) + org from the session + zod +
 * recordAuditEvent. The actual knowledge ingestion / removal runs
 * through the org-safe functions in `src/lib/agents/knowledge-actions.ts`
 * (same pipeline the platform Agent Studio uses), and we keep the
 * `documents.ai_fed_at` flag in sync so the existing "ai knowledge"
 * tab + counts stay truthful.
 */

export type AiKnowledgeActionResult =
  | { ok: true; mode?: "file" | "metadata"; agentName?: string }
  | { ok: false; error: string };

const PATH = "/dashboard/documents";

const pairSchema = z.object({
  documentId: z.string().uuid(),
  agentId: z.string().uuid(),
});

async function guard(): Promise<
  | { ok: true; userId: string | null; organizationId: string }
  | { ok: false; error: string }
> {
  if (!(await canManageEntity("document"))) {
    return { ok: false, error: "Not authorised." };
  }
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  return { ok: true, userId: me?.id ?? null, organizationId };
}

export async function feedDocumentToAgentAction(input: {
  documentId: string;
  agentId: string;
}): Promise<AiKnowledgeActionResult> {
  const parsed = pairSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid document or agent id." };
  const g = await guard();
  if (!g.ok) return g;
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const r = await feedOrgDocumentToAgentKnowledge(parsed.data);
  if (!r.ok) {
    return { ok: false, error: r.error ?? "Couldn't feed the document." };
  }

  // Keep the cabinet's existing AI-knowledge flag truthful.
  const now = new Date();
  await db
    .update(documents)
    .set({ aiFedAt: now })
    .where(
      and(
        eq(documents.id, parsed.data.documentId),
        eq(documents.organizationId, g.organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: g.userId,
    action: "document.ai_feed",
    entityType: "document",
    entityId: parsed.data.documentId,
    after: {
      agentId: parsed.data.agentId,
      agentName: r.agentName ?? null,
      knowledgeDocumentId: r.knowledgeDocumentId ?? null,
      mode: r.mode ?? null,
    },
  });
  revalidatePath(PATH);
  return { ok: true, mode: r.mode, agentName: r.agentName };
}

export async function removeDocumentFromAgentAction(input: {
  documentId: string;
  agentId: string;
}): Promise<AiKnowledgeActionResult> {
  const parsed = pairSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid document or agent id." };
  const g = await guard();
  if (!g.ok) return g;
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const r = await removeOrgDocumentFromAgentKnowledge(parsed.data);
  if (!r.ok) {
    return { ok: false, error: r.error ?? "Couldn't remove the document." };
  }

  // Clear the flag only when no other agent still holds this document.
  if ((r.remainingForDocument ?? 0) === 0) {
    await db
      .update(documents)
      .set({ aiFedAt: null })
      .where(
        and(
          eq(documents.id, parsed.data.documentId),
          eq(documents.organizationId, g.organizationId),
        ),
      );
  }

  await recordAuditEvent({
    actorUserId: g.userId,
    action: "document.ai_remove",
    entityType: "document",
    entityId: parsed.data.documentId,
    after: {
      agentId: parsed.data.agentId,
      removedKnowledgeRows: r.removedCount ?? 0,
      remainingAssignments: r.remainingForDocument ?? 0,
    },
  });
  revalidatePath(PATH);
  return { ok: true };
}
