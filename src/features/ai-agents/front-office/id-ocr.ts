/**
 * Phase 3 (mgmt front-office) — id-ocr agent.
 *
 * Extracts name + nationality + document number + expiry from a passport /
 * KITAS / KTP image via the provider-agnostic AI layer (vision). When AI is in
 * dry-run / no key (getAIProvider → DryRunProvider, isAvailable()=false) it
 * returns a zero-confidence placeholder so the operator enters the fields by
 * hand. confidence < 0.85 → the caller keeps the extraction in `pending_review`.
 */
import { z } from "zod";
import { getAIProvider } from "@/lib/ai/providers";
import type { AIImageAttachment } from "@/lib/ai/providers/types";

export type IdDocumentType = "passport" | "kitas" | "ktp";

export interface IdOcrInput {
  docType: IdDocumentType;
  /** Base64 image bytes (no data: prefix). */
  imageBase64: string;
  mediaType: AIImageAttachment["mediaType"];
  organizationId?: string;
}

export interface IdOcrOutput {
  name?: string;
  nationality?: string;
  documentNumber?: string;
  expiresAt?: string;
  /** 0..1 — < 0.85 triggers manual override in the review UI. */
  confidence: number;
  raw: Record<string, unknown>;
}

const ExtractSchema = z.object({
  name: z.string().trim().min(1).nullable().optional(),
  nationality: z.string().trim().min(1).nullable().optional(),
  documentNumber: z.string().trim().min(1).nullable().optional(),
  expiresAt: z.string().trim().min(1).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
}

function systemPrompt(docType: IdDocumentType): string {
  return (
    `You are an identity-document OCR extractor. Read the ${docType} in the image ` +
    `and return STRICT JSON only: {"name": string|null, "nationality": ` +
    `ISO-3166 alpha-3 or country name|null, "documentNumber": string|null, ` +
    `"expiresAt": "YYYY-MM-DD"|null, "confidence": number 0..1}. ` +
    `"confidence" is your overall extraction certainty. No prose, JSON only.`
  );
}

/** Dry-run: no live model — placeholder forces manual entry/review. */
function synthesizeDryRun(input: IdOcrInput): IdOcrOutput {
  return { confidence: 0, raw: { dry_run: true, docType: input.docType } };
}

export async function run(input: IdOcrInput): Promise<IdOcrOutput> {
  const provider = getAIProvider();
  if (!provider.isAvailable()) return synthesizeDryRun(input);

  try {
    const resp = await provider.complete({
      messages: [
        { role: "system", content: systemPrompt(input.docType) },
        {
          role: "user",
          content: "Extract the identity fields from this document image.",
          images: [{ base64: input.imageBase64, mediaType: input.mediaType }],
        },
      ],
      responseFormat: "json",
      maxTokens: 600,
      temperature: 0.1,
      timeoutMs: 30_000,
    });

    const parsed = ExtractSchema.safeParse(JSON.parse(stripFences(resp.content)));
    if (!parsed.success) {
      return { confidence: 0, raw: { error: "parse_failed", content: resp.content.slice(0, 500) } };
    }
    const d = parsed.data;
    return {
      name: d.name ?? undefined,
      nationality: d.nationality ?? undefined,
      documentNumber: d.documentNumber ?? undefined,
      expiresAt: d.expiresAt ?? undefined,
      confidence: d.confidence ?? 0.7,
      raw: { ...d, model: resp.model },
    };
  } catch (e) {
    return { confidence: 0, raw: { error: e instanceof Error ? e.message : "ocr_failed" } };
  }
}

export const ID_OCR_AGENT = {
  agentCode: "id-ocr",
  description: "Extracts identity fields from passport/KITAS/KTP scans on upload.",
} as const;

/** Map an uploaded image MIME to the vision media type (null = unsupported). */
export function mimeToMediaType(mime: string): AIImageAttachment["mediaType"] | null {
  switch (mime) {
    case "image/jpeg":
    case "image/png":
    case "image/webp":
    case "image/gif":
      return mime;
    default:
      return null;
  }
}
