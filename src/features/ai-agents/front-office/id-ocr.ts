/**
 * Phase 2.4 mgmt-03 — id-ocr agent (stub).
 *
 * Triggered on scan upload. Extracts name + nationality + expiry
 * + document number from a passport / KITAS / KTP image. Writes
 * the result to `guest_ids.ocr_payload`; UI offers manual override
 * if confidence < 0.85 (audit-logged via parent).
 */

export type IdDocumentType = "passport" | "kitas" | "ktp";

export interface IdOcrInput {
  organizationId: string;
  guestId: string;
  scanBlobRef: string;
  docType: IdDocumentType;
}

export interface IdOcrOutput {
  name?: string;
  nationality?: string;
  documentNumber?: string;
  expiresAt?: string;
  confidence: number;
  raw: Record<string, unknown>;
}

export async function run(_input: IdOcrInput): Promise<IdOcrOutput> {
  return { confidence: 0, raw: {} };
}

export const ID_OCR_AGENT = {
  agentCode: "id-ocr",
  description: "Extracts identity fields from passport/KITAS/KTP scans on upload.",
} as const;
