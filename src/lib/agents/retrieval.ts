import "server-only";

/**
 * P5.4.3 AGENT-RAG-RETRIEVAL — cosine-similarity top-K retrieval over
 * `agent_knowledge_chunks`.
 *
 * Embeds the query with the same model used at ingestion
 * (text-embedding-3-small / 1536 dims) so the cosine distance is
 * comparable. Filters by agent + organization scope (NULL org_id =
 * platform-global chunks visible to every subscribed org).
 *
 * Uses pgvector's `<=>` cosine-distance operator. The HNSW / IVFFlat
 * indexes from migration 0109 are consulted automatically by the
 * planner — no index hint needed. We compute `1 - distance` as
 * similarity (0=opposite, 1=identical) so callers can threshold on a
 * normalized scale.
 *
 * Threshold: 0.7 is a reasonable default for 3-small; lower lets in
 * tangentially-related content. Callers can tighten / loosen per
 * agent.
 */

import { sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { embedTextsBatch } from "./openai-client";

export interface RetrievedChunk {
  id: string;
  content: string;
  similarity: number;
  documentId: string;
  metadata: Record<string, unknown>;
}

export interface RetrieveParams {
  agentId: string;
  organizationId: string | null;
  query: string;
  topK?: number;
  minSimilarity?: number;
}

export async function retrieveRelevantChunks(
  params: RetrieveParams,
): Promise<RetrievedChunk[]> {
  const {
    agentId,
    organizationId,
    query,
    topK = 5,
    minSimilarity = 0.7,
  } = params;

  if (!query.trim()) return [];

  const db = requireDb();

  // 1. Embed query (single input — uses batch helper for consistency)
  const { embeddings } = await embedTextsBatch([query]);
  const queryEmbedding = embeddings[0];
  if (!queryEmbedding || queryEmbedding.length === 0) return [];
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  // 2. Cosine-similarity ranked select.
  //
  // We pass NULL via sql parameters when there's no org filter so the
  // (org_id IS NULL OR org_id = $) shape handles both platform-global
  // chunks AND org-scoped chunks for the subscribed tenant.
  const rows = await db.execute<{
    id: string;
    content: string;
    similarity: number;
    document_id: string;
    metadata: Record<string, unknown>;
  }>(sql`
    SELECT
      id::text AS id,
      content,
      document_id::text AS document_id,
      metadata,
      1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
    FROM agent_knowledge_chunks
    WHERE agent_id = ${agentId}::uuid
      AND (
        organization_id IS NULL
        ${organizationId ? sql`OR organization_id = ${organizationId}::uuid` : sql``}
      )
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingLiteral}::vector
    LIMIT ${topK}
  `);

  const rawRows =
    (rows as unknown as { rows?: typeof rows } & typeof rows).rows ?? rows;

  return (Array.isArray(rawRows) ? rawRows : [])
    .filter((r) => typeof r.similarity === "number" && r.similarity >= minSimilarity)
    .map((r) => ({
      id: r.id,
      content: r.content,
      similarity: Number(r.similarity),
      documentId: r.document_id,
      metadata: r.metadata ?? {},
    }));
}

/**
 * Format retrieved chunks as a context block to interpolate into the
 * inference prompt. Also returns a citation map (`source_label →
 * chunk_id`) the UI can use to render footnotes.
 */
export function formatChunksAsContext(chunks: RetrievedChunk[]): {
  contextBlock: string;
  citations: Array<{ label: string; chunkId: string; similarity: number }>;
} {
  if (chunks.length === 0) {
    return { contextBlock: "", citations: [] };
  }

  const citations = chunks.map((c, i) => ({
    label: `Source ${i + 1}`,
    chunkId: c.id,
    similarity: c.similarity,
  }));

  const contextBlock = chunks
    .map(
      (c, i) =>
        `Source ${i + 1} (similarity ${c.similarity.toFixed(2)}):\n${c.content}`,
    )
    .join("\n\n---\n\n");

  return { contextBlock, citations };
}
