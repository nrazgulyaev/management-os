import "server-only";

import { and, desc, eq, like } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  agentKnowledgeDocuments,
  orgAgentSubscriptions,
  platformAgentConfigs,
} from "@/lib/db/schema/agents";
import { requireOrgId } from "@/features/auth/require-org";
import { isAgentEnvReady } from "@/lib/agents/env";

/**
 * DOCS-AI-FEED — read layer for the documents cabinet's AI-knowledge
 * panel. Additive reads over the platform agent system (migration
 * 0109): which agents this workspace can feed, and which workspace
 * documents are already in an agent's knowledge base.
 *
 * Provenance is parsed from the existing `storage_path` column written
 * by `feedOrgDocumentToAgentKnowledge`:
 *
 *   agent/{agentId}/org-doc/{sourceDocumentId}/{knowledgeId}.{ext}      → mode "file"
 *   agent/{agentId}/org-doc/{sourceDocumentId}/meta-{knowledgeId}.md    → mode "metadata"
 */

export interface OrgAgentOption {
  id: string;
  agentCode: string;
  displayName: string;
  description: string | null;
  /** Workspace documents currently in this agent's knowledge base. */
  docCount: number;
}

export interface DocAgentAssignment {
  documentId: string;
  agentId: string;
  agentName: string;
  knowledgeDocumentId: string;
  filename: string;
  /** "file" = full text ingested; "metadata" = metadata card only. */
  mode: "file" | "metadata";
  /** pending | chunking | embedding | ready | failed */
  processingStatus: string;
  processingError: string | null;
  chunkCount: number;
  uploadedAt: string;
}

export interface AiKnowledgeData {
  /** False when OPENAI_API_KEY is missing — ingestion can't run. */
  envReady: boolean;
  agents: OrgAgentOption[];
  assignments: DocAgentAssignment[];
}

const ORG_DOC_RE = /\/org-doc\/([0-9a-f-]{36})\/(meta-)?/i;

export async function getAiKnowledgeData(): Promise<AiKnowledgeData> {
  const db = getDb();
  if (!db) return { envReady: false, agents: [], assignments: [] };

  const organizationId = await requireOrgId();

  const [agentRows, kRows] = await Promise.all([
    db
      .select({
        id: platformAgentConfigs.id,
        agentCode: platformAgentConfigs.agentCode,
        displayName: platformAgentConfigs.displayName,
        description: platformAgentConfigs.description,
      })
      .from(platformAgentConfigs)
      .innerJoin(
        orgAgentSubscriptions,
        and(
          eq(orgAgentSubscriptions.agentId, platformAgentConfigs.id),
          eq(orgAgentSubscriptions.organizationId, organizationId),
          eq(orgAgentSubscriptions.isEnabled, true),
        ),
      )
      .where(eq(platformAgentConfigs.isActive, true)),
    db
      .select({
        id: agentKnowledgeDocuments.id,
        agentId: agentKnowledgeDocuments.agentId,
        storagePath: agentKnowledgeDocuments.storagePath,
        filename: agentKnowledgeDocuments.filename,
        processingStatus: agentKnowledgeDocuments.processingStatus,
        processingError: agentKnowledgeDocuments.processingError,
        chunkCount: agentKnowledgeDocuments.chunkCount,
        uploadedAt: agentKnowledgeDocuments.uploadedAt,
      })
      .from(agentKnowledgeDocuments)
      .where(
        and(
          eq(agentKnowledgeDocuments.organizationId, organizationId),
          like(agentKnowledgeDocuments.storagePath, "%/org-doc/%"),
        ),
      )
      .orderBy(desc(agentKnowledgeDocuments.uploadedAt)),
  ]);

  const nameById = new Map(agentRows.map((a) => [a.id, a.displayName]));
  const countByAgent = new Map<string, number>();
  const assignments: DocAgentAssignment[] = [];

  for (const r of kRows) {
    const m = ORG_DOC_RE.exec(r.storagePath);
    if (!m) continue;
    countByAgent.set(r.agentId, (countByAgent.get(r.agentId) ?? 0) + 1);
    assignments.push({
      documentId: m[1],
      agentId: r.agentId,
      // Assignments to agents that were since disabled stay listed so
      // the operator can still remove them.
      agentName: nameById.get(r.agentId) ?? "Agent (no longer enabled)",
      knowledgeDocumentId: r.id,
      filename: r.filename,
      mode: m[2] ? "metadata" : "file",
      processingStatus: r.processingStatus,
      processingError: r.processingError,
      chunkCount: r.chunkCount,
      uploadedAt: r.uploadedAt.toISOString(),
    });
  }

  return {
    envReady: isAgentEnvReady(),
    agents: agentRows.map((a) => ({
      ...a,
      docCount: countByAgent.get(a.id) ?? 0,
    })),
    assignments,
  };
}
