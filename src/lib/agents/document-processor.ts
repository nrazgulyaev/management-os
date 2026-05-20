import "server-only";

/**
 * P5.4.2 AGENT-RAG-PROCESSOR — extract → chunk → embed → persist.
 *
 * Reads an `agent_knowledge_documents` row, pulls the raw file from
 * Supabase Storage, extracts text per its MIME type, slices it into
 * ~500-token overlapping chunks, batches them through OpenAI
 * embeddings, and lands `agent_knowledge_chunks` rows with a 1536-dim
 * pgvector embedding each.
 *
 * Idempotency: re-running `processDocument(id)` deletes any prior
 * chunks for that document before re-inserting. Safe to re-trigger if
 * embeddings change or a doc was uploaded with stale extraction.
 *
 * Status transitions:
 *   pending → chunking → embedding → ready
 *                                  ↘ failed (with processingError)
 *
 * MVP execution model: synchronous, called inline from a server
 * action. A 5-page tax-code PDF takes ~10-30 seconds end-to-end. The
 * server action surfaces "processing…" in the UI; the user is free to
 * navigate away. For larger docs we'd move to a queue, but Phase 1
 * scope is fine inline.
 */

import { sql, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  agentKnowledgeDocuments,
  agentKnowledgeChunks,
} from "@/lib/db/schema/agents";
import { assertAgentEnvReady } from "./env";
import { embedTextsBatch, countTokens } from "./openai-client";

const STORAGE_BUCKET = "agent-knowledge-docs";
const TARGET_CHUNK_TOKENS = 500;
const CHUNK_OVERLAP_TOKENS = 50;
const EMBED_BATCH_SIZE = 100;

export interface ProcessDocumentResult {
  ok: boolean;
  chunkCount?: number;
  tokensUsed?: number;
  error?: string;
}

export async function processDocument(
  documentId: string,
): Promise<ProcessDocumentResult> {
  assertAgentEnvReady();

  const db = requireDb();
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "Supabase admin client unavailable." };
  }

  const [doc] = await db
    .select()
    .from(agentKnowledgeDocuments)
    .where(eq(agentKnowledgeDocuments.id, documentId))
    .limit(1);

  if (!doc) {
    return { ok: false, error: `Document ${documentId} not found.` };
  }

  try {
    // ---------------------------------------------------------------
    // 1. Download the raw file from Storage
    // ---------------------------------------------------------------
    await updateStatus(documentId, "chunking", null);

    const { data: blob, error: dlErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .download(doc.storagePath);

    if (dlErr || !blob) {
      throw new Error(
        `Storage download failed: ${dlErr?.message ?? "no data"}`,
      );
    }

    const buf = Buffer.from(await blob.arrayBuffer());

    // ---------------------------------------------------------------
    // 2. Extract text per MIME type
    // ---------------------------------------------------------------
    const text = await extractText(buf, doc.mimeType ?? "");
    if (!text.trim()) {
      throw new Error("Extraction produced empty text.");
    }

    // ---------------------------------------------------------------
    // 3. Chunk
    // ---------------------------------------------------------------
    const chunks = chunkText(text, TARGET_CHUNK_TOKENS, CHUNK_OVERLAP_TOKENS);
    if (chunks.length === 0) {
      throw new Error("Chunking produced 0 chunks.");
    }

    // Clear prior chunks (idempotent reprocessing)
    await db
      .delete(agentKnowledgeChunks)
      .where(eq(agentKnowledgeChunks.documentId, documentId));

    // ---------------------------------------------------------------
    // 4. Embed in batches of 100
    // ---------------------------------------------------------------
    await updateStatus(documentId, "embedding", null);

    let totalTokens = 0;
    let chunkIndex = 0;

    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const result = await embedTextsBatch(batch.map((c) => c.content));
      totalTokens += result.tokensUsed;

      const rows = batch.map((c, j) => ({
        documentId,
        agentId: doc.agentId,
        organizationId: doc.organizationId,
        chunkIndex: chunkIndex + j,
        content: c.content,
        embedding: result.embeddings[j],
        metadata: {
          charRange: c.charRange,
          tokenCount: c.tokenCount,
        },
      }));

      // Drizzle's `customType` toDriver returns a string for pgvector.
      // The default insert path works; no SQL escape hatch needed.
      await db.insert(agentKnowledgeChunks).values(rows);

      chunkIndex += batch.length;
    }

    // ---------------------------------------------------------------
    // 5. Mark ready
    // ---------------------------------------------------------------
    await db
      .update(agentKnowledgeDocuments)
      .set({
        processingStatus: "ready",
        processingError: null,
        chunkCount: chunks.length,
        processedAt: sql`now()`,
      })
      .where(eq(agentKnowledgeDocuments.id, documentId));

    return { ok: true, chunkCount: chunks.length, tokensUsed: totalTokens };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateStatus(documentId, "failed", msg);
    return { ok: false, error: msg };
  }
}

async function updateStatus(
  documentId: string,
  status: "pending" | "chunking" | "embedding" | "ready" | "failed",
  errorMessage: string | null,
): Promise<void> {
  const db = requireDb();
  await db
    .update(agentKnowledgeDocuments)
    .set({
      processingStatus: status,
      processingError: errorMessage,
    })
    .where(eq(agentKnowledgeDocuments.id, documentId));
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

async function extractText(buf: Buffer, mime: string): Promise<string> {
  const lower = mime.toLowerCase();

  if (lower === "application/pdf") {
    // `unpdf` is a Next-friendly pure-JS PDF text extractor (pdf-parse
    // pulls a Node-only binary that breaks Vercel functions).
    const { extractText: extractPdfText, getDocumentProxy } = await import(
      "unpdf"
    );
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : text;
  }

  if (
    lower ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value;
  }

  if (lower === "text/plain" || lower === "text/markdown" || lower === "") {
    return buf.toString("utf8");
  }

  throw new Error(`Unsupported MIME type: ${mime}`);
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

interface RawChunk {
  content: string;
  charRange: [number, number];
  tokenCount: number;
}

/**
 * Split text into overlapping chunks of approximately `targetTokens`
 * tokens with `overlapTokens` overlap. Prefers paragraph boundaries
 * (\n\n) when one is reachable within ±20% of the target.
 *
 * Strategy:
 *   1. Walk characters, accumulate a working window.
 *   2. When estimated tokens reach the target, snap backward to the
 *      nearest paragraph boundary if one exists in the last ~20% of
 *      the window. Otherwise cut at the current cursor.
 *   3. Re-seed next window at (end - overlapChars) so we keep
 *      `overlapTokens` worth of context.
 *
 * We approximate "characters per token" as 4 for the boundary snap
 * search radius (the real cost is computed via `countTokens` on the
 * final chunk content).
 */
function chunkText(
  text: string,
  targetTokens: number,
  overlapTokens: number,
): RawChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  if (!normalized.trim()) return [];

  const out: RawChunk[] = [];
  const charsPerToken = 4;
  const windowChars = targetTokens * charsPerToken;
  const overlapChars = overlapTokens * charsPerToken;
  const snapRadius = Math.floor(windowChars * 0.2);

  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + windowChars);

    if (end < normalized.length) {
      // Try to snap end backward to a paragraph boundary inside
      // [end - snapRadius, end].
      const searchFrom = Math.max(start + 1, end - snapRadius);
      const snap = normalized.lastIndexOf("\n\n", end);
      if (snap >= searchFrom) {
        end = snap;
      } else {
        // Fall back to sentence boundary
        const sentenceSnap = Math.max(
          normalized.lastIndexOf(". ", end),
          normalized.lastIndexOf("! ", end),
          normalized.lastIndexOf("? ", end),
          normalized.lastIndexOf("\n", end),
        );
        if (sentenceSnap >= searchFrom) end = sentenceSnap + 1;
      }
    }

    const content = normalized.slice(start, end).trim();
    if (content) {
      out.push({
        content,
        charRange: [start, end],
        tokenCount: countTokens(content),
      });
    }

    if (end >= normalized.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }

  return out;
}
