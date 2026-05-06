import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema/documents";
import { vendors } from "@/lib/db/schema/site-operations";
import { devCostCategories } from "@/lib/db/schema/dev-finance";
import { aiAssistantRuns } from "@/lib/db/schema/ai";
import { aiDocumentExtractions } from "@/lib/db/schema/ai-development";
import { getAIProvider, type AIImageAttachment } from "@/lib/ai/providers";
import { computeCallCost } from "@/lib/ai/cost";
import { checkBudget } from "@/lib/ai/budget";
import { getStorageProvider } from "@/lib/storage";
import { aiModel } from "@/lib/env";

/**
 * AI Document Understanding agent.
 *
 * Extracts structured data from receipts, invoices, delivery notes,
 * and contracts. HITL-strict: every extraction lands as `status =
 * 'pending_review'`. The agent NEVER creates dev_transactions or
 * material_deliveries — that requires explicit operator approval.
 *
 * Pipeline:
 *   1. Look up document.
 *   2. Refuse if there's already an ACTIVE extraction (pending_review
 *      / approved / edited_approved / duplicate). Re-extraction must
 *      explicitly supersede.
 *   3. Budget check (`dev_os.document_understanding`).
 *   4. Open `ai_assistant_runs` row.
 *   5. Download bytes via the storage provider.
 *   6. Call provider with image (if image MIME) or text content.
 *      Currently we always try image — Claude vision handles JPEG/PNG/
 *      WEBP. PDF extraction is deferred (would need a PDF→image
 *      preprocessor); when MIME is application/pdf the agent records a
 *      'low' quality detection and an ambiguity entry.
 *   7. Zod-validate the structured response.
 *   8. Resolve suggested mappings (vendor / category) by fuzzy name match.
 *   9. Insert `ai_document_extractions` row.
 */

export const DOCUMENT_UNDERSTANDING_KEY = "dev_os.document_understanding";
const SYSTEM_PROMPT_MARKER = "DEV_OS_DOCUMENT_UNDERSTANDING_V1";

export type SupportedDocumentType =
  | "receipt"
  | "invoice"
  | "delivery_note"
  | "contract"
  | "other";

const SUPPORTED_TYPES = [
  "receipt",
  "invoice",
  "delivery_note",
  "contract",
  "other",
] as const;

export interface ExtractDocumentResult {
  status:
    | "succeeded"
    | "dry_run"
    | "skipped_active"
    | "budget_exceeded"
    | "failed";
  extractionId?: string;
  runId: string | null;
  errorMessage?: string;
}

const ResponseSchema = z.object({
  detected_language: z.string().max(10).nullable().optional(),
  detected_quality: z
    .enum(["high", "medium", "low", "unreadable"])
    .nullable()
    .optional(),
  extracted_data: z.record(z.string(), z.unknown()),
  reasoning: z.string().min(1).max(4000),
  ambiguities: z.array(z.string().max(300)).max(20).default([]),
  /** Optional vendor / category name hints — resolved to IDs in code. */
  vendor_name_hint: z.string().max(200).nullable().optional(),
  category_name_hint: z.string().max(200).nullable().optional(),
});

export async function extractFromDocument(input: {
  documentId: string;
  documentType: SupportedDocumentType;
  hintProjectId?: string;
  hintVendorId?: string;
}): Promise<ExtractDocumentResult> {
  const db = getDb();
  if (!db) {
    return { status: "failed", errorMessage: "DB unavailable", runId: null };
  }
  if (!SUPPORTED_TYPES.includes(input.documentType)) {
    return {
      status: "failed",
      errorMessage: `Unsupported document type ${input.documentType}`,
      runId: null,
    };
  }

  // 1) Document lookup.
  const [doc] = await db
    .select({
      id: documents.id,
      bucket: documents.storageBucket,
      path: documents.storagePath,
      mime: documents.mimeType,
      title: documents.title,
    })
    .from(documents)
    .where(eq(documents.id, input.documentId))
    .limit(1);
  if (!doc) {
    return { status: "failed", errorMessage: "Document not found", runId: null };
  }

  // 2) Active extraction?
  const [active] = await db
    .select({ id: aiDocumentExtractions.id })
    .from(aiDocumentExtractions)
    .where(
      and(
        eq(aiDocumentExtractions.documentId, doc.id),
        sql`${aiDocumentExtractions.status} IN ('pending_review','approved','edited_approved','duplicate')`,
      ),
    )
    .limit(1);
  if (active) {
    return {
      status: "skipped_active",
      extractionId: active.id,
      runId: null,
    };
  }

  // 3) Budget.
  const budget = await checkBudget(DOCUMENT_UNDERSTANDING_KEY);
  if (budget.decision === "block") {
    const [run] = await db
      .insert(aiAssistantRuns)
      .values({
        assistantKey: DOCUMENT_UNDERSTANDING_KEY,
        runType: "scheduled",
        status: "budget_exceeded",
        inputSummary: `document=${doc.id} budget=${budget.reason}`,
        finishedAt: new Date(),
      })
      .returning({ id: aiAssistantRuns.id });
    return {
      status: "budget_exceeded",
      errorMessage: budget.reason,
      runId: run?.id ?? null,
    };
  }

  // 4) Open run row.
  const [run] = await db
    .insert(aiAssistantRuns)
    .values({
      assistantKey: DOCUMENT_UNDERSTANDING_KEY,
      runType: "scheduled",
      status: "running",
      model: aiModel(),
      inputSummary: `document=${doc.id} type=${input.documentType} mime=${doc.mime}`,
    })
    .returning({ id: aiAssistantRuns.id });
  const runId = run!.id;

  // 5) Download bytes.
  if (!doc.path || !doc.bucket) {
    await markRunFailed(runId, "document missing storage location");
    return {
      status: "failed",
      errorMessage: "document missing storage location",
      runId,
    };
  }
  const storage = getStorageProvider();
  const downloaded = await storage.download(doc.bucket, doc.path);
  if (!downloaded) {
    await markRunFailed(runId, "storage download returned null");
    return {
      status: "failed",
      errorMessage: "storage download failed",
      runId,
    };
  }

  // 6) Build provider call. Vision input only for image MIMEs; PDF
  // and other binary MIMEs go through with no image (the model gets
  // metadata only — quality will be 'low' and the operator must
  // manually fill the form).
  const provider = getAIProvider();
  const isLive = provider.name !== "dry-run";
  const mediaType = normalizeImageMediaType(doc.mime);
  const images: AIImageAttachment[] =
    isLive && mediaType
      ? [{ base64: downloaded.bytes.toString("base64"), mediaType }]
      : [];

  const startMs = Date.now();
  let providerResp;
  try {
    providerResp = await provider.complete({
      messages: [
        { role: "system", content: buildSystemPrompt(input.documentType) },
        {
          role: "user",
          content: buildUserPrompt({
            documentType: input.documentType,
            mime: doc.mime,
            isImage: Boolean(mediaType),
          }),
          images,
        },
      ],
      maxTokens: 1500,
      temperature: 0.1,
      responseFormat: "json",
      timeoutMs: 30_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "provider error";
    await markRunFailed(runId, message);
    return { status: "failed", errorMessage: message, runId };
  }
  const latencyMs = Date.now() - startMs;

  // 7) Parse + Zod validate.
  let parsed;
  try {
    const raw = JSON.parse(providerResp.content);
    parsed = ResponseSchema.parse(
      isLive ? raw : synthesizeDryRun(raw, input.documentType),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "parse failed";
    await markRunFailed(runId, `parse: ${message}`);
    return { status: "failed", errorMessage: message, runId };
  }

  // 7.5) Defense in depth: non-image MIMEs surface a low-quality marker
  // even if the model claimed otherwise — operator must verify.
  let detectedQuality = parsed.detected_quality ?? null;
  let ambiguities = parsed.ambiguities;
  if (!mediaType) {
    if (detectedQuality === "high" || detectedQuality === "medium") {
      detectedQuality = "low";
    } else if (!detectedQuality) {
      detectedQuality = "low";
    }
    ambiguities = [
      `MIME type '${doc.mime}' is not directly supported by vision; the model worked from metadata only — operator must verify all fields.`,
      ...ambiguities,
    ];
  }

  // 8) Resolve mappings (fuzzy name → id) for vendor + category.
  const [vendorMapping, categoryMapping] = await Promise.all([
    parsed.vendor_name_hint
      ? resolveVendorByName(parsed.vendor_name_hint, input.hintVendorId)
      : Promise.resolve(
          input.hintVendorId
            ? { id: input.hintVendorId, confidence: 1.0 }
            : { id: null, confidence: null },
        ),
    parsed.category_name_hint
      ? resolveCategoryByName(parsed.category_name_hint)
      : Promise.resolve({ id: null, confidence: null }),
  ]);

  // 9) Cost.
  const cost = computeCallCost({
    model: providerResp.model,
    promptTokens: providerResp.usage.promptTokens,
    completionTokens: providerResp.usage.completionTokens,
  });

  // 10) Persist extraction. Status starts at 'pending_review' regardless
  // of LLM confidence — operator review is mandatory.
  const [extraction] = await db
    .insert(aiDocumentExtractions)
    .values({
      documentId: doc.id,
      documentType: input.documentType,
      detectedLanguage: parsed.detected_language ?? null,
      detectedQuality,
      extractedData:
        parsed.extracted_data as typeof aiDocumentExtractions.$inferInsert["extractedData"],
      suggestedVendorId: vendorMapping.id,
      suggestedProjectId: input.hintProjectId ?? null,
      suggestedCategoryId: categoryMapping.id,
      vendorMatchConfidence:
        vendorMapping.confidence != null
          ? vendorMapping.confidence.toFixed(2)
          : null,
      categoryMatchConfidence:
        categoryMapping.confidence != null
          ? categoryMapping.confidence.toFixed(2)
          : null,
      reasoning: parsed.reasoning,
      ambiguities,
      rawResponse: providerResp.content,
      aiRunId: runId,
      status: "pending_review",
    })
    .returning({ id: aiDocumentExtractions.id });

  await db
    .update(aiAssistantRuns)
    .set({
      status: isLive ? "succeeded" : "dry_run",
      model: providerResp.model,
      promptTokens: providerResp.usage.promptTokens,
      completionTokens: providerResp.usage.completionTokens,
      totalTokens: providerResp.usage.totalTokens,
      latencyMs,
      inputCostUsd: cost ? cost.inputCostUsd.toFixed(4) : null,
      outputCostUsd: cost ? cost.outputCostUsd.toFixed(4) : null,
      totalCostUsd: cost ? cost.totalCostUsd.toFixed(4) : null,
      outputSummary: parsed.reasoning.slice(0, 500),
      finishedAt: new Date(),
    })
    .where(eq(aiAssistantRuns.id, runId));

  return {
    status: isLive ? "succeeded" : "dry_run",
    extractionId: extraction.id,
    runId,
  };
}

/**
 * Find documents whose type is one of the extraction targets and that
 * have no active extraction. Used by the cron job. Limit kept low —
 * vision calls are slow and we want the cron tick under the Vercel
 * function timeout.
 */
export async function findDocumentsNeedingExtraction(
  limit = 10,
): Promise<Array<{ id: string; type: SupportedDocumentType }>> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: documents.id,
      type: documents.documentType,
    })
    .from(documents)
    .leftJoin(
      aiDocumentExtractions,
      and(
        eq(aiDocumentExtractions.documentId, documents.id),
        sql`${aiDocumentExtractions.status} IN ('pending_review','approved','edited_approved','duplicate')`,
      ),
    )
    .where(
      and(
        sql`${documents.documentType} IN ('receipt','invoice','delivery_note','contract')`,
        isNull(aiDocumentExtractions.id),
      ),
    )
    .orderBy(documents.createdAt)
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    type: r.type as SupportedDocumentType,
  }));
}

// ===========================================================================
// Mapping helpers
// ===========================================================================

/**
 * Fuzzy vendor lookup. Returns the highest-scoring vendor and a
 * confidence between 0 and 1. Algorithm is deliberately simple
 * (lowercase substring + length ratio) — Stage 4 will swap to a
 * proper trigram match if recall becomes a problem.
 */
async function resolveVendorByName(
  hintName: string,
  fallbackVendorId?: string,
): Promise<{ id: string | null; confidence: number | null }> {
  const db = getDb();
  if (!db) {
    return fallbackVendorId
      ? { id: fallbackVendorId, confidence: 1.0 }
      : { id: null, confidence: null };
  }
  const needle = hintName.trim().toLowerCase();
  if (!needle) {
    return fallbackVendorId
      ? { id: fallbackVendorId, confidence: 1.0 }
      : { id: null, confidence: null };
  }
  const rows = await db
    .select({ id: vendors.id, name: vendors.legalName })
    .from(vendors)
    .where(eq(vendors.status, "active"));
  let best: { id: string; score: number } | null = null;
  for (const r of rows) {
    const candidate = r.name.toLowerCase();
    let score = 0;
    if (candidate === needle) score = 1;
    else if (candidate.includes(needle) || needle.includes(candidate)) {
      const longer = Math.max(candidate.length, needle.length);
      const shorter = Math.min(candidate.length, needle.length);
      score = shorter / longer;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: r.id, score };
    }
  }
  if (best && best.score >= 0.4) {
    return { id: best.id, confidence: round2(best.score) };
  }
  // Fall back to operator hint if our match is too weak.
  if (fallbackVendorId) {
    return { id: fallbackVendorId, confidence: 1.0 };
  }
  return { id: null, confidence: null };
}

async function resolveCategoryByName(
  hintName: string,
): Promise<{ id: string | null; confidence: number | null }> {
  const db = getDb();
  if (!db) return { id: null, confidence: null };
  const needle = hintName.trim().toLowerCase();
  if (!needle) return { id: null, confidence: null };
  const rows = await db
    .select({
      id: devCostCategories.id,
      name: devCostCategories.displayName,
    })
    .from(devCostCategories)
    .where(eq(devCostCategories.isActive, true));
  let best: { id: string; score: number } | null = null;
  for (const r of rows) {
    const candidate = r.name.toLowerCase();
    let score = 0;
    if (candidate === needle) score = 1;
    else if (candidate.includes(needle) || needle.includes(candidate)) {
      const longer = Math.max(candidate.length, needle.length);
      const shorter = Math.min(candidate.length, needle.length);
      score = shorter / longer;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: r.id, score };
    }
  }
  if (best && best.score >= 0.4) {
    return { id: best.id, confidence: round2(best.score) };
  }
  return { id: null, confidence: null };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeImageMediaType(
  mime: string | null,
): AIImageAttachment["mediaType"] | null {
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      return "image/jpeg";
    case "image/png":
      return "image/png";
    case "image/webp":
      return "image/webp";
    case "image/gif":
      return "image/gif";
    default:
      return null;
  }
}

// ===========================================================================
// Prompts
// ===========================================================================

function buildSystemPrompt(type: SupportedDocumentType): string {
  const typeSpecific: Record<SupportedDocumentType, string> = {
    receipt: `extracted_data schema:
  amount: number (USD or local currency MAJOR units, e.g. 1234.56)
  currency: "USD" | "IDR" | "RUB" | "EUR" | "USDT" | "CNY" | null
  vendor_name: string | null
  vendor_tax_id: string | null
  transaction_date: YYYY-MM-DD | null
  invoice_number: string | null
  payment_method: "bank_wire" | "cash" | "crypto" | "card" | null
  tax_amount: number | null
  line_items: array of { description, amount, quantity?, unit?, category_hint? }`,
    invoice: `extracted_data schema (same as receipt):
  amount, currency, vendor_name, vendor_tax_id, transaction_date,
  invoice_number, payment_method, tax_amount, line_items.`,
    delivery_note: `extracted_data schema:
  delivery_date: YYYY-MM-DD | null
  po_reference: string | null
  vendor_name: string | null
  delivered_by: string | null
  vehicle_info: string | null
  line_items: array of { material, quantity, unit, po_reference_hint? }`,
    contract: `extracted_data schema:
  parties: array of strings
  total_value: number | null
  currency: string | null
  signed_date: YYYY-MM-DD | null
  payment_terms: string | null`,
    other: `extracted_data: free-form JSON object describing whatever
structured fields you can identify. Set "kind" to a short label.`,
  };
  return `You are extracting structured data (${SYSTEM_PROMPT_MARKER}) from a ${type} for a Bali villa development company. The document may be in English, Indonesian, Russian, or Chinese.

Respond with JSON only. Schema:
  detected_language: ISO 639-1 (e.g. "en", "id", "ru", "zh") or null
  detected_quality: "high" | "medium" | "low" | "unreadable"
  extracted_data: object — see type-specific schema below
  vendor_name_hint: string | null   (for downstream fuzzy-match into vendors table)
  category_name_hint: string | null (for downstream fuzzy-match into dev_cost_categories table)
  reasoning: 1-3 sentence summary of what you saw and any decisions you made
  ambiguities: array of strings — fields you could not read clearly

${typeSpecific[type]}

Critical rules:
1. NEVER invent amounts or dates not visible in the document.
2. Parse "Rp 5,000,000" as currency=IDR, amount=5000000 (already in major units).
3. If a field is unreadable, use null and note it in ambiguities.
4. detected_quality = "unreadable" → return mostly nulls + reasoning explaining why.
5. Never speculate about a category — only suggest one if a line item makes it obvious.`;
}

function buildUserPrompt(args: {
  documentType: SupportedDocumentType;
  mime: string | null;
  isImage: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`Document type: ${args.documentType}`);
  lines.push(`MIME: ${args.mime ?? "unknown"}`);
  if (!args.isImage) {
    lines.push(
      "NOTE: this MIME type is not directly viewable. You're working from metadata only; mark detected_quality as 'low' and add an ambiguity entry.",
    );
  }
  lines.push("");
  lines.push("Return the JSON schema only.");
  return lines.join("\n");
}

function synthesizeDryRun(
  raw: unknown,
  type: SupportedDocumentType,
): unknown {
  if (typeof raw === "object" && raw !== null && "extracted_data" in raw) {
    return raw;
  }
  // Useful per-type stubs so HITL UI exercising in dev shows something.
  const today = new Date().toISOString().slice(0, 10);
  if (type === "delivery_note") {
    return {
      detected_language: "id",
      detected_quality: "medium",
      extracted_data: {
        delivery_date: today,
        po_reference: "[dry-run]",
        vendor_name: "[dry-run vendor]",
        line_items: [
          {
            material: "Cement (40kg bag)",
            quantity: 50,
            unit: "bag",
          },
        ],
      },
      reasoning:
        "[dry-run] Extracted a sample delivery note. Set ANTHROPIC_API_KEY + AI_DRY_RUN=0 for real extraction.",
      ambiguities: [],
      vendor_name_hint: null,
      category_name_hint: null,
    };
  }
  return {
    detected_language: "id",
    detected_quality: "medium",
    extracted_data: {
      amount: 1500000,
      currency: "IDR",
      vendor_name: "[dry-run vendor]",
      transaction_date: today,
      invoice_number: "[dry-run]",
      line_items: [
        { description: "Sample line item", amount: 1500000 },
      ],
    },
    reasoning:
      "[dry-run] Extracted sample fields. Set ANTHROPIC_API_KEY + AI_DRY_RUN=0 for real extraction.",
    ambiguities: [],
    vendor_name_hint: null,
    category_name_hint: null,
  };
}

async function markRunFailed(
  runId: string,
  errorMessage: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(aiAssistantRuns)
    .set({ status: "failed", errorMessage, finishedAt: new Date() })
    .where(eq(aiAssistantRuns.id, runId));
}
