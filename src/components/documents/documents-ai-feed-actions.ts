"use server";

import { z } from "zod";
import { canManageEntity } from "@/features/auth/permissions";
import {
  getAiKnowledgeData,
  type DocAgentAssignment,
  type OrgAgentOption,
} from "@/app/(dashboard)/dashboard/documents/ai-knowledge-queries";

/**
 * DOCS-AI-FEED — read action for the doc-scoped "Feed to AI agent"
 * modal in `documents-ai-feed.tsx` (preview pane + per-row affordance).
 *
 * The page-level AI-knowledge panel gets this data as server props; the
 * preview pane / row buttons live deeper in the client tree, so they
 * load it on demand through this action. Same org-scoped read layer
 * (`getAiKnowledgeData`), same permission gate as the sibling write
 * actions in `ai-knowledge-actions.ts`.
 */

export type DocumentAiFeedState =
  | {
      ok: true;
      envReady: boolean;
      agents: OrgAgentOption[];
      /** Assignments for the requested document only. */
      assignments: DocAgentAssignment[];
    }
  | { ok: false; error: string };

const uuid = z.string().uuid();

export async function getDocumentAiFeedStateAction(
  documentId: string,
): Promise<DocumentAiFeedState> {
  const id = uuid.safeParse(documentId);
  if (!id.success) return { ok: false, error: "Invalid document id." };
  if (!(await canManageEntity("document"))) {
    return { ok: false, error: "Not authorised." };
  }

  const data = await getAiKnowledgeData();
  return {
    ok: true,
    envReady: data.envReady,
    agents: data.agents,
    assignments: data.assignments.filter((a) => a.documentId === id.data),
  };
}
